const Report = require("../models/Report");
const { isAdmin } = require("../middlewares/auth");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ["title", "description", "neighborhood", "address", "latitude", "longitude", "severity"];
const MAX_LIST = 300;

// formato que o front espera
const toPublic = (r) => ({
  id: "r-" + r.clientId,
  clientId: r.clientId,
  title: r.title,
  description: r.description,
  neighborhood: r.neighborhood,
  address: r.address,
  latitude: r.latitude,
  longitude: r.longitude,
  severity: r.severity,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  isDemo: false,
  userId: String(r.user),
});

// só os campos editáveis que vieram no corpo
const pickFields = (b) => Object.fromEntries(FIELDS.filter((k) => k in b).map((k) => [k, b[k]]));

// autor do relato ou moderador
const canManage = (req, report) => isAdmin(req) || report.user.equals(req.user._id);

// "r-<clientId>" -> relato
const findById = (id) => Report.findOne({ clientId: String(id).replace(/^r-/, "").toLowerCase() });

// GET /api/reports  (público)
async function list(req, res) {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(MAX_LIST);
  if (!reports.length) return res.json({ demo: true, reports: [] });
  res.json({ demo: false, reports: reports.map(toPublic) });
}

// POST /api/reports  (logado)
async function create(req, res) {
  const b = req.body || {};
  if (typeof b.clientId !== "string" || !UUID_RE.test(b.clientId)) return res.status(400).json({ error: "clientId: UUID inválido" });
  const clientId = b.clientId.toLowerCase();

  const existing = await Report.findOne({ clientId });
  if (existing) return res.json({ report: toPublic(existing), duplicate: true }); // reenvio da fila offline

  const report = await Report.create({ ...pickFields(b), clientId, user: req.user._id });
  res.status(201).json({ report: toPublic(report) });
}

// PATCH /api/reports/:id  (logado: situação; autor/moderador: demais campos)
async function update(req, res) {
  const report = await findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Relato não encontrado (pode ter sido excluído)." });

  const b = req.body || {};
  const fields = pickFields(b);
  const touchesFields = Object.keys(fields).length > 0;
  if (!touchesFields && !("status" in b)) return res.status(400).json({ error: "nada para atualizar" });
  if (touchesFields && !canManage(req, report)) return res.status(403).json({ error: "Só o autor ou um moderador pode editar este relato." });

  if ("status" in b) report.status = b.status;
  Object.assign(report, fields);
  await report.save(); // o model valida tudo
  res.json({ report: toPublic(report) });
}

// DELETE /api/reports/:id  (autor/moderador)
async function remove(req, res) {
  const report = await findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Relato não encontrado (pode ter sido excluído)." });
  if (!canManage(req, report)) return res.status(403).json({ error: "Só o autor ou um moderador pode excluir." });

  await report.deleteOne();
  res.json({ ok: true });
}

module.exports = { list, create, update, remove };
