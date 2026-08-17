# Delta System - My Drip Nurse

Repositorio principal de automatizacion + dashboards para Delta System.

## Que incluye este repo

- Generacion y manejo de data por `State / County / City`
- Integracion con GoHighLevel (GHL)
- Integracion con Google Sheets
- Control Tower (UI principal) en Next.js
- Dashboards operativos y ejecutivos (Calls, Leads, Conversations, Transactions, Appointments, Search, GA, Ads)

## Carpetas clave

- `control-tower/` -> App principal (Next.js)
- `resources/` -> Configs, estados, archivos base
- `scripts/` -> Automatizaciones y builders
- `services/` -> Clientes y utilidades de integracion (Sheets, etc.)

## Arranque rapido

```bash
cd control-tower
npm install
cp .env.example .env.local
npm run dev
```

Abrir: [http://localhost:3001](http://localhost:3001)

## Documentacion completa de setup

La guia profesional paso a paso (API keys, Google Cloud, GSC, GHL, troubleshooting) esta aqui:

- [`control-tower/README.md`](control-tower/README.md)

## Nota importante

Si ves errores `403` en Sheets o Search Console, normalmente es tema de:

1. API no habilitada en Google Cloud
2. Service account sin permisos en el recurso (Sheet/propiedad GSC)
3. Keyfile equivocado en `.env.local`

La solucion exacta esta documentada en `control-tower/README.md`.

## Mantenimiento rápido del repo (sin romper funcionalidad)

- `npm run repo:doctor`
  - Te da un snapshot de carpetas pesadas, top archivos versionados y archivos sin trackear sospechosos.
- `npm run repo:prune-runtime:dry-run`
  - Muestra qué directorios pesados de runtime se pueden limpiar.
- `npm run repo:prune-runtime`
  - Limpia cachés y artefactos de build/lint en `node_modules` y `.next`.
- `npm run repo:prune-runtime -- --unsafe`
  - También limpia `tmp`, `storage`, `states` y `control-tower/storage` cuando estás en un reset profundo de entorno.
  - Si una carpeta sigue trackeada en Git (como `states/` hoy), la operación la salta para evitar pérdida de archivos versionados.
  - Se recomienda solo si sabes que esos datos son regenerables o ya están guardados fuera de Git.
- `npm run repo:guard`
  - Revisión de salud rápida: archivos versionados grandes, presencia de carpetas runtime y duplicados sin trackear tipo `name 2.ext`.
- `npm run repo:domain-map`
  - Inventario por dominio (admin/partner/care/shared) de `control-tower/src` para planificar la separación.
- `npm run repo:cross-domain-scan`
  - Detecta dependencias entre dominios (admin/partner/care/shared) leyendo imports en `control-tower/src`.
- `npm run repo:domain-map -- --json`
  - Muestra el mismo inventario en JSON para integrar con automatizaciones.
- `npm run repo:light-audit`
  - Muestra qué carpetas y archivos están pesando más (incluyendo carpetas con miles de archivos como `states/`), y sugiere candidatos seguros para separar del repositorio.

Notas de uso diario:
- Los archivos con sufijo ` 2.*` (por ejemplo `archivo 2.tsx`) suelen ser duplicados de merge/editor y ya están excluidos en `.gitignore`.
- Si quieres separar proyectos en repos más pequeños (admin/partner/care), esta base está lista para extraer carpetas funcionales sin tocar la app.

## Qué está frenando más a Git hoy

- `states/` está trackeado con ~18k archivos (`.xml`) y eso hace más pesado el manejo de Git, aunque el tamaño total no sea enorme.
- `resources/statesFiles/` concentra casi 13 MB de data JSON de referencia.
- `control-tower/public/audio/` incluye un MP3 grande de 7.3 MB.

Sugerencia inicial de optimización:
1. Mantener código fuente en el repositorio principal.
2. Externalizar artefactos derivados (siempre regenerables) al menos en dos capas: local + almacenamiento compartido/ci.
3. Dejar `repo:light-audit` y `repo:cross-domain-scan` como checks base antes de cada ciclo de cambio.

### Tarea clave pendiente (si quieres dejar repo más liviano)

Para bajar el costo de Git hoy, el paso más fuerte es sacar `states/` del tracking:

```bash
git rm -r --cached states
git add .gitignore
git status --short
```

`states/` puede seguir en tu disco local (la tienes en `.gitignore`), pero deja de formar parte del historial.  
Después de eso, `npm run repo:prune-runtime -- --unsafe` se puede usar de forma más segura para regenerar `states/` si hace falta.

## Ruta recomendada para separar admin / partner / care

- Fase 1: inventario de rutas y módulos por producto (sin mover código).
- Fase 2: definir contratos de datos compartidos (`services`, `resources`, `scripts`).
- Fase 3: extraer cada producto a repos o worktrees por separado.
- Fase 4: validar deploy y flujos de CI por producto para migración gradual.
