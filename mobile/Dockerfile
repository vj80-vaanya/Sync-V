# Stage 1: Build Expo web export
FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json app.json babel.config.js ./
COPY App.tsx ./
COPY src/ ./src/
COPY assets/ ./assets/

RUN npx expo export --platform web

# Stage 2: Serve static files
FROM node:20-slim

RUN npm install -g serve@14

WORKDIR /app
COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["serve", "dist", "-l", "8080"]
