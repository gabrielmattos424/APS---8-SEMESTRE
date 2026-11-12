const express = require("express");
const mongoose = require("mongoose");
const auth = require("./controllers/authController");
const reports = require("./controllers/reportController");
const { requireAuth, isAdmin } = require("./middlewares/auth");
const rateLimit = require("./middlewares/rateLimit");
const Report = require("./models/Report");

const router = express.Router();

router.get("/health", async (req, res) => res.json({ ok: mongoose.connection.readyState === 1, count: await Report.countDocuments() }));
router.get("/admin/check", (req, res) => (isAdmin(req) ? res.json({ ok: true }) : res.status(401).json({ error: "chave inválida" })));

// usuários
router.post("/auth/register", rateLimit, auth.register);
router.post("/auth/login", rateLimit, auth.login);
router.post("/auth/logout", requireAuth, auth.logout);
router.get("/auth/me", requireAuth, auth.me);

// relatos
router.get("/reports", reports.list);
router.post("/reports", rateLimit, requireAuth, reports.create);
router.patch("/reports/:id", rateLimit, requireAuth, reports.update);
router.delete("/reports/:id", rateLimit, requireAuth, reports.remove);

router.use((req, res) => res.status(404).json({ error: "não encontrado" }));

module.exports = router;
