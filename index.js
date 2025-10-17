import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ROWS = 1000;

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

app.get("/sheets/fullscan", async (req, res) => {
  const { id, query, debug } = req.query;
  if (!id || !query)
    return res.status(400).json({ error: "Parâmetros 'id' e 'query' são obrigatórios." });

  try {
    const metaRes = await fetch(`${SHEETS_BASE_URL}/${id}?key=${GOOGLE_API_KEY}`);
    const metaData = await metaRes.json();
    if (!metaData.sheets)
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });

    const numericQuery = onlyDigits(query);
    const isNumeric = /^\d{6,}$/.test(numericQuery);
    const textQuery = normalizeText(query);

    const results = [];
    const debugInfo = [];
    const sampleValues = [];

    for (const sheet of metaData.sheets) {
      const title = sheet.properties.title;
      const range = `${encodeURIComponent(title)}!A1:Z${MAX_ROWS}`;

      const dataRes = await fetch(
        `${SHEETS_BASE_URL}/${id}/values/${range}?key=${GOOGLE_API_KEY}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`
      );
      const dataJson = await dataRes.json();
      if (!dataJson.values) continue;

      let headers = dataJson.values[0] || [];
      let rows = dataJson.values.slice(1);
      if (headers.length === 1 && dataJson.values.length > 1) {
        headers = dataJson.values[1];
        rows = dataJson.values.slice(2);
      }

      const headerMap = headers.map((h, i) => ({
        index: i,
        name: normalizeText(h),
      }));

      const colCpf = headerMap.find((h) => /CPF|CNS|DOCUMENTO/.test(h.name));
      const colNome = headerMap.find((h) =>
        /NOME|MULHER|IDOSO|PUERPERA|GESTANTE|CIDAD|DIABET|HIPERT/.test(h.name)
      );

      // 🧪 CAPTURAR AMOSTRA DE VALORES CRUS DO CPF/CNS
      if (colCpf && rows.length > 0) {
        const amostra = rows.slice(0, 5).map((r) => r[colCpf.index]);
        sampleValues.push({ title, col: colCpf.name, sample: amostra });
      }

      // --- busca normal (mesmo da v4.1)
      const matches = rows.filter((row) => {
        return row.some((cell, idx) => {
          const raw = String(cell ?? "").trim();
          const digits = onlyDigits(raw);
          if (!digits) return false;

          if (isNumeric) {
            if (numericQuery.length >= 11 && digits.endsWith(numericQuery.slice(-11))) return true;
            if (numericQuery.length >= 15 && digits.endsWith(numericQuery.slice(-15))) return true;
          }
          return normalizeText(raw).includes(textQuery);
        });
      });

      if (matches.length > 0) {
        const indicators = matches.map((row) => {
          const pairs = {};
          headers.forEach((h, i) => {
            if (!h) return;
            pairs[h] = row[i] ?? "";
          });
          return pairs;
        });
        results.push({ title, indicators });
      }

      if (debug)
        debugInfo.push({
          title,
          linhasLidas: rows.length,
          correspondencias: matches.length,
          colCpf: colCpf ? colCpf.name : null,
          colNome: colNome ? colNome.name : null,
        });
    }

    const payload = {
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
      debug: debugInfo,
      samples: sampleValues,
    };

    res.json(payload);
  } catch (err) {
    console.error("❌ Erro:", err);
    res.status(500).json({ error: "Erro interno", details: err.message });
  }
});

app.get("/", (req, res) =>
  res.send("✅ Zenidon Proxy v4.2-debug — inspeção de valores brutos CPF/CNS")
);

app.listen(PORT, () =>
  console.log("🚀 Zenidon Proxy v4.2-debug rodando na porta", PORT)
);