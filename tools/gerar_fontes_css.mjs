#!/usr/bin/env node
// Gera src/styles/fontes.css: os @font-face das fontes do site, apontando para os arquivos dos pacotes @fontsource (T17).
//
//   node tools/gerar_fontes_css.mjs           # reescreve src/styles/fontes.css
//   node tools/gerar_fontes_css.mjs --conferir # só confere se o arquivo atual é o que sairia daqui (código de saída 1 se não for)
//
// Por que existe: o Google Fonts entregava as fontes de fonts.gstatic.com. Agora elas vêm do próprio site, dos pacotes
// @fontsource (os mesmos arquivos do Google Fonts, empacotados no npm com versão fixa). Cada pacote traz um CSS pronto, mas com o
// nome de família "Lexend Variable", "Noto Emoji Variable"… e com pesos 100–900. O texto do autor e o custom.css dele pedem as
// fontes pelo NOME de sempre ("Lexend", "PT Serif", "Road Rage"…), então este script copia os blocos do pacote trocando só:
//   - o nome da família (para o de sempre);
//   - o intervalo de pesos (para o mesmo que o link do Google Fonts pedia: Lexend 300–800, Oswald 300–700, Noto Emoji 300–700);
//   - o caminho do arquivo (para o node_modules, que o Vite empacota em /_astro/ com um carimbo no nome);
//   - e tira o formato .woff antigo (todo navegador de hoje lê .woff2).
// A divisão por alfabeto (`unicode-range`: latin, latin-ext, cyrillic, vietnamese…) fica como veio: o navegador só baixa o arquivo
// da faixa de letras que a página usa (a maioria das páginas baixa só o "latin").
// Quem lê o resultado: src/layouts/BaseLayout.astro (import "../styles/fontes.css").
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SAIDA = join(RAIZ, "src", "styles", "fontes.css");

/** As mesmas famílias, pesos e estilos do <link> do Google Fonts que o site usava:
 *  Lexend:wght@300..800 · Oswald:wght@300..700 · Vollkorn SC:wght@400;600;700 · Noto Emoji:wght@300..700 · PT Serif:ital@0;1 · Road Rage. */
const FAMILIAS = [
  { nome: "Lexend", pacote: "@fontsource-variable/lexend", css: ["wght.css"], pesos: "300 800" },
  { nome: "Oswald", pacote: "@fontsource-variable/oswald", css: ["wght.css"], pesos: "300 700" },
  { nome: "Vollkorn SC", pacote: "@fontsource/vollkorn-sc", css: ["400.css", "600.css", "700.css"] },
  { nome: "Noto Emoji", pacote: "@fontsource-variable/noto-emoji", css: ["wght.css"], pesos: "300 700" },
  // PT Serif: só o 400 normal e o 400 itálico (ital@0;1 sem pesos = 400). Negrito no texto é "falso" (o navegador engrossa), como hoje.
  { nome: "PT Serif", pacote: "@fontsource/pt-serif", css: ["400.css", "400-italic.css"] },
  { nome: "Road Rage", pacote: "@fontsource/road-rage", css: ["400.css"] },
];

const RE_BLOCO = /\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
const pegar = (corpo, propriedade) => new RegExp(`${propriedade}:\\s*([^;]+);`).exec(corpo)?.[1]?.trim();

function blocosDe(familia) {
  const saida = [];
  for (const arquivoCss of familia.css) {
    const caminho = join(RAIZ, "node_modules", familia.pacote, arquivoCss);
    const css = readFileSync(caminho, "utf8");
    for (const m of css.matchAll(RE_BLOCO)) {
      const [, titulo, corpo] = m;
      const src = /url\(\.\/(files\/[^)]+?\.woff2)\)/.exec(corpo ?? "")?.[1];
      const faixa = pegar(corpo ?? "", "unicode-range");
      if (!src || !faixa) throw new Error(`${familia.pacote}/${arquivoCss}: bloco sem woff2 ou sem unicode-range (${titulo})`);
      const estilo = pegar(corpo ?? "", "font-style") ?? "normal";
      const peso = familia.pesos ?? pegar(corpo ?? "", "font-weight") ?? "400";
      const arquivo = relative(join(RAIZ, "src", "styles"), join(RAIZ, "node_modules", familia.pacote, src)).split("\\").join("/");
      // "lexend-latin-ext-wght-normal" → "latin-ext"; o comentário do pacote já diz o recorte
      saida.push({ titulo: String(titulo), estilo, peso, arquivo, faixa });
    }
  }
  return saida;
}

let css = `/* Fontes do site, servidas pelo próprio site (T17). GERADO por \`node tools/gerar_fontes_css.mjs\` — não edite à mão.
   As mesmas famílias, pesos e estilos que o link do Google Fonts pedia; os arquivos vêm dos pacotes @fontsource (versão fixa no package.json).
   Os NOMES das famílias são os de sempre ("Lexend", "Oswald", "Vollkorn SC", "Noto Emoji", "PT Serif", "Road Rage"): o texto do autor
   e o static/custom.css dele pedem as fontes por esse nome.
   Fora de @layer de propósito: @font-face não entra em disputa de cascata (não há "quem ganha"), então não precisa da camada do site. */
`;
for (const familia of FAMILIAS) {
  css += `\n/* ═══ ${familia.nome} (${familia.pacote}) ═══ */\n`;
  for (const b of blocosDe(familia)) {
    css +=
      `/* ${b.titulo} */\n` +
      `@font-face { font-family: "${familia.nome}"; font-style: ${b.estilo}; font-weight: ${b.peso}; font-display: swap; ` +
      `src: url("${b.arquivo}") format("woff2"); unicode-range: ${b.faixa}; }\n`;
  }
}

if (process.argv.includes("--conferir")) {
  const atual = readFileSync(SAIDA, "utf8");
  if (atual !== css) {
    console.error("src/styles/fontes.css está diferente do que o gerador produz: rode `node tools/gerar_fontes_css.mjs`.");
    process.exit(1);
  }
  console.log("src/styles/fontes.css confere com o gerador.");
} else {
  writeFileSync(SAIDA, css);
  console.log(`escrito ${relative(RAIZ, SAIDA)} (${css.length} bytes)`);
}
