// O front matter (o bloco entre `---` no topo de cada .md), lido EXATAMENTE como o build.py lê.
//
// Porte linha a linha de scalar() e parse() do build.py (linhas ~94–119). Não é YAML: é o "YAML mínimo"
// do gerador, que aceita coisas que um YAML de verdade recusaria ou leria diferente, por exemplo:
//   title: Official Artwork: Orcs        → o texto inteiro depois do PRIMEIRO ":" (YAML daria erro)
//   date: 2024-01-02                     → o texto "2024-01-02" (YAML viraria uma data)
//   order: 2                             → o texto "2" (YAML viraria número)
//   summary: "We're lost!", shouted…     → fica com as aspas, porque não terminam com aspas
// Por isso o Astro NÃO usa o leitor de Markdown dele para os arquivos de content/: usa este (D4/D7 —
// o autor continua escrevendo do mesmo jeito). A prova de que é igual ao Python, arquivo por arquivo,
// está em tests/conteudo.test.ts (referência gerada por tools/frontmatter_ref.py).
import { readFileSync } from "node:fs";

/** Um valor do front matter, como o Python o devolve: texto, verdadeiro/falso ou lista (que pode ter listas dentro). */
export type ValorFm = string | boolean | ValorFm[];

/** O front matter de um arquivo: nome do campo → valor. */
export type FrontMatter = Record<string, ValorFm>;

// Os "espaços" do Python (str.strip() e o \s das expressões regulares): os mesmos do JavaScript,
// MAIS \x1c–\x1f e \x85, e SEM o ﻿ (o JavaScript trata o BOM como espaço; o Python, não).
// Conferido carácter por carácter, de 0 a 0x10FFFF, nas duas linguagens.
const ESPACOS_PY = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const RE_PONTAS = new RegExp(`^[${ESPACOS_PY}]+|[${ESPACOS_PY}]+$`, "g");
const RE_INICIO = new RegExp(`^[${ESPACOS_PY}]+`);
/** `re.match(r"\s+-(\s|$)", line)` do parse(): linha recuada que começa com "-" (item de lista). */
const RE_ITEM = new RegExp(`^[${ESPACOS_PY}]+-([${ESPACOS_PY}]|$)`);
/** `re.match(r"---\n(.*?)\n---\n?(.*)\Z", raw, re.S)`: em JavaScript, `$` sem a flag "m" já é só o fim do texto. */
const RE_BLOCO = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** str.strip() do Python. */
export function pyStrip(s: string): string {
  return s.replace(RE_PONTAS, "");
}

/** str.lstrip() do Python. */
function pyLstrip(s: string): string {
  return s.replace(RE_INICIO, "");
}

/** scalar(v) do build.py: "[a, b]" → lista; "entre aspas" → sem as aspas; true/false → booleano; o resto, texto. */
export function scalar(v: string): ValorFm {
  v = pyStrip(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .filter((x) => pyStrip(x) !== "")
      .map((x) => pyStrip(x).replace(/^["']+|["']+$/g, "")); // x.strip().strip("\"'")
  }
  if (v.length > 1 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    return v.slice(1, -1);
  }
  const minusculo = v.toLowerCase();
  if (minusculo === "true") return true;
  if (minusculo === "false") return false;
  return v;
}

/**
 * parse() do build.py, a partir do texto do arquivo já decodificado (ver `decodificar`).
 * Devolve o front matter e o corpo (o Markdown cru, sem o bloco `---`).
 */
export function parse(texto: string): { fm: FrontMatter; body: string } {
  // Path.read_text() abre em "modo texto": \r\n e \r sozinho viram \n. Depois o parse() ainda troca \r\n.
  const raw = texto.replace(/\r\n?/g, "\n");
  // Objeto sem "protótipo": um campo chamado "__proto__" ou "constructor" vira um campo comum, como no Python.
  const fm: FrontMatter = Object.create(null);
  let body = raw;
  const m = RE_BLOCO.exec(raw);
  if (m) {
    body = m[2] ?? "";
    let chave: string | null = null;
    for (const linha of (m[1] ?? "").split("\n")) {
      if (!pyStrip(linha) || pyLstrip(linha).startsWith("#")) continue;
      if (RE_ITEM.test(linha) && chave) {
        // "  - item": acrescenta à lista do último campo (um valor que não era lista é trocado por uma lista)
        const atual = fm[chave];
        const lista: ValorFm[] = Array.isArray(atual) ? atual : [];
        fm[chave] = lista;
        lista.push(scalar(pyStrip(linha).slice(1)));
      } else {
        // "campo: valor" — a chave vai até o PRIMEIRO ":" (line.partition(":"))
        const i = linha.indexOf(":");
        const k = i < 0 ? linha : linha.slice(0, i);
        const v = i < 0 ? "" : linha.slice(i + 1);
        chave = pyStrip(k);
        fm[chave] = pyStrip(v) ? scalar(v) : "";
      }
    }
  }
  return { fm, body };
}

/**
 * Bytes do arquivo → texto, como `read_text("utf-8-sig")`: tira UM BOM do começo (se houver)
 * e PÁRA com erro se o arquivo não for UTF-8 válido (o Python também pára).
 */
export function decodificar(bytes: Uint8Array): string {
  const texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  return texto.startsWith("﻿") ? texto.slice(1) : texto;
}

/** parse(caminho) do build.py: lê o arquivo e separa front matter e corpo. */
export function parseArquivo(caminho: string): { fm: FrontMatter; body: string } {
  return parse(decodificar(readFileSync(caminho)));
}
