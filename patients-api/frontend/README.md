# users-react

Frontend en React + Vite para `users-api`.

## Requisitos
- Node.js 18+ recomendado.

## Desarrollo local
```bash
cd users-react
npm install
# por defecto usa VITE_API_BASE=http://localhost:4001
npm run dev
```
Abre: http://localhost:5173

Puedes cambiar la base desde `.env` o en la propia UI (se guarda en localStorage):
```bash
# .env
VITE_API_BASE=http://localhost:4001
```

## Producción (build)
```bash
npm run build
npm run preview  # sirve la build en 5173
```

## Docker
Construir y levantar con docker-compose desde la raíz del repo:
```bash
docker compose up --build users-react
```
Esto servirá la app en http://localhost:5173 apuntando internamente a `http://users-api:4001`.

Para cambiar el backend en build-time:
```bash
docker compose build users-react --build-arg VITE_API_BASE=http://otro-servicio:4001
```

## Funcionalidades
- Listar usuarios (`GET /users`).
- Crear usuario (`POST /users`).
- Editar inline (`PUT /users/:id`).
- Eliminar (`DELETE /users/:id`).
- Configurar API Base en UI.
