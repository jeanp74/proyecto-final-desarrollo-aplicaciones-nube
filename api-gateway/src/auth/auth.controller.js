// api-gateway/src/auth/auth.controller.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { demoUsers, refreshStore } from "./auth.service.js";

const router = Router();

// === Configuración de JWT ===
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXP = process.env.JWT_EXP || "15m";
const REFRESH_EXP = process.env.REFRESH_EXP || "7d";

// === Funciones internas ===
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXP }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: REFRESH_EXP });
}

// === RUTA: Login de usuario ===
// (Simula autenticación real)
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = demoUsers.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  refreshStore.set(refreshToken, { userId: user.id, createdAt: Date.now() });

  res.json({
    success: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// === RUTA: Refrescar token ===
router.post("/refresh", (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token || !refreshStore.has(refresh_token)) {
    return res.status(401).json({ error: "Token inválido" });
  }

  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    const user = demoUsers.find(u => u.id === payload.sub);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const newAccess = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    refreshStore.delete(refresh_token);
    refreshStore.set(newRefresh, { userId: user.id, createdAt: Date.now() });

    res.json({
      access_token: newAccess,
      refresh_token: newRefresh,
    });
  } catch (err) {
    res.status(401).json({ error: "Token expirado o inválido" });
  }
});

// === RUTA: Logout ===
router.post("/logout", (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) refreshStore.delete(refresh_token);
  res.json({ ok: true });
});

export default router;
