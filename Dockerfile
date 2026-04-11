FROM node:20-slim

WORKDIR /app

# Stage 1: Install all deps (including devDependencies for quality checks)
COPY package*.json ./
RUN npm ci

# Stage 1b: Run duplicate code detection before production build
RUN npm run check:duplicates

# Stage 2: Install only production dependencies
RUN npm ci --omit=dev

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
