# Frontend — Voxel Cup

Aplicación React (CRACO + Three.js) del juego Voxel Cup.

La documentación completa (instalación, ejecución, controles y tests) está en el
**[README principal](../README.md)** de la raíz del repositorio.

## Arranque rápido

```bash
yarn install --frozen-lockfile
PORT=5173 BROWSER=none yarn start   # → http://localhost:5173
```

El proxy de desarrollo reenvía `/api` y el WebSocket al backend en
`http://localhost:8002` (ver `craco.config.js`).
