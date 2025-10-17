// Zenidon Proxy – Fullscan (versão completa)
// Executa leitura dinâmica de TODAS as abas da planilha Equipe 048

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Usa a variável segura da Vercel (criada em Settings → Environment Variables)
const API_KEY = process.env.API_KEY;

// ✅ Rota principal: varredura de todas as abas
app.get("/sheets/fullscan", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Parâmetro 'id' é obrigatório." });
    }

    // 1️⃣ Obter lista de abas
    const urlTabs = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${API_KEY}`;
    const tabsRes = await fetch(urlTabs);
    const tabsData = await tabsRes.json();

    if (!tabsData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    // 2️⃣ Ler cada aba
    const results = [];
    for (const sheet of tabsData.sheets) {
      const title = sheet.properties.title;
      const encodedTitle = encodeURIComponent(`${title}!A1:Z1000`);
      const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodedTitle}?key=${API_KEY}`;

      const dataRes = await fetch(sheetUrl);
      const data = await dataRes.json();

      results.push({
        title,
        values: data.values || [],
      });
    }

    // 3️⃣ Retornar tudo
    res.json({
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    });
  } catch (error) {
    console.error("Erro geral:", error);
    res.status(500).json({ error: "Erro interno ao processar a planilha." });
  }
});

// Rota de teste
app.get("/", (req, res) => {
  res.send("✅ Zenidon Proxy ativo e pronto para uso.");
});

app.listen(PORT, () => {
  console.log(`Zenidon Proxy rodando na porta ${PORT}`);
});
