import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./auth/auth.controller.js";
import gatewayRoutes from "./gateway/gateway.routes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Rutas principales
app.use("/auth", authRouter);
app.use("/api", gatewayRoutes);

app.get("/", (_, res) => res.json({ status: "API Gateway + Auth activo" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
