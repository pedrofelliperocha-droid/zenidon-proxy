import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// 🧩 Utilitário: normaliza texto e remove pontuação
function normalize(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\D/g, ""); // remove tudo que não é número
}

// 🔍 Endpoint de varredura completa
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query } = req.query;

  if (!id || !query) {
    return res.status(400).json({ error: "Parâmetros 'id' e 'query' são obrigatórios." });
  }

  try {
    // 1️⃣ Pega todas as abas
    const tabsResponse = await fetch(`${SHEETS_BASE_URL}/${id}?key=${GOOGLE_API_KEY}`);
    const tabsData = await tabsResponse.json();

    if (!tabsData.sheets || !Array.isArray(tabsData.sheets)) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    const results = [];
    const queryNorm = normalize(query);

    // 2️⃣ Percorre todas as abas
    for (const sheet of tabsData.sheets) {
      const title = sheet.properties.title;
      const range = `${encodeURIComponent(title)}!A1:Z1000`;

      try {
        const dataResponse = await fetch(
          `${SHEETS_BASE_URL}/${id}/values/${range}?key=${GOOGLE_API_KEY}`
        );
        const dataJson = await dataResponse.json();

        if (!dataJson.values || dataJson.values.length === 0) continue;

        const headers = dataJson.values[0];
        const rows = dataJson.values.slice(1);

        // 3️⃣ Busca inteligente
        const matches = rows.filter((row) =>
          row.some((cell) => normalize(cell).includes(queryNorm))
        );

        if (matches.length > 0) {
          results.push({
            title,
            rows: rows.length,
            headers,
            matches,
          });
        }
      } catch (err) {
        console.error(`Erro ao ler aba ${sheet.properties.title}:`, err.message);
      }
    }

    // 4️⃣ Retorno final
    res.json({
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    });
  } catch (error) {
    console.error("Erro geral no fullscan:", error);
    res.status(500).json({ error: "Erro interno no servidor", details: error.message });
  }
});

// 🧭 Rota raiz de verificação
app.get("/", (req, res) => {
  res.send("✅ Zenidon Proxy v3.2 ativo e conectado ao Google Sheets");
});

app.listen(PORT, () => {
  console.log(`✅ Zenidon Proxy v3.2 rodando na porta ${PORT}`);
});
