# Builds the frontend and serves it with Caddy. Build context is the frontend folder (see docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No VITE_API_BASE: the app then calls /api, which Caddy forwards to the backend.
ENV VITE_USE_MOCK=false
RUN npm run build

FROM caddy:2
COPY --from=build /app/dist /srv
