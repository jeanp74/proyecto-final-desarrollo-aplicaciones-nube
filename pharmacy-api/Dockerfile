# -------- FRONTEND BUILD (Vite) --------
FROM node:20-alpine AS webbuild
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Como front y API estarán en el mismo dominio, base "/"
ARG VITE_API_BASE=/
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# -------- BACKEND (Express) --------
FROM node:20-alpine
WORKDIR /app
# instala deps del backend
COPY package*.json ./
RUN npm ci --omit=dev
# copia código backend
COPY . .
# copia el build del front -> /app/public (lo sirve Express)
COPY --from=webbuild /web/dist ./public

ENV NODE_ENV=production
ENV PORT=4003
EXPOSE 4003
# ENV PORT=4002 SERVICE_NAME=products-api
# ENV SERVICE_NAME=products-api

# Tu start ya apunta a src/app.js
CMD ["node","src/app.js"]
