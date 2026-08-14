import { useEffect, useState } from "react";

const KEY = "voxelcup.lang";

const DICT = {
  es: {
    pressEnter: "PRESIONÁ ENTER",
    loading: "CARGANDO",
    tapForSound: "TOCÁ LA PANTALLA PARA EL SONIDO",
    menu: "MENÚ",
    resume: "REANUDAR",
    restart: "REINICIAR PARTIDO",
    camera: "CÁMARA",
    home: "VOLVER AL INICIO",
    settings: "AJUSTES",
    music: "MÚSICA",
    sfxVol: "EFECTOS",
    musicVol: "VOLUMEN MÚSICA",
    language: "IDIOMA",
    zipHint: "El ZIP se genera al instante con el código más reciente.",
    firstHalf: "PRIMER TIEMPO",
    secondHalf: "SEGUNDO TIEMPO",
    halftime: "ENTRETIEMPO",
    fulltime: "FINAL DEL PARTIDO",
    getReady: "¡PREPARATE!",
    go: "¡VAMOS!",
    kickoffOf: "SACA",
    winner: "GANADOR",
    draw: "¡EMPATE!",
    rematch: "REVANCHA",
    move: "Mover",
    run: "Correr (stamina)",
    shoot: "Tiro (mantener)",
    pass: "Pase imantado",
    tackle: "Barrida asistida",
    dribble: "Regate explosivo",
    hairstyle: "Cabello",
    hairColor: "Color de\ncabello",
    skinTone: "Tono de\npiel",
    kitLabel: "Equipación",
    number: "Número",
    play: "¡A JUGAR!",
    creatorTitle1: "CREA TU",
    creatorTitle2: "JUGADOR",
    creatorSub: "Personaliza a tu jugador y entra a la cancha.",
    name: "NOMBRE",
    namePlaceholder: "Escribe tu nombre...",
    preview: "VISTA PREVIA",
    back: "VOLVER",
  },
  en: {
    pressEnter: "PRESS ENTER",
    loading: "LOADING",
    tapForSound: "TAP THE SCREEN FOR SOUND",
    menu: "MENU",
    resume: "RESUME",
    restart: "RESTART MATCH",
    camera: "CAMERA",
    home: "BACK TO HOME",
    settings: "SETTINGS",
    music: "MUSIC",
    sfxVol: "SFX",
    musicVol: "MUSIC VOLUME",
    language: "LANGUAGE",
    zipHint: "The ZIP is generated instantly with the latest source.",
    firstHalf: "FIRST HALF",
    secondHalf: "SECOND HALF",
    halftime: "HALF TIME",
    fulltime: "FULL TIME",
    getReady: "GET READY!",
    go: "GO!",
    kickoffOf: "KICK-OFF",
    winner: "WINNER",
    draw: "DRAW!",
    rematch: "REMATCH",
    move: "Move",
    run: "Sprint (stamina)",
    shoot: "Shot (hold)",
    pass: "Magnet pass",
    tackle: "Assisted tackle",
    dribble: "Explosive dribble",
    hairstyle: "Hair",
    hairColor: "Hair\ncolor",
    skinTone: "Skin\ntone",
    kitLabel: "Kit",
    number: "Number",
    play: "PLAY!",
    creatorTitle1: "CREATE YOUR",
    creatorTitle2: "PLAYER",
    creatorSub: "Customize your player and hit the pitch.",
    name: "NAME",
    namePlaceholder: "Type your name...",
    preview: "PREVIEW",
    back: "BACK",
  },
};

export const LANGS = [
  { id: "es", label: "ESPAÑOL" },
  { id: "en", label: "ENGLISH" },
];

let lang = "es";
try {
  const saved = localStorage.getItem(KEY);
  if (saved && DICT[saved]) lang = saved;
} catch (e) {
  lang = "es";
}

export const getLang = () => lang;

export const t = (key) => (DICT[lang] && DICT[lang][key]) || DICT.es[key] || key;

export const setLang = (next) => {
  if (!DICT[next]) return lang;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch (e) {
    /* no-op */
  }
  window.dispatchEvent(new CustomEvent("voxelcup:lang", { detail: next }));
  return lang;
};

export const useLang = () => {
  const [cur, setCur] = useState(lang);
  useEffect(() => {
    const onChange = (e) => setCur(e.detail);
    window.addEventListener("voxelcup:lang", onChange);
    return () => window.removeEventListener("voxelcup:lang", onChange);
  }, []);
  return cur;
};
