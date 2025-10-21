// ===============================
// 🧩 ZENIDON PROXY – versão 2025-10-R7
// Proxy seguro para integração GPT ⇄ Google Sheets
// Compatível com busca híbrida (CPF + Nome)
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

// Extrai apenas dígitos
function soDigitos(s = "") {
  return String(s).replace(/[^0-9]/g, "");
}
// ------------------------------------------------------------

// ✅ Endpoint principal
app.get("/sheets/fullscan", async (req, res) => {
  // Suporte híbrido (CPF + nome)
  const { id, query, query_cpf, query_nome } = req.query;

  if (!id || (!query && !query_cpf && !query_nome)) {
    return res.status(400).json({ error: "Parâmetros ausentes: id e query são obrigatórios." });
  }

  const API_KEY = process.env.GOOGLE_API_KEY;
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;

  // Define buscas principal e secundária
  const buscaPrimaria = normalize(query_cpf || query || "");
  const buscaSecundaria = normalize(query_nome || "");
  const buscaPrimariaDigits = soDigitos(buscaPrimaria);

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
        const headers = (linhas[1] || []).filter((h) => h && String(h).trim() !== "");
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
            nome.includes("cidadao") ||
            nome.includes("criança") ||
            nome.includes("idoso")
          )
          .map(({ indice }) => indice);
        // ------------------------------------------------------------

        const matches = [];

        // 🧮 Primeira fase: busca por CPF/CNS
        if (buscaPrimaria) {
          for (let i = 2; i < linhas.length; i++) {
            const linha = (linhas[i] || []).map((v) =>
              v === null || v === undefined ? "" : String(v)
            );
            if (!linha || linha.filter((x) => x && String(x).trim() !== "").length === 0) continue;

            const textoCompleto = linha.join(" ");
            const cpfRaw = linha[colCpf] || "";
            const nomesPossiveis = nomeColunas.map((idx) => linha[idx] || "").join(" ");

            const textoNorm = normalize(textoCompleto);
            const cpfNorm = normalize(cpfRaw);
            const cpfDigits = soDigitos(cpfNorm);

            const hitCpf =
              buscaPrimariaDigits &&
              cpfDigits &&
              (
                cpfDigits.includes(buscaPrimariaDigits) ||
                buscaPrimariaDigits.includes(cpfDigits) ||
                // tolera zeros à esquerda ausentes
                cpfDigits.replace(/^0+/, "").includes(buscaPrimariaDigits.replace(/^0+/, "")) ||
                buscaPrimariaDigits.replace(/^0+/, "").includes(cpfDigits.replace(/^0+/, "")) ||
                textoNorm.includes(buscaPrimariaDigits)
              );

            if (hitCpf) {
              matches.push(linha);
              if (matches.length >= 30) break;
            }
          }
        }

        // 🧮 Segunda fase: fallback por nome (se nenhum match anterior)
        if (matches.length === 0 && buscaSecundaria) {
          for (let i = 2; i < linhas.length; i++) {
            const linha = (linhas[i] || []).map((v) =>
              v === null || v === undefined ? "" : String(v)
            );
            if (!linha || linha.filter((x) => x && String(x).trim() !== "").length === 0) continue;

            const textoCompleto = linha.join(" ");
            const nomesPossiveis = nomeColunas.map((idx) => linha[idx] || "").join(" ");

            const nomesNorm = normalize(nomesPossiveis);
            const textoNorm = normalize(textoCompleto);

            if (nomesNorm.includes(buscaSecundaria) || textoNorm.includes(buscaSecundaria)) {
              matches.push(linha);
              if (matches.length >= 30) break;
            }
          }
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
          colNomeIndices: nomeColunas.map((i) => headers[i] || "não encontrada"),
          buscaPrimaria,
          buscaSecundaria,
        });

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
// 🚀 Inicialização
app.listen(PORT, () => {
  console.log(`Zenidon Proxy ativo na porta ${PORT}`);
});
