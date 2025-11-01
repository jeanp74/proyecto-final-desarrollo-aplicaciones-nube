
# Proyecto Final — Guía técnica y flujo de arquitectura
*Última actualización:* 2025-11-01 03:40 UTC

> Este documento describe **cómo funciona de extremo a extremo** el proyecto multi-servicios: *patients-api*, *doctors-api*, *appointments-api* (PostgreSQL) y *pharmacy-api* (Azure Cosmos DB for MongoDB). Incluye el rol de cada Dockerfile, cómo compilan y se sirven los frontends en React/Vite, cómo operan los backends en Express, el pipeline de CI/CD hacia Azure Container Registry (ACR) y despliegue en Azure App Service.

---

## 1) Panorama general (E2E)

```
[React/Vite (cada frontend)]  →  [Express (cada backend)]
         |                                 |
         |  HTTP/JSON                      |  Drivers
         v                                 v
   Azure App Service  (contenedores)  →  PostgreSQL / Cosmos DB (Mongo API)
                   ^
                   |
          Azure Container Registry (ACR)
                   ^
                   |
              GitHub Actions (CI/CD)
```

- Hay **4 servicios** independientes (cada uno con su frontend+backend empaquetados en una sola imagen Docker):
  - **patients-api**: CRUD de pacientes (PostgreSQL).
  - **doctors-api**: CRUD de médicos (PostgreSQL).
  - **appointments-api**: programación y gestión de citas (PostgreSQL con FKs a pacientes/médicos).
  - **pharmacy-api**: inventario y recetas (Azure Cosmos DB for MongoDB API).

- Cada imagen contiene:
  - **Build del frontend** (React con Vite) → copia de `/dist` a `/app/public`.
  - **Backend Express** que sirve **la API** y **estáticos** del frontend (mismo origen/puerto).

- **Variables de entorno** relevantes (en Azure y en local):
  - `PATIENTS_DATABASE_URL` — conexión PostgreSQL para patients.
  - `DOCTORS_DATABASE_URL` — conexión PostgreSQL para doctors.
  - `APPOINTMENTS_DATABASE_URL` — conexión PostgreSQL para appointments.
  - `PHARMACY_MONGO_URI` — cadena de conexión para Cosmos DB Mongo (RU).
  - `PORT` — puerto expuesto por Express (coincide con el mapeo del contenedor).

---

## 2) Flujo de Frontend (React + Vite)

**Concepto clave: mismas URLs para API y app.**  
El build de Vite se sirve bajo el **mismo dominio** que la API (Express hace `express.static('./public')`). Por eso, `VITE_API_BASE` suele valer `/` (mismo origen) y en producción **no se necesitan CORS** ni proxies.

### 2.1. Configuración de bases en el UI
- Cada frontend incluye inputs en el **header** para fijar las URLs base (por ejemplo, en *appointments* se configuran: la propia API, la de **Pacientes** y la de **Doctores**).
- Esas bases se guardan en `localStorage` (helpers en `api.js`).
- En *appointments* y *pharmacy* los **desplegables** (selects) de Pacientes/Doctores se **cargan automáticamente** al abrir, y también cuando cambias la URL y presionas “Guardar bases”.

### 2.2. Llamadas de red
- Cada frontend usa un helper `api(path, options)` que concatena `getApiBase()` con la ruta y hace `fetch` con `Content-Type: application/json`. Si la respuesta no es *ok*, arroja un error con detalle.
- Para catálogos externos (p.ej. pacientes, doctores) se usa `extGet(base, path)`.

### 2.3. Compilación y publicación
- `npm ci && npm run build` en la etapa *webbuild* del Dockerfile genera `/web/dist`.
- La etapa final copia ese build a `/app/public` y Express lo expone en `GET /`.
- **Ventaja**: una sola imagen por servicio; **no** se necesita Nginx dentro del contenedor.

---

## 3) Flujo de Backend (Express)

Cada backend Express tiene la misma estructura básica:

1. **Conexión a la BD** desde variables de entorno.
   - PostgreSQL en patients/doctors/appointments (pools con `pg`).
   - Cosmos DB (Mongo API) en pharmacy (con `mongoose`).

2. **Rutas REST**:
   - *patients-api*  
     `GET /patients`, `GET /patients/:id`, `POST /patients`, `PUT /patients/:id`, `DELETE /patients/:id`
   - *doctors-api*  
     `GET /doctors`, `GET /doctors/:id`, `POST /doctors`, `PUT /doctors/:id`, `DELETE /doctors/:id`
   - *appointments-api*  
     `GET /appointments`, `GET /appointments/:id`, `POST /appointments`, `PUT /appointments/:id`, `DELETE /appointments/:id`  
     Valida `paciente_id` y `medico_id` (FK), fechas y estados (`programada`, `reprogramada`, `cancelada`, `hecha`).
   - *pharmacy-api*  
     Inventario: `GET/POST/PUT/DELETE /medicines`  
     Recetas: `POST /prescriptions` (con items `{ medicina_id, cantidad }`).

3. **Servir frontend**:  
   - `app.use(express.static('public'))` y un *catch-all* que devuelve `index.html` para rutas de SPA.
   - `app.listen(PORT)`.

### 3.1. Autonumeración en Mongo (pharmacy)
- Cosmos DB (Mongo) no tiene autoincremento nativo. Se usa una colección **counters** con documentos por “tipo” de colección:
  ```json
  {{ "_id": "pharmacy_medicamentos", "seq": 0 }}
  {{ "_id": "pharmacy_recetas",      "seq": 0 }}
  ```
- Un helper `getNextSequence(kind)` hace `findOneAndUpdate` con `$inc: {{ seq: 1 }}` y retorna el siguiente `seq`.
- Antes de `insertOne`/`save`, si no viene `id` numérico, se asigna `id = seq`.
- **Lecturas** y **URLs** permiten buscar por `id` numérico o por `_id` de Mongo (cuando aplica).

### 3.2. Integridad en PostgreSQL
- *patients*, *doctors*, *appointments* usan **schemas** dedicados (p.ej. `patients_schema.patients`).  
- *appointments* referencia FKs a `patients_schema.patients(id)` y `doctors_schema.doctors(id)` con acciones `ON UPDATE CASCADE` y `ON DELETE RESTRICT` (o lo que definas).

---

## 4) Esquemas de datos (resumen)

### 4.1. PostgreSQL
- **patients_schema.patients**  
  `id SERIAL PK, nombres TEXT, apellidos TEXT, documento TEXT UNIQUE, ...`
- **doctors_schema.doctors**  
  `id SERIAL PK, nombre_completo TEXT, especialidad TEXT, correo TEXT UNIQUE, ...`
- **appointments_schema.appointments**  
  `id SERIAL PK, paciente_id INT FK, medico_id INT FK, inicio TIMESTAMP, fin TIMESTAMP, motivo TEXT, estado TEXT CHECK (...)`

### 4.2. Cosmos DB (Mongo API)
- **medicines** (inventario)  
  `{{ _id:ObjectId, id:Number, nombre, sku, precio:Number, unidad, stock:Number, ... }}`
- **prescriptions** (recetas)  
  `{{ _id:ObjectId, id:Number, paciente_id:Number, medico_id:Number, items:[ {{ medicina_id:ObjectId, cantidad:Number }} ], notas, createdAt }}`
- **counters** (autonumeración)  
  `{{ _id:"pharmacy_medicamentos" | "pharmacy_recetas", seq:Number }}`

> **Nota**: en recetas, el arreglo `items` referencia **ObjectId** de la medicina (`medicina_id`), mientras que el campo visible de negocio `id` es numérico (autoincremental mediante *counters*).

---

## 5) Dockerfiles — ¿Qué hacen y por qué?

Todos siguen un patrón **multi-stage** para producir imágenes pequeñas:

```Dockerfile
# -------- FRONTEND BUILD (Vite) --------
FROM node:20-alpine AS webbuild
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# (opcional) ARG VITE_API_BASE y ENV VITE_API_BASE
RUN npm run build

# -------- BACKEND (Express) --------
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Copia el build del frontend
COPY --from=webbuild /web/dist ./public

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node","src/app.js"]
```

**Claves:**
- El build del frontend se hace en una imagen separada y solo se copia `/dist` a la final.
- Express sirve **estáticos** desde `./public`; no se necesita Nginx.
- `npm ci --omit=dev` reduce el tamaño final.
- `EXPOSE` coincide con el `PORT` que usa App Service.

---

## 6) CI/CD con GitHub Actions → ACR → App Service

### 6.1. Workflow (resumen)
- Job con **matrix** para construir y empujar múltiples servicios.
- **Login** a ACR con `azure/docker-login@v1`.
- **Build & Push** usando ya sea:
  - `docker/build-push-action@v5` (Buildx) **o**
  - `docker build/tag/push` clásicos.
- Tags: `latest` y `short-sha` para trazabilidad.

### 6.2. Variables/Secrets en GitHub
- `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD` (y si usas un segundo ACR, las variantes `*2`).
- `AZURE_CREDENTIALS` si empleas `azure/login@v2` en flujos más avanzados.

### 6.3. App Service (Web App for Containers)
- Cada servicio se despliega a su **propia Web App** apuntando a su imagen del ACR.
- **Configuración**: `PORT`, cadena de conexión a Postgres o Cosmos, `WEBSITES_PORT` (si hace falta), y *Always On* recomendado.
- **Logging**: activar *Container logging* para diagnóstico.

---

## 7) Ejecución local (docker-compose)

Un `docker-compose.yml` típico (resumen conceptual):

```yaml
services:
  patients-api:
    build: ./patients-api
    environment:
      - PATIENTS_DATABASE_URL=postgres://...
      - PORT=4001
    ports: ["4001:4001"]

  doctors-api:
    build: ./doctors-api
    environment:
      - DOCTORS_DATABASE_URL=postgres://...
      - PORT=4002
    ports: ["4002:4002"]

  appointments-api:
    build: ./appointments-api
    environment:
      - APPOINTMENTS_DATABASE_URL=postgres://...
      - PORT=4003
    ports: ["4003:4003"]

  pharmacy-api:
    build: ./pharmacy-api
    environment:
      - PHARMACY_MONGO_URI=mongodb://...
      - PORT=4004
    ports: ["4004:4004"]

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=secret
    ports: ["5432:5432"]

  mongo:
    image: mongo:6
    ports: ["27017:27017"]
```

> **Tip**: inicializa PostgreSQL con `schemas.sql` (volumen o `docker-entrypoint-initdb.d`). En Mongo, crea los documentos de *counters* si quieres empezar con `id=1`.

---

## 8) Cómo funciona cada *frontend* (detalles prácticos)

- **State & Hooks**: cada tabla usa un *hook* con `load/create/update/remove`.  
- **Filtros**: en *appointments* hay filtros por paciente, médico, estado y rango de fechas.  
- **Selects**: se llenan automáticamente al montar; puedes recargar con “Cargar”.  
- **Errores**: se muestran en una *status bar* encima de la tabla.  
- **UI consistente**: inputs, selects “bonitos” con `.pretty-select`, badges por estado, y tablas similares.

---

## 9) Seguridad y CORS

- Al servir **frontend + API** bajo el **mismo origen**, evitas CORS.  
- Si en algún momento separas dominios, agrega CORS en Express (paquete `cors`) con una `origin` blanca.

---

## 10) Observabilidad y troubleshooting

- **Logs** del contenedor en App Service → diagnostican errores de conexión (DB, puertos).  
- **Errores 500**: revisa variables de entorno y migraciones/esquemas.  
- **Time outs**: verifica que el `PORT` coincide con `WEBSITES_PORT` si lo usas.  
- **Mongo**: si aparece `CastError` al buscar por `_id`, recuerda que para búsquedas de negocio usas `id` (numérico); `_id` es ObjectId.  
- **Auto-incremento Mongo**: si la colección `counters` no existe, créala con `{{ _id: "pharmacy_medicamentos", seq: 0 }}` y `{{ _id: "pharmacy_recetas", seq: 0 }}`.

---

## 11) Extensiones y siguientes pasos

- **Autenticación** (JWT) para proteger API y paneles.  
- **Paginación** y **búsquedas** más avanzadas.  
- **Validación** robusta con `zod` o `joi`.  
- **Alertas** (por ejemplo, stock bajo en farmacia).  
- **Observabilidad**: Application Insights o OpenTelemetry.

---

## 12) Resumen rápido (TL;DR)

- **Una imagen por servicio** → backend Express + frontend estático (Vite) en el mismo contenedor.  
- **PostgreSQL** para pacientes/doctores/citas con FKs y checks; **Cosmos DB (Mongo)** para farmacia con autoincremento por *counters*.  
- **React** consume API propia y catálogos externos; **selects** se cargan automáticamente.  
- **CI/CD** por GitHub Actions → **ACR** → **App Service**.  
- **Config** por variables de entorno; **no CORS** al servir todo desde el mismo origen.

¡Con esto tienes el mapa completo del proyecto, tanto para presentarlo como para operar y escalar!
