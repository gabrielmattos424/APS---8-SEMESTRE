const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const User = require("../models/User");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// ---------- usuário logado (cabeçalho "Authorization: Bearer <token>") ----------
async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Faça login para continuar." });
  const user = await User.findOne({ tokens: sha(token) });
  if (!user) return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  req.user = user;
  req.token = token;
  next();
}

// ---------- moderador (cabeçalho X-Admin-Key) ----------
// Chave vem de ADMIN_KEY (opcional) ou é gerada e guardada em data/admin.key.
const ADMIN_FILE = path.join(__dirname, "..", "..", "data", "admin.key");
let ADMIN_KEY = process.env.ADMIN_KEY || "";
if (!ADMIN_KEY) {
  try { ADMIN_KEY = fs.readFileSync(ADMIN_FILE, "utf8").trim(); } catch {}
  if (!ADMIN_KEY) {
    ADMIN_KEY = crypto.randomBytes(9).toString("base64url");
    fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true });
    fs.writeFileSync(ADMIN_FILE, ADMIN_KEY);
  }
}

function isAdmin(req) {
  const k = req.headers["x-admin-key"];
  return typeof k === "string" && k.length > 0 && crypto.timingSafeEqual(Buffer.from(sha(k)), Buffer.from(sha(ADMIN_KEY)));
}

module.exports = { requireAuth, isAdmin, sha, ADMIN_KEY, ADMIN_FILE };
