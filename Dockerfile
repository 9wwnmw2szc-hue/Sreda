FROM node:22.18-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_APP_NAME=БизнеСоты
RUN npm run build
FROM node:22.18-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_APP_NAME=БизнеСоты
COPY --from=build --chown=node:node /app /app
USER node
# Railway injects PORT; Next.js `next start` respects it. 3000 is the local default only.
EXPOSE 3000
CMD ["npm","run","start","--","--hostname","0.0.0.0"]
