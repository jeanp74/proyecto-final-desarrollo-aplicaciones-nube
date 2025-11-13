import { Router } from "express";
import * as Auth from "./auth.controller.js";

const router = Router();

router.post("/login", Auth.login);
router.post("/refresh", Auth.refresh);
router.post("/logout", Auth.logout);

export default router;
