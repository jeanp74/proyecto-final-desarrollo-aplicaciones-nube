import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { demoUsers, refreshStore } from "./auth.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXP = process.env.JWT_EXP || "15m";
const REFRESH_EXP = process.env.REFRESH_EXP || "7d";

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

// api-gateway/auth/auth.controller.js
import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

// Demo: usuario estático para pruebas
const USER = {
  email: "admin@example.com",
  password: "admin",
  name: "Administrador",
  role: "admin",
};

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (email !== USER.email || password !== USER.password) {
    return res.status(401).json({ success: false, error: "Credenciales inválidas" });
  }

  const token = jwt.sign({ email, role: USER.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });

  res.json({
    success: true,
    token,
    user: { email: USER.email, name: USER.name, role: USER.role },
  });
});

export default router;


export function refresh(req, res) {
  const { refresh_token } = req.body;
  if (!refresh_token || !refreshStore.has(refresh_token))
    return res.status(401).json({ error: "Token inválido" });

  const payload = jwt.verify(refresh_token, JWT_SECRET);
  const user = demoUsers.find(u => u.id === payload.sub);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const newAccess = signAccessToken(user);
  const newRefresh = signRefreshToken(user);
  refreshStore.delete(refresh_token);
  refreshStore.set(newRefresh, { userId: user.id, createdAt: Date.now() });

  res.json({ access_token: newAccess, refresh_token: newRefresh });
}

export function logout(req, res) {
  const { refresh_token } = req.body;
  if (refresh_token) refreshStore.delete(refresh_token);
  res.json({ ok: true });
}
