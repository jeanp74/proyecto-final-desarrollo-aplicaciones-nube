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
ENV PORT=4004
EXPOSE 4004

CMD ["node","src/app.js"]
