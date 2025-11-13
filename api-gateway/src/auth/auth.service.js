// api-gateway/src/auth/auth.service.js
import bcrypt from "bcrypt";

// === Usuarios de prueba (mock) ===
// Contraseña: "admin"
const hashedPassword = await bcrypt.hash("admin", 10);

export const demoUsers = [
  {
    id: 1,
    name: "Administrador",
    email: "admin@example.com",
    password: hashedPassword,
    role: "admin",
  },
  {
    id: 2,
    name: "Usuario Prueba",
    email: "user@example.com",
    password: await bcrypt.hash("user123", 10),
    role: "user",
  },
];

// === Almacenamiento temporal de tokens de refresh ===
export const refreshStore = new Map();