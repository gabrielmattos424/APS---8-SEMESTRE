const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const { sha } = require("../middlewares/auth");

const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email });

// cria uma sessão nova e devolve o token (no banco fica só o hash)
async function startSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  user.tokens = [...user.tokens.slice(-9), sha(token)]; // até 10 aparelhos logados
  await user.save();
  return token;
}

// POST /api/auth/register  { name, email, password }
async function register(req, res) {
  const { name, email, password } = req.body || {};
  if (typeof password !== "string" || password.length < 6) return res.status(400).json({ error: "senha: mínimo 6 caracteres" });
  if (typeof email !== "string") return res.status(400).json({ error: "e-mail inválido" });
  if (await User.findOne({ email: email.trim().toLowerCase() })) return res.status(409).json({ error: "E-mail já cadastrado." });

  const user = new User({ name, email, password: await bcrypt.hash(password, 10) });
  const token = await startSession(user); // save() valida nome/e-mail
  res.status(201).json({ token, user: publicUser(user) });
}

// POST /api/auth/login  { email, password }
async function login(req, res) {
  const { email, password } = req.body || {};
  const user = typeof email === "string" ? await User.findOne({ email: email.trim().toLowerCase() }) : null;
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.password));
  if (!ok) return res.status(401).json({ error: "E-mail ou senha incorretos." });

  const token = await startSession(user);
  res.json({ token, user: publicUser(user) });
}

// POST /api/auth/logout
async function logout(req, res) {
  req.user.tokens = req.user.tokens.filter((t) => t !== sha(req.token));
  await req.user.save();
  res.json({ ok: true });
}

// GET /api/auth/me
function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

module.exports = { register, login, logout, me };
