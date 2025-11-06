# products-react

Frontend en React + Vite para `products-api` (Mongo/Cosmos).

## Requisitos
- Node.js 18+ recomendado.
- `products-api` corriendo y conectado a tu Mongo/Cosmos. En `docker-compose.yml` se leen `MONGODB_URI` y `MONGO_DB_NAME` desde `.env` en la raíz.

## Desarrollo local
```bash
cd products-react
npm install
# por defecto usa VITE_API_BASE=http://localhost:4002
npm run dev
```
Abre: http://localhost:5174

Puedes cambiar la base desde `.env` o en la UI:
```bash
# .env
VITE_API_BASE=http://localhost:4002
```

## Funcionalidades
- Listado con búsqueda por nombre (`q`) y filtro por `category` (lado servidor): `GET /products?page&limit&q&category`
- Paginación con contador de total/páginas.
- Crear producto con campos básicos: `name`, `category`, `brand` (opcional), y una variante `{ sku, price, stock }`.
- Editar en línea: `name`, `brand`, `price`, `stock`.
- Eliminar producto.
- Configurar API Base en la UI (persistido en `localStorage`).

## Docker
Desde la raíz del repo:
```bash
docker compose up --build products-api products-react
```
- `products-react`: http://localhost:5174
- `products-api`: http://localhost:4002

Si necesitas apuntar a otro backend en build-time:
```bash
docker compose build products-react --build-arg VITE_API_BASE=http://otro-host:4002
```

## Notas
- `products-api` implementa rutas:
  - `GET /products` (paginado y filtro `q`/`category`)
  - `GET /products/:id` (por ObjectId o SKU de variante)
  - `POST /products` (requiere `category`)
  - `PUT /products/:id`
  - `DELETE /products/:id`
- Si vas a manipular múltiples variantes por producto o filtros avanzados, puedo extender la UI (multi-variantes, chips de tags, selects de categoría, etc.).
