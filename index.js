import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

function log(label, data) {
  console.log(`\n[${label}]`, JSON.stringify(data, null, 2));
}

app.get("/sheets/fullscan", async (req, res) => {
  try {
    const { id, query, limit } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Parâmetro 'id' ausente" });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chave da API não configurada" });
    }

    const metaURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${apiKey}`;
    const metaRes = await fetch(metaURL);
    const metaData = await metaRes.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    const results = [];
    const searchTerm = query ? query.toLowerCase().trim() : null;

    for (const sheet of metaData.sheets) {
      const title = sheet.properties?.title || "Sem título";
      const range = `${title}!A1:Z1000`;
      const dataURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(
        range
      )}?key=${apiKey}`;

      const dataRes = await fetch(dataURL);
      const dataJson = await dataRes.json();

      if (!dataJson.values) continue;

      // Cabeçalhos
      const headers = dataJson.values[0] || [];

      // Busca paciente
      const matches = dataJson.values.filter((row) =>
        searchTerm ? row.some((cell) => cell?.toLowerCase().includes(searchTerm)) : true
      );

      // Aplica limite de linhas (opcional)
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

    const payload = {
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    };

    res.json(payload);
  } catch (err) {
    console.error("Erro interno:", err);
    res.status(500).json({ error: "Erro interno no servidor", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Zenidon Proxy rodando na porta ${PORT}`);
});

export default app;
