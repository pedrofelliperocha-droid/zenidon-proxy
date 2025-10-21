// ===============================
// 🧩 ZENIDON PROXY – versão 2025-10-R4
// Proxy seguro para integração GPT ⇄ Google Sheets
// Compatível com a planilha “Equipe 048” (USF Denisson Menezes)
// ===============================

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ------------------------------------------------------------
// 🧠 Funções auxiliares
function normalize(text = "") {
  if (text === null || text === undefined) return "";
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove acentos
    .replace(/[^\dA-Za-z\s]/g, "")     // remove pontuação
    .replace(/\s+/g, " ")              // remove espaços múltiplos
    .trim()
    .toLowerCase();
}

// Remove tudo que não for número (para comparações de CPF/CNS)
function soDigitos(s = "") {
  return String(s).replace(/[^0-9]/g, "");
}
// ------------------------------------------------------------

// ✅ Endpoint principal
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query } = req.query;

  if (!id || !query) {
    return res.status(400).json({ error: "Parâmetros ausentes: id e query são obrigatórios." });
  }

  const API_KEY = process.env.GOOGLE_API_KEY;
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const busca = normalize(query);
  const buscaDigits = soDigitos(busca);

  const resultado = {
    spreadsheetId: id,
    totalSheets: 0,
    sheets: [],
    debug: [],
  };

  try {
    const metaResponse = await fetch(`${baseUrl}?key=${API_KEY}`);
    const metaData = await metaResponse.json();

    if (!metaData.sheets) {
      return res.status(404).json({ error: "Planilha não encontrada ou sem abas acessíveis." });
    }

    resultado.totalSheets = metaData.sheets.length;

    // Percorre todas as abas
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
        // 🔍 Identificação das colunas relevantes
        const colCpf = colunas.findIndex((h) => h.includes("cpf") || h.includes("cns"));

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

        // 🧮 Filtragem linha a linha
        const matches = [];

        for (let i = 2; i < linhas.length; i++) {
          const linha = linhas[i];
          if (!linha || linha.filter((x) => x && String(x).trim() !== "").length === 0) continue;

          const textoCompleto = linha.join(" ");
          const cpfRaw = linha[colCpf] || "";
          const nomesPossiveis = nomeColunas.map((idx) => linha[idx] || "").join(" ");

          const nomesNorm = normalize(nomesPossiveis);
          const textoNorm = normalize(textoCompleto);
          const cpfNorm = normalize(cpfRaw);
          const cpfDigits = soDigitos(cpfNorm);

          // Regras de acerto:
          // 1) Busca numérica (CPF/CNS) tolerante a zeros à esquerda e formatação variada
          const hitCpf =
            buscaDigits &&
            cpfDigits &&
            (cpfDigits.includes(buscaDigits) ||
             buscaDigits.includes(cpfDigits) ||
             textoNorm.includes(buscaDigits));

          // 2) Busca textual por nome ou fragmento
          const hitNome = !buscaDigits && nomesNorm.includes(busca);
          const hitRow = !buscaDigits && textoNorm.includes(busca);

          if (hitCpf || hitNome || hitRow) {
            matches.push(linha);
            if (matches.length >= 30) break; // proteção de volume
          }
        }

        // ------------------------------------------------------------
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
          buscaDigits,
        });
        // ------------------------------------------------------------

      } catch (innerError) {
        resultado.debug.push({ title, erro: innerError.message });
      }
    }

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
