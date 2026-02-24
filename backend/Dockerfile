FROM node:18

WORKDIR /app

# Install dependencies (full image has python3/make/g++ for better-sqlite3 native build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3000

# Seed demo data if SEED_DEMO_DATA=true, then start server
CMD ["sh", "-c", "if [ \"$SEED_DEMO_DATA\" = \"true\" ]; then echo 'Seeding demo data...' && node dist/seed.js; fi && exec node dist/index.js"]
