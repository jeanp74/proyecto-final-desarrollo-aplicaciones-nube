# Proyecto Final — Multi‑APIs (Patients, Doctors, Appointments, Pharmacy)

Aplicación compuesta por **4 servicios** independientes. Cada servicio empaqueta **backend Express** y **frontend React/Vite** en **una sola imagen Docker**, sirviendo la **API** y la **SPA** desde el **mismo origen** (sin CORS).

| Servicio | Descripción | Base de datos | Puerto local |
|---|---|---|---|
| `patients-api` | Gestión de pacientes | PostgreSQL | `http://localhost:4001` |
| `doctors-api` | Gestión de médicos   | PostgreSQL | `http://localhost:4002` |
| `appointments-api` | Citas (FK a pacientes y médicos) | PostgreSQL | `http://localhost:4003` |
| `pharmacy-api` | Inventario y recetas | Azure Cosmos DB for MongoDB (RU) | `http://localhost:4004` |

---

## 1) Requisitos

- **Docker** y **Docker Compose**.
- Acceso a **PostgreSQL** (local, contenedor o administrado).
- Acceso a **Cosmos DB for MongoDB** (o Mongo local para desarrollo).
- **Node 18+** si deseas ejecutar sin Docker (opcional).

### Variables de entorno (por servicio)
- `PATIENTS_DATABASE_URL` (patients-api)
- `DOCTORS_DATABASE_URL` (doctors-api)
- `APPOINTMENTS_DATABASE_URL` (appointments-api)
- `PHARMACY_MONGO_URI` (pharmacy-api)
- `PORT` (cada backend expone su propio puerto; coincide con el `EXPOSE` del Dockerfile)

> En producción (Azure App Service), define estas variables en **Configuration → Application settings**.

---

## 2) Puesta en marcha local (Docker Compose)

1) **Base de datos**  
   - PostgreSQL: crea los **schemas/tablas** con tu `schemas.sql` (puedes montarlo en `docker-entrypoint-initdb.d` o ejecutarlo manualmente).  
   - Cosmos/Mongo: crea la BD y, si usas autoincremento en farmacia, inicializa la colección `counters`:
     ```js
     { "_id": "pharmacy_medicamentos", "seq": 0 }
     { "_id": "pharmacy_recetas",      "seq": 0 }
     ```

2) **Levanta los servicios**  
   Desde la raíz del repo:
   ```bash
   docker compose up --build
   ```
   Accede a:
   - Pacientes → `http://localhost:4001`
   - Doctores  → `http://localhost:4002`
   - Citas     → `http://localhost:4003`
   - Farmacia  → `http://localhost:4004`

> Cada frontend incluye en el *header* campos para **API Base** (propia) y, donde aplica, **Pacientes API** y **Doctores API**. Las URLs se guardan en `localStorage` y los selectores (pacientes/doctores) se **cargan automáticamente** al abrir.

---

## 3) Cómo usar los frontends

### 3.1 Pacientes
- Registrar paciente (nombres, apellidos, documento, correo, teléfono, etc.).
- Tabla con **buscar**, **editar** y **eliminar**.  
- `id` autoincremental (PostgreSQL).

### 3.2 Doctores
- Registrar médico (nombre completo, especialidad, correo, teléfono, **activo**).
- Tabla con **buscar**, **editar**/**eliminar**.  
- `id` autoincremental (PostgreSQL).

### 3.3 Citas
- Formulario con **Paciente** y **Médico** (selects cargados desde las APIs de pacientes/doctores).
- Fechas **inicio/fin**, **motivo** y **estado** (`programada`, `reprogramada`, `cancelada`, `hecha`).
- Listado con filtros por paciente/médico/estado y rango de fechas.  
- `id` autoincremental (PostgreSQL).

### 3.4 Farmacia
- Registrar medicamento (**nombre, SKU, precio, unidad, stock**).
- Inventario con búsqueda, **ajuste rápido de stock** (+1/-1), editar y eliminar.
- Crear receta:
  - **Paciente** y **Médico** (selects externos).
  - **Medicamento** (select del inventario; se muestra el stock).
  - Agregar múltiples ítems `{ medicina_id, cantidad }` y confirmar.  
- En Mongo, cada documento tiene `_id` (ObjectId) y un `id` **numérico** de negocio (autoincremental por colección usando `counters`).

---

## 4) Llamadas de API (ejemplos)

> Sustituye por tus URLs (local o Azure).

### Pacientes
```bash
# Crear
curl -X POST http://localhost:4001/patients \
  -H "Content-Type: application/json" \
  -d '{"nombres":"Ana","apellidos":"López","documento":"CC-123","correo":"ana@demo.com"}'

# Listar
curl http://localhost:4001/patients
```

### Doctores
```bash
curl -X POST http://localhost:4002/doctors \
  -H "Content-Type: application/json" \
  -d '{"nombre_completo":"Dr. Juan","especialidad":"General","correo":"juan@doctor.com","telefono":"300...","activo":true}'
```

### Citas
```bash
curl -X POST http://localhost:4003/appointments \
  -H "Content-Type: application/json" \
  -d '{"paciente_id":1,"medico_id":1,"inicio":"2025-11-02T01:00:00Z","fin":"2025-11-02T02:00:00Z","motivo":"General","estado":"programada"}'
```

### Farmacia (inventario y recetas)
```bash
# Crear medicamento
curl -X POST http://localhost:4004/medicines \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Paracetamol","sku":"PARA-500","precio":2.5,"unidad":"und","stock":10}'

# Crear receta (nota: medicina_id es el _id de Mongo del medicamento)
curl -X POST http://localhost:4004/prescriptions \
  -H "Content-Type: application/json" \
  -d '{"paciente_id":1,"medico_id":1,"items":[{"medicina_id":"<ObjectId>","cantidad":2}],"notas":"Tomar cada 8h"}'
```

---

## 5) Despliegue en Azure (resumen)

### 5.1 ACR + Web App for Containers
1. Construye y publica las imágenes en tu **Azure Container Registry (ACR)**.  
2. Crea una **Web App** por servicio y configura:
   - **Image source** → tu ACR (`<acr>.azurecr.io/<servicio>:latest`).
   - **Application settings** (variables): `*_DATABASE_URL` / `PHARMACY_MONGO_URI`, `PORT`, etc.
   - Opcional: `WEBSITES_PORT` con el puerto del contenedor (si lo requiere el plan).
   - **Always On** y **Container logging** para diagnóstico.

### 5.2 CI/CD con GitHub Actions
- El workflow `deploy.yml` construye y hace *push* a ACR (tags `latest` + `short-sha`).  
- Si usas **dos ACRs**, el job selecciona el registro según el servicio (matrix) con secretos `ACR_LOGIN_SERVER/USERNAME/PASSWORD` y sus variantes `*2`.

---

## 6) Estructura por servicio

```
<servicio>/
├─ frontend/
│  ├─ src/                 # React/Vite
│  ├─ package.json
│  └─ vite.config.js
├─ src/
│  ├─ app.js               # Express (API + estáticos)
│  └─ db.js                # Conexión a PostgreSQL/Mongo
├─ Dockerfile              # Multi-stage (build Vite → sirve Express)
└─ package.json            # Backend
```

---

## 7) Problemas comunes (FAQ)

- **500/errores DB**: verifica la URL de la base y que existan los esquemas/tablas.
- **No cargan selects de pacientes/doctores**: revisa las **URLs** en el header y pulsa **Guardar bases** (se guardan en `localStorage`). En Citas y Farmacia la carga es automática al abrir.
- **Mongo `CastError` con `_id`**: usa `id` numérico para visualización/búsqueda de negocio; `_id` es ObjectId.
- **CORS**: no aplica (API y SPA comparten origen). Si separas dominios, habilita `cors` en Express y define `origin`.

---
