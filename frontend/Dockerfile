# syntax=docker/dockerfile:1
#
# Build context is the repository root (see docker-compose.yml), not frontend/: the skill package
# staged into public/skill is assembled from .qoder/skills/, which lives outside the frontend.

FROM node:24-alpine AS skill
# stdlib-only Python, so the "下载 Skill 包" button works on a fresh clone instead of 404ing.
RUN apk add --no-cache python3
WORKDIR /repo
COPY scripts/stage_skill.py ./scripts/
COPY .qoder/skills/mogong-layout ./.qoder/skills/mogong-layout
RUN mkdir -p frontend/public && python3 scripts/stage_skill.py

FROM node:24-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
COPY --from=skill /repo/frontend/public/skill ./public/skill

# Rewrites live in Next's routes manifest, which is written at build time — so the backend
# address is a build input, not a runtime environment variable.
ARG MOGONG_BACKEND_ORIGIN=http://backend:8100
ENV MOGONG_BACKEND_ORIGIN=$MOGONG_BACKEND_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/next.config.ts ./
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
