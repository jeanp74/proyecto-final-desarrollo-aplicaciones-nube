# -------- BACKEND (Express) --------
FROM node:20-alpine
WORKDIR /app
# instala deps del backend
COPY package*.json ./
RUN npm ci --omit=dev
# copia código backend
COPY . .

ENV NODE_ENV=production
ENV PORT=4003
EXPOSE 4003
# ENV PORT=4002 SERVICE_NAME=products-api
# ENV SERVICE_NAME=products-api

# Tu start ya apunta a src/app.js
CMD ["node","src/app.js"]
