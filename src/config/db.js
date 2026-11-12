const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Defina MONGODB_URI no arquivo .env");
  await mongoose.connect(uri);
  console.log("MongoDB conectado");
}

module.exports = connectDB;
