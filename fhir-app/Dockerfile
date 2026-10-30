FROM node:22-alpine

WORKDIR /app

# HOST=0.0.0.0 so the engine container can reach the app on the Docker network.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Install only the runtime dependencies, exactly as pinned in package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Run as the unprivileged "node" user that the base image provides.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
