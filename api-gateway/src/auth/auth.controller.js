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

export async function login(req, res) {
  const { email, password } = req.body;
  const user = demoUsers.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Credenciales inválidas" });

  const access = signAccessToken(user);
  const refresh = signRefreshToken(user);
  refreshStore.set(refresh, { userId: user.id, createdAt: Date.now() });

  res.json({ access_token: access, refresh_token: refresh, token_type: "Bearer" });
}

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
