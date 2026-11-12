const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "nome obrigatório"], trim: true, minlength: [2, "nome: mínimo 2 caracteres"], maxlength: [60, "nome: máximo 60 caracteres"] },
    email: { type: String, required: [true, "e-mail obrigatório"], trim: true, lowercase: true, unique: true, match: [/^\S+@\S+\.\S+$/, "e-mail inválido"] },
    password: { type: String, required: true }, // hash bcrypt, nunca a senha pura
    tokens: [String], // hash (sha256) das sessões ativas
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
