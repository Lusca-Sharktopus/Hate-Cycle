// Prova de que as PÁGINAS do site Astro (T11 em diante) saem iguais às do site Python, página a página.
//
// A referência de cada grupo (tests/fixtures/paginas-<grupo>-python.json: t11 = home, Histórias e página de obra;
// t12 = capítulos; t13 = as duas listas de notícias e as 166 notícias) é o HTML completo que o build.py gera, tirado por
//   python3 tools/paginas_ref.py
// O teste constrói o site Astro de verdade (`astro build`, numa pasta temporária) e compara, para CADA página de cada grupo:
//   - o <head>: título, descrição, og:*, robots, hreflang e alternate (RSS), ícone, fontes, scripts da abertura;
//   - o <main> inteiro: a árvore de tags, os atributos (valores e ordem das classes) e o texto (espaços colapsados);
//   - as runas do fundo (a semente é o endereço da página), a classe do <body>, o cabeçalho e o rodapé.
// E, para TODAS as páginas que o Astro gera, os IDs das conversas de comentários (data-page) contra baseline/comentarios.json
// (invariante 2 do CLAUDE.md: mudar um ID faz as conversas "sumirem").
// Como a comparação é feita (e o que ela ignora de propósito): tests/ajudantes/html.ts. As diferenças técnicas que restam
// (caminhos de CSS/JS do Astro, marcas de escopo) estão listadas e justificadas em docs/aprendendo-astro/07-paginas.md e 08-leitor.md.
//
// Chaves do Supabase (T12): o window.HC das páginas com comentários leva a URL do projeto e a chave anon do config.json do
// autor. A referência foi gravada com MARCADORES no lugar delas; aqui, as do dist/ são conferidas (sem nunca imprimi-las)
// e trocadas pelos mesmos marcadores antes de comparar.
//
// T14 (grupo t14 = páginas avulsas, Universo/Personagens e a 404) mais as provas do SITE INTEIRO:
//   - a lista de endereços do dist/ é exatamente a de baseline/urls.json (193 páginas HTML + os 2 feeds + CNAME) mais o sitemap;
//   - a raiz, as páginas do site antigo e os feeds RSS saem IGUAIS BYTE A BYTE ao que o build.py gera;
//   - o sitemap tem as páginas publicadas e indexáveis (e só elas), conferido contra o dist/;
//   - uma SEGUNDA construção, com rascunhos e Extras ligados (`NODE_ENV=development HC_SHOW_EXTRAS=1 pnpm build`: o que o autor verá
//     se ligar `show_extras`), confere o cabeçalho e o <main> de TODAS as páginas contra o build.py com DRAFTS=True e show_extras=True.
// Atalho para iterar: `HC_DIST=dist pnpm vitest run paginas` usa um dist/ já construído em vez de construir de novo
// (e `HC_DIST_EXTRAS=<pasta>` para a segunda construção).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { limparUrlDoSupabase } from "../src/lib/comentarios";
import { t } from "../src/lib/config";
import { pyStrip } from "../src/lib/frontmatter";
import { canalDoYoutubeComoNoPython, canonicoDoMiolo, cartaoEmOutroIdiomaComoNoPython, folheadorComoNoPython, semJanelaDoJogo, idsDeComentarios, lerPagina, RE_SCRIPT_DOS_COMENTARIOS, homeComoNoPython, resumoCortadoComoNoPython, semBlocoDeOrdem, semScriptsAntigosDosComentarios, soQuatroHistoriasNaHome, type PaginaLida } from "./ajudantes/html";

interface Referencia {
  python: string;
  grupo: string;
  escopo: string;
  paginas: Record<string, string>;
  marcadores?: { url: string; key: string };
}
/** Os grupos de páginas já migrados (os mesmos de GRUPOS em tools/paginas_ref.py). */
const GRUPOS = ["t11", "t12", "t13", "t14"] as const;
const refs: Referencia[] = GRUPOS.map((g) => JSON.parse(readFileSync(new URL(`./fixtures/paginas-${g}-python.json`, import.meta.url), "utf8")));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

let dist = process.env["HC_DIST"] ? join(RAIZ, process.env["HC_DIST"]) : "";
let pastaTemporaria = "";

/** O vitest põe no ambiente o que espelha o import.meta.env dele (NODE_ENV=test, MODE, DEV=true, PROD, SSR, BASE_URL, SITE…) e
 *  variáveis VITEST*; o build filho herdaria isso e se trataria como "dev" (import.meta.env.DEV = true = COM rascunhos, que
 *  faria o site sair com o link Apoio e a "Prévia"). Aqui o build é sempre o de produção, como o `pnpm build`. */
const DO_VITEST = new Set(["MODE", "DEV", "PROD", "SSR", "TEST", "BASE_URL", "SITE", "ASSETS_PREFIX", "FORCE_TTY"]);
function ambienteDoBuild(saida: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", HC_OUT_DIR: saida };
  for (const chave of Object.keys(env)) if (chave.startsWith("VITEST") || DO_VITEST.has(chave)) delete env[chave];
  delete env["HC_SHOW_EXTRAS"]; // o build normal lê só o config.json
  return { ...env, ...extra };
}

/** `astro build` numa pasta; `extra` muda o ambiente (a construção "com rascunhos e Extras" usa NODE_ENV=development e HC_SHOW_EXTRAS=1). */
function construir(saida: string, extra: NodeJS.ProcessEnv = {}): void {
  const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "astro", "bin", "astro.mjs"), "build"], { cwd: RAIZ, env: ambienteDoBuild(saida, extra), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`astro build falhou:\n${r.stdout}\n${r.stderr}`);
}

beforeAll(() => {
  if (dist) return;
  pastaTemporaria = mkdtempSync(join(tmpdir(), "hc-astro-dist-"));
  construir(pastaTemporaria);
  dist = pastaTemporaria;
}, 240_000);
afterAll(() => {
  if (pastaTemporaria) rmSync(pastaTemporaria, { recursive: true, force: true });
  if (pastaDaSegunda) rmSync(pastaDaSegunda, { recursive: true, force: true });
  jaLidas.clear();
});

/** A segunda construção (rascunhos + Extras), feita só quando alguém precisa dela. */
let pastaDaSegunda = "";
let distDaSegunda = process.env["HC_DIST_EXTRAS"] ? join(RAIZ, process.env["HC_DIST_EXTRAS"]) : "";
function segundaConstrucao(): string {
  if (!distDaSegunda) {
    pastaDaSegunda = mkdtempSync(join(tmpdir(), "hc-astro-dist-extras-"));
    // NODE_ENV=development faz o build se tratar como a prévia (import.meta.env.DEV = true = COM rascunhos, o DRAFTS=True do build.py)
    construir(pastaDaSegunda, { NODE_ENV: "development", HC_SHOW_EXTRAS: "1" });
    distDaSegunda = pastaDaSegunda;
  }
  return distDaSegunda;
}

/** Todas as páginas HTML de uma pasta: endereço (/pt/works/) → caminho do arquivo. (Lida uma vez só: são ~180 páginas e cada uma pergunta.) */
const jaLidas = new Map<string, Map<string, string>>();
function paginasDoDist(pasta: string): Map<string, string> {
  const guardadas = jaLidas.get(pasta);
  if (guardadas) return guardadas;
  const achadas = new Map<string, string>();
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome === "index.html") achadas.set("/" + relative(pasta, caminho).split(sep).slice(0, -1).join("/") + (dir === pasta ? "" : "/"), caminho);
      else if (nome === "404.html" && dir === pasta) achadas.set("/404.html", caminho); // a 404 é um arquivo solto, não uma pasta
    }
  };
  andar(pasta);
  jaLidas.set(pasta, achadas);
  return achadas;
}

/**
 * T17h: o HTML do Astro com o href do ícone do YouTube do rodapé como o do Python (a única diferença aceita no rodapé). Exige EXATAMENTE 1
 * troca por página e o canal do idioma da URL (/en/ → @HateCycleEn, /pt/ → @HateCycleBR); senão, é erro.
 */
function trocarCanalDoYoutube(url: string, html: string): string {
  const lang = /^\/(en|pt)\//.exec(url)?.[1] as "en" | "pt" | undefined;
  const r = canalDoYoutubeComoNoPython(html, lang);
  if (r.trocados !== 1 || r.errados !== 0) throw new Error(`${url}: o rodapé devia ter 1 ícone do YouTube com o canal do idioma (trocou ${r.trocados}, de outro idioma ${r.errados})`);
  return r.html;
}

/** O ano do rodapé é o do dia do build ("© 2023 - 2026"): troca por um marcador para o teste não quebrar em 1º de janeiro. */
const semAno = (rodape: string) => rodape.replace(/(2023 - )\d{4}/, "$1<ano>");

// ───────────── as chaves do Supabase do autor (lidas aqui só para conferir e esconder; nunca impressas) ─────────────

const chavesDoAutor = (JSON.parse(readFileSync(join(RAIZ, "config.json"), "utf8")) as { comments?: { supabase_url?: unknown; supabase_anon_key?: unknown } }).comments ?? {};
const temChaves = typeof chavesDoAutor.supabase_url === "string" && chavesDoAutor.supabase_url !== "" && typeof chavesDoAutor.supabase_anon_key === "string" && chavesDoAutor.supabase_anon_key !== "";
const RE_HC = /<script>window\.HC=(\{[\s\S]*?\});<\/script>/g;

/**
 * Troca, no window.HC de cada página, a URL e a chave de verdade pelos marcadores da referência. Antes confere (sem imprimir
 * os valores) que elas são as do config.json, limpas como o build.py limpa. Devolve o HTML e quantos window.HC havia.
 */
function comMarcadores(html: string, marcadores: { url: string; key: string }): { html: string; quantos: number; conferem: boolean } {
  let quantos = 0;
  let conferem = true;
  const saida = html.replace(RE_HC, (script, json: string) => {
    quantos++;
    const hc = JSON.parse(json.replaceAll("<\\/", "</")) as { url: unknown; key: unknown };
    const urlCerta = temChaves && hc.url === limparUrlDoSupabase(String(chavesDoAutor.supabase_url));
    const chaveCerta = temChaves && hc.key === pyStrip(String(chavesDoAutor.supabase_anon_key));
    if (!urlCerta || !chaveCerta) conferem = false;
    return script.replace(`"url": ${JSON.stringify(hc.url)}`, `"url": "${marcadores.url}"`).replace(`"key": ${JSON.stringify(hc.key)}`, `"key": "${marcadores.key}"`);
  });
  return { html: saida, quantos, conferem };
}

// ───────────── as diferenças decididas da T17j (cada uma provada no seu teste) ─────────────

/** O HTML do Python com o que o Astro decidiu diferente: só 4 histórias na home (T17j). (Os posts incorporados são iguais nos dois desde a
 *  T17m: os scripts oficiais, como no site antigo; a exceção semScriptsDosPosts da T17g saiu.) */
function pythonComoNoAstro(html: string): string {
  return soQuatroHistoriasNaHome(html).html;
}
/** O HTML do Astro sem o trilho/link da home e com o resumo cortado das Notícias escrito como no Python (T17j); o leitor página a página
 *  dos quadrinhos vira o <div class="comic"> de dentro e a janela do jogo sai (T17d; tests/folheador.test.ts). Forma inesperada = erro. */
function astroComoNoPython(html: string): string {
  const f = folheadorComoNoPython(html);
  const j = semJanelaDoJogo(f.html);
  if (f.recusados !== 0 || j.foraDoLugar !== 0) throw new Error(`T17d: leitor página a página ou janela do jogo com forma inesperada (${f.recusados} leitor(es), ${j.foraDoLugar} janela(s))`);
  // T17m: o cartão da obra que só tem capítulo no outro idioma leva até lá (no Python, "Em breve"; tests/obras-em-outro-idioma.test.ts)
  const lang = /<html lang="pt/.test(j.html) ? "pt" : "en";
  const c = cartaoEmOutroIdiomaComoNoPython(j.html, t(lang, "soon"));
  return resumoCortadoComoNoPython(homeComoNoPython(c.html).html).html;
}

// ───────────── página a página, grupo a grupo ─────────────

for (const ref of refs) {
  const ESCOPO = new RegExp(ref.escopo);
  const urls = Object.keys(ref.paginas).sort();

  describe(`grupo ${ref.grupo}`, () => {
    test("mesmos endereços (nenhuma página a mais, nenhuma a menos)", () => {
      const doAstro = [...paginasDoDist(dist).keys()].filter((u) => ESCOPO.test(u)).sort();
      expect(doAstro, REFAZER).toEqual(urls);
    });

    if (ref.marcadores) {
      test("o config.json do autor tem as duas chaves dos comentários (a referência foi tirada com chaves)", () => {
        expect(temChaves, "config.json → comments sem supabase_url/supabase_anon_key: sem elas o site não tem comentários, e a referência supõe que tem").toBe(true);
      });
    }

    describe.each(urls)("%s", (url) => {
      let py: PaginaLida;
      let astro: PaginaLida;
      beforeAll(() => {
        // T15: a única diferença aceita — o Python carrega o supabase-js do CDN e o /comments.js; o Astro, o script empacotado
        const doPython = semScriptsAntigosDosComentarios(ref.paginas[url] ?? "");
        if (doPython.sobrou) throw new Error(`${url}: o Python tem supabase-js/comments.js fora do lugar de sempre (depois do window.HC)`);
        // T17j: a home do Python tem até 5 histórias; a do Astro, até 4 (tests/home.test.ts)
        py = lerPagina(pythonComoNoAstro(doPython.html));
        const arquivo = paginasDoDist(dist).get(url);
        if (!arquivo) throw new Error(`o Astro não gerou ${url}`);
        // T17c: o bloco "estou lendo em ordem…" só existe no Astro (tests/ajudantes/html.ts → semBlocoDeOrdem; tests/ordem.test.ts prova que só ele sai)
        // T17h: o ícone do YouTube do rodapé leva ao canal do idioma (tests/ajudantes/html.ts → canalDoYoutubeComoNoPython; tests/canais.test.ts)
        // T17j: o trilho e o link "Ver todas as histórias" da home e o degradê do resumo cortado das Notícias (tests/home.test.ts, tests/noticias.test.ts)
        let html = astroComoNoPython(semBlocoDeOrdem(trocarCanalDoYoutube(url, readFileSync(arquivo, "utf8"))).html);
        if (ref.marcadores) {
          const r = comMarcadores(html, ref.marcadores);
          // sem expect(valor) aqui de propósito: em caso de erro, o vitest imprimiria a chave
          if (!r.conferem) throw new Error(`${url}: a URL ou a chave do window.HC não são as do config.json (limpas como o build.py limpa)`);
          html = r.html;
        }
        astro = lerPagina(html);
      });

      test("<html lang>, título, descrição, og:*, hreflang, alternate (RSS), ícone, fontes e abertura", () => {
        expect(astro.lang).toBe(py.lang);
        expect(astro.cabeca.titulo).toBe(py.cabeca.titulo);
        expect(astro.cabeca.metas).toEqual(py.cabeca.metas);
        expect(astro.cabeca.links).toEqual(py.cabeca.links);
        // A abertura (T07) foi reescrita de propósito (define:vars, formatada): o texto do script difere, o comportamento não.
        // Aqui só se confere que ela existe nos dois e usa o mesmo tempo limite e a mesma chave do navegador.
        expect(astro.cabeca.scriptsInline).toHaveLength(py.cabeca.scriptsInline.length);
        for (const [i, s] of py.cabeca.scriptsInline.entries()) {
          for (const peca of ["hc-intro", "prefers-reduced-motion: reduce", /\d{5}/.exec(s)?.[0] ?? ""]) expect(astro.cabeca.scriptsInline[i]).toContain(peca);
        }
      });
      test("<main> inteiro: tags, atributos, classes e texto", () => {
        expect(astro.main).toBe(py.main);
      });
      test("runas do fundo (mesma semente = o endereço) e classe do <body>", () => {
        expect(astro.classeDoCorpo).toBe(py.classeDoCorpo);
        expect(astro.runas).toBe(py.runas);
      });
      test("cabeçalho e rodapé", () => {
        expect(astro.cabecalho).toBe(py.cabecalho);
        expect(semAno(astro.rodape)).toBe(semAno(py.rodape));
      });
    });
  });
}

// ───────────── os IDs das conversas de comentários ─────────────

describe("IDs dos comentários (data-page) de TODAS as páginas do Astro = baseline/comentarios.json", () => {
  const baseline: { por_pagina: Record<string, string[]>; ids_unicos: string[] } = JSON.parse(readFileSync(join(RAIZ, "baseline", "comentarios.json"), "utf8"));
  const migradas = new RegExp(refs.map((r) => r.escopo).join("|"));

  test("cada página gerada tem exatamente os IDs que tem no site atual (nenhum a mais, nenhum a menos, mesma ordem)", () => {
    const doAstro: Record<string, string[]> = {};
    const daBaseline: Record<string, string[]> = {};
    for (const [url, arquivo] of paginasDoDist(dist)) {
      doAstro[url] = idsDeComentarios(readFileSync(arquivo, "utf8"));
      daBaseline[url] = baseline.por_pagina[url] ?? [];
    }
    expect(doAstro).toEqual(daBaseline);
  });

  test("toda página com comentários do site atual que já foi migrada existe no Astro", () => {
    const geradas = paginasDoDist(dist);
    const faltam = Object.keys(baseline.por_pagina).filter((u) => migradas.test(u) && !geradas.has(u));
    expect(faltam).toEqual([]);
  });

  test("os IDs do Astro são os mesmos da baseline para as páginas migradas, e o mesmo ID nos dois idiomas", () => {
    const geradas = [...paginasDoDist(dist)];
    const doAstro = new Set(geradas.flatMap(([, arquivo]) => idsDeComentarios(readFileSync(arquivo, "utf8"))));
    const esperados = new Set(Object.entries(baseline.por_pagina).filter(([u]) => migradas.test(u)).flatMap(([, ids]) => ids));
    expect([...doAstro].sort()).toEqual([...esperados].sort());
    for (const id of doAstro) expect(baseline.ids_unicos).toContain(id);
    // a mesma conversa em /en/ e /pt/: o ID não leva o idioma
    for (const id of doAstro) expect(id).not.toMatch(/^(en|pt)\/|\/(en|pt)$/);
  });
});

// ───────────── T14: a lista de endereços, os arquivos exatos, o sitemap e o site inteiro com Extras ─────────────

interface ReferenciaT14 extends Referencia {
  exatos: Record<string, string>;
  construcao_com_rascunhos_e_extras: { paginas: Record<string, string>; partes: Record<string, { header: string; main: string }> };
}
const t14 = refs.find((r) => r.grupo === "t14") as ReferenciaT14;
const baselineUrls: { html: string[]; outros_gerados: string[]; outros_de_static_relevantes: string[]; redirects_site_antigo: Record<string, string> } = JSON.parse(
  readFileSync(join(RAIZ, "baseline", "urls.json"), "utf8"),
);

/** Todos os arquivos de uma pasta, relativos a ela e com "/" (ex.: "en/feed.xml"). */
function arquivosDe(pasta: string): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else achados.push(relative(pasta, caminho).split(sep).join("/"));
    }
  };
  andar(pasta);
  return achados.sort();
}
/** O endereço de um arquivo .html do dist/: "en/about/index.html" → "/en/about/"; "index.html" → "/"; "PT.html" → "/PT.html". */
function enderecoDoHtml(arquivo: string): string {
  if (arquivo === "index.html") return "/";
  return arquivo.endsWith("/index.html") ? "/" + arquivo.slice(0, -"index.html".length) : "/" + arquivo;
}

describe("a lista de endereços do dist/ é a da baseline (mais o sitemap)", () => {
  test("as 193 páginas HTML são exatamente as do site atual (nenhuma a mais, nenhuma a menos)", () => {
    // As páginas .html que vêm prontas de static/ (as do site antigo: produtos.html, night.html…) não são páginas
    // geradas: a baseline as lista em outros_de_static_relevantes (próximo teste), como faz o tools/baseline.py.
    const deStatic = new Set(baselineUrls.outros_de_static_relevantes.filter((f) => f.endsWith(".html")).map((f) => f.slice(1)));
    const html = arquivosDe(dist).filter((a) => a.endsWith(".html") && !deStatic.has(a)).map(enderecoDoHtml).sort();
    expect(html).toEqual([...baselineUrls.html].sort());
    expect(html).toHaveLength(193);
  });
  test("os feeds, o CNAME e o sitemap estão lá; nada mais fora do que o site publica (nem /dev/)", () => {
    const todos = arquivosDe(dist);
    for (const f of baselineUrls.outros_gerados) expect(todos, f).toContain(f.slice(1));
    for (const f of baselineUrls.outros_de_static_relevantes) expect(todos, f).toContain(f.slice(1));
    expect(todos).toContain("sitemap.xml");
    expect(todos.filter((a) => a.startsWith("dev/")), "a ferramenta /dev/markdown/ não pode ir para o site publicado").toEqual([]);
  });
  test("os redirecionamentos do site antigo são os de config.json → redirects (menos index.html e os que vão para /)", () => {
    const doConfig = JSON.parse(readFileSync(join(RAIZ, "config.json"), "utf8")) as { redirects: Record<string, string> };
    const esperados = Object.fromEntries(Object.entries(doConfig.redirects).filter(([antigo, novo]) => novo !== "/" && antigo !== "index.html").map(([a, n]) => ["/" + a, n]));
    expect(esperados).toEqual(baselineUrls.redirects_site_antigo);
    for (const [antigo, novo] of Object.entries(esperados)) {
      const html = readFileSync(join(dist, antigo.slice(1)), "utf8");
      expect(html, antigo).toContain(`<meta http-equiv="refresh" content="0; url=${novo}">`);
    }
  });
});

describe("raiz, páginas do site antigo e feeds: IGUAIS, byte a byte, aos do build.py", () => {
  test.each(Object.keys(t14.exatos))("%s", (url) => {
    const arquivo = url === "/" ? "index.html" : url.slice(1);
    const doAstro = readFileSync(join(dist, arquivo), "utf8");
    // toBe com texto grande mostra a diferença inteira; aqui a primeira linha que difere já basta
    expect(doAstro === t14.exatos[url], REFAZER).toBe(true);
  });
  test("os feeds têm a forma de um RSS 2.0 (prólogo, uma só raiz, itens com título, link, guid, data de e-mail e descrição)", () => {
    // Não há leitor de XML no projeto (e não vale instalar um só para isto): o byte a byte acima já prova que é o feed de hoje, e
    // tools/paginas_ref.py confere cada feed do Python com um leitor de XML de verdade (xml.etree) antes de gravar a referência.
    for (const lang of ["en", "pt"]) {
      const xml = readFileSync(join(dist, lang, "feed.xml"), "utf8");
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>')).toBe(true);
      expect(xml.endsWith("</channel></rss>")).toBe(true);
      const itens = [...xml.matchAll(/<item>(.*?)<\/item>/g)].map((m) => m[1] ?? "");
      expect(itens.length).toBeGreaterThan(5);
      expect(itens.length).toBeLessThanOrEqual(30);
      for (const item of itens) {
        expect(item).toMatch(new RegExp(`^<title>[^<>]*</title><link>https://hatecycle\\.com/${lang}/[a-z0-9/-]+/</link><guid>https://hatecycle\\.com/${lang}/[a-z0-9/-]+/</guid><pubDate>[A-Z][a-z]{2}, \\d{2} [A-Z][a-z]{2} \\d{4} 00:00:00 \\+0000</pubDate><description>[^<>]*</description>$`));
      }
    }
  });
});

describe("sitemap.xml", () => {
  const RE_NOINDEX = /<meta name="robots" content="noindex, nofollow"\s*\/?>/;
  /** O que o sitemap deve listar numa construção: todas as páginas, menos a raiz, a 404, os redirects, as noindex e o /dev/. */
  function esperadas(pasta: string): string[] {
    const baseDeRedirects = new Set(arquivosDe(pasta).filter((a) => /^[^/]+\.html$/.test(a) && a !== "404.html" && a !== "index.html"));
    return arquivosDe(pasta)
      .filter((a) => a.endsWith(".html") && a !== "index.html" && a !== "404.html" && !baseDeRedirects.has(a) && !a.startsWith("dev/"))
      .filter((a) => !RE_NOINDEX.test(readFileSync(join(pasta, a), "utf8")))
      .map((a) => "https://hatecycle.com" + enderecoDoHtml(a))
      .sort();
  }
  function listadas(pasta: string): string[] {
    const xml = readFileSync(join(pasta, "sitemap.xml"), "utf8");
    // o formato inteiro, linha por linha (sitemaps.org): prólogo, <urlset> e um <url><loc> por endereço, sem "&" ou "<" soltos
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n(  <url><loc>https:\/\/hatecycle\.com\/[^<>&"' ]*<\/loc><\/url>\n)+<\/urlset>\n$/);
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1] ?? "").sort();
  }
  test("lista as páginas publicadas e indexáveis do site (e só elas), com endereço absoluto", () => {
    expect(listadas(dist)).toEqual(esperadas(dist));
    expect(listadas(dist).length).toBeGreaterThan(150);
  });
  test("não lista a raiz, a 404, os redirects do site antigo nem os capítulos noindex (Ossos do Ofício)", () => {
    const l = listadas(dist);
    for (const fora of ["https://hatecycle.com/", "https://hatecycle.com/404.html", "https://hatecycle.com/PT.html", "https://hatecycle.com/en/works/all-in-a-nights-work/01/"]) expect(l, fora).not.toContain(fora);
    expect(l).toContain("https://hatecycle.com/en/");
    expect(l).toContain("https://hatecycle.com/pt/about/");
    expect(new Set(l).size, "endereços repetidos").toBe(l.length);
  });
  test("com rascunhos e Extras ligados, o sitemap também acompanha o site (Apoio, Universo, Personagens)", () => {
    const outra = segundaConstrucao();
    expect(listadas(outra)).toEqual(esperadas(outra));
    expect(listadas(outra)).toContain("https://hatecycle.com/pt/characters/harry/");
    expect(listadas(outra)).toContain("https://hatecycle.com/en/support/");
  }, 240_000);
});

describe("o site INTEIRO com rascunhos e Extras ligados (o que o autor verá se ligar show_extras) = build.py com DRAFTS=True e show_extras=True", () => {
  const c = t14.construcao_com_rascunhos_e_extras;
  const outra = () => segundaConstrucao();
  /** As chaves do Supabase do autor viram os marcadores da referência (antes, confere que são as do config.json). */
  const lerComMarcadores = (arquivo: string): string => {
    const r = comMarcadores(astroComoNoPython(semBlocoDeOrdem(readFileSync(arquivo, "utf8")).html), { url: "__SUPABASE_URL__", key: "__SUPABASE_ANON_KEY__" });
    if (!r.conferem) throw new Error(`${arquivo}: a URL ou a chave do window.HC não são as do config.json`);
    return r.html;
  };
  const miolo = (html: string) => /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? "";
  const cabecalho = (html: string) => /<header class="site-header"[^>]*>[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";

  test("as mesmas páginas (nenhuma a mais, nenhuma a menos; fora o /dev/ da prévia)", () => {
    const dir = outra();
    const doAstro = arquivosDe(dir).filter((a) => a.endsWith(".html") && !a.startsWith("dev/")).map(enderecoDoHtml).filter((u) => /^\/(en|pt)\//.test(u)).sort();
    expect(doAstro, REFAZER).toEqual([...Object.keys(c.paginas), ...Object.keys(c.partes)].sort());
  }, 240_000);

  test.each(Object.keys(c.paginas))("página do grupo t14 %s: <head>, <main>, runas, cabeçalho e rodapé", (url) => {
    const py = lerPagina(pythonComoNoAstro(semScriptsAntigosDosComentarios(c.paginas[url] ?? "").html));
    const astro = lerPagina(trocarCanalDoYoutube(url, lerComMarcadores(join(outra(), url.slice(1), "index.html"))));
    expect(astro.cabeca.titulo).toBe(py.cabeca.titulo);
    expect(astro.cabeca.metas).toEqual(py.cabeca.metas);
    expect(astro.cabeca.links).toEqual(py.cabeca.links);
    expect(astro.main).toBe(py.main);
    expect(astro.runas).toBe(py.runas);
    expect(astro.cabecalho).toBe(py.cabecalho);
    expect(astro.classeDoCorpo).toBe(py.classeDoCorpo);
    expect(semAno(astro.rodape)).toBe(semAno(py.rodape));
  }, 240_000);

  test("sanidade da referência: com Extras ligados o cabeçalho do Python traz Universo, Personagens e Apoio", () => {
    const h = c.partes["/en/"]?.header ?? "";
    expect(h).toContain('href="/en/universe/"');
    expect(h).toContain('href="/en/characters/"');
    expect(h).toContain('href="/en/support/"');
  });

  const outras = Object.keys(c.partes);
  test("o cabeçalho (menu com Extras e Apoio) e o <main> de todas as outras páginas", () => {
    const dir = outra();
    const diferentes: string[] = [];
    for (const url of outras) {
      const py = c.partes[url];
      if (!py) continue;
      const html = lerComMarcadores(join(dir, url.slice(1), "index.html"));
      if (canonicoDoMiolo(cabecalho(html)) !== canonicoDoMiolo(py.header)) diferentes.push(`${url} (cabeçalho)`);
      if (canonicoDoMiolo(miolo(html)) !== canonicoDoMiolo(pythonComoNoAstro(semScriptsAntigosDosComentarios(py.main).html))) diferentes.push(`${url} (<main>)`);
    }
    expect(diferentes, `${outras.length} páginas conferidas`).toEqual([]);
  }, 240_000);
});

// ───────────── T15: o script dos comentários (empacotado, com o @supabase/supabase-js de versão fixa) ─────────────

describe("T15: o script dos comentários só nas páginas com comentários, sem CDN e sem as chaves dentro", () => {
  const RE_CAIXA = /<section class="hc-comments" data-page="/;
  const srcDe = (script: string) => /src="([^"]+)"/.exec(script)?.[1] ?? "";
  /** Os arquivos JS de /_astro/ que um HTML carrega (<script src> e import dentro de <script type="module"> inline), e o que eles importam. */
  function jsCarregados(html: string): Set<string> {
    const achados = new Set<string>();
    const fila = [...html.matchAll(/<script\b[^>]*\bsrc="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1] ?? "");
    for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) for (const i of (m[1] ?? "").matchAll(/["'](\/_astro\/[^"']+\.js)["']/g)) fila.push(i[1] ?? "");
    while (fila.length) {
      const arquivo = fila.shift() ?? "";
      if (achados.has(arquivo)) continue;
      achados.add(arquivo);
      const js = readFileSync(join(dist, arquivo.slice(1)), "utf8");
      for (const i of js.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) fila.push(new URL(i[1] ?? "", `https://x${arquivo}`).pathname);
    }
    return achados;
  }
  const ehSupabase = (arquivo: string) => /@supabase\/supabase-js/.test(readFileSync(join(dist, arquivo.slice(1)), "utf8"));

  test("cada página com a caixa tem o script UMA vez, fora do <main>; nenhuma outra o tem; nenhuma usa o CDN nem o /comments.js", () => {
    let comCaixa = 0;
    for (const [url, arquivo] of paginasDoDist(dist)) {
      const html = readFileSync(arquivo, "utf8");
      const scripts = html.match(RE_SCRIPT_DOS_COMENTARIOS) ?? [];
      const temCaixa = RE_CAIXA.test(html);
      if (temCaixa) comCaixa++;
      expect(scripts.length, url).toBe(temCaixa ? 1 : 0);
      if (temCaixa) expect(html.indexOf(scripts[0] ?? ""), `${url}: o script vai depois do </main>`).toBeGreaterThan(html.indexOf("</main>"));
      expect(html, url).not.toMatch(/cdn\.jsdelivr\.net\/npm\/@supabase|\/comments\.js/);
    }
    expect(comCaixa, "as páginas com comentários (capítulos e notícias)").toBe(Object.keys(JSON.parse(readFileSync(join(RAIZ, "baseline", "comentarios.json"), "utf8")).por_pagina).length);
  });

  test("o pacote: um arquivo só, com o supabase-js dentro e sem a URL nem a chave do config.json", () => {
    const srcs = new Set<string>();
    for (const [, arquivo] of paginasDoDist(dist)) for (const s of readFileSync(arquivo, "utf8").match(RE_SCRIPT_DOS_COMENTARIOS) ?? []) srcs.add(srcDe(s));
    expect(srcs.size).toBe(1);
    const [src] = [...srcs];
    const todos = jsCarregados(`<script type="module" src="${src}"></script>`);
    expect([...todos].some(ehSupabase), "o supabase-js está empacotado no script dos comentários").toBe(true);
    for (const arquivo of todos) {
      const js = readFileSync(join(dist, arquivo.slice(1)), "utf8");
      // sem expect(js).not.toContain(chave): em caso de erro o vitest imprimiria a chave
      const temUrl = temChaves && js.includes(limparUrlDoSupabase(String(chavesDoAutor.supabase_url)));
      const temChave = temChaves && js.includes(pyStrip(String(chavesDoAutor.supabase_anon_key)));
      expect({ arquivo, temUrl, temChave }).toEqual({ arquivo, temUrl: false, temChave: false });
    }
  });

  test("as páginas SEM comentários não carregam o supabase-js (nem por um arquivo importado por outro)", () => {
    for (const [url, arquivo] of paginasDoDist(dist)) {
      const html = readFileSync(arquivo, "utf8");
      if (RE_CAIXA.test(html)) continue;
      expect([...jsCarregados(html)].filter(ehSupabase), url).toEqual([]);
    }
  });

  test("versão fixa: o package.json pede uma versão exata do @supabase/supabase-js, e é ela que está instalada", () => {
    const pacote = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    const pedida = pacote.dependencies["@supabase/supabase-js"] ?? "";
    expect(pedida).toMatch(/^\d+\.\d+\.\d+$/);
    const instalada = (JSON.parse(readFileSync(join(RAIZ, "node_modules", "@supabase", "supabase-js", "package.json"), "utf8")) as { version: string }).version;
    expect(instalada).toBe(pedida);
  });
});

// ───────────── T17c: o bloco "estou lendo em ordem…" no fim dos capítulos ─────────────

describe("T17c/T17l: o bloco de ordem no fim de TODO capítulo e de toda página de obra (e só neles)", () => {
  const ehCapitulo = (url: string) => /^\/(en|pt)\/works\/[^/]+\/[^/]+\/$/.test(url);
  /** A página de uma obra com lista de capítulos (/pt/works/light-and-blood/): desde a T17l também tem o bloco, logo depois da lista. */
  const ehPaginaDeObra = (url: string) => /^\/(en|pt)\/works\/[^/]+\/$/.test(url);
  const temBloco = (url: string) => ehCapitulo(url) || ehPaginaDeObra(url);
  const RE_SCRIPT_DA_ORDEM = /<script type="module">(?:(?!<\/script>)[\s\S])*\[data-story-order\](?:(?!<\/script>)[\s\S])*<\/script>/g;
  /** Os dois lados de cada ordem de um bloco: { chrono: { prev: href|null, next: href|null }, release: … } e o que cada lado diz. */
  function lados(bloco: string) {
    const doDiv = (ordem: string) => new RegExp(`<div class="so-order" data-ordem="${ordem}"(?: hidden)?>([\\s\\S]*?)</div>(?=<div class="so-order"|</section>)`).exec(bloco)?.[1] ?? "";
    const lado = (div: string, qual: "prev" | "next") => {
      const m = new RegExp(`<(a|div) class="so-side ${qual}[^"]*"([^>]*)>([\\s\\S]*?)</\\1>`).exec(div);
      if (!m) return null;
      const href = /href="([^"]*)"/.exec(m[2] ?? "")?.[1] ?? null;
      const texto = (/<span class="so-label">([^<]*)/.exec(m[3] ?? "")?.[1] ?? "").replaceAll("&amp;", "&");
      return { href, texto, externo: /target="_blank"/.test(m[2] ?? "") };
    };
    return Object.fromEntries(["chrono", "release"].map((o) => [o, { prev: lado(doDiv(o), "prev"), next: lado(doDiv(o), "next") }])) as Record<"chrono" | "release", { prev: ReturnType<typeof lado>; next: ReturnType<typeof lado> }>;
  }
  function verificarPaginas(pasta: string) {
    const capitulos: string[] = [];
    for (const [url, arquivo] of paginasDoDist(pasta)) {
      const html = readFileSync(arquivo, "utf8");
      const r = semBlocoDeOrdem(html);
      const scripts = html.match(RE_SCRIPT_DA_ORDEM) ?? [];
      if (!temBloco(url)) {
        expect(r.removidos, `${url}: bloco fora de capítulo e de página de obra`).toEqual([]);
        expect(scripts, `${url}: script da ordem fora de capítulo e de página de obra`).toEqual([]);
        continue;
      }
      capitulos.push(url);
      expect(r.removidos, `${url}: exatamente 1 bloco`).toHaveLength(1);
      expect(r.filhasDiretasDoMain, `${url}: o bloco é filho direto do <main>`).toEqual([true]);
      if (ehCapitulo(url)) {
        // entre a caixa do capítulo e a caixa (fina) dos comentários
        expect(html, url).toMatch(/<\/div>\s*<section class="reader-box paper story-order"[\s\S]*?<\/section>\s*<div class="reader-box paper slim">/);
      } else {
        // T17l: logo depois da lista de capítulos, e é a última coisa do <main>
        expect(html, url).toMatch(/<ol class="chapter-list">[\s\S]*?<\/ol><\/section>\s*<section class="reader-box paper story-order"[\s\S]*?<\/section>\s*<\/main>/);
      }
      expect(scripts, `${url}: o script do bloco, uma vez`).toHaveLength(1);
      expect(html.indexOf(scripts[0] ?? ""), `${url}: o script vai depois do </main>`).toBeGreaterThan(html.indexOf("</main>"));
      expect(scripts[0], `${url}: o script não leva nada do config.json`).not.toMatch(/supabase|window\.HC|anon/i);
      // os comentários continuam os mesmos: a sua própria caixa, uma vez (ID = o da página), e o bloco não tem nenhum
      expect(r.removidos[0], url).not.toMatch(/data-page|hc-comments|<script/);
      // T17h: nada de "Em breve" no bloco (história sem nada lançado é pulada)
      expect(r.removidos[0], `${url}: sem "Em breve"`).not.toMatch(/so-soon|Em breve|Coming soon/);
      // todas as imagens do bloco passam pelo caminho das imagens (T17): src original + srcset/sizes/width/height, carregamento preguiçoso
      for (const img of r.removidos[0]?.match(/<img\b[^>]*>/g) ?? []) {
        expect(img, `${url}: ${img}`).toMatch(/ srcset="[^"]+" /);
        expect(img, url).toMatch(/ sizes="[^"]+"/);
        expect(img, url).toMatch(/ width="\d+"/);
        expect(img, url).toMatch(/ height="\d+"/);
        expect(img, url).toMatch(/ loading="lazy"/);
        expect(img, url).toMatch(/ alt=""/);
      }
    }
    return capitulos.sort();
  }
  const blocoDe = (pasta: string, url: string) => semBlocoDeOrdem(readFileSync(paginasDoDist(pasta).get(url) ?? "", "utf8")).removidos[0] ?? "";

  test("site publicado: todo capítulo e a página de Luz & Sangue têm o bloco (1), nenhuma outra página tem", () => {
    const capitulos = verificarPaginas(dist);
    expect(capitulos).toEqual(["/en/works/firestriker/01/", "/en/works/light-and-blood/", "/en/works/light-and-blood/01/", "/en/works/light-and-blood/02/", "/pt/works/firestriker/01/", "/pt/works/light-and-blood/", "/pt/works/light-and-blood/01/", "/pt/works/light-and-blood/02/"]);
    // na página da obra a "história atual" é a da página: Luz & Sangue (estou ASSISTINDO), antes dela a Pederneira no lançamento
    const obra = lados(blocoDe(dist, "/pt/works/light-and-blood/"));
    expect(blocoDe(dist, "/pt/works/light-and-blood/")).toContain("estou assistindo em ordem");
    expect(obra.release.prev).toEqual({ href: "/pt/works/firestriker/01/", texto: "Ler Pederneira", externo: false });
    expect(obra.chrono.next).toEqual({ href: "/pt/works/firestriker/01/", texto: "Ler Pederneira", externo: false });
    expect(lados(blocoDe(dist, "/pt/works/light-and-blood/"))).toEqual(lados(blocoDe(dist, "/pt/works/light-and-blood/01/")));
  });

  test("site publicado, Pederneira (PDF do autor): cronológica → antes Luz & Sangue, depois NINGUÉM; lançamento → antes Alô?, depois Luz & Sangue", () => {
    const l = lados(blocoDe(dist, "/pt/works/firestriker/01/"));
    // T17l: Luz & Sangue tem dois episódios → a página da obra (a lista), dos dois lados
    expect(l.chrono.prev).toEqual({ href: "/pt/works/light-and-blood/", texto: "Assistir Luz & Sangue", externo: false });
    expect(l.chrono.next).toBeNull();
    expect(l.release.prev?.externo).toBe(true);
    expect(l.release.prev?.href).toMatch(/^https:\/\//);
    expect(l.release.prev?.texto).toMatch(/^Assistir /);
    expect(l.release.next).toEqual({ href: "/pt/works/light-and-blood/", texto: "Assistir Luz & Sangue", externo: false });
    expect(blocoDe(dist, "/pt/works/firestriker/01/")).toContain("estou lendo em ordem");
    expect(blocoDe(dist, "/pt/works/light-and-blood/02/")).toContain("estou assistindo em ordem");
  });

  test("site publicado: a obra de rascunho não aparece em lado nenhum (nem Beira de Estrada, nem O Pêndulo, nem Ossos do Ofício)", () => {
    for (const url of ["/pt/works/firestriker/01/", "/en/works/firestriker/01/", "/pt/works/light-and-blood/01/", "/en/works/light-and-blood/02/"]) {
      expect(blocoDe(dist, url), url).not.toMatch(/Beira de Estrada|Roadside|P[eê]ndulo|Pendulum|Ossos|All in a Night|roadside|the-pendulum|all-in-a-nights-work/);
    }
  });

  test("site publicado, em TODO capítulo e página de obra (T17l): link externo = o do cartão de Histórias; senão, a página da obra (2+ capítulos) ou o capítulo (1)", () => {
    const paginas = paginasDoDist(dist);
    for (const lang of ["pt", "en"] as const) {
      const historias = readFileSync(paginas.get(`/${lang}/works/`) ?? "", "utf8");
      const botoes = new Set([...historias.matchAll(/<a class="button" href="([^"]+)"/g)].map((m) => m[1]));
      for (const url of [...paginas.keys()].filter((u) => temBloco(u) && u.startsWith(`/${lang}/`))) {
        const l = lados(blocoDe(dist, url));
        for (const o of ["chrono", "release"] as const) {
          for (const qual of ["prev", "next"] as const) {
            const lado = l[o][qual];
            if (!lado?.href) continue;
            if (lado.externo) {
              expect(botoes.has(lado.href), `${url} ${o} ${qual}: o externo é o do cartão`).toBe(true);
              continue;
            }
            expect(paginas.has(lado.href), `${lado.href} existe no site`).toBe(true);
            const obra = /^\/(en|pt)\/works\/([^/]+)\//.exec(lado.href)?.[2] ?? "";
            const capitulosDaObra = [...paginas.keys()].filter((u) => u.startsWith(`/${lang}/works/${obra}/`) && ehCapitulo(u)).sort();
            // a página da obra quando ela tem mais de um capítulo; o capítulo quando tem um só (os dois lados levam ao mesmo lugar)
            expect(lado.href, `${url} ${o} ${qual}`).toBe(capitulosDaObra.length > 1 ? `/${lang}/works/${obra}/` : capitulosDaObra[0]);
          }
        }
      }
    }
    expect(lados(blocoDe(dist, "/en/works/firestriker/01/")).chrono.prev?.href).toBe("/en/works/light-and-blood/");
    expect(lados(blocoDe(dist, "/en/works/firestriker/01/")).release.next?.href).toBe("/en/works/light-and-blood/");
    expect(lados(blocoDe(dist, "/pt/works/light-and-blood/02/")).chrono.next?.href).toBe("/pt/works/firestriker/01/");
    expect(lados(blocoDe(dist, "/pt/works/light-and-blood/01/")).release.prev?.href).toBe("/pt/works/firestriker/01/");
  });

  test("site publicado: a arte em camadas (T17h) de Luz & Sangue, Pederneira e Alô? aparece, de trás para a frente, com as versões leves", () => {
    const camadas = (bloco: string, ordem: "chrono" | "release", lado: "prev" | "next") => {
      const div = new RegExp(`<div class="so-order" data-ordem="${ordem}"(?: hidden)?>([\\s\\S]*?)</div>(?=<div class="so-order"|</section>)`).exec(bloco)?.[1] ?? "";
      const a = new RegExp(`<a class="so-side ${lado}[^"]*"[^>]*>([\\s\\S]*?)</a>`).exec(div)?.[1] ?? "";
      return { tela: /<span class="so-art so-layers"><span class="so-stage[^"]*" style="--ar:([^;"]+);--razao:[\d.]+">/.exec(a)?.[1] ?? null, imgs: [...a.matchAll(/<img class="so-layer[^"]*" src="\/ordem\/([^"/]+?)%20Site%20Cronologia\.png"/g)].map((m) => decodeURIComponent(m[1] ?? "")), tags: a.match(/<img\b[^>]*>/g) ?? [], sobImgs: (a.match(/so-img/g) ?? []).length };
    };
    const ped = blocoDe(dist, "/pt/works/firestriker/01/");
    const lb = camadas(ped, "chrono", "prev"); // Luz & Sangue
    expect(lb.tela).toBe("2087 / 1752");
    expect(lb.imgs).toEqual(["John", "Oliver", "Ellie"]); // Ellie na frente
    expect(lb.sobImgs).toBe(0);
    const hd = camadas(ped, "release", "prev"); // Alô? Residência dos Di Vario
    expect(hd.tela).toBe("627 / 600");
    expect(hd.imgs).toEqual(["Lucas", "Wellersson"]);
    const pd = camadas(blocoDe(dist, "/pt/works/light-and-blood/01/"), "release", "prev"); // Pederneira
    expect(pd.tela).toBe("2002 / 2023");
    expect(pd.imgs).toEqual(["Thymorr", "Harry", "Olivia"]);
    expect(pd.tags[0]).toContain("so-surge"); // o Thymorr surge
    expect(pd.tags[0]).toContain("--o:0");
    // todas as camadas maiores que 240 px têm versões leves (WebP); o John (216 px) passa pelo mesmo caminho, só que sem versões maiores que ele
    for (const tag of [...lb.tags, ...hd.tags, ...pd.tags]) expect(tag).toMatch(/ srcset="[^"]+\.webp[^"]*"/);
  });

  test("prévia (rascunhos, T17d/T17l): Beira de Estrada entra na fila; O Pêndulo e Cat-Crow-Thing, sem arte para a caixa, são pulados; Ossos em português leva ao inglês", () => {
    const dir = segundaConstrucao();
    const capitulos = verificarPaginas(dir);
    for (const c of ["/pt/works/roadside/", "/pt/works/roadside/01/", "/pt/works/roadside/02/", "/en/works/roadside/01/", "/pt/works/the-pendulum/01/", "/en/works/the-pendulum/01/", "/pt/works/cat-crow-thing/01/", "/en/works/cat-crow-thing/01/"]) expect(capitulos, c).toContain(c);
    // Pederneira (cronológica 6): antes Luz & Sangue, depois Beira de Estrada (7); as duas com dois capítulos → a página da obra (T17l)
    const ped = lados(blocoDe(dir, "/pt/works/firestriker/01/"));
    expect(ped.chrono.prev).toEqual({ href: "/pt/works/light-and-blood/", texto: "Assistir Luz & Sangue", externo: false });
    expect(ped.chrono.next).toEqual({ href: "/pt/works/roadside/", texto: "Ler Beira de Estrada", externo: false });
    expect(ped.release.next?.texto).toBe("Assistir Luz & Sangue");
    // Beira de Estrada (quadrinho: "estou lendo"), nos capítulos e na página da obra: cronológica Pederneira ← → (O Pêndulo e Cat-Crow-Thing,
    // sem arte, pulados) ninguém; lançamento (5): Ossos do Ofício (4; em português leva ao capítulo em inglês, T17l) ← → ninguém
    for (const url of ["/pt/works/roadside/01/", "/pt/works/roadside/02/", "/pt/works/roadside/"]) {
      const bloco = blocoDe(dir, url);
      expect(bloco, url).toContain("estou lendo em ordem");
      const l = lados(bloco);
      expect(l.chrono.prev, url).toEqual({ href: "/pt/works/firestriker/01/", texto: "Ler Pederneira", externo: false });
      expect(l.chrono.next, url).toBeNull();
      expect(l.release.prev, url).toEqual({ href: "/en/works/all-in-a-nights-work/01/", texto: "Ler Ossos do Ofício", externo: false });
      expect(l.release.next, url).toBeNull();
      expect(bloco, url).toContain('<a class="so-side prev" href="/en/works/all-in-a-nights-work/01/" hreflang="en">');
    }
    expect(lados(blocoDe(dir, "/en/works/roadside/01/")).release.prev).toEqual({ href: "/en/works/all-in-a-nights-work/01/", texto: "Read All in a Night&#39;s Work", externo: false });
    expect(blocoDe(dir, "/en/works/roadside/01/")).not.toContain("hreflang");
    // O Pêndulo (vídeo: "estou assistindo") e Cat-Crow-Thing (jogo: "estou jogando") ainda TÊM o bloco; antes deles, a Beira de Estrada
    const pen = blocoDe(dir, "/pt/works/the-pendulum/01/");
    expect(pen).toContain("estou assistindo em ordem");
    for (const lang of ["pt", "en"] as const) {
      const cct = blocoDe(dir, `/${lang}/works/cat-crow-thing/01/`);
      expect(cct).toContain(lang === "pt" ? "estou jogando em ordem" : "I’m playing in");
      for (const bloco of [cct, blocoDe(dir, `/${lang}/works/the-pendulum/01/`)]) {
        for (const o of ["chrono", "release"] as const) {
          expect(lados(bloco)[o].prev?.href).toBe(`/${lang}/works/roadside/`);
          expect(lados(bloco)[o].next).toBeNull();
        }
      }
    }
    // em NENHUM bloco da prévia aparecem O Pêndulo ou Cat-Crow-Thing (sem order_art nem order_images), nem "Em breve"
    for (const url of capitulos) {
      expect(blocoDe(dir, url), url).not.toMatch(/Coming soon|Em breve/);
      for (const o of ["chrono", "release"] as const) for (const q of ["prev", "next"] as const) expect(lados(blocoDe(dir, url))[o][q]?.href ?? "", url).not.toMatch(/the-pendulum|cat-crow-thing/);
    }
    // Ossos do Ofício (rascunho; capítulo só em inglês) com a arte em camadas: asas, Giuseppe, olhos; tela quadrada; as asas saem da moldura (T17l)
    for (const url of ["/en/works/light-and-blood/01/", "/pt/works/light-and-blood/01/"]) {
      const ossos = /<a class="so-side prev[^"]*" href="\/en\/works\/all-in-a-nights-work\/01\/"[^>]*>([\s\S]*?)<\/a>/.exec(blocoDe(dir, url))?.[1] ?? "";
      expect([...ossos.matchAll(/<img class="(so-layer[^"]*)" src="\/ordem\/([^"]+?)%20Site%20Cronologia\.png"/g)].map((m) => `${decodeURIComponent(m[2] ?? "")}:${m[1]}`), url).toEqual(["Giuseppe Asas:so-layer so-surge", "Giuseppe:so-layer", "Giuseppe Olhos:so-layer so-surge"]);
      expect(ossos, url).toContain('<span class="so-art so-layers so-sangra"><span class="so-stage so-tem-surge" style="--ar:1000 / 1000;--razao:1">');
    }
    // a arte em camadas da Beira de Estrada (Jean, Cezar e Iris, os olhos da Iris)
    const beira = /<a class="so-side next[^"]*" href="\/pt\/works\/roadside\/">([\s\S]*?)<\/a>/.exec(blocoDe(dir, "/pt/works/firestriker/01/"))?.[1] ?? "";
    expect([...beira.matchAll(/<img class="so-layer[^"]*" src="\/ordem\/([^"]+?)%20Site%20Cronologia\.png"/g)].map((m) => decodeURIComponent(m[1] ?? ""))).toEqual(["Jean", "Cezar e Iris", "Iris Olhos"]);
  }, 240_000);

  test("T17i: em todo capítulo e página de obra (publicado e prévia), as duas ordens têm os dois lugares (lado ou lugar guardado) e a caixa leva os números do rótulo", () => {
    for (const pasta of [dist, segundaConstrucao()]) {
      for (const url of [...paginasDoDist(pasta).keys()].filter(temBloco)) {
        const bloco = blocoDe(pasta, url);
        expect(bloco, url).toMatch(/^<section class="reader-box paper story-order" data-story-order data-ordem="chrono" aria-labelledby="story-order-title" style="--so-em:[\d.]+;--so-em-1:[\d.]+">/);
        for (const div of bloco.split('<div class="so-order"').slice(1)) expect((div.match(/class="so-(side|lugar) (prev|next)/g) ?? []).length, url).toBe(2);
        // toda <img> de camada leva o próprio sizes (a fração da moldura que ocupa) antes das versões leves
        for (const img of bloco.match(/<img class="so-layer[^>]*>/g) ?? []) expect(img, url).toMatch(/ sizes="\(max-width: 700px\) [\d.]+vw, \d+px" srcset="/);
      }
    }
  }, 240_000);
});

// ───────────── T17d: Beira de Estrada (leitor página a página), O Pêndulo (vídeo provisório) e Cat-Crow-Thing (página de jogo) ─────────────

describe("T17d: as três obras novas só existem na prévia; o leitor página a página, o vídeo e a página de jogo no site de verdade", () => {
  const NOVAS = /works\/(roadside|the-pendulum|cat-crow-thing)\b|Cat-Crow-Thing|comics\/provisorio|logo%20steam|data-folheador|data-jogo|fl-runa/;

  test("site publicado: nada delas em NENHUM arquivo (páginas, Histórias, home, sitemap, feeds); nenhum <script src> de fora além dos scripts oficiais dos posts (T17m)", () => {
    const oficiais = ["https://platform.x.com/widgets.js", "https://embed.reddit.com/widgets.js", "//www.instagram.com/embed.js"]; // os --permitir do deploy.yml (tests/scripts-de-fora.test.ts)
    for (const arquivo of arquivosDe(dist).filter((a) => /\.(html|xml)$/.test(a))) {
      const texto = readFileSync(join(dist, arquivo), "utf8");
      expect(NOVAS.test(texto), arquivo).toBe(false);
      for (const m of texto.matchAll(/<script\b[^>]*\bsrc="((?:https?:)?\/\/[^"]*)"/g)) expect(oficiais, arquivo).toContain(m[1]);
    }
    expect(arquivosDe(dist).filter((a) => a.endsWith(".html"))).toHaveLength(197); // as 193 de baseline/urls.json + as 4 páginas antigas de static/ (B35)
  });

  test("prévia: a página da Beira de Estrada lista os dois capítulos (como Luz & Sangue); os cartões levam a ela, ao Pêndulo e ao jogo", () => {
    const dir = segundaConstrucao();
    for (const lang of ["pt", "en"] as const) {
      const obra = readFileSync(join(dir, lang, "works", "roadside", "index.html"), "utf8");
      expect([...obra.matchAll(/<li><a href="(\/[a-z]{2}\/works\/roadside\/\d+\/)"><span class="n">(\d+)<\/span><span class="t">([^<]+)<\/span>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`)).toEqual([
        // T17l: os títulos que o autor mandou (22/10)
        `/${lang}/works/roadside/01/ 1 ${lang === "pt" ? "A Garotinha dos Olhos Vermelhos" : "The Little Girl with Red Eyes"}`,
        `/${lang}/works/roadside/02/ 2 ${lang === "pt" ? "Procurando um lugar seguro" : "Finding a safe place"}`,
      ]);
      const historias = readFileSync(join(dir, lang, "works", "index.html"), "utf8");
      for (const href of [`/${lang}/works/roadside/`, `/${lang}/works/the-pendulum/01/`, `/${lang}/works/cat-crow-thing/01/`]) expect(historias, href).toContain(`<a class="button" href="${href}"`);
      expect(historias).toContain(lang === "pt" ? ">Jogue aqui</a>" : ">Play here</a>");
    }
  }, 240_000);

  test("prévia: cada capítulo da Beira de Estrada tem o leitor página a página com as Oito Runas d'A Força, e o ID dos comentários de sempre", () => {
    const dir = segundaConstrucao();
    for (const lang of ["pt", "en"] as const) {
      for (const cap of ["01", "02"]) {
        const url = `/${lang}/works/roadside/${cap}/`;
        const html = readFileSync(join(dir, url.slice(1), "index.html"), "utf8");
        expect(html.match(/<div class="folheador" data-folheador data-total="8">/g), url).toHaveLength(1);
        const runas = [...html.matchAll(/<a class="fl-runa" href="#p(\d)"[^>]*?( aria-current="page")?><span aria-hidden="true">([^<]+)<\/span><\/a>/g)];
        expect(runas.map((m) => m[3]).join(" "), url).toBe("ᚣ 弓 ♐︎ ᚸ エ ꑭ ⼒ Ⱝ");
        expect(runas.map((m) => !!m[2]), url).toEqual([true, false, false, false, false, false, false, false]);
        // as 8 páginas provisórias, na ordem, com as versões leves (T17) nas que pesam mais de 30 KB
        const imgs = [...(/<div class="comic">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "").matchAll(/<img src="\/comics\/provisorio\/pagina%20placeholder%20(\d)\.png"/g)].map((m) => m[1]);
        expect(imgs, url).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
        expect(idsDeComentarios(html), url).toEqual([`works/roadside/${cap}`]);
        // as setas no estado da página 1: no 01, a da esquerda some (primeiro capítulo); no 02, leva à 8ª do 01; a da direita vai à página 2
        expect(html, url).toContain(`<a class="side-btn next fl-seta" href="#p2"`);
        if (cap === "01") expect(html, url).toContain('<a class="side-btn prev fl-seta ghost" aria-hidden="true"');
        else expect(html, url).toContain(`<a class="side-btn prev fl-seta" href="/${lang}/works/roadside/01/#p8"`);
        expect(html, url).toContain(cap === "01" ? `data-capitulo="/${lang}/works/roadside/02/#p1"` : `data-rotulo-pagina="${lang === "pt" ? "Próxima página" : "Next page"}">`);
        expect(html.match(/<script type="module">(?:(?!<\/script>)[\s\S])*\[data-folheador\](?:(?!<\/script>)[\s\S])*<\/script>/g), `${url}: o script do leitor, uma vez`).toHaveLength(1);
      }
    }
  }, 240_000);

  test("prévia: o leitor página a página (HTML e script) e a janela do jogo só nas páginas delas", () => {
    const dir = segundaConstrucao();
    for (const [url, arquivo] of paginasDoDist(dir)) {
      const html = readFileSync(arquivo, "utf8");
      expect(/data-folheador/.test(html), url).toBe(/^\/(en|pt)\/works\/roadside\/\d+\/$/.test(url));
      expect(/data-jogo/.test(html), url).toBe(/^\/(en|pt)\/works\/cat-crow-thing\/01\/$/.test(url));
    }
  }, 240_000);

  test("prévia: O Pêndulo mostra o vídeo provisório (iframe do YouTube, como Luz & Sangue); Cat-Crow-Thing, a janela da demo e o botão da Steam", () => {
    const dir = segundaConstrucao();
    for (const lang of ["pt", "en"] as const) {
      const pen = readFileSync(join(dir, lang, "works", "the-pendulum", "01", "index.html"), "utf8");
      expect(pen).toContain(`<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/J2j6xoIz0LE" allowfullscreen title="${lang === "pt" ? "O Pêndulo" : "The Pendulum"}"></iframe></div>`);
      expect(idsDeComentarios(pen)).toEqual(["works/the-pendulum/01"]);
      const cct = readFileSync(join(dir, lang, "works", "cat-crow-thing", "01", "index.html"), "utf8");
      expect(cct.match(/<div class="jogo" data-jogo>/g)).toHaveLength(1);
      expect(cct).toContain('<div class="jogo-tela vazia" role="img"');
      expect(cct).not.toMatch(/<div class="jogo"[^]*?<iframe/);
      expect(cct).toMatch(new RegExp(`<span class="steam-btn sem-link" role="link" aria-disabled="true" aria-describedby="jogo-link-em-breve"><img class="steam-logo" src="/social/logo%20steam.png" alt=""[^>]*><span>${lang === "pt" ? "Adicione à Wishlist" : "Wishlist on Steam"}</span></span>`));
      expect(idsDeComentarios(cct)).toEqual(["works/cat-crow-thing/01"]);
    }
  }, 240_000);
});

// ───────────── T17h: o canal do YouTube por idioma ─────────────

describe("T17h: o ícone do YouTube do rodapé leva ao canal do idioma em TODAS as páginas; o Apoio (PT) leva ao canal pessoal", () => {
  const paginas = () => [...paginasDoDist(dist)].filter(([url]) => url !== "/404.html");
  const rodapeDe = (html: string) => /<footer\b[\s\S]*?<\/footer>/.exec(html)?.[0] ?? "";
  const doYoutube = (html: string) => [...rodapeDe(html).matchAll(/<a href="([^"]+)"[^>]*title="YouTube"/g)].map((m) => m[1]);

  test("/en/… → @HateCycleEn e /pt/… → @HateCycleBR, uma vez por página, e nenhum link antigo (@HateCycle) sobra no site", () => {
    let n = 0;
    for (const [url, arquivo] of paginas()) {
      const html = readFileSync(arquivo, "utf8");
      const lang = /^\/(en|pt)\//.exec(url)?.[1];
      if (!lang) continue; // a raiz (redireciona) e os redirects antigos não têm rodapé
      expect(doYoutube(html), url).toEqual([lang === "en" ? "https://www.youtube.com/@HateCycleEn" : "https://www.youtube.com/@HateCycleBR"]);
      expect(html, `${url}: link antigo do canal`).not.toMatch(/youtube\.com\/@HateCycle(?![A-Za-z])/);
      n += 1;
    }
    expect(n).toBeGreaterThan(100);
  });

  test("a página Apoio em português leva ao canal pessoal do autor (e só ela fala dele)", () => {
    const html = readFileSync(paginasDoDist(dist).get("/pt/support/") ?? "", "utf8");
    // desde 22/10 o link é o banner do canal (static/support/banner.png), como o do Catarse
    expect(html).toMatch(/<a href="https:\/\/www\.youtube\.com\/@LuscaSharktopus" target="_blank" rel="noopener"><img src="\/support\/banner\.png" alt="Inscreva-se no canal Lusca Sharktopus no YouTube"[^>]*><\/a>/);
    expect(html).not.toMatch(/youtube\.com\/@HateCycle(?![A-Za-z])/);
  });

  test("a exceção de paridade troca só o href do ícone do rodapé (outro canal, outro idioma ou outra forma de <a> não passam)", () => {
    const icone = (canal: string) => `<a href="https://www.youtube.com/@HateCycle${canal}" target="_blank" rel="noopener" title="YouTube">`;
    expect(canalDoYoutubeComoNoPython(icone("En"), "en")).toEqual({ html: icone(""), trocados: 1, errados: 0 });
    expect(canalDoYoutubeComoNoPython(icone("BR"), "pt")).toEqual({ html: icone(""), trocados: 1, errados: 0 });
    // como o Astro de fato escreve a tag (o atributo do estilo do componente vem depois do title)
    const comCid = '<a href="https://www.youtube.com/@HateCycleEn" target="_blank" rel="noopener" title="YouTube" data-astro-cid-jo6i4kqk>';
    expect(canalDoYoutubeComoNoPython(comCid, "en")).toEqual({ html: comCid.replace("@HateCycleEn", "@HateCycle"), trocados: 1, errados: 0 });
    expect(canalDoYoutubeComoNoPython(icone("BR"), "en")).toEqual({ html: icone("BR"), trocados: 0, errados: 1 });
    expect(canalDoYoutubeComoNoPython(icone("En"), "pt").errados).toBe(1);
    const outros = '<a href="https://www.youtube.com/@HateCycleEn">x</a><a href="https://www.youtube.com/@ResidenciaDosDiVario" target="_blank" rel="noopener" title="YouTube">y</a><a href="https://www.youtube.com/@HateCycleEn" title="YouTube" target="_blank" rel="noopener">z</a>';
    expect(canalDoYoutubeComoNoPython(outros, "en")).toEqual({ html: outros, trocados: 0, errados: 0 });
  });
});

test("o dist/ existe", () => {
  expect(existsSync(dist)).toBe(true);
});
