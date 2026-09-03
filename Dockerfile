# =============================================================================
# Analytica AI - contenedor ÚNICO (web Next.js + motor FastAPI juntos).
# Pensado para desplegar en Coolify como una sola app (build pack: Dockerfile).
# La web llama al motor por http://127.0.0.1:8000 dentro del mismo contenedor.
# PostgreSQL: opcional (si no defines DATABASE_URL, la web usa memoria).
# =============================================================================

# ---- Stage 1: build de la web (Next standalone) ----
FROM node:20-alpine AS webbuilder
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: motor Python (venv limpio) ----
FROM python:3.12-slim AS engine
WORKDIR /opt/engine-src
COPY engine/requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY engine/main.py .

# ---- Stage 3: imagen final ----
FROM python:3.12-slim

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ENGINE_URL=http://127.0.0.1:8000 \
    NEXT_TELEMETRY_DISABLED=1

# Node runtime para servir el standalone de Next (binario oficial de nodejs.org)
ARG NODE_VERSION=20.19.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
     | tar -xJ -C /opt \
  && mv "/opt/node-v${NODE_VERSION}-linux-x64" /opt/node \
  && apt-get purge -y --auto-remove curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/node/bin:/opt/venv/bin:${PATH}"

# Usuario no root
RUN groupadd --system app && useradd --system --gid app app

# Web standalone
WORKDIR /app
COPY --from=webbuilder /app/web/.next/standalone ./
COPY --from=webbuilder /app/web/.next/static ./.next/static
COPY --from=webbuilder /app/web/public ./public

# Motor
COPY --from=engine /opt/venv /opt/venv
RUN mkdir -p /srv/engine
COPY --from=engine /opt/engine-src/main.py /srv/engine/main.py

# Entrypoint (arranca motor + web juntos)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R app:app /app /srv

USER app
EXPOSE 3000 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000', timeout=5)"

CMD ["/entrypoint.sh"]
