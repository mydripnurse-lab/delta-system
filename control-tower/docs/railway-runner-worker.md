# Railway Runner Worker (runs largos)

Este worker saca `run-delta-system` fuera de Vercel para que pueda correr horas sin romper el run cuando el SSE se reconecta.

## 1) Deploy en Railway

1. Crea un nuevo servicio en Railway usando este mismo repo (`control-tower`).
2. Start command del servicio worker:

```bash
npm run worker:runner
```

3. Variables en Railway (worker):

- `DATABASE_URL` (misma DB que usa Control Tower)
- `WORKER_API_KEY` (string secreto)
- `RUNNER_REPO_ROOT=/app/control-tower` (ajusta si tu checkout queda en otra ruta)

Opcional:

- `PORT` (Railway lo inyecta normalmente)
- `RUNNER_WORKER_MAX_BODY_BYTES`

4. Copia la URL pública del worker, por ejemplo:

`https://runner-worker-production.up.railway.app/run`

## 2) Variables en Vercel (Control Tower)

En tu proyecto Vercel:

- `RUNNER_REMOTE_ENABLED=1`
- `RUNNER_REMOTE_JOBS=run-delta-system`
- `RUNNER_WORKER_URL=https://...railway.app/run`
- `RUNNER_WORKER_API_KEY=<mismo WORKER_API_KEY>`
- `RUNNER_WORKER_DELEGATE_TIMEOUT_MS=30000`
- `RUNNER_WORKER_STOP_TIMEOUT_MS=20000`

## 3) Qué no cambia (para no romper nada)

- UI de `Projects` y botones `Run/Stop`: igual.
- SSE `/api/stream/[runId]`: igual (sigue leyendo DB y reconectando).
- Historial en `app.runner_runs` y `app.runner_run_events`: igual.

## 4) Sobre la pantalla “Function CPU” de Vercel

Si offloadeas el runner a Railway, puedes dejar Vercel en `Standard` (1 vCPU / 2GB).  
No necesitas subir esa opción para runs de muchas horas porque el trabajo pesado ya no corre en Vercel.

