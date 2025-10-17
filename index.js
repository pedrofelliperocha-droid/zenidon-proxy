import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Zenidon Proxy v2.1
 * Versão aprimorada com:
 * - Busca universal (ignora acentuação, pontuação, espaços e caracteres invisíveis)
 * - Faixa expandida (até linha 3000)
 * - Log silencioso no console indicando abas com correspondência
 */

app.get("/sheets/fullscan", async (req, res) => {
  try {
    const { id, query, limit } = req.query;

    if (!id) return res.status(400).json({ error: "Parâmetro 'id' ausente." });
    if (!query) return res.status(400).json({ error: "Parâmetro 'query' ausente (nome, CPF ou CNS)." });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Chave da API não configurada no ambiente." });

    // Obter metadados da planilha (abas)
    const metaURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${apiKey}`;
    const metaRes = await fetch(metaURL);
    const metaData = await metaRes.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    // 🔍 Normaliza o termo de busca (remove tudo que possa atrapalhar)
    const normalize = (str) =>
      String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .replace(/[.\-\s\u200B]/g, ""); // remove pontuação e invisíveis

    const searchTerm = normalize(query);
    const results = [];

    for (const sheet of metaData.sheets) {
      const title = sheet.properties?.title || "Sem título";
      const range = `${title}!A1:Z3000`;

      const dataURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
        range
      )}?key=${apiKey}`;
      const dataRes = await fetch(dataURL);
      const dataJson = await dataRes.json();

      if (!dataJson.values) continue;

      const headers = dataJson.values[0] || [];

      // 🔎 Busca inteligente e tolerante a formatação
      const matches = dataJson.values.filter((row) =>
        row.some((cell) => normalize(cell).includes(searchTerm))
      );

      const limited = limit ? matches.slice(0, Number(limit)) : matches;

      if (limited.length > 0) {
        console.log(`✅ Encontrado em: ${title} (${limited.length} resultados)`);
        results.push({
          title,
          rows: limited.length,
          headers,
          matches: limited,
        });
      } else {
        console.log(`ℹ️ Nenhum resultado em: ${title}`);
      }
    }

    res.json({
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    });
  } catch (err) {
    console.error("❌ Erro interno:", err);
    res.status(500).json({
      error: "Erro interno no servidor.",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Zenidon Proxy v2.1 ativo na porta ${PORT}`);
});

export default app;
