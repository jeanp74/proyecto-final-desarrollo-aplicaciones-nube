# -------- BACKEND (Express) --------
FROM node:20-alpine
WORKDIR /app
# instala deps del backend
COPY package*.json ./
RUN npm ci --omit=dev
# copia código backend
COPY . .

ENV NODE_ENV=production
ENV PORT=4001
EXPOSE 4001

CMD ["node","src/app.js"]
