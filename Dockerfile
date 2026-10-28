FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY src ./src
ENV LAGER_DATEI=/data/lager.json
VOLUME /data
EXPOSE 3000
CMD ["node", "src/server.js"]
