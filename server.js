// AlagaViz — servidor Express + MongoDB (Mongoose).
// Serve o PWA (pasta public/) e a API em /api.
require("dotenv").config();
const path = require("node:path");
const express = require("express");
const connectDB = require("./src/config/db");
const routes = require("./src/routes");
const errorHandler = require("./src/middlewares/errorHandler");
const { ADMIN_KEY, ADMIN_FILE } = require("./src/middlewares/auth");

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json({ limit: "20kb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, routes);

// arquivos do app (HTML e service worker sem cache, para receber atualizações)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, file) {
    const noCache = file.endsWith(".html") || file.endsWith("sw.js");
    res.set("Cache-Control", noCache ? "no-cache" : "public, max-age=300");
    res.set("X-Content-Type-Options", "nosniff");
  },
}));

app.use(errorHandler);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AlagaViz em http://localhost:${PORT}`);
      console.log(`Chave de moderador: ${ADMIN_KEY}   (use em "Sou moderador" no app; também em ${ADMIN_FILE})`);
    });
  })
  .catch((err) => {
    console.error("Não foi possível conectar ao MongoDB:", err.message);
    process.exit(1);
  });
