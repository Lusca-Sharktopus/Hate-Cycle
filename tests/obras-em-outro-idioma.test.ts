// T17m (pedido do autor de 22/10, "por agora sim"): o cartão de Histórias (e da home) da obra que NÃO tem nada no idioma da página, mas
// tem capítulo no outro idioma do site, deixa de ser o "Em breve" apagado e leva ao outro idioma, com `hreflang` — a mesma regra do bloco
// "estou lendo em ordem" (T17l). Hoje: nenhuma obra (Ossos do Ofício em português, a única, ganhou o capítulo em português na T17n).
//
// O que se prova aqui:
//   1. a regra (src/lib/obras.ts → cartaoDaObra com `outrosIdiomas`), num SITE INVENTADO lido pelo mesmo carregador e pelas mesmas regras:
//      conto (oneshot) só em inglês → o capítulo; série de dois capítulos só em inglês → a página da obra; obra com capítulo no idioma → nada
//      muda; obra sem nada em idioma nenhum → "Em breve"; link externo → como antes; rascunho → só na prévia; o "👁 Prévia" não aparece
//      quando o botão já leva ao outro idioma; sem `outrosIdiomas`, nada muda (o bloco "em ordem" chama assim);
//   2. as páginas (src/lib/paginas.ts → dadosDosAtalhos/dadosDaHome) passam os outros idiomas, e o WorkCard põe `hreflang` no <a>;
//   3. a exceção de paridade (tests/ajudantes/html.ts → cartaoEmOutroIdiomaComoNoPython) troca SÓ esse botão pelo "Em breve" do Python,
//      com casos negativos; e, no conteúdo de verdade, o cartão de Ossos em português (prévia) leva, desde a T17n, a /pt/works/all-in-a-nights-work/01/.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import WorkCard from "../src/components/WorkCard.astro";
import { langs, t, type Lang } from "../src/lib/config";
import { dadosDoIdioma } from "../src/lib/idioma";
import { cartaoDaObra } from "../src/lib/obras";
import { dadosDaHome, dadosDosAtalhos } from "../src/lib/paginas";
import { carregarConteudo } from "./ajudantes/conteudo";
import { cartaoEmOutroIdiomaComoNoPython } from "./ajudantes/html";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-outro-idioma-"));
  pastas.push(raiz);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return raiz;
}
const wj = (o: Record<string, unknown>) => JSON.stringify({ kind: "prose", universe: true, ...o }, null, 2) + "\n";
const md = (fm = "date: 2026-01-01") => `---\n${fm}\n---\n\nTexto.\n`;

const SITE: Record<string, string> = {
  // conto só em inglês (como era o Ossos do Ofício até a T17n, mas publicado)
  "works/conto/work.json": wj({ oneshot: true, title: { en: "Tale", pt: "Conto" }, order: { release: 1, chrono: 1 } }),
  "works/conto/01/en.md": md(),
  // série de dois capítulos só em inglês → a página da obra
  "works/serie/work.json": wj({ title: { en: "Series", pt: "Série" }, order: { release: 2, chrono: 2 } }),
  "works/serie/01/en.md": md(),
  "works/serie/02/en.md": md("date: 2026-02-01"),
  // nos dois idiomas: nada muda
  "works/ambos/work.json": wj({ oneshot: true, title: { en: "Both", pt: "Ambos" }, order: { release: 3, chrono: 3 } }),
  "works/ambos/01/en.md": md(),
  "works/ambos/01/pt.md": md(),
  // sem nada em idioma nenhum: "Em breve" nos dois
  "works/nada/work.json": wj({ title: { en: "Nothing", pt: "Nada" }, order: { release: 4, chrono: 4 } }),
  // externa: o link de sempre
  "works/fora/work.json": wj({ kind: "video", title: { en: "Outside", pt: "Fora" }, external: "https://www.youtube.com/@exemplo", order: { release: 5, chrono: false } }),
  // rascunho só em inglês: o cartão só existe na prévia
  "works/rascunho/work.json": wj({ oneshot: true, draft: true, title: { en: "Draft", pt: "Rascunho" }, order: { release: 6, chrono: 6 } }),
  "works/rascunho/01/en.md": md(),
  // só um capítulo ESCONDIDO (unlisted) em português e um listado em inglês: o botão leva ao inglês e o "👁 Prévia" não aparece
  "works/oculto/work.json": wj({ oneshot: true, title: { en: "Hidden", pt: "Oculto" }, order: { release: 7, chrono: 7 } }),
  "works/oculto/01/en.md": md(),
  "works/oculto/02/pt.md": md("date: 2026-03-01\nunlisted: true"),
};

function ler(arquivos: Record<string, string>, comRascunhos: boolean) {
  const entradas = carregarConteudo(pastaTemporaria(arquivos), { comRascunhos, mostrarExtras: false });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos, mostrarExtras: false, emissariosEscondidos: [], todosOsIdiomas: langs });
  return Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
}
const botoes = (d: ReturnType<typeof ler>[Lang], comRascunhos: boolean) =>
  Object.fromEntries(dadosDosAtalhos(d, comRascunhos, false).historias.cartoes.map((c) => [c.slug, { ...c.botao, previa: c.previa?.href ?? null }]));

describe("T17m: o cartão da obra que só tem capítulo no outro idioma leva até lá", () => {
  for (const comRascunhos of [false, true] as const) {
    test(`${comRascunhos ? "prévia" : "publicado"}: em português, conto → o capítulo em inglês; série → a página em inglês; o resto como antes`, () => {
      const pt = botoes(ler(SITE, comRascunhos).pt, comRascunhos);
      const leia = t("pt", "read");
      expect(pt.conto).toEqual({ tipo: "link", href: "/en/works/conto/01/", externo: false, rotulo: leia, idioma: "en", previa: null });
      expect(pt.serie).toEqual({ tipo: "link", href: "/en/works/serie/", externo: false, rotulo: leia, idioma: "en", previa: null });
      expect(pt.ambos).toEqual({ tipo: "link", href: "/pt/works/ambos/01/", externo: false, rotulo: leia, previa: null });
      expect(pt.nada).toEqual({ tipo: "em-breve", rotulo: t("pt", "soon"), previa: null });
      expect(pt.fora).toEqual({ tipo: "link", href: "https://www.youtube.com/@exemplo", externo: true, rotulo: t("pt", "watch"), previa: null });
      // capítulo escondido em português: antes, na prévia, "Em breve" + "👁 Prévia"; agora o botão leva ao inglês e a prévia some
      expect(pt.oculto).toEqual({ tipo: "link", href: "/en/works/oculto/01/", externo: false, rotulo: leia, idioma: "en", previa: null });
      if (comRascunhos) expect(pt.rascunho).toEqual({ tipo: "link", href: "/en/works/rascunho/01/", externo: false, rotulo: leia, idioma: "en", previa: null });
      else expect(pt.rascunho).toBeUndefined();
      // em inglês nada muda (todas têm capítulo em inglês, ou nada em idioma nenhum)
      const en = botoes(ler(SITE, comRascunhos).en, comRascunhos);
      for (const b of Object.values(en)) expect("idioma" in b).toBe(false);
      expect(en.nada?.tipo).toBe("em-breve");
    });
  }

  test("sem `outrosIdiomas` (o jeito que o bloco \"em ordem\" chama) nada muda: o cartão do conto em português continua \"Em breve\"", () => {
    const d = ler(SITE, false).pt;
    const conto = d.universo.find((o) => o.data._origem.slug === "conto")!;
    expect(cartaoDaObra(conto, "pt", d.capitulosDe(conto), false).botao).toEqual({ tipo: "em-breve", rotulo: t("pt", "soon") });
    expect(cartaoDaObra(conto, "pt", d.capitulosDe(conto), false, d.capitulosEmOutrosIdiomas(conto)).botao.tipo).toBe("link");
  });

  test("a home (carrossel) usa a mesma regra; a ordem do carrossel não muda (é a do Python: quem tem capítulo no idioma vem antes)", () => {
    const d = ler(SITE, false).pt;
    const home = dadosDaHome(d, false);
    const conto = home.destaques.find((c) => c.slug === "conto");
    if (conto) expect(conto.botao).toMatchObject({ href: "/en/works/conto/01/", idioma: "en" });
    expect(d.destaques.map((o) => o.data._origem.slug)[0]).toBe("ambos");
  });

  test("o WorkCard põe hreflang no <a> do botão que leva ao outro idioma (e só nele)", async () => {
    const container = await AstroContainer.create();
    const d = ler(SITE, false).pt;
    const cartoes = dadosDosAtalhos(d, false, false).historias.cartoes;
    const html = async (slug: string) => container.renderToString(WorkCard, { props: { cartao: cartoes.find((c) => c.slug === slug)! } });
    expect(await html("conto")).toContain(`<a class="button" href="/en/works/conto/01/" hreflang="en">${t("pt", "read")}</a>`);
    expect(await html("ambos")).not.toContain("hreflang");
    expect(await html("fora")).toContain('<a class="button" href="https://www.youtube.com/@exemplo" target="_blank" rel="noopener noreferrer">');
    expect(await html("nada")).toContain(`<span class="button disabled">${t("pt", "soon")}</span>`);
  });
});

describe("T17m: a exceção de paridade cartaoEmOutroIdiomaComoNoPython (o Python mostra \"Em breve\")", () => {
  const cartao = (botao: string) => `<article class="work-card" data-title="Ossos do Ofício"><img src="/c.png" alt="Ossos do Ofício" loading="lazy"><h3>Ossos do Ofício</h3><p>Texto.</p>${botao}</article>`;
  test("troca o <a class=\"button\" hreflang> filho de article.work-card pelo \"Em breve\"", () => {
    const r = cartaoEmOutroIdiomaComoNoPython(cartao('<a class="button" href="/en/works/all-in-a-nights-work/01/" hreflang="en">Leia aqui</a>'), "Em breve");
    expect(r).toEqual({ html: cartao('<span class="button disabled">Em breve</span>'), trocados: 1 });
  });
  test("casos negativos: sem hreflang, com target, outra classe, fora do cartão, outro pai", () => {
    for (const html of [
      cartao('<a class="button" href="/pt/works/x/01/">Leia aqui</a>'),
      cartao('<a class="button" href="https://x.com/" hreflang="en" target="_blank" rel="noopener noreferrer">Veja</a>'),
      cartao('<a class="preview-link" href="/en/x/" hreflang="en">👁 Prévia</a>'),
      '<p><a class="button" href="/en/x/" hreflang="en">Leia aqui</a></p>',
      '<div class="work-card"><a class="button" href="/en/x/" hreflang="en">Leia aqui</a></div>',
      '<a class="so-side prev" href="/en/works/all-in-a-nights-work/01/" hreflang="en">Ler Ossos do Ofício</a>',
    ]) expect(cartaoEmOutroIdiomaComoNoPython(html, "Em breve"), html).toEqual({ html, trocados: 0 });
  });
});

describe("T17n: no conteúdo de verdade (prévia), o cartão de Ossos do Ofício em português leva ao capítulo em PORTUGUÊS (até a T17m, ao inglês)", () => {
  test("Histórias em português: Ossos do Ofício → /pt/works/all-in-a-nights-work/01/, sem hreflang; no publicado, Ossos não existe", () => {
    const entradas = (comRascunhos: boolean) => carregarConteudo(join(RAIZ, "content"), { comRascunhos, mostrarExtras: false });
    for (const comRascunhos of [true, false]) {
      const d = dadosDoIdioma(entradas(comRascunhos), "pt", { comRascunhos, mostrarExtras: false, emissariosEscondidos: [], todosOsIdiomas: langs });
      const ossos = dadosDosAtalhos(d, comRascunhos, false).historias.cartoes.find((c) => c.slug === "all-in-a-nights-work");
      if (comRascunhos) expect(ossos?.botao).toEqual({ tipo: "link", href: "/pt/works/all-in-a-nights-work/01/", externo: false, rotulo: t("pt", "read") });
      else expect(ossos).toBeUndefined();
    }
  });
});
