# Analytica AI

Plataforma demo de **análisis de datos impulsada por IA para la detección de patrones complejos en tiempo real**.

Subes un CSV → el motor detecta automáticamente **tendencias** (regresión), **outliers** (regla IQR), **correlaciones** entre columnas numéricas y **anomalías recientes**, y lo muestra con gráficos. Un resumen narrativo con IA es **opcional** (se habilita con una API key).

Stack: **Next.js 16 + Tailwind** (web/API) · **Python FastAPI** (motor de análisis) · **PostgreSQL** (almacenamiento opcional).

## Arquitectura

```
┌────────────┐   POST /api/datasets   ┌──────────────────┐   INSERT/GET   ┌──────────┐
│  Web/UI    │ ─────────────────────▶ │  Next.js (web)   │ ◀────────────▶ │ PostgreSQL │
│ (CSV+charts)│                        └───────┬──────────┘                 └──────────┘
└────────────┘                                │ POST /analyze (columnas+filas)
                                              ▼
                                      ┌──────────────────┐
                                      │ Motor Python      │  /analyze /analyze-csv /health
                                      │ (engine/main.py)  │
                                      └──────────────────┘
```

- **web** — interfaz, subida/parseo de CSV, rutas API (`/api/datasets`, `/api/analyze`, `/api/ai-summary`).
- **engine** — FastAPI. Análisis determinista en Python puro (sin dependencias de datos): tendencia por mínimos cuadrados, outliers por IQR, correlación de Pearson y anomalías por z-score. No consume claves API.
- **PostgreSQL** — si no hay `DATABASE_URL`, la web usa un almacén en memoria (suficiente para la demo).

## Ejecución local

**No necesitas Docker** para correr la demo en desarrollo: motor en un venv de Python + web con `npm`. Docker/compose queda como opción para servidores (p. ej. desplegar en Coolify).

```bash
# Terminal 1 — Motor Python (http://127.0.0.1:8000)
python3 -m venv .venv
source .venv/bin/activate
pip install -r engine/requirements.txt
uvicorn main:app --app-dir engine --port 8000

# Terminal 2 — Web (http://localhost:3000)
cd web
npm install
npm run dev
```

La web sin `DATABASE_URL` funciona con almacenamiento en memoria (suficiente para la demo). Si quieres el **resumen con IA**, define en la terminal de la web: `AI_API_KEY=...` (y opcionalmente `AI_BASE_URL`/`AI_MODEL`).

### Con Docker (opcional, p. ej. servidor/Coolify)

```bash
cp .env.example .env          # pega AI_API_KEY si quieres el resumen con IA
docker compose up --build     # levanta db + motor + web
open http://localhost:3000
```

El botón **"Probar con datos de ejemplo"** carga un CSV de ventas con tendencia, un outlier puntual y correlación ventas↔usuarios.

## API del motor (Python)

| Endpoint | Método | Body | Descripción |
|---|---|---|---|
| `/health` | GET | — | Healthcheck |
| `/analyze` | POST | `{columns:[{name,type}], rows:[[...]]}` | Análisis estructurado |
| `/analyze-csv` | POST | `{text:"<csv>", delimiter:","}` | Análisis directo desde texto CSV |

## IA opcional (resumen narrativo)

Variables de entorno en la web:

| Variable | Default | Descripción |
|---|---|---|
| `AI_API_KEY` | *(vacía)* | Si está definida, activa el botón "Resumen con IA". |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Compatible con cualquier API estilo OpenAI (p. ej. DeepSeek: `https://api.deepseek.com/v1`). |
| `AI_MODEL` | `gpt-4o-mini` | Modelo a usar (p. ej. `deepseek-v4-flash`). |

## Deploy en Coolify (dominio: https://analytica.evoluciondigitalia.cl)

Usa **`docker-compose.prod.yml`**: la DB y el motor quedan en la red interna (sin URL pública) y
solo la web (`web:3000`) recibe el dominio.

1. En Coolify → **New Resource → Docker Compose** (o **App** apuntando al repo `cesargarrido/analytica-ai`, rama `main`).
2. Pega el contenido de `docker-compose.prod.yml` (o déjalo que lo tome del repo).
3. Variables de entorno del recurso (opcionales): `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` y `POSTGRES_PASSWORD`.
4. En la pestaña del recurso, asigna el **dominio al servicio `web`** con puerto **3000**: `https://analytica.evoluciondigitalia.cl`.
5. **Motor y DB sin dominio** (quedan internos y alcanzables por `http://engine:8000` / `db:5432`).
6. Asegura DNS: el subdominio `analytica` debe resolver al servidor de Coolify (si ya tienes `n8n.evoluciondigitalia.cl`, probablemente hay wildcard y no necesitas tocar nada).
7. **Deploy**. La demo quedará en https://analytica.evoluciondigitalia.cl.

Después, en el portafolio (`evoluciondigitalia`), cambia en `content/projects/analytica-ai.mdx` el
`liveUrl` de `https://analytica-ai.demo` a `https://analytica.evoluciondigitalia.cl` y haz push.

## Estructura

```
engine/                    Motor Python FastAPI (main.py, requirements.txt, Dockerfile)
web/                       Next.js App Router + Tailwind (app/, components/, lib/, Dockerfile)
docker-compose.yml         Desarrollo local (con Docker)
docker-compose.prod.yml    Producción / Coolify (sin puertos públicos)
.env.example
```
