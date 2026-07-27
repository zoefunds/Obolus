FROM node:20-slim

WORKDIR /app

# Install from the workspace root so the backend's hoisted deps (viem,
# genlayer-js, ioredis, ...) resolve the same way they do in dev.
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
RUN npm install --workspace backend --omit=dev

COPY backend backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
