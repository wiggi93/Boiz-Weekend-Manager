FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tools.js http.js index.js ./
# OAuth clients/tokens live here so connectors survive a redeploy.
VOLUME /data
EXPOSE 8040
CMD ["node", "http.js"]
