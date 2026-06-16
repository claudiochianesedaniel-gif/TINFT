# TINFT — API Fastify + frontend statici (sito, web app, console, test-app.html).
# Immagine portabile per qualsiasi host Node (Render / Railway / Fly / VPS).
# Il server legge $PORT (fornita dall'host) e serve i frontend da WEB_DIR.
FROM node:22-slim

# openssl/ca-certificates: richiesti da Prisma e per le chiamate HTTPS (RPC).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable

# Copia tutto il monorepo (il .dockerignore tiene fuori node_modules, .git, lib Foundry, ecc.)
COPY . .

# Installa le dipendenze del workspace (solo services/api ha dipendenze npm).
RUN pnpm install --frozen-lockfile

ENV HOST=0.0.0.0
ENV WEB_DIR=/app/apps/web
# Default locale; in cloud l'host inietta $PORT e l'API ci si lega da sola.
EXPOSE 3001

WORKDIR /app/services/api
CMD ["pnpm", "dev"]
