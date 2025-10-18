import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Função auxiliar: normaliza textos (remove acentos, pontuação e espaços extras)
function normalize(text = "") {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Endpoint principal: /sheets/fullscan
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query } = req.query;

  if (!id || !query) {
    return res.status(400).json({ error: "Parâmetros ausentes: id e query são obrigatórios." });
  }

  const API_KEY = process.env.GOOGLE_API_KEY;
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const busca = normalize(query);

  const resultado = {
    spreadsheetId: id,
    totalSheets: 0,
    sheets: [],
    debug: [],
  };

  try {
    // Obtém a lista de abas
    const metaResponse = await fetch(`${baseUrl}?key=${API_KEY}`);
    const metaData = await metaResponse.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    resultado.totalSheets = metaData.sheets.length;

    // Loop pelas abas
    for (const sheet of metaData.sheets) {
      const title = sheet.properties.title;
      const range = `${title}!A1:Z1000`;

      try {
        const valuesResponse = await fetch(
          `${baseUrl}/values/${encodeURIComponent(range)}?key=${API_KEY}`
        );
        const valuesData = await valuesResponse.json();

        if (!valuesData.values || valuesData.values.length === 0) {
          resultado.debug.push({ title, linhasLidas: 0, correspondencias: 0 });
          continue;
        }

        const linhas = valuesData.values;
        const headers = linhas[1] || [];
        const colunas = headers.map((h) => normalize(h));

        // Índices de colunas relevantes
        const colCpf = colunas.findIndex((h) => h.includes("cpf") || h.includes("cns"));
        const colNome = colunas.findIndex((h) => h.includes("mulher") || h.includes("cidadao") || h.includes("gestante") || h.includes("hipertenso") || h.includes("diabetico"));

        // Filtragem direta linha a linha
        const matches = [];
        for (let i = 2; i < linhas.length; i++) {
          const linha = linhas[i];
          const textoCompleto = linha.join(" ");
          const cpf = linha[colCpf] || "";
          const nome = linha[colNome] || "";

          if (
            normalize(cpf).includes(busca) ||
            normalize(nome).includes(busca) ||
            normalize(textoCompleto).includes(busca)
          ) {
            matches.push(linha);
          }

          // Parar caso encontre mais de 30 resultados (proteção de volume)
          if (matches.length >= 30) break;
        }

        resultado.sheets.push({
          title,
          rows: linhas.length,
          headers,
          matches,
        });

        resultado.debug.push({
          title,
          linhasLidas: linhas.length,
          correspondencias: matches.length,
          colCpf: headers[colCpf] || "não encontrada",
          colNome: headers[colNome] || "não encontrada",
        });
      } catch (innerError) {
        resultado.debug.push({ title, erro: innerError.message });
      }
    }

    // Retorna apenas o essencial
    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      error: "Erro interno ao processar a planilha.",
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Zenidon Proxy ativo na porta ${PORT}`);
});