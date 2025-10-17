import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Zenidon Proxy – API segura para leitura filtrada da planilha Equipe 048.
 * Lê todas as abas do Google Sheets e retorna apenas as linhas correspondentes
 * ao nome, CPF ou CNS informado via parâmetro `query`.
 */

app.get("/sheets/fullscan", async (req, res) => {
  try {
    const { id, query, limit } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Parâmetro 'id' ausente." });
    }
    if (!query) {
      return res.status(400).json({ error: "Parâmetro 'query' ausente (nome, CPF ou CNS)." });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chave da API não configurada no ambiente." });
    }

    // Obter metadados da planilha (nomes das abas)
    const metaURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${apiKey}`;
    const metaRes = await fetch(metaURL);
    const metaData = await metaRes.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    const searchTerm = query.toLowerCase().trim();
    const results = [];

    // Percorre todas as abas e busca correspondências
    for (const sheet of metaData.sheets) {
      const title = sheet.properties?.title || "Sem título";
      const range = `${title}!A1:Z1000`;
      const dataURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
        range
      )}?key=${apiKey}`;

      const dataRes = await fetch(dataURL);
      const dataJson = await dataRes.json();

      if (!dataJson.values) continue;

      const headers = dataJson.values[0] || [];
      const matches = dataJson.values.filter((row) =>
        row.some((cell) => cell?.toLowerCase().includes(searchTerm))
      );

      const limited = limit ? matches.slice(0, Number(limit)) : matches;

      if (limited.length > 1) {
        results.push({
          title,
          rows: limited.length,
          headers,
          matches: limited,
        });
      }
    }

    // Monta a resposta consolidada
    res.json({
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    });
  } catch (err) {
    res.status(500).json({
      error: "Erro interno no servidor.",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Zenidon Proxy rodando na porta ${PORT}`);
});

export default app;
