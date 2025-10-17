import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Função auxiliar para logar no console (debug remoto)
function log(label, data) {
  console.log(`\n[${label}]`, JSON.stringify(data, null, 2));
}

// Endpoint principal: leitura de todas as abas
app.get("/sheets/fullscan", async (req, res) => {
  try {
    const sheetId = req.query.id;
    if (!sheetId) {
      return res.status(400).json({ error: "Parâmetro 'id' ausente" });
    }

    log("Requisição recebida", { sheetId });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chave da API não configurada" });
    }

    // 1️⃣ Pega lista de abas
    const metaURL = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${apiKey}`;
    const metaRes = await fetch(metaURL);
    const metaData = await metaRes.json();

    log("Resposta METADATA", metaData);

    if (!metaData.sheets) {
      return res.status(404).json({
        error: "Planilha não encontrada ou sem abas acessíveis.",
        details: metaData,
      });
    }

    // 2️⃣ Para cada aba, busca os dados
    const results = [];
    for (const sheet of metaData.sheets) {
      const title = sheet.properties?.title || "Sem título";
      const range = `${title}!A1:Z1000`;
      const dataURL = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
        range
      )}?key=${apiKey}`;

      const dataRes = await fetch(dataURL);
      const dataJson = await dataRes.json();

      results.push({
        title,
        rows: dataJson.values ? dataJson.values.length : 0,
        values: dataJson.values || [],
      });
    }

    // 3️⃣ Retorna tudo consolidado
    const payload = {
      spreadsheetId: sheetId,
      totalSheets: results.length,
      sheets: results,
    };

    log("RESULTADO FINAL", payload);
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
