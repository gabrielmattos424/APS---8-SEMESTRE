const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true }, // UUID gerado no aparelho (evita duplicar no reenvio offline)
    title: { type: String, required: [true, "título obrigatório"], trim: true, minlength: [3, "título: de 3 a 80 caracteres"], maxlength: [80, "título: de 3 a 80 caracteres"] },
    description: { type: String, trim: true, default: "", maxlength: [500, "descrição: máximo 500 caracteres"] },
    neighborhood: { type: String, trim: true, default: "", maxlength: [60, "bairro: máximo 60 caracteres"] },
    address: { type: String, trim: true, default: "", maxlength: [120, "endereço: máximo 120 caracteres"] },
    latitude: { type: Number, required: [true, "latitude inválida (-90 a 90)"], min: [-90, "latitude inválida (-90 a 90)"], max: [90, "latitude inválida (-90 a 90)"] },
    longitude: { type: Number, required: [true, "longitude inválida (-180 a 180)"], min: [-180, "longitude inválida (-180 a 180)"], max: [180, "longitude inválida (-180 a 180)"] },
    severity: { type: String, enum: { values: ["low", "moderate", "high", "critical"], message: "gravidade inválida" }, required: [true, "gravidade inválida"] },
    status: { type: String, enum: { values: ["reported", "monitoring", "resolved"], message: "situação inválida" }, default: "reported" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // autor
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
