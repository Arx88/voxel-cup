# ⚽ Voxel Cup

> **Fútbol voxel multijugador en tiempo real.**
> React + Three.js en el cliente · FastAPI + WebSocket en el servidor · MongoDB para persistencia.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-000000?logo=three.js&logoColor=white&style=flat-square)](https://threejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white&style=flat-square)](https://fastapi.tiangolo.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-realtime-7c3aed?style=flat-square)](#)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20local-47A248?logo=mongodb&logoColor=white&style=flat-square)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-propietaria-informational?style=flat-square)](#)

---

## ✨ Características

- 🎮 **Modos 2v2, 3v3 y 4v4**, además de partidas contra la IA.
- 🌐 **Multijugador en tiempo real** por WebSocket: un jugador es **host** (simulación autoritativa) y el resto son **invitados**.
- 🧠 **Netcode de nivel competitivo**:
  - Predicción local + reconciliación suave (sin *rubber-banding*).
  - Snapshots del host **coalescidos a 30 Hz**, desacoplados del bucle de render.
  - Interpolación sobre el reloj del host y *lerp* de ángulos por el arco corto.
  - Eco de **RTT por slot** sin necesidad de sincronizar relojes.
- 🩺 **Overlay de diagnóstico** en partida (`F3`): ping, RTT, drift, tasa de estados/inputs, latencia tecla→ack y ritmo del host.
- ⚽ Balón con física, **carga de remate**, pases, entradas, sprint, dash y emotes.
- ⚡ **Power-ups** sincronizados entre host e invitado.
- 🗺️ Minimapa, HUD, notificaciones y pantalla de resultados.
- 🧪 Suite de tests de backend, de red y **end-to-end con dos navegadores reales**.

---

## 🧱 Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Cliente | React 19, Three.js, Tailwind v4, CRACO (CRA) |
| Servidor | FastAPI, Uvicorn, Motor (MongoDB async) |
| Tiempo real | WebSocket (relay de estado + input a 30 Hz) |
| Datos | MongoDB (Atlas o instancia local) |
| Build | Yarn 1.22 + `craco build` |
| Tests | Pytest + Playwright |

---

## 📁 Estructura del proyecto

```
voxel-cup/
├── frontend/                 # Aplicación React (CRACO + Three.js)
│   ├── src/
│   │   ├── components/       # HUD, Lobby, Room, NetDiagHud, ...
│   │   ├── game/             # engine.js, sync.js, net.js, diagnostics.js, ...
│   │   └── assets/           # modelos, texturas, audio
│   ├── craco.config.js       # proxy /api → backend y compat Tailwind v4
│   └── vercel.json           # build para Vercel
├── backend/                  # API FastAPI + WebSocket
│   ├── server.py             # app principal, endpoints /api/*
│   ├── rooms.py              # salas multiplayer (host/guest, relay)
│   ├── requirements.txt
│   └── test_rooms.py         # tests de salas (12 checks)
├── tests/                    # tests de red y e2e
│   ├── test_netdiag.py
│   ├── test_netdiag_browser.py
│   └── test_netdiag_live.py  # partido real host + invitado
└── README.md
```

---

## ✅ Requisitos

| Herramienta | Versión |
| --- | --- |
| Node.js | 18+ |
| Yarn | 1.22.22 (declarado en `packageManager`) |
| Python | 3.10+ |
| MongoDB | local (`mongod`) o [Atlas](https://www.mongodb.com/atlas) |

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Arx88/voxel-cup.git
cd voxel-cup
```

### 2. Backend (FastAPI + WebSocket)

```bash
cd backend

# (opcional) entorno virtual
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

Crea el archivo de entorno copiando el ejemplo:

```bash
cp .env.example .env
```

`backend/.env` necesita dos variables:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=voxel_cup_dev
# CORS_ORIGINS=*   # opcional
```

> `MONGO_URL` puede apuntar a un MongoDB local o a un cluster de **MongoDB Atlas**.
> Nunca subas `.env` al repo: ya está excluido en `.gitignore`.

### 3. Frontend (React)

```bash
cd ../frontend
yarn install --frozen-lockfile
```

---

## ▶️ Ejecutar

Levanta **MongoDB**, luego el backend y por último el frontend (en terminales separadas).

```bash
# Terminal 1 — Backend (puerto 8002)
cd backend
python -m uvicorn server:app --host 127.0.0.1 --port 8002
```

```bash
# Terminal 2 — Frontend (puerto 5173)
cd frontend
# Windows (cmd):
set PORT=5173 && set BROWSER=none && yarn start
# Windows (PowerShell):
$env:PORT="5173"; $env:BROWSER="none"; yarn start
# Linux/macOS:
PORT=5173 BROWSER=none yarn start
```

Abre **http://localhost:5173** en tu navegador.

> El proxy de desarrollo (en `craco.config.js`) reenvía `/api` y el tráfico WebSocket
> al backend en `localhost:8002`, así que solo usás la URL del frontend.

---

## 🎮 Cómo jugar

| Tecla | Acción |
| --- | --- |
| `W A S D` / flechas | Moverse |
| `Espacio` | Rematar (mantené para **cargar fuerza**) |
| `Q` | Pasar |
| `E` | Entrada / tackle |
| `F` | Dash |
| `Shift` | Sprint |
| `1` – `4` | Emotes |
| `C` | Cambiar cámara |
| `F3` | Mostrar/ocultar **diagnóstico de red** |

### Multijugador

1. El **host** crea una sala (`Crear sala`) y comparte el código de 4 letras.
2. Los **invitados** entran con `Unirse` e ingresan el código.
3. Solo el **host** inicia la partida — cuando arranca, arranca para todos.
4. El host simula el mundo; los invitados predicen su jugador local y
   reconcilian con los snapshots autoritativos.

---

## 🩺 Diagnóstico de red en vivo

Dentro de un partido apretá **`F3`** (o agregá `#netdiag` a la URL) para ver en tiempo real:

- **FPS** de simulación y render.
- **RTT** real (eco de tu propio timestamp) y *one-way* estimado.
- **Tasa** de estados recibidos e inputs enviados.
- **Latencia** tecla→movimiento local y tecla→ack del host.
- **Drift** (predicción vs autoridad), paquetes pendientes y *gaps*.
- **Ritmo del host** (detecta un host con la pestaña en segundo plano).

---

## 🧪 Tests

```bash
# Backend: salas, host/start, relay de estado/input, promoción de host (12 checks)
cd backend
python test_rooms.py
```

```bash
# Red: camino RTT del relay (levanta su propio backend)
python tests/test_netdiag.py

# Colector de métricas del cliente (13 checks)
python tests/test_netdiag_browser.py

# End-to-end: dos Chromium reales (host + invitado) en un partido (13 checks)
python tests/test_netdiag_live.py
```

> `test_netdiag_browser.py` y `test_netdiag_live.py` requieren `playwright`
> (`pip install playwright && playwright install chromium`).

---

## ☁️ Despliegue

- **Frontend → Vercel**: ya incluye `frontend/vercel.json` (build con `craco`).
  El frontend es 100 % serverless-friendly.
- **Backend → free-tier** (Railway, Render o Fly.io): FastAPI + WebSocket no corre
  en Vercel; necesita un host con soporte de WebSocket persistente y MongoDB Atlas.
  Apuntá `REACT_APP_BACKEND_URL` a la URL del backend desplegado.

---

## 📝 Notas

- El juego y la interfaz están en **español**.
- Los snapshots de red son *lossy* a propósito: solo importa el estado más reciente,
  por eso el relay descarta colas de estados obsoletos en vez de acumularlas.

---

Hecho con 💙 por **ACIDO** · ⚽ Voxel Cup
