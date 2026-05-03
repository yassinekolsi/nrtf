# ============================================================
# Stage 1: Build the Next.js frontend
# ============================================================
FROM node:22-alpine AS frontend

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Bake the API base into the JS bundle — browser hits same origin
ENV NEXT_PUBLIC_API_BASE_URL=/api
RUN pnpm build

# ============================================================
# Stage 2: Production image (Python + Node runtime)
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# Install system deps + Node.js 22 runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev curl gnupg ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY main.py database.py models.py schemas.py ./
COPY routers/ routers/

# Frontend standalone build from Stage 1
COPY --from=frontend /build/.next/standalone ./frontend/
COPY --from=frontend /build/.next/static ./frontend/.next/static
COPY --from=frontend /build/public ./frontend/public

# Start script
COPY start.sh .
RUN chmod +x start.sh

# Non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["./start.sh"]
