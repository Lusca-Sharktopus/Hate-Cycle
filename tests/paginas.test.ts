// Prova de que as PÁGINAS do site Astro (T11 em diante) saem iguais às do site Python, página a página.
//
// A referência de cada grupo (tests/fixtures/paginas-<grupo>-python.json: t11 = home, Histórias e página de obra;
// t12 = capítulos) é o HTML completo que o build.py gera, tirado por
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
// Atalho para iterar: `HC_DIST=dist pnpm vitest run paginas` usa um dist/ já construído em vez de construir de novo.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { limparUrlDoSupabase } from "../src/lib/comentarios";
import { pyStrip } from "../src/lib/frontmatter";
import { idsDeComentarios, lerPagina, type PaginaLida } from "./ajudantes/html";

interface Referencia {
  python: string;
  grupo: string;
  escopo: string;
  paginas: Record<string, string>;
  marcadores?: { url: string; key: string };
}
/** Os grupos de páginas já migrados. A T13 (notícias) e a T14 acrescentam os seus aqui (e em GRUPOS de tools/paginas_ref.py). */
const GRUPOS = ["t11", "t12"] as const;
const refs: Referencia[] = GRUPOS.map((g) => JSON.parse(readFileSync(new URL(`./fixtures/paginas-${g}-python.json`, import.meta.url), "utf8")));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

let dist = process.env["HC_DIST"] ? join(RAIZ, process.env["HC_DIST"]) : "";
let pastaTemporaria = "";

/** O vitest põe no ambiente o que espelha o import.meta.env dele (NODE_ENV=test, MODE, DEV=true, PROD, SSR, BASE_URL, SITE…) e
 *  variáveis VITEST*; o build filho herdaria isso e se trataria como "dev" (import.meta.env.DEV = true = COM rascunhos, que
 *  faria o site sair com o link Apoio e a "Prévia"). Aqui o build é sempre o de produção, como o `pnpm build`. */
const DO_VITEST = new Set(["MODE", "DEV", "PROD", "SSR", "TEST", "BASE_URL", "SITE", "ASSETS_PREFIX", "FORCE_TTY"]);
function ambienteDoBuild(saida: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", HC_OUT_DIR: saida };
  for (const chave of Object.keys(env)) if (chave.startsWith("VITEST") || DO_VITEST.has(chave)) delete env[chave];
  return env;
}

beforeAll(() => {
  if (dist) return;
  pastaTemporaria = mkdtempSync(join(tmpdir(), "hc-astro-dist-"));
  const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "astro", "bin", "astro.mjs"), "build"], {
    cwd: RAIZ,
    env: ambienteDoBuild(pastaTemporaria),
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`astro build falhou:\n${r.stdout}\n${r.stderr}`);
  dist = pastaTemporaria;
}, 240_000);
afterAll(() => {
  if (pastaTemporaria) rmSync(pastaTemporaria, { recursive: true, force: true });
});

/** Todas as páginas HTML de uma pasta: endereço (/pt/works/) → caminho do arquivo. */
function paginasDoDist(pasta: string): Map<string, string> {
  const achadas = new Map<string, string>();
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome === "index.html") achadas.set("/" + relative(pasta, caminho).split(sep).slice(0, -1).join("/") + (dir === pasta ? "" : "/"), caminho);
    }
  };
  andar(pasta);
  return achadas;
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
        py = lerPagina(ref.paginas[url] ?? "");
        const arquivo = paginasDoDist(dist).get(url);
        if (!arquivo) throw new Error(`o Astro não gerou ${url}`);
        let html = readFileSync(arquivo, "utf8");
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

test("o dist/ existe", () => {
  expect(existsSync(dist)).toBe(true);
});
