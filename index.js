import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// ✅ Rota 1 — Ler dados de uma aba específica
app.get("/sheets", async (req, res) => {
  const { id, range } = req.query;

  if (!id || !range) {
    return res.status(400).json({ error: "Parâmetros 'id' e 'range' são obrigatórios." });
  }

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
        range
      )}?key=${process.env.GOOGLE_API_KEY}`
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Erro ao acessar o Google Sheets:", text);
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Erro interno ao acessar o Google Sheets:", error);
    res.status(500).json({ error: "Erro interno ao acessar a planilha." });
  }
});

// ✅ Rota 2 — Listar todas as abas (competências)
app.get("/sheets/tabs", async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Parâmetro "id" é obrigatório.' });
  }

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${process.env.GOOGLE_API_KEY}`
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Erro ao listar abas:", text);
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Erro interno ao listar abas:", error);
    res.status(500).json({ error: "Erro interno ao listar abas." });
  }
});

// ✅ Servidor
app.listen(3000, () => {
  console.log("Zenidon Proxy rodando na porta 3000");
});
