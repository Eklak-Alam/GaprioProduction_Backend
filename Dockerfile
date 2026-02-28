# -------- 1️⃣ Builder Stage --------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./

RUN npm ci --omit=dev

# Copy rest of the code
COPY . .

# -------- 2️⃣ Production Runner --------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production node_modules and source
COPY --from=builder /app /app

USER appuser

EXPOSE 5000

CMD ["node", "server.js"]