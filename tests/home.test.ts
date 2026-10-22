// T17j (pedido do autor, 21/10/2026): a home com no máximo 4 histórias e a seta da direita que É o link "Ver todas as histórias"
// (src/components/Carrossel.astro, src/lib/home.ts → HISTORIAS_NA_HOME, src/lib/paginas.ts → dadosDaHome).
//
// Confere: a regra (4), o componente (o link de verdade, sem JavaScript, com nome para o leitor de tela), o site construído (pt e en,
// publicado) e as duas exceções de paridade com o Python (tests/ajudantes/html.ts → homeComoNoPython, soQuatroHistoriasNaHome), com casos
// negativos. A comparação com o <main> do Python está em tests/componentes.test.ts e tests/paginas.test.ts; o comportamento no navegador
// (mouse, foco, celular), em tools/home_playwright.py. A forma exata do link é conferida no site construído (abaixo).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { HISTORIAS_NA_HOME } from "../src/lib/home";
import { DESTAQUES_NA_HOME } from "../src/lib/obras";
import { homeComoNoPython, soQuatroHistoriasNaHome } from "./ajudantes/html";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

describe("a regra", () => {
  test("a home mostra 4; a escolha continua sendo a do build.py (5), só cortada", () => {
    expect(HISTORIAS_NA_HOME).toBe(4);
    expect(DESTAQUES_NA_HOME).toBe(5);
    const paginas = readFileSync(join(RAIZ, "src", "lib", "paginas.ts"), "utf8");
    expect(paginas).toContain("dados.destaques.slice(0, HISTORIAS_NA_HOME)");
  });
});

describe("o componente", () => {
  test("o CSS: espaço para 4 na tela larga, rótulo no mouse e no foco, rótulo sempre visível na tela estreita", () => {
    const css = readFileSync(join(RAIZ, "src", "components", "Carrossel.astro"), "utf8");
    expect(css).toContain(".rail-home .work-card { flex: 0 0 calc((100% - 3 * 1.4rem) / 4); min-width: 0; }");
    expect(css).toContain(".rail-more:hover .rail-label, .rail-more:focus-visible .rail-label { display: inline; }");
    expect(css).toMatch(/@media \(max-width: 1000px\) \{[\s\S]*\.rail-more \.rail-label \{ display: inline; \}/);
    expect(css).toMatch(/<style is:global>\s*@layer site \{/);
  });
});

const DIST = join(RAIZ, process.env["HC_DIST"] ?? "dist");
describe.skipIf(!existsSync(join(DIST, "pt", "index.html")))("o site construído (dist/)", () => {
  for (const [lang, rotulo] of [["pt", "Ver todas as histórias"], ["en", "See all stories"]] as const) {
    test(`/${lang}/: no máximo 4 cartões, um link só, para /${lang}/works/, dentro do trilho`, () => {
      const html = readFileSync(join(DIST, lang, "index.html"), "utf8");
      const trilho = /<div class="rail rail-home">[\s\S]*?<\/svg><\/a><\/div>/.exec(html)?.[0] ?? "";
      expect(trilho).not.toBe("");
      const cartoes = trilho.match(/<article class="work-card[ "]/g) ?? [];
      expect(cartoes.length).toBeGreaterThan(0);
      expect(cartoes.length).toBeLessThanOrEqual(4);
      expect(html.match(/class="rail-btn rail-next rail-more"/g)?.length).toBe(1);
      expect(trilho).toContain(`<a class="rail-btn rail-next rail-more" href="/${lang}/works/" aria-label="${rotulo}"><span class="rail-label">${rotulo}</span>`);
    });
  }
  test("nenhuma outra página tem o trilho da home", () => {
    for (const arquivo of ["pt/works/index.html", "en/works/index.html", "pt/news/index.html", "pt/about/index.html"]) {
      if (existsSync(join(DIST, arquivo))) expect(readFileSync(join(DIST, arquivo), "utf8"), arquivo).not.toContain("rail-home");
    }
  });
});

describe("as exceções de paridade", () => {
  const CARTAO = (n: number) => `<div class="work-card"><h3>${n}</h3></div>`;
  const WORKS = (n: number) => `<div class="works" data-more-url="/pt/works/" data-more-label="Ver">${Array.from({ length: n }, (_v, i) => CARTAO(i + 1)).join("")}</div>`;
  const LINK = '<a class="rail-btn rail-next rail-more" href="/pt/works/" aria-label="Ver"><span class="rail-label">Ver</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5v15l11.5-7.5z"></path></svg></a>';

  test("Astro: sai só o trilho (abertura e fechamento) e o link; os cartões ficam byte a byte", () => {
    const astro = `<section><h2>H</h2><div class="rail rail-home">${WORKS(4)}${LINK}</div></section>`;
    expect(homeComoNoPython(astro)).toEqual({ html: `<section><h2>H</h2>${WORKS(4)}</section>`, trilhos: 1 });
  });
  test.each([
    ["outra classe no trilho", `<div class="rail">${WORKS(2)}${LINK}</div>`],
    ["link que não é o último", `<div class="rail rail-home">${LINK}${WORKS(2)}</div>`],
    ["link para outro lugar", `<div class="rail rail-home">${WORKS(2)}${LINK.replace('href="/pt/works/"', 'href="/pt/news/"')}</div>`],
    ["works sem data-more-url", `<div class="rail rail-home">${WORKS(2).replace(' data-more-url="/pt/works/"', "")}${LINK}</div>`],
    ["algo a mais no trilho", `<div class="rail rail-home">${WORKS(2)}<p>x</p>${LINK}</div>`],
    ["link com outra classe", `<div class="rail rail-home">${WORKS(2)}${LINK.replace("rail-more", "rail-mais")}</div>`],
  ])("Astro: não mexe quando a forma não é exata (%s)", (_n, html) => {
    expect(homeComoNoPython(html)).toEqual({ html, trilhos: 0 });
  });
  test("Python: sai só o 5º cartão em diante, e só no carrossel da home (data-more-url)", () => {
    expect(soQuatroHistoriasNaHome(WORKS(5))).toEqual({ html: WORKS(4), tirados: 1 });
    expect(soQuatroHistoriasNaHome(WORKS(3))).toEqual({ html: WORKS(3), tirados: 0 });
    const grade = `<div class="works grid">${Array.from({ length: 6 }, (_v, i) => CARTAO(i)).join("")}</div>`;
    expect(soQuatroHistoriasNaHome(grade)).toEqual({ html: grade, tirados: 0 });
    const outroFilho = `<div class="works" data-more-url="/x/">${CARTAO(1)}${CARTAO(2)}${CARTAO(3)}${CARTAO(4)}<p>fica</p>${CARTAO(5)}</div>`;
    expect(soQuatroHistoriasNaHome(outroFilho).html).toBe(`<div class="works" data-more-url="/x/">${CARTAO(1)}${CARTAO(2)}${CARTAO(3)}${CARTAO(4)}<p>fica</p></div>`);
  });
});
