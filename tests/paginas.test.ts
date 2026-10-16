// Prova de que as PÁGINAS do site Astro (T11 em diante) saem iguais às do site Python, página a página.
//
// A referência (tests/fixtures/paginas-t11-python.json) é o HTML completo que o build.py gera, tirado por
//   python3 tools/paginas_ref.py
// O teste constrói o site Astro de verdade (`astro build`, numa pasta temporária) e compara, para CADA página do grupo:
//   - o <head>: título, descrição, og:*, robots, hreflang e alternate (RSS), ícone, fontes, scripts da abertura;
//   - o <main> inteiro: a árvore de tags, os atributos (valores e ordem das classes) e o texto (espaços colapsados);
//   - as runas do fundo (a semente é o endereço da página), a classe do <body>, o cabeçalho e o rodapé.
// Como a comparação é feita (e o que ela ignora de propósito): tests/ajudantes/html.ts. As diferenças técnicas que restam
// (caminhos de CSS/JS do Astro, marcas de escopo) estão listadas e justificadas em docs/aprendendo-astro/07-paginas.md.
//
// Atalho para iterar: `HC_DIST=dist pnpm vitest run paginas` usa um dist/ já construído em vez de construir de novo.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { lerPagina, type PaginaLida } from "./ajudantes/html";

interface Referencia {
  python: string;
  grupo: string;
  escopo: string;
  paginas: Record<string, string>;
}
const ref: Referencia = JSON.parse(readFileSync(new URL("./fixtures/paginas-t11-python.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";
const ESCOPO = new RegExp(ref.escopo);

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

const urls = Object.keys(ref.paginas).sort();

describe("as páginas do grupo existem nos dois sites, e só elas", () => {
  test("mesmos endereços (nenhuma a mais, nenhuma a menos)", () => {
    const doAstro = [...paginasDoDist(dist).keys()].filter((u) => ESCOPO.test(u)).sort();
    expect(doAstro, REFAZER).toEqual(urls);
  });
});

describe.each(urls)("%s", (url) => {
  let py: PaginaLida;
  let astro: PaginaLida;
  beforeAll(() => {
    py = lerPagina(ref.paginas[url] ?? "");
    const arquivo = paginasDoDist(dist).get(url);
    if (!arquivo) throw new Error(`o Astro não gerou ${url}`);
    astro = lerPagina(readFileSync(arquivo, "utf8"));
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

test("o dist/ existe", () => {
  expect(existsSync(dist)).toBe(true);
});
