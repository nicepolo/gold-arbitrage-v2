FROM node:22-alpine

WORKDIR /app

# Install pnpm globally first
RUN npm install -g pnpm@10.4.1

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/index.js"]
