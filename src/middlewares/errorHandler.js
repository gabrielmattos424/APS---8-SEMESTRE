// Erros não tratados viram JSON { error } (Express 5 já captura erros de funções async).
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Dados grandes demais" });
  if (err.name === "ValidationError") return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join("; ") });
  console.error(err);
  res.status(500).json({ error: "erro interno" });
}

module.exports = errorHandler;
