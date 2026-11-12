// Limite simples: 40 escritas por minuto por IP.
const hits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || "?";
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k);
  if (arr.length > 40) return res.status(429).json({ error: "Muitas ações. Tente novamente em instantes." });
  next();
}

module.exports = rateLimit;
