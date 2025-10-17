import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ROWS = 1000;

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
// Endpoint principal
// ------------------------------
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query, debug } = req.query;
  if (!id || !query) {
    return res
      .status(400)
      .json({ error: "Parâmetros 'id' e 'query' são obrigatórios." });
  }

  try {
    const metaRes = await fetch(`${SHEETS_BASE_URL}/${id}?key=${GOOGLE_API_KEY}`, {
      headers: { Accept: "application/json" },
    });
    const metaData = await metaRes.json();

    if (!metaData.sheets) {
      return res
        .status(404)
        .json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    const numericQuery = onlyDigits(query);
    const isNumeric = /^\d{6,}$/.test(numericQuery);
    const textQuery = normalizeText(query);

    const results = [];
    const debugInfo = [];
    const traceInfo = [];

    // ------------------------------
    // Varredura de todas as abas
    // ------------------------------
    for (const sheet of metaData.sheets) {
      const title = sheet.properties.title;
      const range = `${encodeURIComponent(title)}!A1:Z${MAX_ROWS}`;

      const dataRes = await fetch(
        `${SHEETS_BASE_URL}/${id}/values/${range}?key=${GOOGLE_API_KEY}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
        { headers: { Accept: "application/json" } }
      );
      const dataJson = await dataRes.json();
      if (!dataJson.values) continue;

      const headers = dataJson.values[0] || [];
      const rows = dataJson.values.slice(1);

      // --- NOVO: capturar cabeçalho cru para inspeção
      if (debug == 3) {
        traceInfo.push({
          title,
          header: headers,
        });
      }

      // --- Busca de correspondência
      const matches = rows.filter((row) =>
        row.some((cell) => {
          const cellRaw = String(cell ?? "").trim();

          if (isNumeric) {
            const digits = onlyDigits(cellRaw);
            if (!digits || digits.length < 6) return false;
            return digits === numericQuery;
          } else {
            return normalizeText(cellRaw).includes(textQuery);
          }
        })
      );

      if (matches.length > 0) {
        results.push({ title, matches });
      }

      if (debug) {
        debugInfo.push({
          title,
          linhasLidas: rows.length,
          correspondencias: matches.length,
        });
      }
    }

    // ------------------------------
    // Resposta final
    // ------------------------------
    const payload = {
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    };

    if (debug) payload.debug = debugInfo;
    if (debug == 3) payload.trace = traceInfo;

    res.json(payload);
  } catch (err) {
    console.error("❌ Erro:", err);
    res.status(500).json({ error: "Erro interno", details: err.message });
  }
});

// ------------------------------
// Endpoint raiz
// ------------------------------
app.get("/", (req, res) => {
  res.send(
    "✅ Zenidon Proxy v3.9b-header-scan ativo — pronto para capturar cabeçalhos de todas as abas"
  );
});

app.listen(PORT, () =>
  console.log("🚀 Zenidon Proxy v3.9b-header-scan rodando na porta", PORT)
);