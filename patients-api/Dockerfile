# -------- FRONTEND BUILD (Vite) --------
FROM node:20-alpine AS webbuild
WORKDIR /web
# copia sólo lo necesario para cachear la instalación
COPY frontend/package*.json ./ 
RUN npm ci
# copia el resto y construye
COPY frontend/ .
# puedes fijar la API en build-time si quieres
ARG VITE_API_BASE
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
# copia el build del frontend a /app/public (lo servirá Express)
COPY --from=webbuild /web/dist ./public

ENV NODE_ENV=production
ENV PORT=4001
EXPOSE 4001

CMD ["node","src/app.js"]
