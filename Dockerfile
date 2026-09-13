FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DATA_SOURCE=api
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DATA_SOURCE=api
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm","run","start","--","--hostname","0.0.0.0"]
