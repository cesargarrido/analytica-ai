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

Requisito: Docker (con compose).

```bash
# 1. Variables opcionales
cp .env.example .env          # pega AI_API_KEY si quieres el resumen con IA

# 2. Levantar todo (db + motor + web)
docker compose up --build

# 3. Abrir
open http://localhost:3000
```

Sin Docker (solo web + motor):

```bash
# Motor
python3 -m venv .venv && source .venv/bin/activate
pip install -r engine/requirements.txt
uvicorn main:app --app-dir engine --port 8000

# Web (otra terminal)
cd web
npm install
npm run dev      # http://localhost:3000
```

La web sin `DATABASE_URL` funciona en memoria. El botón **"Probar con datos de ejemplo"** carga un CSV de ventas con tendencia, un outlier puntual y correlación ventas↔usuarios.

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

## Deploy en Coolify

1. Crea una app "Docker Compose" apuntando a `cesargarrido/analytica-ai` (rama `main`).
2. En el compose editor asegúrate de las variables de entorno (`AI_API_KEY`, etc.) y mapea dominios/subdominios a `web:3000`, `engine:8000`.
3. `db` puede sustituirse por el servicio PostgreSQL de Coolify si lo prefieres.

## Estructura

```
engine/          Motor Python FastAPI (main.py, requirements.txt, Dockerfile)
web/             Next.js App Router + Tailwind (app/, components/, lib/, Dockerfile)
docker-compose.yml
.env.example
```
