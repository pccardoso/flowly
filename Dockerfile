FROM node:22-alpine AS build
WORKDIR /app
# python3/make/g++: toolchain de compilação nativa exigida pelo node-gyp do
# isolated-vm (sandbox do step CODIGO_JAVASCRIPT) — sem isso `npm ci` falha
# ao tentar compilar o addon nesta imagem alpine (musl, sem toolchain default).
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# chromium: motor de renderização do PdfRendererService (exportação de PDF de
# card, HTML/CSS via Puppeteer) — usamos puppeteer-core (sem Chromium
# embutido, que não roda bem no musl do Alpine) apontando pro binário do
# pacote apk via PUPPETEER_EXECUTABLE_PATH (ver docker-compose.yml).
RUN apk add --no-cache python3 make g++ chromium
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# mp3 dos alertas sonoros (ver src/sons) — lidos em runtime de /app/sounds.
COPY --from=build /app/sounds ./sounds
EXPOSE 3000
CMD ["node", "dist/main"]
