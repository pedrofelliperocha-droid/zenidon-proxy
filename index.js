// ===============================
// 🧩 ZENIDON PROXY – versão 2025-10-R9
// Proxy seguro para integração GPT ⇄ Google Sheets
// ✅ Compatível com: CPFs truncados, zeros ausentes, tipos mistos, abas curtas
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\dA-Za-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Extrai apenas dígitos
function soDigitos(s = "") {
  return String(s).replace(/[^0-9]/g, "");
}

// Reconstrói zeros à esquerda e identifica truncamentos
function ajustarCpf(raw = "") {
  const digits = soDigitos(raw);
  if (!digits) return { cpf: "", truncado: false };
  if (digits.length === 11) return { cpf: digits, truncado: false };
  if (digits.length < 11 && digits.length >= 8) {
    const corrigido = digits.padStart(11, "0");
    return { cpf: corrigido, truncado: true };
  }
  return { cpf: digits, truncado: false };
}
// ------------------------------------------------------------

// ✅ Endpoint principal
app.get("/sheets/fullscan", async (req, res) => {
  const { id, query, query_cpf, query_nome } = req.query;

  if (!id || (!query && !query_cpf && !query_nome)) {
    return res
      .status(400)
      .json({ error: "Parâmetros ausentes: id e query são obrigatórios." });
  }

  const API_KEY = process.env.GOOGLE_API_KEY;
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;

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
      return res
        .status(404)
        .json({ error: "Planilha não encontrada ou sem abas acessíveis." });
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
        const headers = (linhas[1] || []).filter(
          (h) => h && String(h).trim() !== ""
        );
        const colunas = headers.map((h) => normalize(h));

        const colCpf = colunas.findIndex(
          (h) => h.includes("cpf") || h.includes("cns")
        );

        const nomeColunas = colunas
          .map((h, i) => ({ nome: h, indice: i }))
          .filter(({ nome }) =>
            nome.includes("mulher") ||
            nome.includes("gestante") ||
            nome.includes("puerpera") ||
            nome.includes("hipertenso") ||
            nome.includes("diabetico") ||
            nome.includes("cidadao") ||
            nome.includes("crianca") ||
            nome.includes("idoso")
          )
          .map(({ indice }) => indice);

        const matches = [];
        let truncamentos = 0;

        // ------------------------------------------------------------
        // 🧮 1ª fase — Busca por CPF/CNS (tolerante)
        if (buscaPrimariaDigits) {
          for (let i = 2; i < linhas.length; i++) {
            const linha = (linhas[i] || []).map((v) =>
              v === null || v === undefined ? "" : String(v)
            );
            if (!linha.join("").trim()) continue;

            const cpfRaw = linha[colCpf] || "";
            const { cpf: cpfCorrigido, truncado } = ajustarCpf(cpfRaw);
            if (truncado) truncamentos++;

            const textoNorm = normalize(linha.join(" "));
            const cpfDigits = cpfCorrigido;

            const hitCpf =
              cpfDigits &&
              (cpfDigits.includes(buscaPrimariaDigits) ||
                buscaPrimariaDigits.includes(cpfDigits) ||
                cpfDigits.replace(/^0+/, "").includes(
                  buscaPrimariaDigits.replace(/^0+/, "")
                ) ||
                buscaPrimariaDigits
                  .replace(/^0+/, "")
                  .includes(cpfDigits.replace(/^0+/, "")) ||
                textoNorm.includes(buscaPrimariaDigits));

            if (hitCpf) {
              matches.push(linha);
              if (matches.length >= 30) break;
            }
          }
        }

        // ------------------------------------------------------------
        // 🧮 2ª fase — Fallback por nome (se nada encontrado)
        if (matches.length === 0 && buscaSecundaria) {
          for (let i = 2; i < linhas.length; i++) {
            const linha = (linhas[i] || []).map((v) =>
              v === null || v === undefined ? "" : String(v)
            );
            if (!linha.join("").trim()) continue;

            const nomesPossiveis = nomeColunas
              .map((idx) => linha[idx] || "")
              .join(" ");
            const nomesNorm = normalize(nomesPossiveis);
            const textoNorm = normalize(linha.join(" "));

            if (
              nomesNorm.includes(buscaSecundaria) ||
              textoNorm.includes(buscaSecundaria)
            ) {
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
          truncamentosDetectados: truncamentos,
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
  console.log(`Zenidon Proxy R9 ativo na porta ${PORT}`);
});
