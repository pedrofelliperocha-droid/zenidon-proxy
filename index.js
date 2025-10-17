import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/sheets", async (req, res) => {
  const spreadsheetId = req.query.id;
  const range = req.query.range;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!spreadsheetId || !range) {
    return res.status(400).json({ error: "Parâmetros ausentes: id e range são obrigatórios." });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Erro ao acessar a API do Google Sheets", details: error.message });
  }
});

app.listen(3000, () => console.log("Zenidon Proxy rodando na porta 3000"));
