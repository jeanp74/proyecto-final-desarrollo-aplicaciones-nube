# 🛡️ API Gateway – Proyecto Final (AuthN + AuthZ + OAuth 2.0)

## 📘 Descripción general

Este proyecto implementa un **API Gateway personalizado** en Node.js que sirve como **punto de entrada único** para todas las APIs del sistema (pacientes, doctores, citas, farmacia, etc.).  
Además, gestiona la **autenticación (AuthN)**, **autorización (AuthZ)** y **emisión/validación de tokens JWT (OAuth 2.0)**.

El Gateway centraliza las peticiones de los clientes y aplica políticas de seguridad, validación y enrutamiento antes de redirigir las solicitudes a los microservicios correspondientes.

---

## 🧩 Estructura del proyecto

```

api-gateway/
│
├── auth/
│   ├── auth.controller.js      # Controlador principal para login, registro y emisión de tokens
│   ├── auth.routes.js          # Rutas públicas (/auth/login, /auth/register, /auth/refresh)
│   └── auth.service.js         # Lógica central: generación y validación de tokens JWT
│
├── gateway/
│   ├── gateway.routes.js       # Enrutador principal del Gateway, delega peticiones a servicios backend
│   ├── gateway.service.js      # Proxy HTTP que reenvía solicitudes a los microservicios (pacientes, doctores, etc.)
│   └── routes.config.js        # Mapa de rutas internas → URLs de microservicios reales
│
├── middlewares/
│   ├── auth.middleware.js      # Middleware que valida el token JWT en rutas protegidas
│   ├── logger.middleware.js    # Middleware para registrar solicitudes entrantes
│   └── cors.middleware.js      # Configuración global de CORS
│
├── utils/
│   ├── jwt.util.js             # Funciones utilitarias para firmar y verificar tokens
│   ├── env.util.js             # Carga de variables de entorno y configuración global
│   └── response.util.js        # Estructura estándar para respuestas (éxito/error)
│
├── app.js                      # Punto de entrada de la aplicación Express
├── Dockerfile                  # Imagen Docker para despliegue en Azure
├── package.json                # Dependencias y scripts npm
└── README.md                   # Este archivo 📘

````

---

## 🔐 Módulos principales

### 1️⃣ `auth/` → Autenticación y Autorización

- **auth.controller.js**  
  Define los endpoints `/auth/login`, `/auth/register`, `/auth/refresh`.  
  - **Login:** genera un token JWT al validar credenciales.  
  - **Register:** crea usuarios en la base de datos (si aplica).  
  - **Refresh:** renueva el token antes de expirar.

- **auth.service.js**  
  Implementa las funciones para generar tokens firmados y validarlos.  
  Usa `jsonwebtoken` y variables de entorno (`JWT_SECRET`, `JWT_EXPIRES_IN`).

- **auth.routes.js**  
  Define las rutas y conecta los controladores con Express.

---

### 2️⃣ `gateway/` → Enrutamiento central y proxy

- **gateway.routes.js**  
  Define los endpoints del gateway (por ejemplo `/api/pacientes`, `/api/doctores`, `/api/farmacia`).  
  Aplica el middleware de autenticación y llama al proxy.

- **gateway.service.js**  
  Reenvía las solicitudes HTTP al microservicio correspondiente, utilizando `node-fetch` o `axios`.  
  - Agrega encabezados de autenticación.  
  - Maneja los errores y devuelve la respuesta al cliente.

- **routes.config.js**  
  Contiene las URLs base de los microservicios, por ejemplo:
  ```js
  export const routesMap = {
    pacientes: process.env.PATIENTS_API_URL,
    doctores: process.env.DOCTORS_API_URL,
    citas: process.env.APPOINTMENTS_API_URL,
    farmacia: process.env.PHARMACY_API_URL,
  };
````

---

### 3️⃣ `middlewares/`

* **auth.middleware.js**
  Verifica el token JWT en cada solicitud protegida.
  Si el token es válido, añade la información del usuario (`req.user`) y continúa.
  Si no, devuelve un error 401.

* **logger.middleware.js**
  Muestra en consola los logs básicos de cada petición entrante (método, ruta, estado, tiempo de respuesta).

* **cors.middleware.js**
  Configura CORS para permitir peticiones desde el frontend (React/Vite o cualquier dominio permitido).

---

### 4️⃣ `utils/`

* **jwt.util.js**
  Funciones para generar y verificar tokens JWT:

  ```js
  export function generateToken(payload) { ... }
  export function verifyToken(token) { ... }
  ```

* **env.util.js**
  Carga las variables desde `.env` y las valida.

* **response.util.js**
  Define respuestas estándar (por ejemplo: `success(data)` o `error(message, code)`).

---

## ⚙️ Configuración de entorno (`.env`)

Ejemplo:

```
PORT=5000
JWT_SECRET=SuperClaveSegura123
JWT_EXPIRES_IN=1h

PATIENTS_API_URL=https://patients-api.azurewebsites.net
DOCTORS_API_URL=https://doctors-api.azurewebsites.net
APPOINTMENTS_API_URL=https://appointments-api.azurewebsites.net
PHARMACY_API_URL=https://pharmacy-api.azurewebsites.net
```

---

## 🚀 Cómo ejecutar localmente

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear un archivo `.env` (según el ejemplo anterior).

3. Iniciar el servidor:

   ```bash
   npm start
   ```

4. Acceder al Gateway:

   ```
   http://localhost:5000/
   ```

---

## 🧱 Flujo de peticiones

```text
Cliente → API Gateway → (auth.middleware valida token)
                      ↓
                Rutas del Gateway
                      ↓
          Proxy → Microservicio correspondiente
                      ↓
                 Respuesta al cliente
```

---

## 🔄 Despliegue en Azure

* El `Dockerfile` genera una imagen Node.js ligera (basada en `node:20-alpine`).
* La imagen se sube al **Azure Container Registry (ACR)**.
* El contenedor se ejecuta en un **Azure App Service** vinculado al ACR.
* CI/CD se gestiona con **GitHub Actions** (workflow `deploy.yml`).

---

## 📜 Licencia

Proyecto académico desarrollado como práctica universitaria para el módulo de despliegue en nube y seguridad de aplicaciones.
Uso educativo y demostrativo.
