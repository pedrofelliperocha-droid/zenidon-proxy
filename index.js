import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ROWS = 5000;

// ------------------------------
// Funções auxiliares
// ------------------------------
function normalizeText(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

// ------------------------------
// Endpoint principal: /sheets/fullscan
// ------------------------------
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query, debug } = req.query;
  if (!id || !query) {
    return res.status(400).json({ error: "Parâmetros 'id' e 'query' são obrigatórios." });
  }

  try {
    // 1️⃣ Buscar metadados da planilha (abas)
    const metaRes = await fetch(`${SHEETS_BASE_URL}/${id}?key=${GOOGLE_API_KEY}`, {
      headers: { Accept: "application/json" },
    });
    const metaData = await metaRes.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    // 2️⃣ Preparar query
    const numericQuery = onlyDigits(query);
    const isNumeric = /^\d{6,}$/.test(numericQuery);
    const textQuery = normalizeText(query);

    const results = [];
    const debugInfo = [];

    // 3️⃣ Percorrer todas as abas
    for (const sheet of metaData.sheets) {
      const title = sheet.properties.title;
      const range = `${encodeURIComponent(title)}!A1:Z${MAX_ROWS}`;

      const dataRes = await fetch(
        `${SHEETS_BASE_URL}/${id}/values/${range}?key=${GOOGLE_API_KEY}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
        { headers: { Accept: "application/json" } }
      );
      const dataJson = await dataRes.json();
      if (!dataJson.values) continue;

      const headers = dataJson.values[0];
      const rows = dataJson.values.slice(1);

      // 4️⃣ Filtro principal
      const matches = rows.filter((row) =>
        row.some((cell) => {
          const cellRaw = cell ?? "";

          if (isNumeric) {
            const digits = onlyDigits(cellRaw);
            if (!digits || digits.length < 6) return false;
            if (!numericQuery || numericQuery.length < 6) return false;

            return (
              digits === numericQuery ||
              digits.endsWith(numericQuery) ||
              numericQuery.endsWith(digits)
            );
          } else {
            return normalizeText(cellRaw).includes(textQuery);
          }
        })
      );

      if (matches.length > 0) {
        results.push({ title, rows: rows.length, headers, matches });
      }

      // info de debug
      if (debug) {
        debugInfo.push({
          title,
          linhasLidas: rows.length,
          correspondencias: matches.length,
        });
      }
    }

    // 5️⃣ Montar resposta final
    const payload = {
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    };

    // 6️⃣ Se debug=1 → mostra apenas estatísticas
    if (debug == 1) payload.debug = debugInfo;

    // 7️⃣ Se debug=2 → inclui prévia de dados reais da planilha
    if (debug == 2) {
      const sampleSheet = metaData.sheets[0]?.properties?.title;
      if (sampleSheet) {
        const sampleRange = `${encodeURIComponent(sampleSheet)}!A1:Z5`;
        const sampleRes = await fetch(
          `${SHEETS_BASE_URL}/${id}/values/${sampleRange}?key=${GOOGLE_API_KEY}`,
          { headers: { Accept: "application/json" } }
        );
        const sampleJson = await sampleRes.json();
        payload.debug = debugInfo;
        payload.samplePreview = {
          sheet: sampleSheet,
          linhas: sampleJson.values || [],
        };
      }
    }

    res.json(payload);
  } catch (err) {
    console.error("❌ Erro no fullscan:", err);
    res.status(500).json({ error: "Erro interno no Zenidon Proxy", details: err.message });
  }
});

// ------------------------------
// Endpoint raiz
// ------------------------------
app.get("/", (req, res) => {
  res.send("✅ Zenidon Proxy v3.6-debug-inspect rodando e pronto para diagnóstico");
});

// ------------------------------
// Inicialização do servidor
// ------------------------------
app.listen(PORT, () => console.log("🚀 Zenidon Proxy v3.6-debug-inspect rodando na porta", PORT));