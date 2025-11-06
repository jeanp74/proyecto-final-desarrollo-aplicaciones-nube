# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci || npm install
COPY . .
# VITE_API_BASE can be overridden at build time
ARG VITE_API_BASE=http://localhost:4001
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# --- Run stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Replace default config with SPA-aware config
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
