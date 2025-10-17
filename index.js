import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_API_KEY;

app.get("/sheets/fullscan", async (req, res) => {
  const { id, query } = req.query;
  if (!id) return res.status(400).json({ error: "Missing sheet ID" });

  try {
    // 1️⃣ Pega metadados da planilha (títulos das abas)
    const metaURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${API_KEY}`;
    const metaRes = await fetch(metaURL, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const metaData = await metaRes.json();

    const sheets = metaData.sheets || [];
    if (sheets.length === 0)
      return res.json({ spreadsheetId: id, totalSheets: 0, sheets: [] });

    // 2️⃣ Lê aba por aba, com delay leve pra evitar ResponseTooLarge
    const results = [];
    for (const sheet of sheets) {
      const title = sheet.properties.title;
      const range = `${title}!A1:Z1000`;
      const dataURL = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?key=${API_KEY}&majorDimension=ROWS`;
      const dataRes = await fetch(dataURL, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const dataJson = await dataRes.json();

      if (dataJson.values) {
        const headers = dataJson.values[0];
        const matches = dataJson.values.filter((row) =>
          row.join(" ").includes(query)
        );
        if (matches.length > 0)
          results.push({ title, rows: dataJson.values.length, headers, matches });
      }

      await new Promise((r) => setTimeout(r, 150)); // pequena pausa entre abas
    }

    res.json({
      spreadsheetId: id,
      totalSheets: results.length,
      sheets: results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Zenidon Proxy v3 running on port ${PORT}`));
