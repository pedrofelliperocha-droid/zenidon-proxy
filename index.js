// ===============================
// 🧩 ZENIDON PROXY – versão revisada (2025-10)
// Proxy seguro para integração GPT ⇄ Google Sheets
// Compatível com planilha “Equipe 048” (USF Denisson Menezes)
// ===============================

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ------------------------------------------------------------
// 🧠 Função auxiliar: normaliza textos (remove acentos, pontuação e espaços extras)
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
// ------------------------------------------------------------

// ✅ Endpoint principal: /sheets/fullscan
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

    // Loop por todas as abas da planilha
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

        // ------------------------------------------------------------
        // 🧩 Identificação das colunas relevantes
        const colCpf = colunas.findIndex((h) => h.includes("cpf") || h.includes("cns"));

        // Identifica TODAS as possíveis colunas que contêm nomes
        const nomeColunas = colunas
          .map((h, i) => ({ nome: h, indice: i }))
          .filter(({ nome }) =>
            nome.includes("mulher") ||
            nome.includes("gestante") ||
            nome.includes("puerpera") ||
            nome.includes("hipertenso") ||
            nome.includes("diabetico") ||
            nome.includes("cidadao")
          )
          .map(({ indice }) => indice);
        // ------------------------------------------------------------

        // 🧮 Filtragem direta linha a linha
        const matches = [];

        for (let i = 2; i < linhas.length; i++) {
          const linha = linhas[i];
          const textoCompleto = linha.join(" ");
          const cpf = linha[colCpf] || "";

          // Concatena todos os campos possíveis de nome
          const nomesPossiveis = nomeColunas.map((idx) => linha[idx] || "").join(" ");

          if (
            normalize(cpf).includes(busca) ||
            normalize(nomesPossiveis).includes(busca) ||
            normalize(textoCompleto).includes(busca)
          ) {
            matches.push(linha);
          }

          // Proteção contra volume excessivo
          if (matches.length >= 30) break;
        }

        // ------------------------------------------------------------
        // 📊 Adiciona resultados ao objeto final
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
          colNomeIndices: nomeColunas.map((i) => headers[i] || "não encontrada"),
        });
        // ------------------------------------------------------------

      } catch (innerError) {
        resultado.debug.push({ title, erro: innerError.message });
      }
    }

    // Retorna o resultado consolidado
    res.json(resultado);

  } catch (error) {
    res.status(500).json({
      error: "Erro interno ao processar a planilha.",
      message: error.message,
    });
  }
});

// ------------------------------------------------------------
// 🚀 Inicialização do servidor
app.listen(PORT, () => {
  console.log(`Zenidon Proxy ativo na porta ${PORT}`);
});
