// Confere que nenhuma página publicada carrega um <script src> de FORA do site, a não ser os endereços EXATOS que o CI permite
// (T17m, decisão do autor de 22/10: os posts do X, do Reddit e do Instagram voltaram aos scripts oficiais, como no site antigo, até
// resolver o B27 depois da virada). Roda no passo "Conferir o resultado" do .github/workflows/deploy.yml, que passa a lista com
// --permitir; um <script src> desconhecido colado no texto de uma notícia faz o deploy PARAR, em vez de ir ao ar sem ninguém ver.
//
// Por que um script e não um `grep`: o `grep` da T20 lia linha por linha, e `<script` com o `src=` na linha de baixo passava. Aqui o
// arquivo é lido INTEIRO: a tag pode ter quebras de linha, aspas duplas, simples ou nenhuma, maiúsculas, entidades (`&#47;&#47;`).
// Conta como "de fora" todo `src` que não é um caminho do próprio site (`/algo`, `algo`, `./algo`): `https://…`, `http://…`, `//…`
// (sem protocolo), `data:`, `javascript:`, qualquer `esquema:`. Os scripts do próprio site (`/_astro/…`) passam sempre.
//
// Uso:  node tools/scripts_de_fora.mjs <pasta> [--permitir <endereço exato>]...
// Saída 0 = tudo certo (lista quantos de cada endereço permitido apareceram); 1 = achou script de fora não permitido (lista os arquivos);
// 2 = uso errado. Só a biblioteca do Node.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Desfaz as entidades que poderiam esconder um endereço (`&#47;`, `&#x2F;`, `&sol;`, `&colon;`, `&amp;`…). */
export function desfazerEntidades(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);?/gi, (_t, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_t, d) => String.fromCodePoint(Number(d)))
    .replace(/&(sol|colon|period|amp|quot|apos|tab|newline);/gi, (_t, n) => ({ sol: "/", colon: ":", period: ".", amp: "&", quot: '"', apos: "'", tab: "\t", newline: "\n" })[n.toLowerCase()]);
}

/** Os `src` de todas as tags <script> de um HTML (o arquivo inteiro, com quebras de linha dentro da tag). */
export function srcsDosScripts(html) {
  const srcs = [];
  for (const m of html.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const attrs = m[1] ?? "";
    const s = /(?:^|[\s"'/])src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs);
    if (s) srcs.push(desfazerEntidades(s[1] ?? s[2] ?? s[3] ?? "").trim());
  }
  return srcs;
}

/** O `src` é de fora do site? (protocolo, `//` sem protocolo, ou qualquer `esquema:`; barra invertida conta como barra, como no navegador) */
export function ehDeFora(src) {
  const s = src.replace(/[\u0000- ]+/g, "").replace(/\\/g, "/");
  return /^\/\//.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s);
}

/** Os scripts de fora não permitidos de um HTML. */
export function scriptsProibidos(html, permitidos) {
  return srcsDosScripts(html).filter((src) => ehDeFora(src) && !permitidos.includes(src));
}

function htmlsDe(pasta) {
  const saida = [];
  const andar = (d) => {
    for (const nome of readdirSync(d)) {
      const c = join(d, nome);
      if (statSync(c).isDirectory()) andar(c);
      else if (/\.html?$/i.test(nome)) saida.push(c);
    }
  };
  andar(pasta);
  return saida.sort();
}

function principal(argv) {
  const permitidos = [];
  let pasta = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--permitir") permitidos.push(argv[++i] ?? "");
    else if (!pasta) pasta = argv[i];
    else return console.error(`argumento a mais: ${argv[i]}`), 2;
  }
  if (!pasta || permitidos.some((p) => !p)) return console.error("uso: node tools/scripts_de_fora.mjs <pasta> [--permitir <endereço exato>]..."), 2;
  const proibidos = [];
  const usados = new Map(permitidos.map((p) => [p, 0]));
  const arquivos = htmlsDe(pasta);
  for (const arquivo of arquivos) {
    const html = readFileSync(arquivo, "utf8");
    for (const src of srcsDosScripts(html)) {
      if (!ehDeFora(src)) continue;
      if (usados.has(src)) usados.set(src, (usados.get(src) ?? 0) + 1);
      else proibidos.push(`${relative(pasta, arquivo)}: ${src}`);
    }
  }
  console.log(`${arquivos.length} páginas lidas inteiras; scripts de fora permitidos: ${[...usados].map(([p, n]) => `${p} (${n})`).join(", ") || "nenhum"}`);
  if (proibidos.length) {
    console.log(`::error::script de outro site no HTML publicado, fora da lista permitida (ver lição 08, posts incorporados):`);
    for (const p of proibidos) console.log(`  ${p}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(principal(process.argv.slice(2)));
