import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// sua API key — já está guardada na Vercel como variável de ambiente
const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error("❌ ERRO: Nenhuma GOOGLE_API_KEY encontrada no ambiente da Vercel.");
}

// rota para listar abas
app.get("/sheets/tabs", async (req, res) => {
  const id = req.query.id;

  console.log("🧭 [tabs] Recebido pedido para listar abas da planilha:", id);

  if (!id) {
    return res.status(400).json({ error: "ID da planilha não fornecido." });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log("🔍 [tabs] Resposta do Google:", data);

    if (data.error) {
      return res.status(data.error.code || 500).json(data);
    }

    const sheetNames = data.sheets?.map((s) => s.properties.title) || [];

    res.json({
      spreadsheetId: id,
      totalSheets: sheetNames.length,
      sheets: sheetNames,
