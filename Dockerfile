# Benchmark Runner Container
# Node.js + Python for LLM code evaluation

FROM node:22-slim

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install Python dependencies (datasets library for HuggingFace)
RUN pip3 install --break-system-packages datasets>=3.0.0

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy container code
COPY dist/container ./dist/container

# Copy Python scripts
COPY scripts/load_problems.py ./scripts/

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the benchmark runner
CMD ["node", "dist/container/index.js"]
