import * as THREE from "three";
import { FIELD, TEAMS, FORMATIONS, MODES, DEFAULT_MODE, getActiveMode } from "./config";
import { createPlayerMesh, animatePlayer, TOTAL } from "./player";
import { loadProfile, profileLook } from "./appearance";
import { getKit, pickRivalKit, DEFAULT_KIT_ID } from "./kits";
import { buildStadium, updateLedBoards, flashLedBoards, rippleNet, updateNets } from "./stadium";
import { ballTexture, trailTexture, arrowTexture } from "./textures";
import { sfx, crowd, chargeTone } from "./audio";
import { PowerupField, POWERUPS } from "./powerups";
import { VoxelFX } from "./fx";
import { updateAI } from "./ai";
import { makeKeeperAttrs } from "./keeper";
import { getSettings } from "./settings";
import { PR_TABLE, awardPR, getPR, resetAllPR, buildPRSnapshot } from "./pr";
import { netDiag } from "./diagnostics";

const HALF_L = FIELD.L / 2;
const HALF_W = FIELD.W / 2;
const BALL_R = 0.36;
const TACKLE_CD = 1.15;
const DASH_CD = 1.0;
const BUFFER = 0.14; // Fase 1: buffer de inputs (140ms)
const COYOTE = 0.12; // Fase 1: coyote time al perder el balón
const MAGNUS = 0.052; // Fase 1: coeficiente de curva (efecto Magnus arcade)
const SWEET_LO = 0.7;
const SWEET_HI = 0.87;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));
const shortAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function emoteTexture(char) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.font = "80px serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(char, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Game {
  constructor(container, options = {}) {
    this.container = container;
    this.renderOptions = options || {};
    this.keys = {};
    this.time = 0;
    // === Plan v2.0: modo de juego activo (2v2 / 3v3 / 4v4) ===
    // Se lee de localStorage; define formación (nº de jugadores) y duración.
    this.mode = getActiveMode();
    this.formation = FORMATIONS[this.mode];
    this.halfSeconds = MODES[this.mode].halfSeconds;
    this.halfLen = this.halfSeconds; // 2 tiempos x halfSeconds = partido completo
    this.halftimeLen = 10; // duración de la pausa de entretiempo (s)
    this.snapshot = {
      score: { red: 0, blue: 0 },
      clock: this.halfLen,
      mode: this.mode,
      half: 1,
      halfLabel: "PRIMER TIEMPO",
      kickoffCount: 0,
      halftime: false,
      halftimeCount: 0,
      matchEnded: false,
      winner: null,
      camMode: "area",
      povYaw: 0,
      povPitch: 0,
      pointerLocked: false,
      kickoffGo: 0,
      stamina: 1,
      power: 0,
      charging: false,
      goalText: null,
      players: [],
      ball: { x: 0, z: 0 },
      paused: false,
      stats: {
        red: { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 },
        blue: { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 },
      },
      heroStats: { goals: 0, shots: 0, tackles: 0, passes: 0 },
      goals: [], // {team, minute, half, byHero}
      // === Phase 3: HUD FIFA + rating 1-10 ===
      ballHolder: null,        // { team, number, name } o null si el balón está suelto
      ballHolderRating: null,  // número 1.0-10.0 o null
      playerRatings: { red: [], blue: [] },  // [{ number, name, rating }, ...]
      // === P1-MULTIAGENT: stats por-jugador ===
      // Diccionario key=`${team}-${formationIdx}` → stats. Se popula en
      // _initPlayerStats() (constructor + reset) y se actualiza en _pass,
      // _shoot, _tackle, _slideContacts, _keeperSave, _updateBall (goal) y
      // el bloque de posesión por-frame del loop.
      playerStats: {},
      // === P1-PR-TEST: snapshot de Puntos de Rendimiento para la HUD ========
      // Array de {name, team, role, pr, goals, assists, tackles, saves}
      // ordenado por PR desc. Lo rellena el loop cada ~0.5s llamando a
      // buildPRSnapshot() desde pr.js. Filtra arqueros (van en HUD aparte).
      prSnapshot: [],
    };
    this.charge = 0;
    this.goalCooldown = 0;
    this.kickCooldown = 0;
    this.tackleCooldown = 0;
    this.dashCooldown = 0;
    this.saveCooldown = 0;
    this.superMeter = 0;
    this.holdShoot = false;
    this.holdSprint = false;
    this.hitstop = 0;
    this.slowmo = 0;
    this.flash = 0;
    this.coyote = 0;
    this.buf = { shoot: 0, pass: 0, tackle: 0, dash: 0 };
    this.bufCharge = 0;
    this.shotKind = "normal";
    this.deadzone = 0.18;
    this.stick = { x: 0, y: 0 };
    this.effects = { red: {}, blue: {} };
    this.toast = null;
    this.toastId = 0;
    this.camShake = 0;
    this._teamTackleCd = { red: 0, blue: 0 };
    this.fovTarget = 45;
    // 4 emojis tácticos que influyen en la IA del equipo propio:
    // 👆 pedir balón (la IA te lo pasa si lo tiene), ❗ patear (la IA tira si lo tiene),
    // 😡 enojarse (la IA juega más agresivo), 👏 aplaudir (la IA juega más relajada)
    this.emotes = ["\u{1F446}", "\u2757", "\u{1F621}", "\u{1F44F}"];
    // Phase 3: lastPasser — para atribuir asistencia al autor del gol.
    this.lastPasser = null; // referencia al jugador que pasó (o null)
    // Inicializar comandos de emoji para que la IA pueda leerlos desde el frame 1
    this.emoteCommand = -1;
    this.emoteCommandTimer = 0;
    this.emoteCommandTeam = null;
    // Phase 3: inicializar playerRatings para el primer partido (reset() lo
    // refresca en cada revancha, pero el primer snapshot ya debe tener datos).
    this._initPlayerRatings();
    this.half = 1;
    this.matchEnded = false;
    this.kickoffCount = 3.2; // arranque inicial con cuenta 3-2-1-¡silbato!
    this.kickoffLast = 4;
    this.kickoffGo = 0;
    this.halftimeShown = false;
    this.halftimeTimer = 0;
    // ---- cámara POV: mirada propia, independiente del jugador -------------
    this.povYaw = 0;
    this.povPitch = 0;
    this.lookDelta = { yaw: 0, pitch: 0 };
    this.pointerLocked = false;
    this.camTrans = 0;
    this.camTransDur = 0.72;
    this.camTransFrom = null;

    // === P2-SYNC-TEST: network hooks ===========================================
    // networkMode: null = single-player (default, runs full simulation).
    //              "client" = non-host client (skip simulation; the sync
    //                         layer writes positions to meshes directly and
    //                         the loop just renders).
    // _syncHook: called every frame from _loop with (dt) — host sync uses
    //            it to apply remote inputs and broadcast state at 20Hz.
    // _clientRenderHook: called every frame from _loop in "client" mode
    //                    with (dt) — client sync uses it to read
    //                    interpolated state, apply it to meshes, and send
    //                    local input at 30Hz.
    this.networkMode = null;
    this._syncHook = null;
    this._clientRenderHook = null;

    this._initRenderer();
    this._initScene();
    this._initEntities();
    this._bindInput();
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this._simAccum = 0;
    this._lastTick = typeof performance !== "undefined" ? performance.now() : Date.now();
    this._rafPending = false;
    this._clientRenderDebt = 0;
    // Adaptive render budget (host): EMA of one draw's wall-clock cost and
    // the wall-clock time of the last draw. Used to throttle the expensive
    // GPU draw when the renderer is slow, so sim + network keep real-time.
    this._renderCostEma = 0;
    this._lastRenderAt = 0;
    this._scheduleFrame();
    // Keep-alive: requestAnimationFrame pauses in background tabs, which froze
    // the host simulation and made remote guests feel totally lagged. This
    // interval re-enters the loop when rAF stalls; the fixed-timestep
    // accumulator in _loop catches up on the real elapsed time.
    this._keepAlive = setInterval(() => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - this._lastTick > 100) {
        // Cancel the stale rAF callback before waking the loop. Without this
        // guard, a background-tab fallback plus the pending rAF created two
        // independent frame chains and accelerated the host simulation.
        if (this._rafPending) {
          cancelAnimationFrame(this.raf);
          this._rafPending = false;
        }
        this._loop();
      }
    }, 100);
    setTimeout(() => crowd.start(), 300);
  }

  _initRenderer() {
    const r = new THREE.WebGLRenderer({
      // The multiplayer guest must keep the complete scene, but antialiasing
      // is a second expensive pass on integrated/mobile GPUs. The host keeps
      // the higher-quality path; the guest prioritizes input and state timing.
      antialias: !this.renderOptions.client,
      powerPreference: "high-performance",
      stencil: false,
    });
    // Fase visual 4K: sube pixel ratio + saturación via tonemapping ACES
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.renderOptions.client ? 0.85 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.28;
    this.container.appendChild(r.domElement);
    r.domElement.style.display = "block";
    this.renderer = r;
  }

  _initScene() {
    const s = new THREE.Scene();
    const bg = document.createElement("canvas");
    bg.width = 4;
    bg.height = 512;
    const bgg = bg.getContext("2d");
    const gr = bgg.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#02061f");
    gr.addColorStop(0.42, "#0a1f7a");
    gr.addColorStop(0.78, "#1b46e0");
    gr.addColorStop(1, "#3a7bff");
    bgg.fillStyle = gr;
    bgg.fillRect(0, 0, 4, 512);
    const bgt = new THREE.CanvasTexture(bg);
    bgt.colorSpace = THREE.SRGBColorSpace;
    s.background = bgt;
    s.fog = new THREE.Fog("#12299e", 180, 330);
    this.scene = s;

    // Fase 3: hemisférico cálido de cielo + frío de césped, y rim light para
    // despegar a los jugadores del fondo.
    s.add(new THREE.HemisphereLight("#e6f2ff", "#25d820", 0.68));
    s.add(new THREE.AmbientLight("#ffffff", 0.22));
    const sun = new THREE.DirectionalLight("#fffdf0", 1.55);
    sun.position.set(30, 58, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 52;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 170 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.radius = 3;
    s.add(sun);
    const fill = new THREE.DirectionalLight("#8fb8ff", 0.22);
    fill.position.set(-32, 34, -22);
    s.add(fill);
    const rim = new THREE.DirectionalLight("#ffd0a0", 0.3);
    rim.position.set(0, 9, -46);
    s.add(rim);

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 420);
    this.camera.position.set(0, 20.6, 23);
    this.camera.lookAt(0, 1.7, 0);
    this.camMode = "area";

    const st = buildStadium(s);
    this.stands = st.stands;
    this.fx = new VoxelFX(s);
  }

  _initEntities() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 18),
      new THREE.MeshLambertMaterial({ map: ballTexture() })
    );
    ball.castShadow = true;
    ball.position.set(0, BALL_R, 0);
    this.scene.add(ball);
    const bs = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 24),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false })
    );
    bs.rotation.x = -Math.PI / 2;
    bs.position.y = 0.02;
    this.scene.add(bs);
    this.ball = { mesh: ball, shadow: bs, vel: new THREE.Vector3(), spin: new THREE.Vector3() };

    this.players = [];
    // Hasta 5 números por equipo (modo 4v4 = 1 arquero + 4 de campo).
    // [0]=arquero, [1-4]=jugadores de campo. El héroe (red i=1) usa su número
    // de perfil; el resto toma de acá. Si faltara un número, se deriva del índice.
    const numbers = { red: [1, 4, 7, 10, 9], blue: [1, 3, 6, 10, 8] };
    const myProfile = loadProfile();
    this._profileName = myProfile.name || "";
    // Kits: el equipo local usa el kit elegido por el jugador; el rival elige
    // el kit alterno que no choque con el nuestro.
    const myKit = getKit(myProfile.kitId || DEFAULT_KIT_ID);
    const rivalKit = pickRivalKit(myKit);
    const teamKits = { red: myKit, blue: rivalKit };
    const heroLook = profileLook(myProfile);
    ["red", "blue"].forEach((team) => {
      const t = TEAMS[team];
      const kit = teamKits[team];
      this.formation.forEach((f, i) => {
        const keeper = i === 0;
        const hero = team === "red" && i === 1;
        const keeperKit = { shirt: "#ffd21c", alt: "#101018", pattern: "solid", shorts: "#1c1c22", socks: "#1c1c22" };
        const activeKit = keeper ? keeperKit : kit;
        const mesh = createPlayerMesh({
          shirt: activeKit.shirt,
          shorts: activeKit.shorts,
          socks: activeKit.socks,
          number: hero ? myProfile.number : numbers[team][i],
          skin: hero ? myProfile.skin : undefined,
          hair: hero ? myProfile.hairColor : undefined,
          hairStyle: hero ? myProfile.hairStyle : undefined,
          kit: activeKit,
          look: hero ? heroLook : undefined,
        });
        const home = new THREE.Vector3(f.x * t.dir, 0, f.z * t.dir);
        mesh.position.copy(home);
        mesh.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(mesh);
        this.players.push({
          mesh,
          team,
          keeper,
          hero,
          number: hero ? myProfile.number : numbers[team][i],
          formationIdx: i, // Phase 3: índice dentro de la formación (para rating lookup)
          home,
          baseRole: f.role || "MID",
          attrs: keeper ? makeKeeperAttrs(team) : null,
          vel: new THREE.Vector3(),
          speed: 0,
          heading: mesh.rotation.y,
          targetHeading: mesh.rotation.y,
          slide: 0,
          slideDir: new THREE.Vector3(),
          diveT: 0,
          diveKind: null,
          diveSide: 1,
          aiTackleCd: 0,
          aiThink: 0,
          squash: 0,
          noTackle: 0,
          dashT: 0,
          dashFx: 0,
          role: "support",
          aiState: "TRANSICION",
          // === P1-MULTIAGENT: per-agent controller state ============================
          // Cada jugador (humano o IA) tiene su propio controller con input +
          // cooldowns + stamina + super + buffers. Los campos legacy `this.*`
          // del Game (kickCooldown, stamina, etc.) quedan como proxies que
          // delegan al controller del héroe local — ver `_installAgentProxies()`.
          // Así el código existente (test, HUD, IA) sigue leyendo `game.stamina`
          // etc. sin enterarse de que ahora vive en el controller del héroe.
          controller: {
            type: hero ? "human" : "ai", // 'human' para el héroe, 'ai' para el resto
            clientId: null,              // null local; la capa de networking lo setea después
            isLocal: hero,               // true sólo para el humano local
            // Input del agente — separado de this.keys/this.stick (que quedan
            // como input del humano local). Para el humano local, el loop
            // espeja this.keys/this.stick → controller.input cada frame; para
            // IA, updateAI() lo popula; para remotos, la capa de networking.
            input: {
              ax: 0,           // stick analógico / WASD resuelto (eje X)
              az: 0,           // stick analógico / WASD resuelto (eje Z)
              shoot: false,    // mantener para cargar
              pass: false,
              tackle: false,
              dash: false,
              sprint: false,
              charge: 0,       // carga del tiro 0..1
              // Modificadores de tiro (low/placed/curl/bicycle). Para el humano
              // local se espejan desde this.keys en el loop; para IA/remotos
              // los puede setear directamente quien produce el input.
              low: false,
              lofted: false,
              side: 0,         // -1, 0, +1 (curl)
            },
            // Estado por agente — antes vivía en Game.* (compartido entre el
            // héroe y la IA, lo cual era un bug latente). Ahora cada agente
            // tiene el suyo.
            kickCooldown: 0,
            tackleCooldown: 0,
            dashCooldown: 0,
            stamina: 1,
            superMeter: 0,
            charge: 0,
            holdShoot: false,
            holdSprint: false,
            coyote: 0,
            buf: { shoot: 0, pass: 0, tackle: 0, dash: 0 },
            bufCharge: 0,
            // P1-PR-TEST: Puntos de Rendimiento por-jugador. Reseteado en
            // reset() y al inicio de cada partido. Bumped por awardPR()
            // cuando el motor detecta un evento (gol, pase, tiro, etc.).
            pr: 0,
            prPassCount: 0, // cap de 25 pases contados (spec sección 06)
          },
        });
      });
    });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: "#ffd21c", transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.scene.add(ring);
    this.ring = ring;

    this.arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: arrowTexture(), transparent: true, depthTest: false })
    );
    this.arrow.scale.set(0.95, 0.95, 1);
    this.arrow.renderOrder = 5;
    this.scene.add(this.arrow);

    this.emoteSprites = this.emotes.map((ch) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTexture(ch), transparent: true }));
      sp.scale.set(1.3, 1.3, 1);
      sp.visible = false;
      this.scene.add(sp);
      return sp;
    });
    this.activeEmote = -1;
    this.emoteTimer = 0;

    this.trail = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.62),
      new THREE.MeshBasicMaterial({
        map: trailTexture(),
        color: "#ffffff",
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      })
    );
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.visible = false;
    this.scene.add(this.trail);

    this.controlled = this.players.find((p) => p.hero) || this.players.find((p) => p.team === "red" && !p.keeper);
    this.hero = this.controlled;
    // P1-MULTIAGENT: instalar proxies backward-compat. Después de este punto,
    // `this.kickCooldown`, `this.stamina`, `this.charge`, etc. dejan de ser
    // campos directos del Game y pasan a ser getters/setters que delegan al
    // controller del héroe local. Así todo el código existente (HUD, IA,
    // test) que lee `game.stamina` o setea `game.kickCooldown = 0` sigue
    // funcionando — pero por debajo ya opera sobre el estado por-agente.
    this._installAgentProxies();
    // P1-MULTIAGENT: inicializar playerStats desde this.players recién creado.
    this._initPlayerStats();
    // P1-PR-TEST: inicializar PR de todos los jugadores en 0.
    resetAllPR(this.players);
    this.stamina = 1;
    this.powerups = new PowerupField(this.scene);

    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.62, 40),
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.04;
    this.scene.add(this.aura);

    this.aimGuide = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: trailTexture(),
        color: "#ffd21c",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.aimGuide.rotation.x = -Math.PI / 2;
    this.aimGuide.visible = false;
    this.scene.add(this.aimGuide);

    // Fase 1: cono de intención del pase (destella 1 frame al pasar)
    this.passHint = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1.06, 32),
      new THREE.MeshBasicMaterial({
        color: "#3df0ff",
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.passHint.rotation.x = -Math.PI / 2;
    this.passHint.position.y = 0.05;
    this.passHint.visible = false;
    this.scene.add(this.passHint);

    this.passCone = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: trailTexture(),
        color: "#3df0ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.passCone.rotation.x = -Math.PI / 2;
    this.passCone.visible = false;
    this.scene.add(this.passCone);
    this.passConeT = 0;

    // Indicador visual de pase: línea del portador al receptor objetivo
    // Se actualiza cada frame cuando el portador tiene el balón y no está cargando tiro.
    this.passLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.1, 0),
        new THREE.Vector3(0, 0.1, 0),
      ]),
      new THREE.LineBasicMaterial({
        color: "#3df0ff",
        transparent: true,
        opacity: 0.7,
        linewidth: 3,
      })
    );
    this.passLine.visible = false;
    this.scene.add(this.passLine);
  }

  // P1-MULTIAGENT: instalar proxies backward-compat.
  // Convierte los campos legacy `this.kickCooldown`, `this.tackleCooldown`,
  // `this.dashCooldown`, `this.stamina`, `this.superMeter`, `this.charge`,
  // `this.holdShoot`, `this.holdSprint`, `this.coyote`, `this.buf`,
  // `this.bufCharge` en getters/setters que delegan al controller del héroe
  // local (`this.controlled.controller.*`).
  // Esto preserva la API pública del Game: el HUD lee `snapshot.stamina`
  // (poblado desde `this.stamina`), el test setea `g.kickCooldown = 0`,
  // la IA en ai.js escribe `game.kickCooldown = 0.22` al tirar — todo sigue
  // funcionando exactamente igual, pero por debajo el estado ya vive en el
  // controller por-agente. Cuando se agregue multiplayer, cada agente tendrá
  // su propio controller.* y el proxy seguirá apuntando al héroe local.
  _installAgentProxies() {
    const scalars = [
      "kickCooldown",
      "tackleCooldown",
      "dashCooldown",
      "stamina",
      "superMeter",
      "charge",
      "holdShoot",
      "holdSprint",
      "coyote",
      "bufCharge",
    ];
    scalars.forEach((k) => {
      Object.defineProperty(this, k, {
        get() {
          const c = this.controlled?.controller;
          return c ? c[k] : 0;
        },
        set(v) {
          const c = this.controlled?.controller;
          if (c) c[k] = v;
        },
        configurable: true,
        enumerable: true,
      });
    });
    // `buf` es un objeto (diccionario de buffers) — proxy de la referencia.
    Object.defineProperty(this, "buf", {
      get() {
        return this.controlled?.controller?.buf;
      },
      set(v) {
        const c = this.controlled?.controller;
        if (c) c.buf = v;
      },
      configurable: true,
      enumerable: true,
    });
  }

  // P1-MULTIAGENT: stats por-jugador. Llamado en reset() y en el constructor.
  // Key = `${team}-${formationIdx}` — estable para todo el partido (no colisiona
  // como sí puede hacerlo el número de camiseta). Incluye arqueros (para saves).
  _initPlayerStats() {
    this.snapshot.playerStats = {};
    this.players.forEach((p) => {
      const key = `${p.team}-${p.formationIdx}`;
      this.snapshot.playerStats[key] = {
        team: p.team,
        formationIdx: p.formationIdx,
        number: p.number || 0,
        isLocal: !!p.controller?.isLocal,
        isKeeper: !!p.keeper,
        goals: 0,
        assists: 0,
        shots: 0,
        shotsOnTarget: 0,
        passes: 0,
        passesCompleted: 0,
        tackles: 0,
        tacklesWon: 0,
        saves: 0,
        possession: 0,
        distance: 0,
        rating: 6.0,
      };
    });
  }

  // Helper: devuelve el key de playerStats para un jugador.
  _statsKey(p) {
    if (!p) return null;
    return `${p.team}-${p.formationIdx}`;
  }

  // Helper: incrementa un campo de playerStats para un jugador.
  _bumpStat(p, field, amount = 1) {
    const key = this._statsKey(p);
    if (!key) return;
    const s = this.snapshot.playerStats?.[key];
    if (s && typeof s[field] === "number") s[field] += amount;
  }

  _bindInput() {
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow")) e.preventDefault();
      if (this.keys[k]) return;
      this.keys[k] = true;
      if (k === "c") this.toggleCamera();
      if (k === "escape" && this.camMode === "pov") this.toggleCamera();
      if (k === "e") this.press("tackle");
      if (k === "q") this.press("pass");
      if (k === "f") this.press("dash");
      if (k === "shift") this.press("sprint");
      if (k === "1" || k === "2" || k === "3" || k === "4") this.playEmote(Number(k) - 1);
      if (k === " ") {
        e.preventDefault();
        this.press("shoot");
      }
      // Feed the diagnostics overlay: a movement keydown starts the
      // keyToLocalMove / keyToAck latency clock.
      netDiag.markInput(k);
      // Send movement/button edges immediately; the heartbeat remains as a
      // loss-tolerant fallback. This removes a full 33ms transport wait when
      // the guest is under render pressure.
      this._clientInputChanged?.();
    };
    this.onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === " ") this.release("shoot");
      if (k === "shift") this.release("sprint");
      this.keys[k] = false;
      this._clientInputChanged?.();
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // ---- Mirada POV: pointer lock automático + mouse movement style FPS ----
    const cvs = this.renderer.domElement;
    this.onCanvasClick = () => {
      if (this.camMode !== "pov" || this.paused || this.matchEnded) return;
      if (document.pointerLockElement !== cvs) cvs.requestPointerLock?.();
    };
    this.onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === cvs;
      this.snapshot.pointerLocked = this.pointerLocked;
    };
    this.onMouseMove = (e) => {
      if (this.camMode !== "pov" || this.paused) return;
      const st = getSettings();
      const sens = clamp(st.povSens || 1, 0.2, 3);
      let dx, dy;
      if (this.pointerLocked) {
        // Pointer lock activo: mouse movement directo (estilo FPS puro)
        dx = e.movementX || 0;
        dy = e.movementY || 0;
        // Sensibilidad decente: 0.0022 rad/pixel ≈ 3.5cm de mouse = 180° de giro
        this.lookDelta.yaw -= dx * 0.0022 * sens;
        this.lookDelta.pitch += (st.invertY ? 1 : -1) * dy * 0.0018 * sens;
      } else {
        // Sin pointer lock: usar delta del mouse desde última posición para
        // tener control tipo "drag look" — cada px de movimiento = X rad de giro.
        // Esto permite jugar SIN pointer lock si el navegador lo bloquea.
        const lastX = this._lastMouseX ?? e.clientX;
        const lastY = this._lastMouseY ?? e.clientY;
        dx = e.clientX - lastX;
        dy = e.clientY - lastY;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        // Sensibilidad un poco menor sin lock (más control fino)
        this.lookDelta.yaw -= dx * 0.0015 * sens;
        this.lookDelta.pitch += (st.invertY ? 1 : -1) * dy * 0.0012 * sens;
      }
    };
    cvs.addEventListener("click", this.onCanvasClick);
    cvs.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  _exitPointerLock() {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  // Mirada POV: mouse (pointer lock o drag) + flechas del teclado.
  // Yaw ilimitado (360°), pitch limitado a [-0.5, 0.35] rad (no marear).
  _updatePovLook(dt) {
    const st = getSettings();
    const sens = clamp(st.povSens || 1, 0.2, 3);
    // Teclado: flechas para mirar (giro más lento que el mouse)
    let yaw = (this.keys.arrowleft ? 1 : 0) - (this.keys.arrowright ? 1 : 0);
    let pitch = (this.keys.arrowup ? 1 : 0) - (this.keys.arrowdown ? 1 : 0);
    if (st.invertY) pitch *= -1;
    this.povYaw += yaw * 1.2 * sens * dt;
    this.povPitch += pitch * 0.7 * sens * dt;
    // A/D como turn (opcional, según setting)
    if ((st.povAD || "strafe") === "turn") {
      const t = (this.keys.a ? 1 : 0) - (this.keys.d ? 1 : 0);
      this.povYaw += t * 1.0 * sens * dt;
    }
    // Suavizado del delta de mouse (lookDelta acumulado por mousemove)
    const smooth = 0.25; // respuesta rápida pero sin jitter
    const dy = this.lookDelta.yaw * smooth;
    const dp = this.lookDelta.pitch * smooth;
    this.povYaw += dy;
    this.povPitch += dp;
    this.lookDelta.yaw -= dy;
    this.lookDelta.pitch -= dp;
    if (Math.abs(this.lookDelta.yaw) < 0.0002) this.lookDelta.yaw = 0;
    if (Math.abs(this.lookDelta.pitch) < 0.0002) this.lookDelta.pitch = 0;
    // Pitch limitado (no mirar al cielo ni al piso del todo)
    this.povPitch = clamp(this.povPitch, -0.5, 0.35);
    // Yaw normalizado a [-PI, PI] para evitar overflow numérico
    this.povYaw = shortAngle(this.povYaw);
  }

  press(a) {
    if (this.paused) return;
    // P2-SYNC-TEST: in client mode the guest must NOT execute actions locally
    // (shoot/pass/tackle/dash are host-authoritative). Only track holdShoot /
    // holdSprint so ClientSync can forward the intent; the host broadcasts the
    // resulting state. Executing locally would kick a stale ball and play
    // duplicated SFX, causing one-frame desync flashes.
    const clientMode = this.networkMode === "client";
    if (a === "shoot") this.holdShoot = true;
    else if (a === "sprint") this.holdSprint = true;
    else if (a === "pass") {
      if (clientMode) return;
      if (this._canKick()) this._pass();
      else this.buf.pass = BUFFER;
    } else if (a === "tackle") {
      if (clientMode) return;
      if (this.tackleCooldown <= 0) this._tackle();
      else this.buf.tackle = BUFFER;
    } else if (a === "dash") {
      if (clientMode) return;
      if (this.dashCooldown <= 0) this._dash();
      else this.buf.dash = BUFFER;
    }
    this._clientInputChanged?.();
  }

  release(a) {
    if (a === "shoot") {
      if (this.holdShoot) {
        // En modo cliente NO disparar localmente; el host lo hará al recibir
        // el flanco de subida de `buttons.shoot` y devolverá el estado.
        if (this.networkMode !== "client") {
          if (this._canKick()) this._shoot(this.charge);
          else {
            // El tiro no se "come": queda buffereado con la potencia cargada
            this.buf.shoot = BUFFER;
            this.bufCharge = this.charge;
          }
        }
        this.charge = 0;
      }
      this.holdShoot = false;
    } else if (a === "sprint") this.holdSprint = false;
    this._clientInputChanged?.();
  }

  // Fase 1: stick analógico con dead-zone configurable (touch / gamepad)
  setStick(x, y) {
    const m = Math.hypot(x, y);
    if (m < this.deadzone) {
      this.stick.x = 0;
      this.stick.y = 0;
      this._clientInputChanged?.();
      return;
    }
    const s = (m - this.deadzone) / (1 - this.deadzone) / m;
    this.stick.x = x * s;
    this.stick.y = y * s;
    this._clientInputChanged?.();
  }

  _eff(team, key) {
    return (this.effects[team] && this.effects[team][key]) > 0;
  }

  _toast(text, color) {
    this.toastId += 1;
    this.toast = { text, color, id: this.toastId, t: 1.9 };
  }

  _applyPowerup(type, player) {
    const team = player.team;
    const opp = team === "red" ? "blue" : "red";
    const def = POWERUPS[type];
    if (type === "ice") {
      this.effects[opp].slow = def.dur;
      sfx.freeze();
    } else {
      this.effects[team][type] = type === "boot" ? 999 : def.dur;
      sfx.powerupGrab(team === "red");
    }
    if (type === "boot") sfx.superReady();
    const mine = team === "red";
    this._toast(`${mine ? "" : "RIVAL: "}${def.label}`, mine ? def.color : "#ff6b6b");
    this.camShake = Math.max(this.camShake, 0.12);
    this.fx.sparks(player.mesh.position.x, 1.2, player.mesh.position.z, def.color, 16, 8);
    crowd.hype(0.16, 1.2);
  }

  _dash(p = this.controlled) {
    if (p.controller.dashCooldown > 0) return;
    if (p.slide > 0) return;
    const bolt = this._eff(p.team, "bolt");
    if (p.controller.stamina < 0.18 && !bolt) {
      sfx.ui();
      return;
    }
    const input = this._inputDir(p);
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const dir = input.lengthSq() > 0 ? input : fwd;
    p.vel.x = dir.x * 28;
    p.vel.z = dir.z * 28;
    p.dashT = 0.32;
    p.noTackle = 0.75;
    p.dashFx = 0.32;
    p.squash = 0.5;
    if (!bolt) p.controller.stamina = clamp(p.controller.stamina - 0.2, 0, 1);
    p.controller.dashCooldown = DASH_CD;
    p.controller.superMeter = clamp(p.controller.superMeter + 0.05, 0, 1);
    if (this._hasBall(p)) {
      const b = this.ball;
      b.vel.x = dir.x * 14;
      b.vel.z = dir.z * 14;
      b.vel.y = 0.2;
      p.controller.kickCooldown = 0.05;
    }
    for (let i = 0; i < 4; i++) {
      this.fx.dust(p.mesh.position.x - dir.x * i * 0.6, p.mesh.position.z - dir.z * i * 0.6, 3, 1.1);
    }
    this.fx.grass(p.mesh.position.x, p.mesh.position.z, dir.x, dir.z, 7, 1.3);
    sfx.dash();
    sfx.whoosh(0.55);
    this.camShake = Math.max(this.camShake, 0.11);
  }

  toggleCamera() {
    this.camMode = this.camMode === "area" ? "pov" : "area";
    this.snapshot.camMode = this.camMode;
    // Transición suave: guardamos el estado actual de la cámara y mezclamos
    // hacia el encuadre del modo nuevo durante camTransDur segundos.
    this.camLook = this.camLook || new THREE.Vector3(0, 1.7, 0);
    this.camTransFrom = {
      pos: this.camera.position.clone(),
      look: this.camLook.clone(),
      fov: this.camera.fov,
    };
    this.camTrans = this.camTransDur;
    const p = this.controlled;
    if (this.camMode === "pov") {
      // La mirada arranca alineada con el jugador y desde ahí la maneja el
      // usuario (mouse / flechas): nunca se realimenta con su rotación.
      this.povYaw = p ? p.mesh.rotation.y : 0;
      this.povPitch = 0;
      this.lookDelta.yaw = 0;
      this.lookDelta.pitch = 0;
      this.fovTarget = 64;
      // Solicitar pointer lock automáticamente al entrar en POV
      // (el navegador puede rechazarlo si no es por gesto del usuario,
      //  en ese caso el jugador hace click en el canvas para activarlo)
      const cvs = this.renderer.domElement;
      setTimeout(() => {
        if (this.camMode === "pov" && !this.paused && document.pointerLockElement !== cvs) {
          cvs.requestPointerLock?.();
        }
      }, 100);
    } else {
      this._exitPointerLock();
      this.fovTarget = 45;
    }
    sfx.ui();
  }

  playEmote(i) {
    if (i < 0 || i > 3) return;
    this.activeEmote = i;
    this.emoteTimer = 1.8;
    sfx.emote(i);
    // Influencia en la IA del equipo propio (no del oponente):
    // 0=👆 pedir balón: la IA intenta pasarte la pelota si la tiene
    // 1=❗ patear: la IA intenta tirar al arco si la tiene
    // 2=😡 enojarse: la IA juega más agresivo (más pressing, más barridas)
    // 3=👏 aplaudir: la IA juega más relajada (menos pressing, más posesión)
    this.emoteCommand = i;
    this.emoteCommandTimer = 4.0; // dura 4 segundos el efecto
    this.emoteCommandTeam = this.controlled?.team || "red";
  }

  setPaused(p) {
    this.paused = p;
    this.snapshot.paused = p;
    if (!p) crowd.start();
  }

  // === Sistema de pausas (multijugador) ===
  // Cada equipo tiene 3 pausas de hasta 30 segundos por partido.
  // El equipo del héroe (siempre red por ahora) es el que puede pedir pausa.
  usePause() {
    if (!this.pauseState) this._initPauses();
    const st = this.pauseState.red; // héroe siempre es red
    if (st.remaining <= 0) return false; // sin pausas disponibles
    st.remaining--;
    st.active = true;
    st.timer = 30; // 30 segundos
    this.snapshot.pauses = { ...this.pauseState };
    return true;
  }

  _initPauses() {
    this.pauseState = {
      red:  { remaining: 3, active: false, timer: 0 },
      blue: { remaining: 3, active: false, timer: 0 },
    };
    this.snapshot.pauses = {
      red:  { remaining: 3, active: false, timer: 0 },
      blue: { remaining: 3, active: false, timer: 0 },
    };
  }

  // Llamado cada frame para decrementar el timer de pausa activa.
  // Cuando llega a 0, se desactiva automáticamente (reanuda el juego).
  _updatePauseTimer(dt) {
    if (!this.pauseState) return;
    let changed = false;
    for (const team of ["red", "blue"]) {
      const st = this.pauseState[team];
      if (st.active) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = 0;
          st.active = false;
          // Auto-reanudar si era el equipo del héroe
          if (team === "red") {
            this.setPaused(false);
            // Disparar evento para cerrar el menú del HUD
            window.dispatchEvent(new CustomEvent("voxelcup:pause-expired"));
          }
        }
        changed = true;
      }
    }
    if (changed) {
      this.snapshot.pauses = {
        red:  { ...this.pauseState.red },
        blue: { ...this.pauseState.blue },
      };
    }
  }

  reset() {
    // Re-leer modo por si el jugador lo cambió en el menú entre partidas.
    // (La formación real solo se reaplica montando un Game nuevo, pero al
    // menos el reloj y el snapshot.mode quedan sincronizados.)
    this.mode = getActiveMode();
    this.formation = FORMATIONS[this.mode];
    this.halfSeconds = MODES[this.mode].halfSeconds;
    this.halfLen = this.halfSeconds;
    this.snapshot.score = { red: 0, blue: 0 };
    this.snapshot.clock = this.halfLen;
    this.snapshot.mode = this.mode;
    this.snapshot.half = 1;
    this.snapshot.halfLabel = "PRIMER TIEMPO";
    this.snapshot.halftime = false;
    this.snapshot.matchEnded = false;
    this.snapshot.winner = null;
    this.snapshot.stats = {
      red: { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 },
      blue: { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 },
    };
    this.snapshot.heroStats = { goals: 0, shots: 0, tackles: 0, passes: 0 };
    this.snapshot.goals = [];
    // Phase 3: reiniciar ratings de jugadores desde la formación activa.
    this._initPlayerRatings();
    // P1-MULTIAGENT: reiniciar stats por-jugador desde this.players.
    this._initPlayerStats();
    // P1-PR-TEST: reiniciar PR de todos los jugadores a 0 al empezar.
    resetAllPR(this.players);
    // Sistema de pausas: reiniciar a 3 pausas de 30s por equipo
    this._initPauses();
    this.half = 1;
    this.matchEnded = false;
    this.halftimeShown = false;
    this.superMeter = 0;
    this.stamina = 1;
    // P1-MULTIAGENT: resetear también el controller del héroe local (super,
    // stamina, cooldowns) para que un partido nuevo arranque limpio.
    if (this.controlled?.controller) {
      const c = this.controlled.controller;
      c.superMeter = 0;
      c.stamina = 1;
      c.kickCooldown = 0;
      c.tackleCooldown = 0;
      c.dashCooldown = 0;
      c.charge = 0;
      c.coyote = 0;
      c.holdShoot = false;
      c.holdSprint = false;
      c.bufCharge = 0;
      if (c.buf) Object.keys(c.buf).forEach((k) => (c.buf[k] = 0));
    }
    this.effects = { red: {}, blue: {} };
    this.powerups.clear();
    this._kickoff();
    this.kickoffCount = 3.2;
    this.kickoffLast = 4;
    this.kickoffGo = 0;
  }

  // Phase 3: rating 1-10 por jugador (estilo FIFA).
  // Lookup por formationIdx (no por shirt number) — el héroe puede tener una
  // camiseta colisionante con otro jugador, así que el índice de formación es
  // el identificador estable.
  _ratingFor(p) {
    if (!p) return 6.0;
    const teamRatings = this.snapshot.playerRatings?.[p.team] || [];
    const idx = p.formationIdx ?? -1;
    const entry = teamRatings.find(r => r.number === idx);
    return entry ? entry.rating : 6.0;
  }

  _applyRatingDelta(p, delta) {
    if (!p) return;
    const arr = this.snapshot.playerRatings?.[p.team];
    if (!arr) return;
    const idx = p.formationIdx ?? -1;
    const entry = arr.find(r => r.number === idx);
    if (entry) {
      entry.rating = Math.max(1.0, Math.min(10.0, entry.rating + delta));
    }
  }

  // Construye playerRatings desde this.formation. Llamado en reset() y en
  // constructor para que el primer partido ya tenga ratings visibles.
  _initPlayerRatings() {
    this.snapshot.playerRatings = { red: [], blue: [] };
    // Mapeo rol → nombre visible en la HUD FIFA
    const roleName = (role, idx) => {
      if (role === "DEF") {
        // En 4v4 hay dos DEF; los distinguimos con sufijo.
        const defCount = this.formation.filter(f => f.role === "DEF").length;
        return defCount > 1 ? `DEF ${idx}` : "DEFENSOR";
      }
      if (role === "MID") return "MEDIOCAMPO";
      if (role === "FWD") return "DELANTERO";
      return `JUGADOR ${idx}`;
    };
    let defIdx = 0;
    this.formation.forEach((f, i) => {
      if (f.role === "GK") return; // GK no entra en ratings
      if (f.role === "DEF") defIdx++;
      const name = roleName(f.role, defIdx);
      this.snapshot.playerRatings.red.push({
        number: i, name, rating: 6.0
      });
      this.snapshot.playerRatings.blue.push({
        number: i, name, rating: 6.0
      });
    });
    this.snapshot.ballHolder = null;
    this.snapshot.ballHolderRating = null;
    this.lastPasser = null;
  }

  _kickoff(scoredAgainst) {
    this.ball.mesh.position.set(0, BALL_R, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.shotKind = "normal";
    // Phase 3: balón al centro = balón suelto. Nadie lo posee al arrancar.
    this.snapshot.ballHolder = null;
    this.snapshot.ballHolderRating = null;
    this.lastPasser = null;
    this.players.forEach((p) => {
      p.mesh.position.copy(p.home);
      p.vel.set(0, 0, 0);
      p.slide = 0;
      p.dashT = 0;
      p.noTackle = 0;
      p.diveT = 0;
      p.squash = 0;
      p.slideTarget = null;
      p.slideBrake = false;
    });
    // El equipo al que le hicieron gol saca desde el centro: un delantero se
    // coloca junto a la pelota, otro un pasito atrás para el pase inicial.
    if (scoredAgainst) {
      const mates = this.players.filter((p) => p.team === scoredAgainst && !p.keeper);
      const dir = TEAMS[scoredAgainst].dir; // hacia dónde ataca ese equipo
      if (mates[0]) mates[0].mesh.position.set(-0.9 * dir, 0, 0.2);
      if (mates[1]) mates[1].mesh.position.set(-3.4 * dir, 0, -2.6);
      if (mates[2]) mates[2].mesh.position.set(-3.4 * dir, 0, 2.6);
      // rivales retroceden a su mitad para respetar el saque
      this.players
        .filter((p) => p.team !== scoredAgainst && !p.keeper)
        .forEach((p) => {
          if (p.home.x * dir < 0) p.mesh.position.set(p.home.x, 0, p.home.z);
          else p.mesh.position.set(-3 * -dir, 0, p.home.z);
        });
    }
  }

  _hasBall(p = this.controlled) {
    // P1-MULTIAGENT: kickCooldown ahora vive en el controller del agente.
    // Para el héroe local, p.controller.kickCooldown == this.kickCooldown (proxy).
    const d = this.ball.mesh.position.distanceTo(p.mesh.position);
    const reach = this._eff(p.team, "magnet") ? 2.7 : 2.1;
    return d < reach && (p.controller?.kickCooldown ?? 0) <= 0 && p.slide <= 0;
  }

  // Coyote time: la acción sigue válida 120ms después de perder el contacto
  _canKick(p = this.controlled) {
    if (this._hasBall(p)) return true;
    const c = p.controller;
    if ((c?.coyote ?? 0) <= 0 || (c?.kickCooldown ?? 0) > 0) return false;
    return this.ball.mesh.position.distanceTo(p.mesh.position) < 3.4;
  }

  // Base de la cámara activa. TODO input de movimiento se resuelve contra
  // estos vectores, nunca contra el mundo global ni contra la rotación
  // instantánea del jugador (eso provocaba el giro descontrolado en POV).
  _camBasis() {
    if (this.camMode === "pov") {
      const y = this.povYaw;
      // forward = hacia dónde mira la cámara; right = forward x up (mano
      // derecha de three.js). El right anterior estaba invertido: por eso
      // "D" empujaba al jugador hacia la izquierda de la pantalla.
      return {
        forward: new THREE.Vector3(Math.sin(y), 0, Math.cos(y)),
        right: new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)),
      };
    }
    // Cámara aérea: orientación fija, arriba de pantalla = -Z, derecha = +X
    return { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
  }

  // P1-MULTIAGENT: _inputDir ahora acepta un agente. Para el humano local
  // lee teclado/stick (legacy); para IA/remotos lee p.controller.input.ax/az
  // (world space). En ambos casos, el resultado también se espeja al
  // controller.input del agente para traceability / networking.
  _inputDir(p = this.controlled) {
    const c = p?.controller;
    if (c && !c.isLocal) {
      // IA / remoto: input por-agente ya en world space.
      const ax = c.input.ax || 0;
      const az = c.input.az || 0;
      const v = new THREE.Vector3(ax, 0, az);
      if (v.lengthSq() > 1) v.normalize();
      return v;
    }
    // Local human: keyboard + stick → camera-basis → world space.
    const pov = this.camMode === "pov";
    const turnMode = pov && (getSettings().povAD || "strafe") === "turn";
    // En POV las flechas son para mirar, no para moverse.
    const rightKey = pov ? !!this.keys.d : !!(this.keys.d || this.keys.arrowright);
    const leftKey = pov ? !!this.keys.a : !!(this.keys.a || this.keys.arrowleft);
    const backKey = pov ? !!this.keys.s : !!(this.keys.s || this.keys.arrowdown);
    const fwdKey = pov ? !!this.keys.w : !!(this.keys.w || this.keys.arrowup);
    const raw = new THREE.Vector3(
      turnMode ? 0 : (rightKey ? 1 : 0) - (leftKey ? 1 : 0),
      0,
      (backKey ? 1 : 0) - (fwdKey ? 1 : 0)
    );
    if (raw.lengthSq() === 0 && (this.stick.x || this.stick.y)) raw.set(this.stick.x, 0, this.stick.y);
    if (raw.lengthSq() === 0) {
      if (c) { c.input.ax = 0; c.input.az = 0; }
      return raw;
    }
    if (raw.lengthSq() > 1) raw.normalize();
    const { forward, right } = this._camBasis();
    const v = new THREE.Vector3().addScaledVector(right, raw.x).addScaledVector(forward, -raw.z);
    if (v.lengthSq() > 0) v.normalize();
    // Espejar al controller.input (world space) para traceability / networking.
    if (c) { c.input.ax = v.x; c.input.az = v.z; }
    return v;
  }

  _bestPassTarget(aimDir, p = this.controlled) {
    const mates = this.players
      .filter((o) => o !== p && o.team === p.team && !o.keeper)
      .map((o) => {
        const to = o.mesh.position.clone().sub(p.mesh.position).setY(0);
        const dist = to.length();
        const dir = to.clone().normalize();
        const dot = dir.dot(aimDir);
        const goalDir = TEAMS[p.team].dir;
        const upfield = (o.mesh.position.x - p.mesh.position.x) * goalDir;
        let block = 0;
        this.players.forEach((op) => {
          if (op.team === p.team) return;
          const rel = op.mesh.position.clone().sub(p.mesh.position).setY(0);
          const proj = rel.dot(dir);
          if (proj > 0 && proj < dist) {
            const perp = rel.clone().sub(dir.clone().multiplyScalar(proj)).length();
            if (perp < 2.2) block += (2.2 - perp) * 0.5;
          }
        });
        return { o, dist, dir, dot, score: dot * 2.6 + upfield * 0.05 - dist / 70 - block };
      })
      // Más permisivo: dot > -0.4 (cualquier mate en un cono amplio de ~114°)
      // y distancia razonable. Antes era -0.2 (cono de ~78°) — muy estrecho.
      .filter((m) => m.dot > -0.4 && m.dist > 3 && m.dist < 62)
      .sort((a, b2) => b2.score - a.score);
    return mates[0] || null;
  }

  _pass(p = this.controlled) {
    const b = this.ball;
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const inputDir = this._inputDir(p);
    const hasExplicitAim = inputDir.lengthSq() > 0;
    const aimDir = hasExplicitAim ? inputDir.normalize() : fwd;
    // PASE ASISTIDO: si hay un compañero en el cono de aim, el balón va hacia él
    // con corrección de lead-time. Si NO hay aim explícito (sin WASD), buscamos
    // al compañero más adelantado como pase por defecto.
    // P1-MULTIAGENT: through = holdSprint del agente (IA lo setea directamente;
    // humano local lo setea via press("sprint")). keys.shift sólo cuenta para
    // el humano local (legacy fallback) — no filtrar shift del local al IA.
    const through = !!(p.controller.holdSprint || (p.controller.isLocal && this.keys.shift));

    let target = this._bestPassTarget(aimDir, p);
    // Fallback: si no hay aim explícito y no encontramos target en el cono,
    // buscar al compañero más adelante (pase de seguridad al hueco).
    if (!target && !hasExplicitAim) {
      const goalDir = TEAMS[p.team].dir;
      let bestMate = null;
      let bestUpfield = -1e9;
      this.players.forEach((o) => {
        if (o === p || o.team !== p.team || o.keeper) return;
        const upfield = (o.mesh.position.x - p.mesh.position.x) * goalDir;
        if (upfield > 2 && upfield > bestUpfield) {
          bestUpfield = upfield;
          bestMate = o;
        }
      });
      if (bestMate) {
        const to = bestMate.mesh.position.clone().sub(p.mesh.position).setY(0);
        const dist = to.length();
        target = { o: bestMate, dist, dir: to.clone().normalize(), dot: 0.5, score: 0 };
      }
    }
    let finalDir = aimDir;
    if (target) {
      const leadTime = clamp(target.dist / 22, 0.18, 1.0) * (through ? 2.1 : 1);
      const runDir = target.o.vel.lengthSq() > 1 ? target.o.vel : fwd;
      const leadPos = target.o.mesh.position
        .clone()
        .addScaledVector(target.o.vel, leadTime)
        .addScaledVector(runDir.clone().setY(0).normalize(), through ? 7.0 : 0);
      leadPos.x = clamp(leadPos.x, -HALF_L + 2, HALF_L - 2);
      leadPos.z = clamp(leadPos.z, -HALF_W + 2, HALF_W - 2);
      // AIM-ASSIST del pase: mezclar aimDir del jugador con la dirección al receptor.
      // 30% input del jugador + 70% hacia el receptor → el balón va al receptor
      // incluso si el aim del jugador no es perfecto. Esto es "pase asistido".
      const toReceiver = leadPos.sub(p.mesh.position).setY(0).normalize();
      const assistAmt = 0.85; // 85% va al receptor, 15% respeta el input del jugador
      finalDir = aimDir.clone().lerp(toReceiver, assistAmt).normalize();
      const dist = target.dist * (through ? 1.35 : 1);
      const power = clamp(15 + dist * 0.85, 16, 38);
      b.vel.copy(finalDir.clone().multiplyScalar(power));
      b.vel.y = through ? 1.6 : 0.6 + Math.min(1.2, target.dist * 0.03);
      this.passConeData = { a: Math.atan2(finalDir.z, finalDir.x), len: Math.min(target.dist, 26) };
      if (through) this._toast("PASE FILTRADO", "#3df0ff");
    } else {
      // Sin receptor: pase 100% manual en la dirección del input
      const power = through ? 32 : 22;
      b.vel.copy(aimDir.clone().multiplyScalar(power));
      b.vel.y = through ? 1.6 : 0.8;
      this.passConeData = { a: Math.atan2(aimDir.z, aimDir.x), len: 18 };
    }
    b.spin.set(0, 0, 0);
    p.targetHeading = Math.atan2(finalDir.x, finalDir.z);
    this.passConeT = 0.07;
    this.shotKind = "pass";
    // P1-MULTIAGENT: cooldowns/stamina/super/charge ahora por-agente.
    p.controller.kickCooldown = 0.22;
    p.controller.charge = 0;
    p.controller.coyote = 0;
    p.controller.superMeter = clamp(p.controller.superMeter + 0.07, 0, 1);
    this.camShake = Math.max(this.camShake, 0.07);
    this.fx.grass(p.mesh.position.x, p.mesh.position.z, -finalDir.x, -finalDir.z, 3, 0.7);
    sfx.pass();
    // Estadísticas
    if (this.snapshot.stats?.[p.team]) this.snapshot.stats[p.team].passes += 1;
    if (p === this.hero) this.snapshot.heroStats.passes += 1;
    // P1-MULTIAGENT: stats por-jugador
    this._bumpStat(p, "passes");
    // P1-PR-TEST: pase completado +4 PR (cap 25 pases contados, manejado en awardPR).
    // Si fue pase filtrado (through), +18 PR como keyPass.
    awardPR(p, "passCompleted");
    if (through) awardPR(p, "keyPass");
    // Phase 3: tracking del paseador + rating + ball holder
    this.lastTouch = p;
    this.lastPasser = p;
    this.snapshot.ballHolder = {
      team: p.team,
      number: p.number || 0,
      name: p === this.hero ? (this._profileName || "JUGADOR") : (p.baseRole || `#${p.number || 0}`)
    };
    this.snapshot.ballHolderRating = this._ratingFor(p);
    this._applyRatingDelta(p, +0.05);
  }

  // Tipo de tiro según el input mantenido al soltar
  // P1-MULTIAGENT: para el humano local lee this.keys; para IA/remotos lee
  // p.controller.input.low/lofted/side.
  _shotType(p = this.controlled) {
    let inGround, lofted, side;
    const c = p?.controller;
    if (c && !c.isLocal) {
      inGround = !!c.input.low;
      lofted = !!c.input.lofted;
      side = c.input.side || 0;
    } else {
      inGround = this.keys.s || this.keys.arrowdown;
      lofted = this.keys.w || this.keys.arrowup;
      side = (this.keys.d || this.keys.arrowright ? 1 : 0) - (this.keys.a || this.keys.arrowleft ? 1 : 0);
    }
    if (this.ball.mesh.position.y > 1.05) return { kind: "bicycle", side: 0 };
    if (side !== 0) return { kind: "curl", side };
    if (inGround) return { kind: "low", side: 0 };
    if (lofted) return { kind: "placed", side: 0 };
    return { kind: "normal", side: 0 };
  }

  _shoot(rawCharge, p = this.controlled) {
    const b = this.ball;
    const power = clamp(rawCharge, 0.28, 1);
    const boot = this._eff(p.team, "boot");
    // P1-MULTIAGENT: superMeter por-agente.
    const c = p.controller;
    const isSuper = boot || (c.superMeter >= 1 && power >= 0.6);
    const sweet = !isSuper && rawCharge >= SWEET_LO && rawCharge <= SWEET_HI;
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const goal = new THREE.Vector3(HALF_L * TEAMS[p.team].dir, 0, 0);
    const toGoal = goal.clone().sub(p.mesh.position).setY(0).normalize();
    const { kind, side } = this._shotType(p);
    // Aim-assist ASISTIDO (no automático): mezcla suave de fwd con toGoal
    // para que tiros cercanos al arco tengan chance real de ir al arco.
    // Magnet aumenta la mezcla (mejor aim-assist, no auto-aim).
    let assistAmt = this._eff(p.team, "magnet") ? 0.45 : 0.28;
    if (sweet) assistAmt += 0.22;
    if (kind === "placed") assistAmt += 0.16;
    const assist = fwd.clone().lerp(toGoal, clamp(assistAmt, 0, 0.9)).normalize();
    b.spin.set(0, 0, 0);

    if (isSuper) {
      const isAccurate = Math.random() < 0.75;
      if (isAccurate) {
        const cornerZ = (Math.random() < 0.5 ? -1 : 1) * (FIELD.GOAL_W / 2 - 0.6);
        const cornerY = 1.4 + Math.random() * 1.6;
        const aimPoint = new THREE.Vector3(HALF_L * TEAMS[p.team].dir, cornerY, cornerZ);
        const superDir = aimPoint.sub(p.mesh.position).normalize();
        b.vel.copy(superDir.multiplyScalar(82));
        b.vel.y = 4.4 + Math.random() * 1.4;
        this._toast("¡SÚPER DISPARO A LA ESQUINA!", "#ff3b3b");
      } else {
        b.vel.copy(assist.multiplyScalar(70));
        b.vel.y = 5.6;
        this._toast("¡SÚPER DISPARO!", "#ff8a1f");
      }
      this.shotKind = "super";
      this.superShotFx = { t: 0.9 };
      this.camShake = 0.55;
      this.hitstop = 0.06;
      if (boot) this.effects[p.team].boot = 0;
      else c.superMeter = 0;
      sfx.kick(1.6);
      sfx.whoosh(1);
      sfx.superReady();
      crowd.hype(0.24, 1.8);
    } else {
      let speed = 26 + power * 30;
      // Magnet ya no da bonus de velocidad: vuelve a su rol original de aim-assist
      // (manejado arriba en el cálculo de `assist`).
      let lift = 3.2 + power * 4.6;
      if (kind === "low") {
        speed *= 1.16;
        lift = 0.9 + power * 1.1;
      } else if (kind === "placed") {
        speed *= 0.9;
        lift = 4.6 + power * 5.4;
      } else if (kind === "curl") {
        speed *= 1.04;
        lift = 2.6 + power * 4.2;
        b.spin.set(0, side * (7 + power * 9), 0);
      } else if (kind === "bicycle") {
        speed *= 1.1;
        lift = 6.5 + power * 3.4;
        p.squash = 0.9;
        this.camShake = Math.max(this.camShake, 0.3);
        this._toast("¡CHILENA!", "#c56bff");
      }
      if (sweet) {
        speed *= 1.24;
        this.shotKind = "sweet";
        // Ventana perfecta: micro slow-mo + destello + chispas doradas
        this.slowmo = 0.26;
        this.flash = 0.09;
        this.camShake = Math.max(this.camShake, 0.34);
        this.fx.sparks(b.mesh.position.x, 0.6, b.mesh.position.z, "#ffd76a", 20, 11);
        this._toast("¡TIRO PERFECTO!", "#ffd76a");
        sfx.sweetSpot();
        crowd.hype(0.16, 1.4);
      } else {
        this.shotKind = kind;
      }
      b.vel.copy(assist.multiplyScalar(speed));
      b.vel.y = lift;
      c.superMeter = clamp(c.superMeter + 0.05 + power * 0.05, 0, 1);
      sfx.kick(power);
      if (power > 0.62) sfx.whoosh(power);
      this.camShake = Math.max(this.camShake, 0.1 + power * 0.22);
    }
    this.fx.grass(p.mesh.position.x, p.mesh.position.z, -assist.x, -assist.z, 6, 1.1);
    // P1-MULTIAGENT: charge/coyote/kickCooldown por-agente.
    c.charge = 0;
    c.coyote = 0;
    c.kickCooldown = 0.32;
    this.lastTouch = p;
    // Phase 3: el tirador es ahora el ball holder + rating +0.15
    this.snapshot.ballHolder = {
      team: p.team,
      number: p.number || 0,
      name: p === this.hero ? (this._profileName || "JUGADOR") : (p.baseRole || `#${p.number || 0}`)
    };
    this.snapshot.ballHolderRating = this._ratingFor(p);
    // Estadísticas: se cuenta como tiro cualquier disparo (no pases)
    if (this.snapshot.stats?.[p.team]) this.snapshot.stats[p.team].shots += 1;
    if (p === this.hero) this.snapshot.heroStats.shots += 1;
    // P1-MULTIAGENT: stats por-jugador
    this._bumpStat(p, "shots");
    // P1-PR-TEST: PR por tiro. Siempre +2 (tiroOff) base; si fue al arco
    // (determinado por _shotType/aim post-update) +8 en lugar de +2; si fue
    // sweet spot, +4 extra. Aquí sólo podemos dar el base + sweet bonus —
    // el "onTarget" real se determina en _updateBall cuando el balón llega
    // al arco (vía _keeperSave). Para no double-count, damos shotOff aquí
    // y shotOnTarget (+6 delta) en _keeperSave. Sweet bonus va acá.
    awardPR(p, "shotOff");
    if (sweet) awardPR(p, "sweetSpot");
    this._applyRatingDelta(p, +0.15);
  }

  _tackle(p = this.controlled) {
    if (p.controller.tackleCooldown > 0) return;
    if (p.slide > 0 || p.dashT > 0) return;
    const bp = this.ball.mesh.position;
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const input = this._inputDir(p);
    // Prioridad al input del jugador para direccionar la barrida.
    // Si no hay input, usamos el heading actual (nunca "cualquier dirección").
    const aim = input.lengthSq() > 0 ? input : fwd;

    // Buscamos objetivo válido — sólo rivales realmente delante y cerca.
    let target = null;
    let best = -1e9;
    this.players.forEach((o) => {
      if (o.team === p.team) return;
      const rel = o.mesh.position.clone().sub(p.mesh.position).setY(0);
      const d = rel.length();
      if (d > 6.5) return; // antes 9.5 — ya no se barre desde lejos
      const dot = rel.clone().normalize().dot(aim);
      if (dot < 0.35) return; // debe estar razonablemente en la dirección apuntada
      const ballD = o.mesh.position.distanceTo(bp);
      const score = dot * 3 - d * 0.18 - ballD * 0.35;
      if (score > best) {
        best = score;
        target = o;
      }
    });

    // Ventana de timing: barrida lanzada a la distancia justa contra el que conduce
    p.perfectWindow = false;
    if (target) {
      const d = target.mesh.position.distanceTo(p.mesh.position);
      const carrying = target.mesh.position.distanceTo(bp) < 2.0;
      if (carrying && d > 1.7 && d < 3.6) p.perfectWindow = true;
    }

    // Dirección final: SIEMPRE respeta el input del jugador.
    // Sólo hacemos ligero "aim assist" hacia el objetivo cuando el input ya
    // apunta hacia él (dot > 0.75), evitando el efecto "barre solo".
    const ballRel = bp.clone().sub(p.mesh.position).setY(0);
    let dir = aim.clone();
    if (target) {
      const toT = target.mesh.position.clone().sub(p.mesh.position).setY(0).normalize();
      if (toT.dot(aim) > 0.75) {
        // Aim assist suave: 55% aim del jugador + 45% hacia rival
        dir = aim.clone().lerp(toT, 0.45).normalize();
      }
    } else if (ballRel.length() < 5.0 && ballRel.clone().normalize().dot(aim) > 0.5) {
      dir = aim.clone().lerp(ballRel.clone().normalize(), 0.3).normalize();
    }

    p.slide = 0.6; // duración ligeramente más corta: más punitivo si fallás
    p.slideDir.copy(dir);
    // Asistencia ASISTIDA (no automática): tracking suave del objetivo
    // durante el slide, solo si el jugador ya apuntaba hacia él (dot > 0.75).
    // Sin esto las barridas se sienten como deslizar sobre hielo sin control.
    p.slideTarget = target ? target : null;
    p.slideAssist = target ? 0.35 : 0;
    p.stoleThis = false;
    p.shieldBounce = false;
    p.slideBrake = false;
    p.squash = 0.7;
    p.vel.x = dir.x * 24; // antes 26 — recorrido más contenido
    p.vel.z = dir.z * 24;
    p.controller.tackleCooldown = TACKLE_CD;
    this.fx.dust(p.mesh.position.x, p.mesh.position.z, 6, 1.2);
    this.fx.grass(p.mesh.position.x, p.mesh.position.z, dir.x, dir.z, 8, 1.4);
    sfx.tackle();
    // P1-MULTIAGENT: stats por-jugador (tackles = intentos; tacklesWon se bumpa en _slideContacts)
    this._bumpStat(p, "tackles");
    // P1-PR-TEST: si el slide termina sin robo, se penaliza con tackleMissed
    // (-5). Se evalúa en el loop cuando slide→0; aquí sólo marcamos el
    // intento para que el loop pueda detectar "no robó".
    p._prTacklePending = true;
  }

  _slideContacts(p, dt) {
    if (p.slide <= 0) return;
    const b = this.ball;
    this.players.forEach((o) => {
      if (o.team === p.team) return;
      const rel = o.mesh.position.clone().sub(p.mesh.position).setY(0);
      const d = rel.length();
      // Rango de impacto reducido a 1.6 (antes 2.0). Un jugador nunca vuela
      // por una barrida que "casi no lo tocó".
      if (d > 1.6 || d < 0.001) return;
      // Además, la víctima debe estar en el semicírculo delantero del
      // que barre (no atrás): evita el efecto de "te barren sin verte".
      const n = rel.clone().normalize();
      if (n.dot(p.slideDir) < 0.25) return;
      if (this._eff(o.team, "shield") || o.noTackle > 0) {
        if (!p.shieldBounce) {
          p.shieldBounce = true;
          p.vel.x *= -0.35;
          p.vel.z *= -0.35;
          this.camShake = Math.max(this.camShake, 0.16);
          this.fx.sparks(o.mesh.position.x, 1.4, o.mesh.position.z, "#20d47a", 12, 8);
          sfx.shieldHit();
        }
        return;
      }
      o.vel.x += n.x * 15;
      o.vel.z += n.z * 15;
      o.slide = Math.max(o.slide, 0.32);
      o.squash = 0.6;
      o.slideDir.copy(n);
      if (!p.stoleThis && b.mesh.position.distanceTo(o.mesh.position) < 3.2) {
        p.stoleThis = true;
        const to = p.mesh.position.clone().sub(b.mesh.position).setY(0).normalize();
        b.vel.set(to.x * 5 + p.vel.x * 0.3, 1.0, to.z * 5 + p.vel.z * 0.3);
        b.spin.set(0, 0, 0);
        // P1-MULTIAGENT: kickCooldown por-agente (antes this.kickCooldown,
        // que via proxy caía en el héroe local incluso cuando un IA robaba).
        p.controller.kickCooldown = 0.12;
        this.camShake = Math.max(this.camShake, 0.28);
        this.hitstop = 0.11;
        p.slideBrake = true;
        p.vel.x *= 0.42;
        p.vel.z *= 0.42;
        const perfect = !!p.perfectWindow;
        this.fx.grass(o.mesh.position.x, o.mesh.position.z, n.x, n.z, perfect ? 16 : 8, perfect ? 1.8 : 1.1);
        this.fx.dust(o.mesh.position.x, o.mesh.position.z, 6, 1.2);
        if (perfect) {
          // Fase 5: destello blanco de 1 frame + chispas
          this.flash = 0.055;
          this.fx.sparks(o.mesh.position.x, 1.1, o.mesh.position.z, "#ffffff", 18, 10);
          sfx.perfectTackle();
        }
        sfx.steal();
        sfx.recovery();
        // P1-MULTIAGENT: superMeter por-agente — cada agente que roba carga
        // su propio super. Toast/sfx quedan gated al humano local.
        p.controller.superMeter = clamp(p.controller.superMeter + (perfect ? 0.34 : 0.22), 0, 1);
        if (p === this.controlled) {
          this._toast(perfect ? "¡BARRIDA PERFECTA!" : "¡ROBO!", perfect ? "#ffffff" : "#20d47a");
          crowd.hype(perfect ? 0.2 : 0.14, 1.0);
          if (p.controller.superMeter >= 1) sfx.superReady();
        }
        // Estadísticas: robo/barrida exitosa
        if (this.snapshot.stats?.[p.team]) this.snapshot.stats[p.team].tackles += 1;
        if (p === this.hero) this.snapshot.heroStats.tackles += 1;
        // P1-MULTIAGENT: stats por-jugador (tacklesWon = barrida exitosa)
        this._bumpStat(p, "tacklesWon");
        // P1-PR-TEST: PR por barrida exitosa. perfectTackle +30, tackle +15.
        awardPR(p, perfect ? "perfectTackle" : "tackle");
        // Cancelar el pending de tackleMissed: el slide SÍ robó.
        p._prTacklePending = false;
        // Phase 3: el que barre es ahora el ball holder + rating +0.20
        this.lastTouch = p;
        this.snapshot.ballHolder = {
          team: p.team,
          number: p.number || 0,
          name: p === this.hero ? (this._profileName || "JUGADOR") : (p.baseRole || `#${p.number || 0}`)
        };
        this.snapshot.ballHolderRating = this._ratingFor(p);
        this._applyRatingDelta(p, +0.20);
        // TODO P3: wire rating delta for pass interception (-0.15 al paseador
        // previo si era rival). Requiere tracking de toque-por-collision en
        // _updateBall, hoy sólo lastTouch se actualiza en shoot/pass/tackle.
        p.perfectWindow = false;
      }
    });
    if (!p.stoleThis && b.mesh.position.distanceTo(p.mesh.position) < 2.5) {
      p.stoleThis = true;
      b.vel.set(p.slideDir.x * 8 + p.vel.x * 0.35, 1.0, p.slideDir.z * 8 + p.vel.z * 0.35);
      // P1-MULTIAGENT: kickCooldown por-agente.
      p.controller.kickCooldown = 0.1;
      sfx.steal();
      // P1-MULTIAGENT: superMeter por-agente.
      p.controller.superMeter = clamp(p.controller.superMeter + 0.1, 0, 1);
      // P1-PR-TEST: robo de balón suelto = tackle normal (+15). No es
      // perfectTackle porque no había rival carrying. Cancela tackleMissed.
      awardPR(p, "tackle");
      p._prTacklePending = false;
    }
  }

  // El jugador humano controla SIEMPRE su propio personaje: nunca se cambia
  // automáticamente de futbolista. Los compañeros los maneja la IA.
  _updateControlled() {
    if (this.hero && this.controlled !== this.hero) this.controlled = this.hero;
  }

  // Fase 5: atajada — blocaje / rechace / palomita según el tipo de tiro
  _keeperSave(p, kind = "parry", shot = null) {
    const b = this.ball;
    const t = TEAMS[p.team];
    const side = Math.sign((shot ? shot.z : b.mesh.position.z) - p.mesh.position.z) || 1;
    p.diveT = kind === "catch" ? 0.5 : 0.62;
    p.diveKind = kind;
    p.diveSide = side;
    p.squash = kind === "catch" ? 0.45 : 0.8;
    p.vel.set(0, 0, 0);
    if (kind !== "catch") {
      p.vel.x = t.dir * 5;
      p.vel.z = side * (kind === "dive" ? 13 : 8);
    }
    if (kind === "catch") {
      b.vel.set(t.dir * 22, 4.0, (Math.random() - 0.5) * 8);
      this.hitstop = Math.max(this.hitstop, 0.05);
    } else if (kind === "parry") {
      b.vel.set(t.dir * 15, 6.0, side * 10);
    } else {
      b.vel.set(t.dir * 21, 5.0, side * 14);
    }
    b.spin.set(0, 0, 0);
    // P1-MULTIAGENT: kickCooldown por-agente (el arquero que ataja).
    p.controller.kickCooldown = 0.16;
    this.fx.sparks(b.mesh.position.x, Math.max(0.4, b.mesh.position.y), b.mesh.position.z, "#8fd8ff", 14, 9);
    this.fx.grass(p.mesh.position.x, p.mesh.position.z, t.dir, side, 10, 1.4);
    sfx.save();
    // Estadísticas: atajada del arquero
    if (this.snapshot.stats?.[p.team]) this.snapshot.stats[p.team].saves += 1;
    // P1-MULTIAGENT: stats por-jugador (saves para el arquero)
    this._bumpStat(p, "saves");
    // P1-PR-TEST: atajada +35 PR (+15 extra si palomita/dive). El spec
    // dice "arquero humano" pero aplicamos a cualquier arquero para que
    // la IA también acumule PR (sin esto los GKs siempre tendrían PR=0).
    awardPR(p, "save");
    if (kind === "dive") awardPR(p, "saveDive");
    if (kind === "dive") {
      this.slowmo = 0.38;
      this.camShake = Math.max(this.camShake, 0.3);
      this._toast("¡PALOMITA!", "#8fd8ff");
      crowd.hype(0.2, 1.6);
    } else if (kind === "catch") {
      this._toast("BLOCAJE", "#8fd8ff");
    } else {
      this.camShake = Math.max(this.camShake, 0.16);
      this._toast("¡RECHAZA EL ARQUERO!", "#8fd8ff");
    }
  }

  _movePlayer(p, dir, sprint, dt) {
    if (p.slide > 0) {
      if (p.slideAssist > 0 && p.slideTarget) {
        p.slideAssist -= dt;
        const want = p.slideTarget.mesh.position.clone().sub(p.mesh.position).setY(0);
        const cur = new THREE.Vector3(p.vel.x, 0, p.vel.z);
        const spd = cur.length();
        if (want.lengthSq() > 0.04 && spd > 1) {
          want.normalize();
          cur.normalize().lerp(want, 1 - Math.exp(-6 * dt)).normalize();
          p.vel.x = cur.x * spd;
          p.vel.z = cur.z * spd;
          p.slideDir.copy(cur);
        }
      }
      const fr = Math.exp(-(p.slideBrake ? 6.8 : 3.0) * dt);
      p.vel.x *= fr;
      p.vel.z *= fr;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.z += p.vel.z * dt;
      p.mesh.position.x = clamp(p.mesh.position.x, -HALF_L - 2, HALF_L + 2);
      p.mesh.position.z = clamp(p.mesh.position.z, -HALF_W - 2, HALF_W + 2);
      p.speed = Math.hypot(p.vel.x, p.vel.z);
      p.targetHeading = Math.atan2(p.slideDir.x, p.slideDir.z);
      p.mesh.rotation.y += shortAngle(p.targetHeading - p.mesh.rotation.y) * (1 - Math.exp(-14 * dt));
      p.heading = p.mesh.rotation.y;
      if (p.speed > 8 && Math.random() < 0.6) {
        this.fx.grass(p.mesh.position.x, p.mesh.position.z, p.slideDir.x, p.slideDir.z, 3, 1.2);
      }
      return;
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      const fr = Math.exp(-4.2 * dt);
      p.vel.x *= fr;
      p.vel.z *= fr;
      if (dir.lengthSq() > 0) {
        p.vel.x += dir.x * 42 * dt;
        p.vel.z += dir.z * 42 * dt;
      }
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.z += p.vel.z * dt;
      p.mesh.position.x = clamp(p.mesh.position.x, -HALF_L - 2, HALF_L + 2);
      p.mesh.position.z = clamp(p.mesh.position.z, -HALF_W - 2, HALF_W + 2);
      p.speed = Math.hypot(p.vel.x, p.vel.z);
      if (p.speed > 0.6) p.targetHeading = Math.atan2(p.vel.x, p.vel.z);
      p.mesh.rotation.y += shortAngle(p.targetHeading - p.mesh.rotation.y) * (1 - Math.exp(-16 * dt));
      p.heading = p.mesh.rotation.y;
      return;
    }
    const eff = this.effects[p.team] || {};
    let mul = 1;
    if (eff.bolt > 0) mul *= 1.3;
    if (eff.slow > 0) mul *= 0.58;
    const base = (p.keeper ? 8 : 11.6) * mul;
    const max = sprint ? base * 1.5 : base;
    // Aceleración gradual: arrancar cuesta más que mantener velocidad.
    // El sprint tiene una curva de aceleración más larga (sensación de inercia).
    const target = dir.clone().multiplyScalar(max);
    const cur = new THREE.Vector3(p.vel.x, 0, p.vel.z);
    const moving = dir.lengthSq() > 0;
    const reversing = moving && cur.dot(dir) < 0;
    const prevSpeed = cur.length();
    // Curvas distintas: arranque más lento (sensación de inercia), frenada agresiva,
    // cambio de dirección con coyote (mantiene inercia un instante).
    // A mayor velocidad actual, más fácil mantenerla (menos resistencia).
    let accel;
    if (!moving) accel = 32; // frenada agresiva
    else if (reversing) accel = 22;
    else if (sprint) {
      // Sprint: arranque lento (8), se acelera con la velocidad (hasta 18)
      // Esto da una sensación de "tomar carrera" antes de llegar a max speed.
      const speedRatio = prevSpeed / max; // 0 = parado, 1 = max speed
      accel = 8 + speedRatio * 10; // 8 al arrancar, 18 a max speed
    } else {
      // Walk: arranque medio (14), llega a 22 a max speed
      const speedRatio = prevSpeed / max;
      accel = 14 + speedRatio * 8;
    }
    const k = 1 - Math.exp(-accel * dt);
    p.vel.x = lerp(p.vel.x, target.x, k);
    p.vel.z = lerp(p.vel.z, target.z, k);
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.z += p.vel.z * dt;
    p.mesh.position.x = clamp(p.mesh.position.x, -HALF_L - 2, HALF_L + 2);
    p.mesh.position.z = clamp(p.mesh.position.z, -HALF_W - 2, HALF_W + 2);
    p.speed = Math.hypot(p.vel.x, p.vel.z);
    if (p.speed > 0.6) p.targetHeading = Math.atan2(p.vel.x, p.vel.z);

    // Polvo de frenada brusca
    if (!moving && prevSpeed > 11 && p.speed < prevSpeed - 1.4 && Math.random() < 0.7) {
      this.fx.dust(p.mesh.position.x, p.mesh.position.z, 4, 1.3);
    }
    // Cubitos de pasto al correr
    if (p.speed > 8.5 && Math.random() < (sprint ? 0.5 : 0.24)) {
      const inv = 1 / Math.max(0.001, p.speed);
      this.fx.grass(p.mesh.position.x, p.mesh.position.z, p.vel.x * inv, p.vel.z * inv, 2, sprint ? 1.1 : 0.75);
    }

    const diff = shortAngle(p.targetHeading - p.mesh.rotation.y);
    const maxTurn = (7.5 + p.speed * 0.5) * dt;
    const step = diff * (1 - Math.exp(-15 * dt));
    p.mesh.rotation.y += clamp(step, -maxTurn, maxTurn);
    p.heading = p.mesh.rotation.y;
  }

  _separatePlayers(dt) {
    const R = 0.92;
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const pi = this.players[i];
        const pj = this.players[j];
        const a = pi.mesh.position;
        const b = pj.mesh.position;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < R * 2) {
          const push = (R * 2 - d) * Math.min(1, dt * 14);
          const nx = dx / d;
          const nz = dz / d;
          // El jugador controlado pesa más: los rivales se abren en vez de
          // trabarlo. Nunca queda encajonado por un bloque de IA.
          let wa = 0.5;
          let wb = 0.5;
          if (pi === this.controlled) {
            wa = 0.12;
            wb = 0.88;
          } else if (pj === this.controlled) {
            wa = 0.88;
            wb = 0.12;
          }
          a.x -= nx * push * wa;
          a.z -= nz * push * wa;
          b.x += nx * push * wb;
          b.z += nz * push * wb;
        }
      }
    }
  }

  _dribble(dt) {
    // El que lleva la pelota es el jugador más cercano (dentro del alcance),
    // no sólo el héroe local. Así los jugadores remotos (multiplayer) también
    // llevan la pelota pegada al pie cuando corren, en vez de dejarla atrás.
    const b = this.ball;
    let p = null;
    let d = 1e9;
    for (const pl of this.players) {
      // Sólo jugadores humanos (héroe local + remotos). Los de IA manejan la
      // pelota con su propia lógica en ai.js, así que no les pegamos la bola.
      if (pl !== this.controlled && !pl.controller?.isRemote) continue;
      if (pl.slide > 0) continue;
      const dd = b.mesh.position.distanceTo(pl.mesh.position);
      if (dd < d) { d = dd; p = pl; }
    }
    if (!p) return;
    const magnet = this._eff(p.team, "magnet");
    if (d > (magnet ? 3.5 : 2.4) || (p.controller?.kickCooldown ?? 0) > 0) return;

    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const carryDist = 0.68 + Math.min(0.55, p.speed * 0.055);
    const targetX = p.mesh.position.x + fwd.x * carryDist;
    const targetZ = p.mesh.position.z + fwd.z * carryDist;

    const ballSpd = b.vel.length();
    const fastBall = ballSpd > (magnet ? 20 : 12);
    let snap = fastBall ? 9 : d < 1.0 ? 26 : d < 1.8 ? 19 : 13;
    if (magnet) snap *= 1.6;
    // Sticky control: el imán al pie se corta al esprintar (menos control, más riesgo).
    // p.speed > 12 es el proxy de sprint para jugadores locales y remotos.
    const sprinting = p.speed > 12;
    if (sprinting && !magnet) snap *= 0.55;
    const k = 1 - Math.exp(-snap * dt);
    b.mesh.position.x = lerp(b.mesh.position.x, targetX, k);
    b.mesh.position.z = lerp(b.mesh.position.z, targetZ, k);

    if (fastBall) {
      const kv = 1 - Math.exp(-6 * dt);
      b.vel.x = lerp(b.vel.x, p.vel.x, kv);
      b.vel.z = lerp(b.vel.z, p.vel.z, kv);
      b.vel.y = lerp(b.vel.y, 0, kv);
    } else {
      b.vel.x = lerp(b.vel.x, p.vel.x * 1.06, k);
      b.vel.z = lerp(b.vel.z, p.vel.z * 1.06, k);
    }
    b.mesh.position.y = BALL_R;
  }

  _spawnDust(x, z) {
    this.fx.dust(x, z, 4, 1);
  }

  _updateBall(dt) {
    const b = this.ball;
    const p = b.mesh.position;
    const airborne = p.y > BALL_R + 0.02;

    // Fase 1: efecto Magnus — la curva sale del spin acumulado
    if (b.spin.lengthSq() > 0.01) {
      const acc = new THREE.Vector3().crossVectors(b.spin, b.vel).multiplyScalar(MAGNUS);
      b.vel.addScaledVector(acc, dt);
      b.spin.multiplyScalar(Math.exp(-(airborne ? 0.55 : 2.6) * dt));
    }

    p.addScaledVector(b.vel, dt);
    b.vel.y -= 24 * dt;
    if (p.y < BALL_R) {
      p.y = BALL_R;
      const imp = -b.vel.y;
      if (imp > 1.2) {
        // Bote escalonado: pierde más energía en cada escalón, no linealmente
        const e = imp > 15 ? 0.6 : imp > 8 ? 0.48 : imp > 3.5 ? 0.33 : 0.17;
        b.vel.y = imp * e;
        if (imp > 6) this.fx.grass(p.x, p.z, b.vel.x * 0.04, b.vel.z * 0.04, 3, 0.8);
      } else {
        b.vel.y = 0;
      }
      const spd = Math.hypot(b.vel.x, b.vel.z);
      // Fricción de rodadura por tramos
      const fric = spd > 26 ? 0.3 : spd > 12 ? 0.55 : spd > 4 ? 1.15 : 2.2;
      b.vel.x *= 1 - Math.min(0.9, fric * dt);
      b.vel.z *= 1 - Math.min(0.9, fric * dt);
    } else {
      b.vel.x *= 1 - 0.08 * dt;
      b.vel.z *= 1 - 0.08 * dt;
    }
    if (Math.abs(p.z) > HALF_W - 0.4) {
      p.z = clamp(p.z, -HALF_W + 0.4, HALF_W - 0.4);
      if (Math.abs(b.vel.z) > 7) sfx.wallHit();
      b.vel.z *= -0.72;
      b.spin.y *= -0.5;
    }
    const inGoalMouth = Math.abs(p.z) < FIELD.GOAL_W / 2 - 0.2 && p.y < FIELD.GOAL_H;
    if (Math.abs(p.x) > HALF_L - 1.6 && !inGoalMouth) {
      p.x = clamp(p.x, -HALF_L + 1.6, HALF_L - 1.6);
      if (Math.abs(b.vel.x) > 9) {
        if (Math.abs(p.z) < FIELD.GOAL_W / 2 + 1.6) {
          // Fase 5: al palo — metálico + shake + chispas cúbicas
          sfx.post();
          this.camShake = Math.max(this.camShake, 0.28);
          this.hitstop = 0.05;
          this.fx.sparks(p.x, Math.max(0.6, p.y), p.z, "#ffe9a8", 20, 12);
          this._toast("¡AL PALO!", "#ffd21c");
          crowd.hype(0.1, 0.9);
        } else sfx.wallHit();
      }
      b.vel.x *= -0.72;
    }
    if (this.goalCooldown <= 0 && Math.abs(p.x) > HALF_L - 1.2 && inGoalMouth) {
      const scorer = p.x > 0 ? "red" : "blue";
      const goalDir = Math.sign(p.x);
      this.snapshot.score[scorer] += 1;
      this.snapshot.goalText = TEAMS[scorer].label;
      this.snapshot.goalScorer = scorer;
      // Autor del gol: último tocador del equipo que anota
      const byHero =
        this.hero &&
        this.hero.team === scorer &&
        this.lastTouch === this.hero;
      if (byHero) this.snapshot.heroStats.goals += 1;
      // Info del autor para el banner de gol (nombre + número)
      const shooter = this.lastTouch && this.lastTouch.team === scorer ? this.lastTouch : null;
      const heroName = (this._profileName || "").toUpperCase();
      this.snapshot.goalScorerNumber = shooter ? shooter.number : null;
      this.snapshot.goalScorerHero = !!byHero;
      this.snapshot.goalScorerName = byHero && heroName
        ? heroName
        : shooter
        ? `#${shooter.number}`
        : TEAMS[scorer].label;
      // Marcar todos los jugadores del equipo scorer para que celebren
      this.celebrateTeam = scorer;
      this.celebrateT = 3.2;
      this.players.forEach((pl) => {
        pl.celebrate = pl.team === scorer;
        pl.celebT = pl.team === scorer ? Math.random() * 0.35 : 0;
        pl.celebHopPhase = Math.random() * Math.PI * 2;
      });
      const elapsed = this.halfLen - this.snapshot.clock;
      const minute = Math.max(1, Math.ceil(elapsed / (this.halfLen / 45))); // aprox 45' por tiempo
      this.snapshot.goals.push({
        team: scorer,
        half: this.half,
        minute,
        byHero: !!byHero,
        scorer: this.snapshot.goalScorerName,
      });
      // Phase 3: rating deltas al autor del gol / asistencia / gol en contra.
      if (this.lastTouch) {
        if (this.lastTouch.team === scorer) {
          // Gol legítimo: +1.5 al autor, +1.0 al asistente (si hubo pase).
          this._applyRatingDelta(this.lastTouch, +1.5);
          // P1-MULTIAGENT: stats por-jugador (goals al autor, assists al pasador)
          this._bumpStat(this.lastTouch, "goals");
          // P1-PR-TEST: gol +100 PR (+25 bonus si fue chilena o fuera de área).
          // Detectamos chilena vía shotKind; el "fuera de área" requiere
          // saber la posición del tirador al impactar — aproximamos con la
          // posición actual del lastTouch (sigue cerca del arco rival).
          {
            const shooterPos = this.lastTouch.mesh.position;
            const goalX = HALF_L * TEAMS[scorer].dir;
            const distToGoal = Math.abs(Math.abs(goalX) - Math.abs(shooterPos.x));
            const fromOutsideArea = distToGoal > 16.5; // 16.5m = borde del área
            const isBicycle = this.shotKind === "bicycle";
            const goalExtra = (fromOutsideArea || isBicycle) ? PR_TABLE.goalBonus : 0;
            awardPR(this.lastTouch, "goal", goalExtra);
          }
          if (
            this.lastPasser &&
            this.lastPasser.team === scorer &&
            this.lastPasser !== this.lastTouch
          ) {
            this._applyRatingDelta(this.lastPasser, +1.0);
            this._bumpStat(this.lastPasser, "assists");
            // P1-PR-TEST: asistencia +60 PR.
            awardPR(this.lastPasser, "assist");
          }
        } else {
          // Gol en contra: el último toque fue de un rival que la mandó adentro.
          this._applyRatingDelta(this.lastTouch, -1.0);
          // P1-MULTIAGENT: gol en contra se cuenta como goal del scorer team
          // atribuido al último toque rival (estadística de "own goal").
          this._bumpStat(this.lastTouch, "goals");
          // P1-PR-TEST: gol en contra -40 PR al autor desafortunado.
          awardPR(this.lastTouch, "ownGoal");
        }
      }
      this.lastPasser = null; // se consume la asistencia al atribuirla
      this.goalCooldown = 3.4;
      this.goalScoredBy = scorer;
      // Frenar la pelota adentro del arco: sin esta guarda la anima se rompe
      // porque la bola sigue viajando y se sale por el fondo del stage.
      const netX = (HALF_L - 0.7) * goalDir;
      p.x = netX;
      p.y = Math.min(Math.max(p.y, BALL_R), FIELD.GOAL_H * 0.55);
      p.z = clamp(p.z, -FIELD.GOAL_W / 2 + 0.6, FIELD.GOAL_W / 2 - 0.6);
      b.vel.set(-goalDir * 0.6, 0, 0);
      b.spin.set(0, 0, 0);
      this.kickCooldown = 0.4;
      this.camShake = 0.5;
      // Confeti voxel del color del equipo (1 draw call)
      const cols =
        scorer === "red"
          ? ["#ff2d3c", "#ff6a1f", "#ffd21c", "#ffffff"]
          : ["#2f74ff", "#3df0ff", "#ffd21c", "#ffffff"];
      this.fx.confetti(scorer === "red" ? HALF_L - 6 : -HALF_L + 6, 0, cols, 170);
      this.fx.sparks(p.x, 1.2, p.z, cols[0], 22, 13);
      rippleNet(this.scene, Math.sign(p.x), 1.25);
      flashLedBoards(this.scene, 1);
      sfx.netHit();
      sfx.goalHorn();
      sfx.crowdRoar();
      sfx.goalFanfare();
      crowd.hype(0.28, 3.2);
      // Tiempo bala: último toque en el tiempo agregado
      if (this.snapshot.clock < 22) {
        this.slowmo = 0.75;
        this.flash = 0.1;
      }
    }

    // Si el jugador controlado está conduciendo, un rival no le roba por
    // simple contacto: tiene que barrer. Evita perder la pelota "sin culpa".
    const carrying =
      this.controlled &&
      this.controlled.slide <= 0 &&
      this.controlled.mesh.position.distanceTo(p) < 1.5 &&
      b.vel.length() < 22;

    this.players.forEach((pl) => {
      const dv = p.clone().sub(pl.mesh.position).setY(0);
      const d = dv.length();
      if (pl === this.controlled && d < 2.5 && b.vel.length() < 22) return;
      if (carrying && pl !== this.controlled && pl.slide <= 0) return;
      if (d < 0.95) {
        const n = d > 0 ? dv.clone().normalize() : new THREE.Vector3(1, 0, 0);
        p.x = pl.mesh.position.x + n.x * 0.8;
        p.z = pl.mesh.position.z + n.z * 0.8;
        const bSpd = b.vel.length();
        if (bSpd < 18) {
          const fwd = new THREE.Vector3(Math.sin(pl.mesh.rotation.y), 0, Math.cos(pl.mesh.rotation.y));
          b.vel.x = fwd.x * (bSpd * 0.15) + pl.vel.x * 0.6;
          b.vel.z = fwd.z * (bSpd * 0.15) + pl.vel.z * 0.6;
          b.vel.y = 0;
        } else {
          b.vel.x = n.x * bSpd * 0.5 + pl.vel.x * 0.5;
          b.vel.z = n.z * bSpd * 0.5 + pl.vel.z * 0.5;
          this.fx.dust(p.x, p.z, 3, 0.9);
        }
      }
    });

    const cp = this.controlled;
    if (cp && cp.slide <= 0 && this.kickCooldown <= 0) {
      const to = cp.mesh.position.clone().sub(p).setY(0);
      const dist = to.length();
      if (dist > 1.0 && dist < 3.4 && b.vel.length() < 24) {
        let closer = null;
        let cd = 1e9;
        this.players.forEach((pl) => {
          const dd = pl.mesh.position.distanceTo(p);
          if (dd < cd) {
            cd = dd;
            closer = pl;
          }
        });
        if (closer === cp) {
          const pull = to.normalize().multiplyScalar(6.5);
          const kk = 1 - Math.exp(-8 * dt);
          b.vel.x += pull.x * kk;
          b.vel.z += pull.z * kk;
        }
      }
    }

    const spd = Math.hypot(b.vel.x, b.vel.z);
    if (spd > 0.1) {
      const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize();
      b.mesh.rotateOnWorldAxis(axis, (spd * dt) / BALL_R);
    }
    b.shadow.position.set(p.x, 0.02, p.z);
    const yFactor = clamp(1 - (p.y - BALL_R) / 4, 0.25, 1);
    b.shadow.scale.set(yFactor, yFactor, 1);
    b.shadow.material.opacity = 0.32 * yFactor;

    // Trail: color según el tipo de tiro (blanco raso, dorado sweet spot).
    // Con "Balón de fuego" activo o super shot: pelota prendida fuego con
    // estela intensa de fuego + chispas cúbicas naranja/rojo/amarillo.
    const boots = (this.effects.red && this.effects.red.boot > 0) || (this.effects.blue && this.effects.blue.boot > 0);
    const onFire = boots || this.shotKind === "super" || (this.superShotFx && this.superShotFx.t > 0);
    const trailCol = onFire
      ? "#ff5a12"
      : this.shotKind === "sweet"
      ? "#ffd76a"
      : "#ffffff";
    this.trail.visible = spd > 8 || onFire;
    if (this.trail.visible) {
      const superOn = spd > 45 || this.shotKind === "sweet" || onFire;
      const len = clamp(spd / 18, onFire ? 1.6 : 0.8, superOn ? 5.4 : 2.6);
      const dirA = Math.atan2(b.vel.z, b.vel.x);
      this.trail.position.set(
        p.x - Math.cos(dirA) * len * 1.5,
        Math.max(0.06, p.y - 0.05),
        p.z - Math.sin(dirA) * len * 1.5
      );
      this.trail.rotation.z = -dirA;
      this.trail.material.color.set(trailCol);
      this.trail.material.opacity = onFire
        ? 0.75
        : clamp((spd - 13) / (superOn ? 34 : 44), 0.06, superOn ? 0.8 : 0.42);
      this.trail.scale.set(len, superOn ? 1.9 : 1, 1);
      if (spd > 20 || onFire) this.fx.trailCube(p.x, p.y, p.z, trailCol, onFire ? 0.24 : spd > 45 ? 0.19 : 0.13);
    }
    // Chispas de fuego constantes cuando el balón está prendido
    if (onFire) {
      const spawn = Math.random() < (spd > 20 ? 0.85 : 0.55);
      if (spawn) {
        const cols = ["#ff2d12", "#ff8a1f", "#ffd21c", "#ff5a12"];
        this.fx.sparks(p.x, p.y + 0.2, p.z, cols[Math.floor(Math.random() * cols.length)], 3, 6);
      }
      if (Math.random() < 0.35) {
        this.fx.trailCube(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.3 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.3, "#ffd21c", 0.35);
      }
    }
  }

  // Indicador "tu jugador": anillo + flecha sobre el controlled.
  // Se llama tanto en el loop del host como en el render del cliente (que
  // saltea la simulación y por eso antes no posicionaba el indicador).
  _updatePlayerIndicator(dt) {
    const cp = this.controlled?.mesh?.position;
    if (!cp) return;
    const povOn = this.camMode === "pov";
    this.ring.visible = !povOn;
    this.arrow.visible = !povOn;
    this.ring.position.set(cp.x, 0.06, cp.z);
    this.ring.rotation.z = this.time * 0.9; // anillo voxel girando suave
    this.arrow.position.set(cp.x, TOTAL + 0.22 + Math.sin(this.time * 4) * 0.12, cp.z);
  }

  _updateCamera(dt) {
    const b = this.ball.mesh.position;
    const bv = this.ball.vel;
    const c = this.camera;
    if (this.camMode === "area") {
      const cp = this.controlled.mesh.position;
      const leadX = clamp(bv.x * 0.22, -6, 6);
      const leadZ = clamp(bv.z * 0.18, -4, 4);
      const focusX = (b.x + leadX) * 0.72 + cp.x * 0.2;
      const focusZ = (b.z + leadZ) * 0.5 + cp.z * 0.18;
      const tp = new THREE.Vector3(focusX * 0.86, 20.6, focusZ * 0.7 + 23);
      c.position.lerp(tp, 1 - Math.exp(-2.6 * dt));
      this.camLook = this.camLook || new THREE.Vector3(0, 1.7, 0);
      this.camLook.lerp(new THREE.Vector3(focusX, 1.7, focusZ * 0.6), 1 - Math.exp(-4.2 * dt));
      c.lookAt(this.camLook);
      // Fase 2: FOV que respira — se abre en contraataque, se cierra en el área
      const inBox = Math.abs(b.x) > HALF_L - 15;
      const breaking = Math.hypot(bv.x, bv.z) > 24 && !inBox;
      this.fovTarget = 45 + (breaking ? 3.4 : 0) - (inBox ? 3.2 : 0);
    } else {
      const p = this.controlled;
      const sens = clamp(getSettings().povSens || 1, 0.4, 2);
      // Yaw propio de la cámara POV: sigue al jugador con retardo, así el
      // input no se realimenta con la rotación instantánea del personaje.
      this.povYaw += shortAngle(p.mesh.rotation.y - this.povYaw) * (1 - Math.exp(-3.4 * sens * dt));
      const fwd = new THREE.Vector3(Math.sin(this.povYaw), 0, Math.cos(this.povYaw));
      const tp = p.mesh.position.clone().addScaledVector(fwd, -4.4).setY(3.3);
      c.position.lerp(tp, 1 - Math.exp(-6 * sens * dt));
      this.camLook = this.camLook || new THREE.Vector3();
      this.camLook.lerp(p.mesh.position.clone().addScaledVector(fwd, 9).setY(1.45), 1 - Math.exp(-7 * sens * dt));
      c.lookAt(this.camLook);
      this.fovTarget = 64 + (p.speed > 15 ? 3 : 0);
    }
    if (Math.abs(c.fov - this.fovTarget) > 0.01) {
      c.fov = damp(c.fov, this.fovTarget, 2.4, dt);
      c.updateProjectionMatrix();
    }
    if (this.camShake > 0) {
      c.position.x += (Math.random() - 0.5) * this.camShake;
      c.position.y += (Math.random() - 0.5) * this.camShake * 0.6;
      c.position.z += (Math.random() - 0.5) * this.camShake;
    }
  }

  _consumeBuffers(dt) {
    Object.keys(this.buf).forEach((k) => {
      if (this.buf[k] > 0) this.buf[k] = Math.max(0, this.buf[k] - dt);
    });
    if (this.buf.shoot > 0 && this._canKick()) {
      this.buf.shoot = 0;
      this._shoot(this.bufCharge);
    }
    if (this.buf.pass > 0 && this._canKick()) {
      this.buf.pass = 0;
      this._pass();
    }
    if (this.buf.tackle > 0 && this.tackleCooldown <= 0) {
      this.buf.tackle = 0;
      this._tackle();
    }
    if (this.buf.dash > 0 && this.dashCooldown <= 0) {
      this.buf.dash = 0;
      this._dash();
    }
  }

  // P2-SYNC-TEST: drive a remote-human player from network input.
  // Called every frame from _loop in place of updateAI for players whose
  // controller.isRemote === true (set by HostSync._markRemoteHumans).
  // Reads controller.input.{ax,az,sprint,shoot,pass,tackle,dash,charge}
  // (written by HostSync._applyRemoteInputs from the latest 30Hz packet) and
  // moves the player + triggers actions using the per-agent controller
  // cooldowns (so remote humans respect the same rules as the local hero).
  _updateRemoteHuman(p, dt) {
    const c = p?.controller;
    if (!c) return;
    const inp = c.input || {};
    const ax = Number(inp.ax) || 0;
    const az = Number(inp.az) || 0;
    const dir = new THREE.Vector3(ax, 0, az);
    if (dir.lengthSq() > 1) dir.normalize();
    const sprint = !!inp.sprint && (c.stamina > 0.02 || this._eff(p.team, "bolt"));
    // Movement: same _movePlayer path as the local hero (respects slides,
    // boundaries, etc.). For remote humans we use the input direction
    // directly (already in world space — the client sends screen-space which
    // equals world space under the default aerial camera).
    this._movePlayer(p, dir, sprint, dt);
    // Heading: face movement direction (or keep current if idle).
    if (dir.lengthSq() > 0.01) {
      const wantYaw = Math.atan2(dir.x, dir.z);
      p.targetHeading = wantYaw;
      p.mesh.rotation.y += shortAngle(wantYaw - p.mesh.rotation.y) * (1 - Math.exp(-12 * dt));
      p.heading = p.mesh.rotation.y;
    }
    // Stamina drain/recovery mirrors the local hero's logic.
    const drain = this._eff(p.team, "bolt") ? 0 : this._hasBall(p) ? -0.13 : -0.26;
    const recovery = dir.lengthSq() > 0.01 ? 0.10 : 0.20;
    c.stamina = clamp(c.stamina + (sprint ? drain : recovery) * dt, 0, 1);
    // Cooldowns tick down.
    if (c.kickCooldown > 0) c.kickCooldown = Math.max(0, c.kickCooldown - dt);
    if (c.tackleCooldown > 0) c.tackleCooldown = Math.max(0, c.tackleCooldown - dt);
    if (c.dashCooldown > 0) c.dashCooldown = Math.max(0, c.dashCooldown - dt);
    // Action buttons: trigger on rising edge (just-pressed). The client
    // sends the held-state every 30Hz; we approximate "just pressed" by
    // tracking the previous frame's state in c._lastInput.
    const prev = c._lastInput || {};
    // El tiro se resuelve al SOLTAR el botón (mismo comportamiento que el
    // héroe local): se carga mientras se mantiene y se dispara con la carga
    // acumulada en el último frame de mantenido (prev.charge). Antes se
    // disparaba en el flanco de subida con la carga recién iniciada (~0),
    // por eso el invitado "pateaba sin fuerza".
    const shootReleased = !inp.shoot && (!!prev.shoot || !!inp.release);
    const passPressed = !!inp.pass && !prev.pass;
    const tacklePressed = !!inp.tackle && !prev.tackle;
    const dashPressed = !!inp.dash && !prev.dash;
    if (shootReleased && c.kickCooldown <= 0 && this._canKick(p)) {
      this._shoot(Number(prev.charge) || Number(inp.charge) || 0.7, p);
      c.kickCooldown = 0.22;
    }
    if (passPressed && c.kickCooldown <= 0 && this._canKick(p)) {
      this._pass(p);
      c.kickCooldown = 0.22;
    }
    if (tacklePressed && c.tackleCooldown <= 0) {
      this._tackle(p);
    }
    if (dashPressed && c.dashCooldown <= 0) {
      this._dash(p);
    }
    c._lastInput = {
      shoot: !!inp.shoot,
      pass: !!inp.pass,
      tackle: !!inp.tackle,
      dash: !!inp.dash,
      release: !!inp.release,
      charge: Number(inp.charge) || 0,
    };
    // `release` is an edge event, unlike the held buttons. Consume it after
    // one simulation tick so a delayed packet cannot fire repeatedly.
    inp.release = false;
  }

  /**
   * Percepción local del jugador controlado: flecha de dirección/fuerza al
   * cargar el tiro, indicador de pase y cono de pase. El host ya lo dibuja
   * en su render; el cliente (invitado) no simula, así que lo llamamos desde
   * su rama de render para que vea las MISMAS ayudas visuales.
   */
  _updatePerception() {
    const cpl = this.controlled;
    if (!cpl?.mesh) return;
    const cp = cpl.mesh.position;
    const povOn = this.camMode === "pov";
    const hasBallNow = !this.paused && (
      this.networkMode === "client" ? !!this.snapshot.hasBall : this._hasBall()
    );
    const sweetNow = this.holdShoot && this.charge >= SWEET_LO && this.charge <= SWEET_HI;

    if (hasBallNow && this.holdShoot && !povOn) {
      const fwd = new THREE.Vector3(Math.sin(cpl.heading), 0, Math.cos(cpl.heading));
      const goal = new THREE.Vector3(HALF_L * TEAMS[cpl.team].dir, 0, 0);
      const toGoal = goal.clone().sub(cpl.mesh.position).setY(0).normalize();
      const dirv = fwd.lerp(toGoal, this._eff(cpl.team, "magnet") ? 0.45 : 0.28).normalize();
      const len = 4.5 + this.charge * 12;
      const a = Math.atan2(dirv.z, dirv.x);
      const superOn = this.superMeter >= 1 || this.effects[cpl.team].boot > 0;
      this.aimGuide.visible = true;
      this.aimGuide.position.set(cp.x + Math.cos(a) * len * 0.5, 0.07, cp.z + Math.sin(a) * len * 0.5);
      this.aimGuide.rotation.z = -a;
      this.aimGuide.scale.set(len, 1.1 + this.charge * 0.8, 1);
      this.aimGuide.material.color.set(
        superOn ? "#ff6a1f" : sweetNow ? "#ffd76a" : this.charge > 0.9 ? "#ff3b3b" : "#ffd21c"
      );
      this.aimGuide.material.opacity = 0.3 + this.charge * 0.4 + (sweetNow ? 0.22 : 0);
    } else {
      this.aimGuide.visible = false;
    }

    if (hasBallNow && !this.holdShoot && !povOn) {
      const fwd2 = new THREE.Vector3(Math.sin(cpl.heading), 0, Math.cos(cpl.heading));
      const inp = this._inputDir();
      const aimForHint = inp.lengthSq() > 0 ? inp.clone().normalize() : fwd2;
      const tgt = this._bestPassTarget(aimForHint);
      if (tgt) {
        this.passHint.visible = true;
        this.passHint.position.set(tgt.o.mesh.position.x, 0.05, tgt.o.mesh.position.z);
        this.passHint.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
        this.passHint.material.opacity = 0.45 + Math.sin(this.time * 6) * 0.18;
        const from = new THREE.Vector3(cp.x, 0.1, cp.z);
        const to = new THREE.Vector3(tgt.o.mesh.position.x, 0.1, tgt.o.mesh.position.z);
        this.passLine.geometry.setFromPoints([from, to]);
        this.passLine.material.opacity = 0.5 + Math.sin(this.time * 6) * 0.15;
        this.passLine.visible = true;
      } else {
        this.passHint.visible = false;
        this.passLine.visible = false;
      }
    } else {
      this.passHint.visible = false;
      this.passLine.visible = false;
    }

    if (this.passConeT > 0 && this.passConeData && !povOn) {
      const { a, len } = this.passConeData;
      this.passCone.visible = true;
      this.passCone.position.set(cp.x + Math.cos(a) * len * 0.5, 0.075, cp.z + Math.sin(a) * len * 0.5);
      this.passCone.rotation.z = -a;
      this.passCone.scale.set(len, 2.4, 1);
      this.passCone.material.opacity = 0.55 * (this.passConeT / 0.07);
    } else {
      this.passCone.visible = false;
    }
  }

  _scheduleFrame() {
    if (this._rafPending) return;
    this._rafPending = true;
    this.raf = requestAnimationFrame(() => {
      this._rafPending = false;
      this._loop();
    });
  }

  _updateClientVisuals(dt) {
    const cp = this.controlled?.mesh?.position;
    const b = this.ball;
    if (!b?.mesh) return;

    // Power-up items are authoritative, but their animation is local-only.
    // Without this pass syncItems() leaves every received group at scale 0.01.
    try { this.powerups?.updateVisual?.(dt, this.time); } catch (e) { /* noop */ }

    // The host and the state buffer are authoritative, but the local guest
    // player is intentionally a few frames ahead while being predicted. When
    // that player owns the ball, render the same short dribble leash locally
    // so the ball does not visibly trail behind the responsive mesh.
    if (this.networkMode === "client" && this.snapshot.hasBall && this.controlled?.mesh) {
      const p = this.controlled;
      const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
      const carryDist = 0.68 + Math.min(0.55, (p.speed || 0) * 0.055);
      const targetX = p.mesh.position.x + fwd.x * carryDist;
      const targetZ = p.mesh.position.z + fwd.z * carryDist;
      const k = 1 - Math.exp(-22 * Math.max(0, Math.min(dt, 0.05)));
      b.mesh.position.x = lerp(b.mesh.position.x, targetX, k);
      b.mesh.position.z = lerp(b.mesh.position.z, targetZ, k);
      b.mesh.position.y = BALL_R;
      b.vel.x = lerp(b.vel.x || 0, p.vel.x || 0, k);
      b.vel.z = lerp(b.vel.z || 0, p.vel.z || 0, k);
      if (b.shadow) {
        b.shadow.position.x = b.mesh.position.x;
        b.shadow.position.z = b.mesh.position.z;
      }
    }

    const speed = Math.hypot(b.vel.x || 0, b.vel.z || 0);
    const mineChip = (this.snapshot.chips || []).find((c) => c.mine && c.type !== "ice");
    const onFire = mineChip?.type === "boot" || this.snapshot.superFx > 0 || this.shotKind === "super";
    this.trail.visible = speed > 8 || onFire;
    if (this.trail.visible) {
      const len = clamp(speed / 18, onFire ? 1.6 : 0.8, onFire ? 5.4 : 2.6);
      const dirA = Math.atan2(b.vel.z || 0, b.vel.x || 0);
      this.trail.position.set(
        b.mesh.position.x - Math.cos(dirA) * len * 1.5,
        Math.max(0.06, b.mesh.position.y - 0.05),
        b.mesh.position.z - Math.sin(dirA) * len * 1.5
      );
      this.trail.rotation.z = -dirA;
      this.trail.material.color.set(onFire ? "#ff5a12" : this.shotKind === "sweet" ? "#ffd76a" : "#ffffff");
      this.trail.material.opacity = onFire ? 0.75 : clamp((speed - 13) / 44, 0.06, 0.42);
      this.trail.scale.set(len, onFire ? 1.9 : 1, 1);
    }

    if (cp && mineChip && this.camMode !== "pov") {
      const def = POWERUPS[mineChip.type];
      this.aura.visible = !!def;
      if (def) {
        this.aura.material.color.set(def.color);
        this.aura.material.opacity = 0.35 + Math.sin(this.time * 7) * 0.15;
        this.aura.position.set(cp.x, 0.045, cp.z);
        this.aura.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
        this.ring.material.color.set(def.color);
      }
    } else {
      this.aura.visible = false;
      this.ring.material.color.set("#ffd21c");
    }
  }

  _loop() {
    netDiag.markFrame();
    // Schedule the next frame FIRST so an exception can't kill the loop. The
    // scheduler is guarded because background keep-alive may call _loop()
    // directly when the browser has throttled rAF.
    this._scheduleFrame();

    // Real elapsed time since the previous tick (rAF or keep-alive interval).
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let raw = (now - (this._lastTick || now)) / 1000;
    this._lastTick = now;
    // A background tab may wake only once per second (or after a longer
    // visibility transition). Keep enough accumulated time to catch up
    // without silently slowing the authoritative world.
    raw = Math.max(0, Math.min(raw, 5.0));
    // Modo turbo para tests headless: multiplica el tiempo acumulado.
    if (typeof window !== "undefined" && window.__turbo) raw *= window.__turbo;
    this._simAccum = (this._simAccum || 0) + raw;
    const renderDt = Math.min(raw || 1 / 60, 0.05);

    // === P2-SYNC-TEST: client mode skips simulation entirely ================
    // The sync layer writes received positions/rotations to meshes via
    // _clientRenderHook(dt); we just render the scene afterwards.
    //
    // CRITICAL: errors in _clientRenderHook are LOGGED, not silently
    // swallowed. A silent error here would freeze the client's game
    // permanently (no state applied → meshes stay at initial positions).
    // The hook itself has its own try/catch for granular error handling,
    // but we log here as a safety net.
    if (this.networkMode === "client") {
      // Client mode never consumes the host simulation accumulator. Leaving
      // it growing made diagnostics misleading and retained seconds of stale
      // wall time on slow/background guests.
      this._simAccum = 0;
      this.time += renderDt;
      if (this._clientRenderHook) {
        try { this._clientRenderHook(renderDt); } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[engine] _clientRenderHook threw (client frozen?):", e);
        }
      }
      try { this._updateCamera?.(renderDt); } catch (e) { /* noop */ }
      try { this._updatePlayerIndicator?.(renderDt); } catch (e) { /* noop */ }
      // Percepción local (flecha de tiro, pase, cono): el cliente no simula,
      // pero sí debe ver las mismas ayudas visuales que el host.
      try { this._updatePerception(); } catch (e) { /* noop */ }
      try { this._updateClientVisuals(renderDt); } catch (e) { /* noop */ }
      // Render at a stable 30fps ceiling. State application, input edges and
      // prediction continue every callback; skipping redundant WebGL passes
      // prevents a slow guest GPU from starving WebSocket callbacks and
      // making controls feel seconds behind. All visual layers remain enabled
      // on each rendered frame.
      this._clientRenderDebt = (this._clientRenderDebt || 0) + renderDt;
      if (this._clientRenderDebt >= 1 / 30) {
        const visualDt = Math.min(this._clientRenderDebt, 0.1);
        this._clientRenderDebt = 0;
        try { this.fx?.update?.(visualDt); } catch (e) { /* noop */ }
        try { this.renderer.render(this.scene, this.camera); } catch (e) {
          console.warn("[engine] client render error:", e);
        }
        netDiag.markRender();
      }
      return;
    }

    // === HOST: fixed-timestep simulation with catch-up ======================
    // rAF may be throttled (background tab) but the keep-alive interval still
    // calls _loop with a large `raw`. Advance the sim in 1/60s steps so the
    // host runs in real time no matter how sparse the ticks are.
    const STEP = 1 / 60;
    const MAX_STEPS = 300;
    let dt = STEP;
    let steps = 0;
    while (this._simAccum >= STEP && steps < MAX_STEPS) {
      this._simAccum -= STEP;
      steps++;
      dt = STEP;
      this.time += dt;

    // === P2-SYNC-TEST: host sync hook (apply remote inputs) ===
    // Called BEFORE the simulation step so remote inputs are visible to the
    // engine's _updateRemoteHuman() / _movePlayer() this same step. State
    // BROADCAST is decoupled — HostSync owns a 30Hz timer so the state rate
    // never collapses to the render rate when the frame budget is exceeded.
    try { this._syncHook?.(dt); } catch (e) { /* noop */ }

    // Sistema de pausas: decrementar timer aunque el juego esté pausado
    this._updatePauseTimer(dt);
    // Decrementar timer del comando de emoji
    if (this.emoteCommandTimer > 0) {
      this.emoteCommandTimer -= dt;
      if (this.emoteCommandTimer <= 0) {
        this.emoteCommandTimer = 0;
        this.emoteCommand = -1;
      }
    }

    const cf = this.scene.userData.cornerFlags;
    if (cf) cf.forEach((f, i) => (f.rotation.y = Math.sin(this.time * 2 + i * 0.7) * 0.35));
    updateLedBoards(this.scene, this.time, dt);
    updateNets(this.scene, dt);

    if (!this.paused) {
      // Fin de partido: freezamos toda la física, sólo animamos jugadores.
      if (this.matchEnded) {
        this.snapshot.matchEnded = true;
        this.snapshot.camMode = this.camMode;
        continue;
      }

      // ENTRETIEMPO — pausa cinemática con cuenta regresiva hacia el 2º tiempo
      if (this.snapshot.halftime) {
        this.halftimeTimer -= dt;
        const prev = Math.ceil(this.snapshot.halftimeCount);
        const cur = Math.max(0, Math.ceil(this.halftimeTimer));
        if (cur !== prev && cur > 0 && cur <= 3) {
          sfx.ready?.();
          this.camShake = Math.max(this.camShake, 0.05);
        }
        this.snapshot.halftimeCount = Math.max(0, this.halftimeTimer);
        if (this.halftimeTimer <= 0) {
          this.snapshot.halftime = false;
          this.snapshot.halftimeCount = 0;
          this._kickoff();
          this.kickoffCount = 3.2;
          this.kickoffLast = 4;
          this.kickoffGo = 0;
        }
        this.snapshot.hasBall = false;
        this.snapshot.charging = false;
        this.snapshot.superFx = 0;
        this.fx.update(dt);
        this._updateCamera(dt);
        this.snapshot.camMode = this.camMode;
        this.snapshot.ball = { x: this.ball.mesh.position.x, z: this.ball.mesh.position.z };
        this.snapshot.players = this.players.map((pl) => ({
          x: pl.mesh.position.x,
          z: pl.mesh.position.z,
          team: pl.team,
          keeper: pl.keeper,
          me: pl === this.controlled,
        }));
        continue;
      }

      // Cuenta 3-2-1-¡silbato! antes de que arranque la jugada
      if (this.kickoffCount > 0 || this.kickoffGo > 0) {
        if (this.kickoffCount > 0) {
          this.kickoffCount -= dt;
          const cur = Math.ceil(this.kickoffCount);
          if (cur !== this.kickoffLast && cur >= 1 && cur <= 3) {
            this.kickoffLast = cur;
            sfx.ready();
            this.camShake = Math.max(this.camShake, 0.06);
          }
          if (this.kickoffCount <= 0) {
            this.kickoffLast = 0;
            this.kickoffGo = 0.7; // fase ¡YA! post-3-2-1
            sfx.whistle();
            this.camShake = Math.max(this.camShake, 0.22);
            crowd.hype(0.14, 1.0);
          }
        } else if (this.kickoffGo > 0) {
          this.kickoffGo -= dt;
        }
        this.snapshot.kickoffCount = Math.max(0, this.kickoffCount);
        this.snapshot.kickoffGo = Math.max(0, this.kickoffGo);
        this.snapshot.hasBall = false;
        this.snapshot.charging = false;
        this.snapshot.superFx = 0;
        this.fx.update(dt);
        // Process remote human inputs even during kickoff so the guest can
        // move their player. The ball stays locked at center during kickoff
        // (the engine doesn't apply ball physics here), but players can
        // reposition. This fixes the bug where the guest couldn't move at
        // all because _updateRemoteHuman was only called AFTER kickoff.
        this.players.forEach((pl) => {
          if (pl === this.controlled) return;
          if (pl.controller?.isRemote) {
            this._updateRemoteHuman(pl, dt);
          }
        });
        this._updateCamera(dt);
        this.snapshot.camMode = this.camMode;
        this.snapshot.ball = { x: this.ball.mesh.position.x, z: this.ball.mesh.position.z };
        this.snapshot.players = this.players.map((pl) => ({
          x: pl.mesh.position.x,
          z: pl.mesh.position.z,
          team: pl.team,
          keeper: pl.keeper,
          me: pl === this.controlled,
        }));
        continue;
      }
      this.snapshot.kickoffCount = 0;
      this.snapshot.kickoffGo = 0;

      if (this.hitstop > 0) this.hitstop -= dt;
      if (this.slowmo > 0) this.slowmo -= dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      const scale = this.hitstop > 0 ? 0.3 : this.slowmo > 0 ? 0.42 : 1;
      const sdt = dt * scale;

      if (this.goalCooldown > 0) {
        this.goalCooldown -= sdt;
        this.celebrateT = Math.max(0, (this.celebrateT || 0) - sdt);
        if (this.goalCooldown <= 0) {
          this.snapshot.goalText = null;
          this.snapshot.goalScorer = null;
          this.snapshot.goalScorerName = null;
          this.snapshot.goalScorerNumber = null;
          this.snapshot.goalScorerHero = false;
          this.celebrateTeam = null;
          this.players.forEach((pl) => {
            pl.celebrate = false;
            pl.mesh.position.y = 0;
          });
          const against = this.goalScoredBy === "red" ? "blue" : "red";
          this.goalScoredBy = null;
          this._kickoff(against);
          sfx.whistle();
        }
      }
      if (this.kickCooldown > 0) this.kickCooldown -= sdt;
      if (this.saveCooldown > 0) this.saveCooldown -= sdt;
      const tkPrev = this.tackleCooldown;
      const dsPrev = this.dashCooldown;
      if (this.tackleCooldown > 0) this.tackleCooldown -= sdt;
      if (this.dashCooldown > 0) this.dashCooldown -= sdt;
      if (tkPrev > 0 && this.tackleCooldown <= 0) sfx.ready();
      if (dsPrev > 0 && this.dashCooldown <= 0) sfx.ready();

      ["red", "blue"].forEach((tm) => {
        const e = this.effects[tm];
        Object.keys(e).forEach((k) => {
          if (k === "boot") return;
          if (e[k] > 0) e[k] = Math.max(0, e[k] - sdt);
        });
      });

      this.players.forEach((pl) => {
        if (pl.slide > 0) {
          const wasSliding = pl.slide > 0;
          pl.slide -= sdt;
          // Si el slide termina y NO robó el balón → barrida fallida
          // Penalidad: -25% de stamina (solo aplica al héroe controlado)
          if (wasSliding && pl.slide <= 0 && !pl.stoleThis && pl === this.controlled) {
            this.stamina = clamp(this.stamina - 0.25, 0, 1);
            this._toast("BARRIDA FALLIDA", "#ff5a5a");
          }
          // P1-PR-TEST: si el slide termina sin robo Y estaba marcado como
          // pendiente de tackle, penalizar -5 PR (tackleMissed). Se aplica a
          // todos los agentes (humano e IA) — el spec lo dice por evento,
          // no por quién lo disparó.
          if (wasSliding && pl.slide <= 0 && !pl.stoleThis && pl._prTacklePending) {
            awardPR(pl, "tackleMissed");
            pl._prTacklePending = false;
          }
        }
        if (pl.noTackle > 0) pl.noTackle -= sdt;
        if (pl.squash > 0) pl.squash = Math.max(0, pl.squash - sdt * 3.2);
      });
      this.snapshot.clock = Math.max(0, this.snapshot.clock - sdt);
      // Posesión: cada tick, jugador más cercano a la pelota "posee"
      {
        const bp = this.ball.mesh.position;
        let closest = null, cd = 1e9;
        for (const pl of this.players) {
          if (pl.keeper) continue;
          const d = pl.mesh.position.distanceTo(bp);
          if (d < cd) { cd = d; closest = pl; }
        }
        if (closest && cd < 4.5 && this.snapshot.stats?.[closest.team]) {
          this.snapshot.stats[closest.team].possession += sdt;
          // P1-MULTIAGENT: posesión por-jugador (tiempo acumulado como closest).
          this._bumpStat(closest, "possession", sdt);
        }
        // Phase 3: actualización por frame del ballHolder. Si el jugador más
        // cercano está claramente en posesión (cd < 2.0), lo mostramos como
        // tenedor; si la pelota está claramente suelta (cd > 5.0 y detenida),
        // limpiamos. Esto cubre también los pases/recibos del IA que no pasan
        // por _pass()/_shoot() (la IA modifica b.vel directamente en ai.js).
        const bspd = this.ball.vel.length();
        if (closest && cd < 2.0 && bspd < 18) {
          const cur = this.snapshot.ballHolder;
          if (!cur || cur.team !== closest.team || cur.number !== (closest.number || 0)) {
            this.snapshot.ballHolder = {
              team: closest.team,
              number: closest.number || 0,
              name: closest === this.hero ? (this._profileName || "JUGADOR") : (closest.baseRole || `#${closest.number || 0}`)
            };
            this.snapshot.ballHolderRating = this._ratingFor(closest);
            this.lastTouch = closest;
          }
        } else if (cd > 5.0 && bspd < 6.0) {
          // Pelota detenida y sin nadie cerca: suelta.
          this.snapshot.ballHolder = null;
          this.snapshot.ballHolderRating = null;
        }
      }
      // Fin de tiempo: medio tiempo o fin de partido
      if (this.snapshot.clock <= 0 && this.goalCooldown <= 0) {
        sfx.whistle();
        sfx.whistle();
        this.camShake = Math.max(this.camShake, 0.24);
        crowd.hype(0.18, 1.4);
        if (this.half === 1) {
          this.half = 2;
          this.snapshot.half = 2;
          this.snapshot.halfLabel = "SEGUNDO TIEMPO";
          this.snapshot.halftime = true;
          this.halftimeTimer = this.halftimeLen;
          this.snapshot.halftimeCount = this.halftimeLen;
          this.snapshot.clock = this.halfLen;
          this.powerups.clear();
          this._kickoff();
          crowd.hype(0.22, 2.2);
        } else {
          this.matchEnded = true;
          this.snapshot.matchEnded = true;
          const s = this.snapshot.score;
          this.snapshot.winner = s.red === s.blue ? "draw" : s.red > s.blue ? "red" : "blue";
          this.powerups.clear();
          sfx.goalHorn();
          sfx.crowdRoar();
          crowd.hype(0.32, 3.6);
        }
      }

      const inCelebration = this.goalCooldown > 0;
      this._updateControlled();
      // P1-MULTIAGENT: espejar input del humano local a su controller.input.
      // La dirección (ax/az) ya se espeja dentro de _inputDir(p); acá van los
      // botones held (shoot/sprint) y la carga del tiro. Para IA/remotos, los
      // campos input.* los popula updateAI() o la capa de networking.
      {
        const lc = this.controlled?.controller;
        if (lc && lc.isLocal) {
          lc.input.shoot = !!this.holdShoot;
          lc.input.sprint = !!this.holdSprint;
          lc.input.charge = this.charge;
        }
      }
      const p = this.controlled;
      const dir = inCelebration ? new THREE.Vector3(0,0,0) : this._inputDir(p);
      const bolt = this._eff(p.team, "bolt");
      const wantSprint =
        !inCelebration &&
        (this.holdSprint || !!this.keys.shift) && (this.stamina > 0.02 || bolt) && dir.lengthSq() > 0;
      // === SISTEMA DE STAMINA ===
      // Drain (sprint):
      //   - Sin balón: -0.26/s → 3.85s de sprint = 67m = 1 cruce de cancha
      //   - Con balón: -0.13/s → 7.7s de sprint = 134m = 2 cruces de cancha
      //   - Con Bolt: 0 (stamina infinita)
      // Recuperación (no sprint):
      //   - Parado (sin input): 0.20/s → 5s para full (descanso real)
      //   - Caminando (con input, sin sprint): 0.10/s → 10s para full
      //   - Así parar a descansar es 2x más eficiente que seguir caminando.
      let drain;
      if (bolt) drain = 0;
      else if (this._hasBall(p)) drain = -0.13;
      else drain = -0.26;
      const moving = dir.lengthSq() > 0.01;
      const recovery = moving ? 0.10 : 0.20; // parado recupera 2x más rápido
      this.stamina = clamp(this.stamina + (wantSprint ? drain : recovery) * sdt, 0, 1);
      this._movePlayer(p, dir, wantSprint, sdt);

      if (this._hasBall(p)) this.coyote = COYOTE;
      else if (this.coyote > 0) this.coyote -= dt;
      if (!inCelebration) this._consumeBuffers(dt);

      const chargingNow = !inCelebration && this.holdShoot && this._canKick();
      if (chargingNow) {
        this.charge = clamp(this.charge + sdt * 1.6, 0, 1);
        chargeTone.start();
        chargeTone.update(this.charge);
      } else {
        chargeTone.stop();
        if (!this.holdShoot) this.charge = 0;
      }

      this.players.forEach((pl) => {
        if (pl === p || inCelebration) return;
        // P2-SYNC-TEST: remote-human players are driven by network input
        // via _updateRemoteHuman (set up by HostSync). Skip AI for them so
        // their controller.input (ax/az/buttons) is honored directly.
        if (pl.controller?.isRemote) {
          this._updateRemoteHuman(pl, sdt);
        } else {
          updateAI(this, pl, sdt);
        }
      });
      if (inCelebration) {
        // Durante celebración: los jugadores del equipo scorer saltan y corren
        // hacia el autor del gol o hacia el centro con brazos arriba.
        // El equipo perdedor se queda quieto (frustración).
        this.players.forEach((pl) => {
          pl.celebT = (pl.celebT || 0) + sdt;
          if (pl.celebrate) {
            // salto hop cíclico
            const hop = Math.abs(Math.sin(pl.celebT * 6 + (pl.celebHopPhase || 0))) * 0.55;
            pl.mesh.position.y = hop;
            // pequeño desplazamiento hacia el autor / centro
            const bx = 0;
            const bz = 0;
            const to = new THREE.Vector3(bx - pl.mesh.position.x, 0, bz - pl.mesh.position.z);
            if (to.lengthSq() > 4) {
              to.normalize().multiplyScalar(3.4 * sdt);
              pl.mesh.position.x += to.x;
              pl.mesh.position.z += to.z;
              pl.speed = 3.4;
              pl.heading = Math.atan2(to.x, to.z);
              pl.mesh.rotation.y = pl.heading;
            } else {
              pl.speed = 0;
              // giro dando vueltas de festejo
              pl.mesh.rotation.y += 3.5 * sdt;
            }
          } else {
            pl.speed = 0;
            pl.mesh.position.y = 0;
          }
        });
      }
      this.players.forEach((pl) => this._slideContacts(pl, sdt));
      this._separatePlayers(sdt);
      if (!inCelebration) this._dribble(sdt);
      this._updateBall(sdt);

      const ev = this.powerups.update(sdt, this.time);
      if (ev && ev.spawned) {
        sfx.powerupSpawn();
        this._toast("¡POWER-UP EN CANCHA!", POWERUPS[ev.spawned].color);
      }
      if (this.goalCooldown <= 0) {
        this.powerups.collect(this.players).forEach((g) => this._applyPowerup(g.type, g.player));
      }
      if (this.toast) {
        this.toast.t -= dt;
        if (this.toast.t <= 0) this.toast = null;
      }
      if (this.passConeT > 0) this.passConeT = Math.max(0, this.passConeT - dt);
    } else {
      chargeTone.stop();
    }
    } // end while (fixed-timestep simulation)
    if (this._simAccum > STEP) this._simAccum = STEP;
    dt = renderDt;

    // When the authoritative host tab is hidden, keep simulation/network
    // alive but skip the expensive visual pass. Otherwise two full stadium
    // renders (host + guest) can starve the host's own fixed-timestep loop.
    // The network snapshot is rebuilt from the authoritative meshes so the
    // guest still receives fresh positions, HUD values and notifications.
    if (this.networkMode !== "client" && typeof document !== "undefined" && document.hidden) {
      this.snapshot.camMode = this.camMode;
      this.snapshot.ball = { x: this.ball.mesh.position.x, z: this.ball.mesh.position.z };
      this.snapshot.players = this.players.map((pl) => ({
        x: pl.mesh.position.x,
        z: pl.mesh.position.z,
        team: pl.team,
        keeper: pl.keeper,
        me: pl === this.controlled,
      }));
      this.snapshot.stamina = this.stamina;
      this.snapshot.power = this.charge;
      this.snapshot.charging = this.holdShoot;
      this.snapshot.superMeter = this.superMeter;
      this.snapshot.superReady = this.superMeter >= 1 || this.effects.red.boot > 0;
      this.snapshot.hasBall = !this.paused && this._hasBall();
      this.snapshot.cd = {
        tackle: clamp(this.tackleCooldown / TACKLE_CD, 0, 1),
        dash: clamp(this.dashCooldown / DASH_CD, 0, 1),
      };
      const hiddenChips = [];
      Object.keys(this.effects.red).forEach((k) => {
        if (k !== "slow" && this.effects.red[k] > 0) hiddenChips.push({ type: k, mine: true, t: k === "boot" ? 1 : this.effects.red[k] / POWERUPS[k].dur });
      });
      if (this.effects.red.slow > 0) hiddenChips.push({ type: "ice", mine: false, t: this.effects.red.slow / POWERUPS.ice.dur });
      Object.keys(this.effects.blue).forEach((k) => {
        if (k !== "slow" && this.effects.blue[k] > 0) hiddenChips.push({ type: k, mine: false, t: k === "boot" ? 1 : this.effects.blue[k] / POWERUPS[k].dur });
      });
      this.snapshot.chips = hiddenChips;
      this.snapshot.toast = this.toast ? { ...this.toast } : null;
      if (this.superShotFx) {
        this.superShotFx.t = Math.max(0, this.superShotFx.t - dt);
        if (this.superShotFx.t <= 0) this.superShotFx = null;
      }
      return;
    }

    // Animaciones secundarias: cabeza al balón + squash & stretch
    const bpos = this.ball.mesh.position;
    this.players.forEach((pl) => {
      const lookYaw = clamp(
        shortAngle(Math.atan2(bpos.x - pl.mesh.position.x, bpos.z - pl.mesh.position.z) - pl.mesh.rotation.y),
        -0.95,
        0.95
      );
      animatePlayer(pl.mesh, pl.speed, dt, pl.slide > 0, { lookYaw, squash: pl.squash || 0 });
    });

    this.fx.update(dt);

    const cp = this.controlled.mesh.position;
    const povOn = this.camMode === "pov";
    this._updatePlayerIndicator(dt);

    const myEff = this.effects.red;
    const auraKey = ["boot", "bolt", "magnet", "shield"].find((k) => myEff[k] > 0);
    if (auraKey && !povOn) {
      this.aura.visible = true;
      this.aura.material.color.set(POWERUPS[auraKey].color);
      this.aura.material.opacity = 0.35 + Math.sin(this.time * 7) * 0.15;
      this.aura.position.set(cp.x, 0.045, cp.z);
      this.aura.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
      this.ring.material.color.set(POWERUPS[auraKey].color);
    } else {
      this.aura.visible = false;
      this.ring.material.color.set("#ffd21c");
    }

    const cpl = this.controlled;
    const hasBallNow = !this.paused && this._hasBall();
    const sweetNow = this.holdShoot && this.charge >= SWEET_LO && this.charge <= SWEET_HI;
    if (hasBallNow && this.holdShoot && !povOn) {
      const fwd = new THREE.Vector3(Math.sin(cpl.heading), 0, Math.cos(cpl.heading));
      const goal = new THREE.Vector3(HALF_L * TEAMS[cpl.team].dir, 0, 0);
      const toGoal = goal.clone().sub(cpl.mesh.position).setY(0).normalize();
      const dirv = fwd.lerp(toGoal, this._eff(cpl.team, "magnet") ? 0.45 : 0.28).normalize();
      const len = 4.5 + this.charge * 12;
      const a = Math.atan2(dirv.z, dirv.x);
      const superOn = this.superMeter >= 1 || this.effects[cpl.team].boot > 0;
      this.aimGuide.visible = true;
      this.aimGuide.position.set(cp.x + Math.cos(a) * len * 0.5, 0.07, cp.z + Math.sin(a) * len * 0.5);
      this.aimGuide.rotation.z = -a;
      this.aimGuide.scale.set(len, 1.1 + this.charge * 0.8, 1);
      this.aimGuide.material.color.set(
        superOn ? "#ff6a1f" : sweetNow ? "#ffd76a" : this.charge > 0.9 ? "#ff3b3b" : "#ffd21c"
      );
      this.aimGuide.material.opacity = 0.3 + this.charge * 0.4 + (sweetNow ? 0.22 : 0);
    } else {
      this.aimGuide.visible = false;
    }

    if (hasBallNow && !this.holdShoot && !povOn) {
      const fwd2 = new THREE.Vector3(Math.sin(cpl.heading), 0, Math.cos(cpl.heading));
      const inp = this._inputDir();
      // Normalizar inp antes de pasarlo a _bestPassTarget — debe usar el mismo
      // criterio que _pass() para que la flecha muestre el receptor correcto.
      const aimForHint = inp.lengthSq() > 0 ? inp.clone().normalize() : fwd2;
      const tgt = this._bestPassTarget(aimForHint);
      if (tgt) {
        this.passHint.visible = true;
        this.passHint.position.set(tgt.o.mesh.position.x, 0.05, tgt.o.mesh.position.z);
        this.passHint.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
        this.passHint.material.opacity = 0.45 + Math.sin(this.time * 6) * 0.18;
        // Línea del portador al receptor
        const from = new THREE.Vector3(cp.x, 0.1, cp.z);
        const to = new THREE.Vector3(tgt.o.mesh.position.x, 0.1, tgt.o.mesh.position.z);
        this.passLine.geometry.setFromPoints([from, to]);
        this.passLine.material.opacity = 0.5 + Math.sin(this.time * 6) * 0.15;
        this.passLine.visible = true;
      } else {
        this.passHint.visible = false;
        this.passLine.visible = false;
      }
    } else {
      this.passHint.visible = false;
      this.passLine.visible = false;
    }

    if (this.passConeT > 0 && this.passConeData && !povOn) {
      const { a, len } = this.passConeData;
      this.passCone.visible = true;
      this.passCone.position.set(cp.x + Math.cos(a) * len * 0.5, 0.075, cp.z + Math.sin(a) * len * 0.5);
      this.passCone.rotation.z = -a;
      this.passCone.scale.set(len, 2.4, 1);
      this.passCone.material.opacity = 0.55 * (this.passConeT / 0.07);
    } else {
      this.passCone.visible = false;
    }

    this.emoteSprites.forEach((sp, i) => {
      const on = this.activeEmote === i && this.emoteTimer > 0 && !povOn;
      sp.visible = on;
      if (on) sp.position.set(cp.x, TOTAL + 0.85 + Math.sin(this.time * 5) * 0.1, cp.z);
    });
    if (this.emoteTimer > 0) this.emoteTimer -= dt;

    this.players.forEach((pl) => {
      if (pl.dashFx > 0) pl.dashFx = Math.max(0, pl.dashFx - dt);
    });
    const cpDash = this.controlled.dashFx || 0;
    if (cpDash > 0 && !povOn) {
      this.aura.visible = true;
      this.aura.material.color.set("#c56bff");
      this.aura.material.opacity = 0.55 * (cpDash / 0.32);
      this.aura.position.set(cp.x, 0.045, cp.z);
      this.aura.scale.setScalar(1.4 + (0.32 - cpDash) * 5);
    }

    const { torsos, heads, positions } = this.stands;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i += 1) {
      const pos = positions[i];
      const bob = Math.sin(this.time * 3 + i * 0.7) * 0.12;
      dummy.position.set(pos.x, pos.y + 0.4 + bob, pos.z);
      dummy.rotation.y =
        pos.axis === "z" ? (pos.sign < 0 ? 0 : Math.PI) : pos.sign < 0 ? Math.PI / 2 : -Math.PI / 2;
      dummy.updateMatrix();
      torsos.setMatrixAt(i, dummy.matrix);
      dummy.position.y = pos.y + 1.05 + bob;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    }
    torsos.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;

    this._updateCamera(dt);

    this.snapshot.stamina = this.stamina;
    this.snapshot.power = this.charge;
    this.snapshot.charging = this.holdShoot;
    this.snapshot.sweet = sweetNow;
    this.snapshot.sweetLo = SWEET_LO;
    this.snapshot.sweetHi = SWEET_HI;
    this.snapshot.flash = this.flash;
    this.snapshot.slowmo = this.slowmo > 0;
    this.snapshot.superMeter = this.superMeter;
    this.snapshot.superReady = this.superMeter >= 1 || this.effects.red.boot > 0;
    this.snapshot.hasBall = hasBallNow;
    this.snapshot.superFx = this.superShotFx ? this.superShotFx.t : 0;
    this.snapshot.tackleReady = this.tackleCooldown <= 0;
    this.snapshot.cd = {
      tackle: clamp(this.tackleCooldown / TACKLE_CD, 0, 1),
      dash: clamp(this.dashCooldown / DASH_CD, 0, 1),
    };
    const chips = [];
    Object.keys(this.effects.red).forEach((k) => {
      if (k === "slow" || !(this.effects.red[k] > 0)) return;
      chips.push({ type: k, mine: true, t: k === "boot" ? 1 : this.effects.red[k] / POWERUPS[k].dur });
    });
    if (this.effects.red.slow > 0) {
      chips.push({ type: "ice", mine: false, t: this.effects.red.slow / POWERUPS.ice.dur });
    }
    Object.keys(this.effects.blue).forEach((k) => {
      if (k === "slow" || !(this.effects.blue[k] > 0)) return;
      chips.push({ type: k, mine: false, t: k === "boot" ? 1 : this.effects.blue[k] / POWERUPS[k].dur });
    });
    this.snapshot.chips = chips;
    this.snapshot.toast = this.toast ? { ...this.toast } : null;
    if (this.superShotFx) {
      this.superShotFx.t -= dt;
      if (this.superShotFx.t <= 0) this.superShotFx = null;
    }
    if (this.camShake > 0) this.camShake = Math.max(0, this.camShake - dt * 1.4);
    this.snapshot.camMode = this.camMode;
    this.snapshot.ball = { x: this.ball.mesh.position.x, z: this.ball.mesh.position.z };
    this.snapshot.players = this.players.map((pl) => ({
      x: pl.mesh.position.x,
      z: pl.mesh.position.z,
      team: pl.team,
      keeper: pl.keeper,
      me: pl === this.controlled,
    }));
    // P1-PR-TEST: refrescar prSnapshot cada ~0.5s (no cada frame — la lista
    // es chica pero sort + map en 8 jugadores a 60fps es innecesario).
    this._prSnapTimer = (this._prSnapTimer || 0) - dt;
    if (this._prSnapTimer <= 0) {
      this._prSnapTimer = 0.5;
      this.snapshot.prSnapshot = buildPRSnapshot(this.players, this.snapshot.playerStats, this._profileName);
    }

    // Adaptive render budget: the expensive GPU draw runs only when enough
    // wall time has passed since the last draw. `_renderCostEma` smooths the
    // measured cost of one draw, so on a fast GPU this draws every frame
    // (60fps), while on a slow GPU / software renderer it throttles DRAWING
    // instead of letting the draw queue starve the fixed-timestep simulation
    // and the 30Hz state broadcast. Snapshot building above still runs every
    // tick, so the broadcast always carries fresh authoritative data.
    const _nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const _budget = this._renderCostEma > 0 ? this._renderCostEma * 1.25 : 0;
    if (_nowMs - this._lastRenderAt >= _budget) {
      const _t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.renderer.render(this.scene, this.camera);
      const _cost =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0;
      this._renderCostEma =
        this._renderCostEma === 0 ? _cost : this._renderCostEma * 0.9 + _cost * 0.1;
      this._lastRenderAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      netDiag.markRender();
    }
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this._rafPending = false;
    if (this._keepAlive) clearInterval(this._keepAlive);
    chargeTone.stop();
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
