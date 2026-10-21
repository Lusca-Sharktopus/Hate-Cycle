#!/usr/bin/env node
// T18 — Paridade do HTML INTEIRO (<html>: <head>, <body>, cabeçalho, rodapé, scripts), site Python × site Astro, página a página.
//
// Uso (na raiz do repositório; precisa de Node ≥ 22.18, que lê TypeScript sozinho — o projeto pede ≥ 22.12, então em 22.12–22.17
// rode com `node --experimental-strip-types`):
//   node tools/paridade_html.mjs --python <pasta do site Python> --astro <pasta do site Astro> [--json <arquivo>] [--mostrar 40]
// Os dois sites são os gerados de verdade:
//   python3 -c "import build as b; from pathlib import Path; b.BASE=''; b.OUT=Path('<pasta>'); b.build()"          # publicado
//   python3 -c "import build as b; from pathlib import Path; b.BASE=''; b.DRAFTS=True; b.OUT=Path('<pasta>'); b.build()"   # prévia
//   pnpm build                                              (dist/)          # publicado
//   NODE_ENV=development HC_OUT_DIR=<pasta> pnpm build                       # prévia (rascunhos; a pasta /dev/ da prévia fica de fora)
// O mais fácil é `python3 tools/paridade_t18.py`, que gera os quatro sites e chama esta ferramenta.
//
// Como compara: cada página vira a forma canônica de tests/ajudantes/html.ts (parse5; tags, atributos na ordem, classes, texto
// com espaços colapsados — a mesma régua de tests/paginas.test.ts), mas do <html> INTEIRO, não só <main>/<head>. Antes, aplica as
// diferenças DECIDIDAS, uma por uma, e conta em quantas páginas cada uma agiu (cada regra só tira/troca exatamente o que a decisão
// diz; o que sobrar aparece como diferença):
//   T15   o par de <script src> antigo dos comentários (supabase-js do CDN + /comments.js) sai do Python;
//   T17c  a <section data-story-order> ("estou lendo em ordem…") sai do Astro;
//   T17   <link> de fontes (Google no Python; preload no Astro) saem; os ícones (1 no Python, 32+192 px no Astro) viram um só;
//   T17   o fundo da tela de abertura: /intro/fundo.png (Python) × /intro/fundo_<hash>.jpeg (Astro, versão leve);
//   T17   os 5 atributos das versões leves das <img> com srcset (régua de tests/ajudantes/html.ts);
//   T06   o CSS: /style.css?v= (Python) × /_astro/*.css e <style> (Astro) saem dos dois lados; o /custom.css do autor fica e é conferido;
//   T06+  os scripts DO SITE saem da árvore dos dois lados (site.js, os inline da abertura e do menu no Python; os da abertura e os
//         <script type="module"> no Astro) e são conferidos à parte, como COMPORTAMENTOS (abaixo). Scripts de posts incorporados
//         (X, Reddit, Instagram…) e o window.HC ficam na árvore e são comparados normalmente;
//   —     as chaves do Supabase do window.HC viram marcadores (antes, confere que são iguais nos dois; nunca são impressas);
//   —     data-astro-cid-* (marca de escopo do CSS do Astro) não conta (régua de tests/ajudantes/html.ts).
// Comportamentos: para cada página, quais blocos do static/site.js AGIRIAM nela (o seletor de cada bloco acha algo na página) e
// quais scripts o Astro manda para ela. Cada bloco tem de ter o seu script no Astro; o Astro só pode ter a mais o que foi decidido
// (bloco de ordem, T17c). O bloco 3 do site.js (GIFs de `.page-project`) não age em página nenhuma (T14) e é conferido.
// Sai com 0 se não sobrar nenhuma diferença, 1 se sobrar (e mostra as primeiras linhas de cada uma).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "parse5";
import { canonico, semBlocoDeOrdem, semScriptsAntigosDosComentarios } from "../tests/ajudantes/html.ts";

// ───────────── argumentos ─────────────
const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};
const PY = opcao("--python");
const AS = opcao("--astro");
const JSON_SAIDA = opcao("--json");
const MOSTRAR = Number(opcao("--mostrar", "40"));
if (!PY || !AS) {
  console.error("uso: node tools/paridade_html.mjs --python <pasta> --astro <pasta> [--json <arquivo>] [--mostrar N]");
  process.exit(2);
}

// ───────────── árvore ─────────────
const ehEl = (n) => "tagName" in n;
const filhos = (n) => ("content" in n ? n.content : n).childNodes ?? [];
const attr = (e, nome) => e.attrs.find((a) => a.name === nome)?.value;
const classes = (e) => (attr(e, "class") ?? "").split(/\s+/).filter(Boolean);
function varrer(n, quando, achados = []) {
  if (ehEl(n) && quando(n)) achados.push(n);
  for (const f of filhos(n)) varrer(f, quando, achados);
  return achados;
}
function remover(e) {
  const pai = e.parentNode;
  pai.childNodes.splice(pai.childNodes.indexOf(e), 1);
}
const textoDe = (e) => filhos(e).map((f) => (f.nodeName === "#text" ? f.value : ehEl(f) ? textoDe(f) : "")).join("");
const temAncestral = (e, quando) => {
  for (let p = e.parentNode; p && ehEl(p); p = p.parentNode) if (quando(p)) return true;
  return false;
};

// ───────────── os scripts do site: o que cada um é ─────────────
// Python: static/site.js (global, em toda página; cada bloco só age se o seu seletor achar algo) + 3 inline do shell().
// Astro: os mesmos comportamentos, um script por componente (lição 07/08/10), reconhecidos por um pedaço do código.
const SCRIPTS_DO_ASTRO = [
  ["abertura: classe intro no <html>", (s) => s.inline && /const limite = \d+;/.test(s.texto) && /hc-intro/.test(s.texto)],
  ["abertura: vídeo da logo", (s) => s.inline && /const video = "\/intro\/logo\.webm"/.test(s.texto)],
  ["abertura: fechar (bloco 5b do site.js)", (s) => s.modulo && /getElementById\(`intro`\)/.test(s.texto) && /dataset\.min/.test(s.texto)],
  ["menu suspenso (details.dd)", (s) => s.modulo && /details\.dd\[open\]/.test(s.texto)],
  ["1 seletor de Histórias (.sorter)", (s) => s.modulo && /\[`release`,`chrono`,`alpha`\]/.test(s.texto)],
  ["2 carrossel (.works:not(.grid))", (s) => s.modulo && /\.works:not\(\.grid\)/.test(s.texto)],
  ["4 carta que vira (.flip-card)", (s) => s.modulo && /\.flip-card/.test(s.texto)],
  ["5a capa ausente (.work-card > img)", (s) => s.modulo && /\.work-card > img/.test(s.texto)],
  ["5a foto de emissário ausente (.emi-photo img)", (s) => s.modulo && /\.emi-photo img/.test(s.texto)],
  ["6 notícias: busca e páginas (.news-list)", (s) => s.modulo && /news-list|news-item/.test(s.texto)],
  ["7 posts alternados (.embed-alt)", (s) => s.modulo && /\.embed-alt/.test(s.texto)],
  ["T15 comentários (script empacotado)", (s) => s.modulo && /CaixaDeComentarios\.astro/.test(s.src)],
  ["T17c bloco de ordem", (s) => s.modulo && /hc-ordem-de-leitura/.test(s.texto)],
];
// O que a página do Python ativaria (blocos do site.js cujo seletor acha algo + os inline do shell()).
function comportamentosDoPython(doc, scripts) {
  const c = new Set();
  const temSiteJs = scripts.some((s) => /^\/site\.js\?v=[0-9a-f]+$/.test(s.src));
  for (const s of scripts) {
    if (s.inline && /hc-intro/.test(s.texto) && /setTimeout/.test(s.texto) && !/createElement\('video'\)/.test(s.texto)) c.add("abertura: classe intro no <html>");
    if (s.inline && /createElement\('video'\)/.test(s.texto) && /\/intro\/logo\.webm/.test(s.texto)) c.add("abertura: vídeo da logo");
    if (s.inline && /details\.dd\[open\]/.test(s.texto)) c.add("menu suspenso (details.dd)");
  }
  if (!temSiteJs) return c;
  const todos = varrer(doc, () => true);
  const com = (cl) => todos.some((e) => classes(e).includes(cl));
  if (todos.some((e) => classes(e).includes("sorter"))) c.add("1 seletor de Histórias (.sorter)");
  if (todos.some((e) => classes(e).includes("works") && !classes(e).includes("grid"))) c.add("2 carrossel (.works:not(.grid))");
  // bloco 3: `.page-project .prose` existe (Histórias), mas ele só age se houver .apollo-gif/.anfibio-gif dentro (não há em página nenhuma)
  const prosasDoProjeto = todos.filter((e) => classes(e).includes("prose") && temAncestral(e, (p) => classes(p).includes("page-project")));
  if (prosasDoProjeto.some((p) => varrer(p, (e) => classes(e).includes("apollo-gif") || classes(e).includes("anfibio-gif")).length)) c.add("3 GIFs de .page-project (nunca age: T14)");
  if (com("flip-card")) c.add("4 carta que vira (.flip-card)");
  if (todos.some((e) => e.tagName === "img" && e.parentNode && ehEl(e.parentNode) && classes(e.parentNode).includes("work-card"))) c.add("5a capa ausente (.work-card > img)");
  if (todos.some((e) => e.tagName === "img" && temAncestral(e, (p) => classes(p).includes("emi-photo")))) c.add("5a foto de emissário ausente (.emi-photo img)");
  if (todos.some((e) => attr(e, "id") === "intro")) c.add("abertura: fechar (bloco 5b do site.js)");
  if (com("news-list")) c.add("6 notícias: busca e páginas (.news-list)");
  if (com("embed-alt")) c.add("7 posts alternados (.embed-alt)");
  return c;
}
/** Os <script> de um documento, com o que interessa. */
function scriptsDe(doc) {
  return varrer(doc, (e) => e.tagName === "script").map((e) => {
    const src = attr(e, "src") ?? "";
    const tipo = attr(e, "type") ?? "";
    return { el: e, src, modulo: tipo === "module", inline: !src && tipo !== "module", texto: textoDe(e) };
  });
}
/** O script é do SITE (sai da árvore e vira comportamento) ou é de conteúdo (post incorporado, window.HC: fica na árvore)? */
function ehScriptDoSite(s, lado) {
  if (/window\.HC=/.test(s.texto)) return false;
  if (lado === "python") return /^\/site\.js\?v=[0-9a-f]+$/.test(s.src) || (s.inline && /hc-intro|details\.dd\[open\]|\/intro\/logo\.webm/.test(s.texto));
  return (s.modulo && (s.src === "" || s.src.startsWith("/_astro/"))) || (s.inline && /hc-intro|\/intro\/logo\.webm/.test(s.texto));
}

// ───────────── as regras, uma por decisão ─────────────
const CONTAGEM = {};
const conta = (regra, url) => ((CONTAGEM[regra] ??= new Set()).add(url));
const FALHAS = [];
const falha = (url, o_que) => FALHAS.push(`${url}: ${o_que}`);

const RE_HC = /<script>window\.HC=(\{[\s\S]*?\});<\/script>/g;
function hcs(html) {
  return [...html.matchAll(RE_HC)].map((m) => m[1]);
}
const comMarcadores = (html) =>
  html.replace(RE_HC, (_s, json) => {
    const hc = JSON.parse(json.replaceAll("<\\/", "</"));
    return `<script>window.HC=${JSON.stringify({ ...hc, url: "__SUPABASE_URL__", key: "__SUPABASE_ANON_KEY__" })};</script>`;
  });

function normalizar(html, lado, url, existe) {
  const r = { comportamentos: new Set(), customCss: [] };
  if (lado === "python") {
    const s = semScriptsAntigosDosComentarios(html);
    if (s.sobrou) falha(url, "o Python tem supabase-js/comments.js fora do par de sempre");
    if (s.quantos) conta("T15: par de <script> antigo dos comentários (Python)", url);
    html = s.html;
  } else {
    const s = semBlocoDeOrdem(html);
    if (s.removidos.length) {
      conta("T17c: bloco \"estou lendo em ordem\" (Astro)", url);
      if (!/^\/(en|pt)\/works\/[^/]+\/[^/]+\/$/.test(url)) falha(url, "bloco de ordem fora de um capítulo");
      if (s.removidos.length !== 1 || !s.filhasDiretasDoMain.every(Boolean)) falha(url, "bloco de ordem: não é 1 filho direto do <main>");
    }
    html = s.html;
  }
  html = comMarcadores(html);
  const doc = parse(html);
  const cabeca = varrer(doc, (e) => e.tagName === "head")[0];
  // T17 fontes e ícone
  for (const e of varrer(doc, (e) => e.tagName === "link")) {
    const href = attr(e, "href") ?? "";
    const rel = attr(e, "rel") ?? "";
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\b/.test(href) || (rel === "preload" && attr(e, "as") === "font")) {
      if (lado === "astro" && !existe(href)) falha(url, `pré-carregamento de fonte aponta para arquivo que não existe: ${href}`);
      remover(e);
      conta(`T17: <link> de fontes (${lado === "python" ? "Google Fonts" : "preload"})`, url);
    } else if (rel === "icon") {
      if (!/^\/logos\/favicon(_[A-Za-z0-9-]+)?\.png$/.test(href)) falha(url, `ícone inesperado: ${href}`);
      if (!existe(href)) falha(url, `ícone não existe: ${href}`);
      conta(`T17: ícone (${lado === "python" ? "1 link" : "32 e 192 px"})`, url);
      e.attrs = [{ name: "rel", value: "icon" }, { name: "href", value: "/logos/favicon.png" }, { name: "type", value: "image/png" }];
    } else if (rel === "stylesheet") {
      if (/^\/custom\.css(\?v=[0-9a-f]+)?$/.test(href)) {
        r.customCss.push(href.replace(/\?v=.*/, ""));
        e.attrs = e.attrs.map((a) => (a.name === "href" ? { ...a, value: "/custom.css" } : a));
      } else if ((lado === "python" && /^\/style\.css\?v=[0-9a-f]+$/.test(href)) || (lado === "astro" && /^\/_astro\/[^/]+\.css$/.test(href))) {
        if (!existe(href)) falha(url, `CSS que não existe: ${href}`);
        remover(e);
        conta(`T06: CSS (${lado === "python" ? "/style.css" : "/_astro/*.css e <style>"})`, url);
      }
    }
  }
  // dois ícones viram um
  const icones = varrer(cabeca, (e) => e.tagName === "link" && attr(e, "rel") === "icon");
  for (const e of icones.slice(1)) remover(e);
  if (lado === "astro") for (const e of varrer(doc, (e) => e.tagName === "style")) (remover(e), conta("T06: CSS (/_astro/*.css e <style>)", url));
  // o custom.css: tem de ser o ÚLTIMO CSS da página (vem depois de todos, para ganhar)
  const ordemDoCss = varrer(doc, (e) => e.tagName === "style" || (e.tagName === "link" && attr(e, "rel") === "stylesheet"));
  if (ordemDoCss.length && attr(ordemDoCss.at(-1), "href") !== "/custom.css") falha(url, "o /custom.css não é o último CSS da página");
  // T17 fundo da abertura
  for (const e of varrer(doc, (e) => e.attrs.some((a) => a.name === "id" && a.value === "intro"))) {
    const st = attr(e, "style") ?? "";
    const m = /url\('([^']+)'\)/.exec(st);
    if (m && lado === "astro" && /^\/intro\/fundo_[A-Za-z0-9-]+\.jpeg$/.test(m[1])) {
      if (!existe(m[1])) falha(url, `fundo da abertura não existe: ${m[1]}`);
      e.attrs = e.attrs.map((a) => (a.name === "style" ? { ...a, value: st.replace(m[1], "/intro/fundo.png") } : a));
      conta("T17: fundo da abertura em JPEG", url);
    }
  }
  // T17 imagens com versões leves (só contagem: a régua de canonico() já ignora os 5 atributos)
  if (varrer(doc, (e) => e.tagName === "img" && attr(e, "srcset") !== undefined).length) conta("T17: <img> com srcset/sizes/width/height/decoding", url);
  if (varrer(doc, (e) => e.attrs.some((a) => a.name.startsWith("data-astro-cid-"))).length) conta("T06: data-astro-cid-* (escopo do CSS)", url);
  // scripts do site → comportamentos
  const scripts = scriptsDe(doc);
  if (lado === "python") r.comportamentos = comportamentosDoPython(doc, scripts);
  for (const s of scripts) {
    if (!ehScriptDoSite(s, lado)) continue;
    if (lado === "astro") {
      const quem = SCRIPTS_DO_ASTRO.filter(([, q]) => q(s)).map(([n]) => n);
      if (quem.length !== 1) falha(url, `script do Astro não reconhecido (${quem.length} candidatos): ${s.src || s.texto.slice(0, 80)}`);
      else r.comportamentos.add(quem[0]);
      if (s.src && !existe(s.src)) falha(url, `script que não existe: ${s.src}`);
    } else if (s.src && !existe(s.src.replace(/\?v=.*/, ""))) falha(url, `script que não existe: ${s.src}`);
    remover(s.el);
    conta(`T06+: scripts do site fora da árvore (${lado})`, url);
  }
  const raiz = varrer(doc, (e) => e.tagName === "html")[0];
  r.canonico = canonico(raiz);
  return r;
}

// ───────────── diferença de linhas (para mostrar o que sobrou) ─────────────
function diffLinhas(a, b) {
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fa = a.length, fb = b.length;
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) (fa--, fb--);
  const A = a.slice(ini, fa), B = b.slice(ini, fb);
  if (A.length * B.length > 4e7) return [`(diferença grande: ${A.length} × ${B.length} linhas a partir da linha ${ini + 1})`];
  const L = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const saida = [];
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) (i++, j++);
    else if (j < B.length && (i === A.length || L[i][j + 1] >= L[i + 1][j])) saida.push(`+ astro  ${B[j++]}`);
    else saida.push(`- python ${A[i++]}`);
  }
  return saida;
}

// ───────────── as páginas ─────────────
function paginas(pasta) {
  const m = new Map();
  const andar = (d) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) {
        if (d === pasta && n === "dev") continue; // a ferramenta /dev/markdown/ da prévia do Astro (nunca vai para o publicado)
        andar(c);
      } else if (n.endsWith(".html")) {
        const rel = relative(pasta, c).split(sep).join("/");
        m.set(rel === "index.html" ? "/" : rel.endsWith("/index.html") ? "/" + rel.slice(0, -10) : "/" + rel, c);
      }
    }
  };
  andar(pasta);
  return m;
}
const existeEm = (pasta) => (href) => {
  try {
    const caminho = decodeURIComponent(href.split(/[?#]/)[0]);
    return statSync(join(pasta, caminho)).isFile();
  } catch {
    return false;
  }
};

const pp = paginas(PY), pa = paginas(AS);
const soPython = [...pp.keys()].filter((u) => !pa.has(u)).sort();
const soAstro = [...pa.keys()].filter((u) => !pp.has(u)).sort();
if (soPython.length) falha("(lista)", `páginas só no Python: ${soPython.join(", ")}`);
if (soAstro.length) falha("(lista)", `páginas só no Astro: ${soAstro.join(", ")}`);

const resultado = { paginas: 0, identicasSemRegra: 0, iguaisDepoisDasRegras: 0, diferentes: [], comportamentos: {}, hcIguais: 0, hcDiferentes: [] };
const tabelaComportamentos = new Map();
for (const url of [...pp.keys()].filter((u) => pa.has(u)).sort()) {
  resultado.paginas++;
  const hp = readFileSync(pp.get(url), "utf8"), ha = readFileSync(pa.get(url), "utf8");
  if (hp === ha) {
    resultado.identicasSemRegra++;
    resultado.iguaisDepoisDasRegras++;
    continue;
  }
  // as chaves do window.HC: iguais nos dois (sem imprimir)
  const hcP = hcs(hp), hcA = hcs(ha);
  if (hcP.length || hcA.length) {
    if (JSON.stringify(hcP) === JSON.stringify(hcA)) resultado.hcIguais++;
    else resultado.hcDiferentes.push(url);
  }
  const p = normalizar(hp, "python", url, existeEm(PY)), a = normalizar(ha, "astro", url, existeEm(AS));
  if (JSON.stringify(p.customCss) !== JSON.stringify(a.customCss)) falha(url, `custom.css: Python ${JSON.stringify(p.customCss)} × Astro ${JSON.stringify(a.customCss)}`);
  // comportamentos
  const cp = [...p.comportamentos].filter((c) => !c.startsWith("3 ")), ca = [...a.comportamentos];
  if (p.comportamentos.has("3 GIFs de .page-project (nunca age: T14)")) falha(url, "o bloco 3 do site.js (GIFs de .page-project) agiria aqui, e o Astro não o tem (T14 diz que nunca age)");
  const extrasDecididos = new Set(["T17c bloco de ordem", "T15 comentários (script empacotado)"]);
  const faltam = cp.filter((c) => !a.comportamentos.has(c));
  const sobram = ca.filter((c) => !p.comportamentos.has(c) && !extrasDecididos.has(c));
  if (faltam.length) falha(url, `comportamento do Python sem script no Astro: ${faltam.join("; ")}`);
  if (sobram.length) falha(url, `script do Astro sem o elemento que o usa no Python: ${sobram.join("; ")}`);
  if (a.comportamentos.has("T15 comentários (script empacotado)") !== /class="hc-comments"/.test(ha)) falha(url, "script dos comentários × caixa de comentários");
  if (a.comportamentos.has("T17c bloco de ordem") !== (CONTAGEM['T17c: bloco "estou lendo em ordem" (Astro)']?.has(url) === true)) falha(url, "script do bloco de ordem × bloco de ordem");
  const chave = `Python: ${[...p.comportamentos].sort().join(" | ")}\nAstro:  ${ca.sort().join(" | ")}`;
  (tabelaComportamentos.get(chave) ?? tabelaComportamentos.set(chave, []).get(chave)).push(url);
  if (p.canonico === a.canonico) resultado.iguaisDepoisDasRegras++;
  else resultado.diferentes.push({ url, linhas: diffLinhas(p.canonico.split("\n"), a.canonico.split("\n")) });
}
resultado.comportamentos = Object.fromEntries([...tabelaComportamentos].map(([k, v]) => [k, v]));

// ───────────── relatório ─────────────
console.log(`páginas comparadas: ${resultado.paginas} (só no Python: ${soPython.length}; só no Astro: ${soAstro.length})`);
console.log(`  idênticas byte a byte: ${resultado.identicasSemRegra}`);
console.log(`  iguais depois das diferenças decididas: ${resultado.iguaisDepoisDasRegras}`);
console.log(`  DIFERENTES: ${resultado.diferentes.length}`);
console.log(`window.HC (chaves do Supabase): igual nos dois em ${resultado.hcIguais} páginas; diferente em ${resultado.hcDiferentes.length}`);
console.log("\nregras aplicadas (páginas em que cada uma agiu):");
for (const [regra, urls] of Object.entries(CONTAGEM).sort()) console.log(`  ${String(urls.size).padStart(4)}  ${regra}`);
console.log("\ncomportamentos (scripts) por grupo de páginas:");
for (const [k, urls] of tabelaComportamentos) console.log(`  [${urls.length} páginas, ex.: ${urls[0]}]\n    ${k.replace("\n", "\n    ")}`);
if (FALHAS.length) {
  console.log(`\nFALHAS (${FALHAS.length}):`);
  for (const f of FALHAS.slice(0, 200)) console.log("  " + f);
}
for (const d of resultado.diferentes.slice(0, 30)) {
  console.log(`\n── ${d.url} (${d.linhas.length} linhas diferentes)`);
  for (const l of d.linhas.slice(0, MOSTRAR)) console.log("   " + l.slice(0, 300));
}
if (JSON_SAIDA) writeFileSync(JSON_SAIDA, JSON.stringify({ ...resultado, regras: Object.fromEntries(Object.entries(CONTAGEM).map(([k, v]) => [k, v.size])), falhas: FALHAS, soPython, soAstro }, null, 2));
process.exit(resultado.diferentes.length || FALHAS.length || soPython.length || soAstro.length ? 1 : 0);
