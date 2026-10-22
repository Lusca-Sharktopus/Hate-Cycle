// T17d — o LEITOR PÁGINA A PÁGINA dos quadrinhos (Beira de Estrada) e a PÁGINA DE JOGO (Cat-Crow-Thing), só no Astro.
//
// O que se prova aqui (o site de verdade construído é provado no bloco "T17d" de tests/paginas.test.ts; o script no navegador simulado,
// em tests/folheador-dom.test.ts; no navegador de verdade, tools/folheador_playwright.py):
//   1. as regras puras (src/scripts/folheador/regras.ts): o fragmento #pN, as setas de cada página, as teclas, o que baixar já;
//   2. os dados de cada capítulo em sites INVENTADOS, em build e em prévia: a seta da direita na última página vai à 1ª do próximo capítulo
//      e SOME no capítulo mais recente daquele modo (o rascunho só conta na prévia); a da esquerda, na 1ª página, vai à ÚLTIMA do anterior e
//      some no primeiro capítulo; capítulo `unlisted` não tem vizinhos; obra sem `page_runes` continua com o leitor de sempre;
//   3. os erros que param o build (runas ≠ páginas, page_runes fora de quadrinho, game em quadrinho ou vídeo) e o schema dos campos novos;
//   4. o HTML do componente: 8 runas, a 1ª com aria-current, as setas, o <noscript>; e as EXCEÇÕES de paridade (tests/ajudantes/html.ts):
//      folheadorComoNoPython() e semJanelaDoJogo() tiram só o que é do Astro — sem elas, o Leitor sai idêntico ao de sempre (= ao Python);
//   5. a janela do jogo: sem demo e sem link (o caso de hoje), com demo e com link.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import Leitor from "../src/components/Leitor.astro";
import { langs, type Lang } from "../src/lib/config";
import { folheadorDoCapitulo, glifoDaRuna } from "../src/lib/folheador";
import { dadosDoIdioma } from "../src/lib/idioma";
import { janelaDoJogo, SANDBOX_DA_DEMO } from "../src/lib/jogo";
import { leiturasDaObra, type LeituraDoCapitulo } from "../src/lib/leitura";
import { finalizarMain } from "../src/lib/pagina";
import { arquivosDoGlob } from "../src/lib/quadrinhos";
import { criarSchemas } from "../src/lib/schemas";
import { TEXTOS_DO_FOLHEADOR } from "../src/lib/textosDoFolheador";
import { TEXTOS_DO_JOGO } from "../src/lib/textosDoJogo";
import { direcaoDaTecla, fragmentoDaPagina, paginaDoFragmento, paginasParaBaixar, rotuloDaPagina, setasDaPagina } from "../src/scripts/folheador/regras";
import { carregarConteudo } from "./ajudantes/conteudo";
import { canonicoDoMiolo, folheadorComoNoPython, semJanelaDoJogo } from "./ajudantes/html";

// ───────────── sites inventados ─────────────

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-folheador-teste-"));
  pastas.push(raiz);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return raiz;
}
const wj = (o: Record<string, unknown>) => JSON.stringify(o, null, 2) + "\n";
const md = (fm: string, corpo = "") => `---\n${fm}\n---\n${corpo}`;
const ambos = (base: string, fm: string, corpo = "") => ({ [`${base}/en.md`]: md(fm, corpo), [`${base}/pt.md`]: md(fm, corpo) });

const RUNAS_DA_FORCA = ["ᚣ", "弓", "♐︎", "ᚸ", "エ", "ꑭ", "⼒", "Ⱝ"];

/** static/ dos sites inventados: páginas de quadrinho (vazias; só o nome importa). */
const pastaStatic = pastaTemporaria({
  "hq/01/1.png": "", "hq/01/2.png": "", "hq/01/10.png": "",
  "hq/02/a.png": "", "hq/02/b.png": "", "hq/02/c.png": "",
  "hq/03/p1.png": "", "hq/03/p2.png": "", "hq/03/p3.png": "",
  "hq/04/1.png": "", "hq/04/2.png": "", "hq/04/3.png": "",
  "oito/1.png": "", "oito/2.png": "", "oito/3.png": "", "oito/4.png": "", "oito/5.png": "", "oito/6.png": "", "oito/7.png": "", "oito/8.png": "",
});

/**
 * O site inventado:
 *   hq     — quadrinho com page_runes de 3 runas; 01 (glob, ordem natural 1, 2, 10), 02 (lista pages), 03 RASCUNHO, 04 `unlisted`.
 *   forca  — quadrinho com as Oito Runas d'A Força, dois capítulos de 8 páginas (como a Beira de Estrada).
 *   antiga — quadrinho SEM page_runes (o leitor de sempre).
 *   jogo   — capítulo único com `game` (sem demo, sem link: o caso de hoje do Cat-Crow-Thing), com texto embaixo.
 *   jogo2  — com demo e com link.
 */
function siteInventado(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "works/hq/work.json": wj({ kind: "comic", title: { en: "Comic", pt: "Quadrinho" }, page_runes: ["ᚣ", "弓", "♐"], order: { release: 1, chrono: 1 } }),
    ...ambos("works/hq/01", "date: 2026-01-01\npages_glob: hq/01/*.png"),
    ...ambos("works/hq/02", "date: 2026-02-01\npages: [hq/02/a.png, hq/02/b.png, hq/02/c.png]"),
    ...ambos("works/hq/03", "date: 2026-03-01\ndraft: true\npages_glob: hq/03/*.png"),
    ...ambos("works/hq/04", "unlisted: true\npages_glob: hq/04/*.png"),
    "works/forca/work.json": wj({ kind: "comic", title: "Força", page_runes: RUNAS_DA_FORCA, order: { release: 2, chrono: 2 } }),
    ...ambos("works/forca/01", "pages_glob: oito/*.png"),
    ...ambos("works/forca/02", "pages_glob: oito/*.png"),
    "works/antiga/work.json": wj({ kind: "comic", title: "Antiga", order: { release: 3, chrono: 3 } }),
    ...ambos("works/antiga/01", "pages_glob: hq/01/*.png"),
    "works/jogo/work.json": wj({ oneshot: true, title: "Jogo", game: { demo: "", steam: "" }, media: "videogame", order: { release: 4, chrono: 4 } }),
    ...ambos("works/jogo/01", "comments: false", "\nUm texto embaixo do botão.\n"),
    "works/jogo2/work.json": wj({ oneshot: true, title: "Jogo 2", game: { demo: "https://example.itch.io/demo", steam: "https://store.steampowered.com/app/1/" }, media: "videogame", order: { release: 5, chrono: 5 } }),
    ...ambos("works/jogo2/01", "comments: false"),
    ...extra,
  };
}

function leituras(arquivos: Record<string, string>, comRascunhos: boolean): Map<string, LeituraDoCapitulo> {
  const raiz = pastaTemporaria(arquivos);
  const entradas = carregarConteudo(raiz, { comRascunhos, mostrarExtras: false });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos, mostrarExtras: false, emissariosEscondidos: [], todosOsIdiomas: langs });
  const dados = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  const ferramentas = { glob: (padrao: string) => arquivosDoGlob(pastaStatic, padrao), comentarios: () => null };
  const saida = new Map<string, LeituraDoCapitulo>();
  for (const lang of langs) {
    for (const obra of dados[lang].obras) {
      const capitulos = Object.fromEntries(langs.map((l) => [l, dados[l].capitulosDe(obra)])) as Record<Lang, ReturnType<(typeof dados)[Lang]["capitulosDe"]>>;
      for (const l of leiturasDaObra(obra, lang, capitulos, ferramentas)) saida.set(l.url, l);
    }
  }
  return saida;
}
const folheadorDe = (l: LeituraDoCapitulo | undefined) => (l?.conteudo.formato === "comic" ? l.conteudo.folheador : undefined);
const setas = (l: LeituraDoCapitulo | undefined) => {
  const f = folheadorDe(l);
  return f ? { anterior: f.anterior.capitulo?.href ?? null, proxima: f.proxima.capitulo?.href ?? null, inicialAnterior: f.anterior.inicial?.href ?? null, inicialProxima: f.proxima.inicial?.href ?? null } : null;
};

// ───────────── 1. as regras puras ─────────────

describe("regras do leitor página a página (as mesmas no build e no navegador)", () => {
  test("o fragmento: #p1…#pN; qualquer outra coisa (inclusive a volta do login) não é página", () => {
    expect(fragmentoDaPagina(3)).toBe("#p3");
    expect(paginaDoFragmento("#p1", 8)).toBe(1);
    expect(paginaDoFragmento("#p8", 8)).toBe(8);
    for (const f of ["", "#", "#p0", "#p9", "#p", "#P3", "#p3x", "#p03", "#p-1", "#pagina3", "#access_token=abc&p3", " #p3", "#p99999"]) expect(paginaDoFragmento(f, 8), f).toBeNull();
  });

  test("as setas: dentro do capítulo, página vizinha; nas pontas, o capítulo vizinho ou nada", () => {
    const v = { capituloAnterior: { href: "/a/#p8", rotulo: "A" }, proximoCapitulo: { href: "/c/#p1", rotulo: "C" }, paginaAnterior: "ant", proximaPagina: "prox" };
    expect(setasDaPagina(1, 8, v)).toEqual({ anterior: { href: "/a/#p8", rotulo: "A" }, proxima: { href: "#p2", rotulo: "prox" } });
    expect(setasDaPagina(5, 8, v)).toEqual({ anterior: { href: "#p4", rotulo: "ant" }, proxima: { href: "#p6", rotulo: "prox" } });
    expect(setasDaPagina(8, 8, v)).toEqual({ anterior: { href: "#p7", rotulo: "ant" }, proxima: { href: "/c/#p1", rotulo: "C" } });
    const sozinho = { ...v, capituloAnterior: null, proximoCapitulo: null };
    expect(setasDaPagina(1, 8, sozinho).anterior).toBeNull();
    expect(setasDaPagina(8, 8, sozinho).proxima).toBeNull();
    expect(setasDaPagina(1, 1, sozinho)).toEqual({ anterior: null, proxima: null });
  });

  test("teclas: ← e → sem modificador e fora de campo de texto", () => {
    const t = { key: "ArrowRight", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, emCampoDeTexto: false };
    expect(direcaoDaTecla(t)).toBe("proxima");
    expect(direcaoDaTecla({ ...t, key: "ArrowLeft" })).toBe("anterior");
    for (const outra of [{ key: "ArrowUp" }, { key: "Enter" }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { emCampoDeTexto: true }]) expect(direcaoDaTecla({ ...t, ...outra }), JSON.stringify(outra)).toBeNull();
  });

  test("baixar já: a página atual e as vizinhas", () => {
    expect(paginasParaBaixar(1, 8)).toEqual([1, 2]);
    expect(paginasParaBaixar(5, 8)).toEqual([5, 6, 4]);
    expect(paginasParaBaixar(8, 8)).toEqual([8, 7]);
    expect(rotuloDaPagina("Página {n} de {total}", 3, 8)).toBe("Página 3 de 8");
  });

  test("os textos existem nos dois idiomas, e o rótulo da runa leva {n} e {total}", () => {
    for (const lang of langs) {
      expect(TEXTOS_DO_FOLHEADOR[lang].pagina).toMatch(/\{n\}.*\{total\}/);
      expect(Object.values(TEXTOS_DO_FOLHEADOR[lang]).every((v) => v.trim() !== "")).toBe(true);
    }
    expect(TEXTOS_DO_JOGO.en.botaoDaSteam).toBe("Wishlist on Steam"); // o texto do autor (20/10)
    expect(TEXTOS_DO_JOGO.pt.botaoDaSteam).toBe("Adicione à Wishlist");
  });

  test("a runa que viraria emoji ganha o U+FE0E; a que já tem, ou não precisa, fica como está", () => {
    expect(glifoDaRuna("♐")).toBe("♐︎");
    expect(glifoDaRuna("♐︎")).toBe("♐︎");
    expect(glifoDaRuna("ᚣ")).toBe("ᚣ");
  });

  test("runas ≠ páginas: o build pára com uma explicação", () => {
    expect(() => folheadorDoCapitulo("pt", RUNAS_DA_FORCA, 7, null, null, "/pt/works/x/01/")).toThrow(/7 página\(s\).*8 runa\(s\)/);
    expect(folheadorDoCapitulo("pt", undefined, 7, null, null, "/x/")).toBeNull();
  });
});

// ───────────── 2. sites inventados: build × prévia ─────────────

describe("sites inventados: para onde vão as setas, em build e em prévia", () => {
  const build = leituras(siteInventado(), false);
  const previa = leituras(siteInventado(), true);

  test("build: 01 → 02; o 02 é o mais recente (o 03 é rascunho): a seta da direita some na última página dele", () => {
    expect(setas(build.get("/pt/works/hq/01/"))).toEqual({ anterior: null, proxima: "/pt/works/hq/02/#p1", inicialAnterior: null, inicialProxima: "#p2" });
    expect(setas(build.get("/pt/works/hq/02/"))).toEqual({ anterior: "/pt/works/hq/01/#p3", proxima: null, inicialAnterior: "/pt/works/hq/01/#p3", inicialProxima: "#p2" });
    expect(build.has("/pt/works/hq/03/")).toBe(false);
  });

  test("prévia: o rascunho 03 entra no fim; o 02 passa a levar a ele e o 03 é o mais recente", () => {
    expect(setas(previa.get("/pt/works/hq/02/"))?.proxima).toBe("/pt/works/hq/03/#p1");
    expect(setas(previa.get("/pt/works/hq/03/"))).toEqual({ anterior: "/pt/works/hq/02/#p3", proxima: null, inicialAnterior: "/pt/works/hq/02/#p3", inicialProxima: "#p2" });
    expect(setas(previa.get("/en/works/hq/01/"))?.proxima).toBe("/en/works/hq/02/#p1"); // e em inglês, com os endereços em inglês
  });

  test("capítulo `unlisted`: só as páginas dele (sem capítulos vizinhos)", () => {
    expect(setas(build.get("/pt/works/hq/04/"))).toEqual({ anterior: null, proxima: null, inicialAnterior: null, inicialProxima: "#p2" });
  });

  test("as runas: uma por página, na ordem do work.json, com o rótulo \"Página N de T\"; as páginas na ordem natural (1, 2, 10)", () => {
    const l = build.get("/pt/works/hq/01/");
    const f = folheadorDe(l);
    expect(f?.runas.map((r) => [r.runa, r.href, r.rotulo])).toEqual([["ᚣ", "#p1", "Página 1 de 3"], ["弓", "#p2", "Página 2 de 3"], ["♐︎", "#p3", "Página 3 de 3"]]);
    expect(l?.conteudo.formato === "comic" && l.conteudo.paginas.map((p) => p.arquivo)).toEqual(["hq/01/1.png", "hq/01/2.png", "hq/01/10.png"]);
    expect(folheadorDe(build.get("/en/works/hq/01/"))?.runas[2]?.rotulo).toBe("Page 3 of 3");
    expect(folheadorDe(build.get("/en/works/hq/02/"))?.anterior.capitulo?.rotulo).toBe("Previous chapter: Chapter 1");
  });

  test("as Oito Runas d'A Força: 8 páginas por capítulo; do 01 para o 02 e de volta à 8ª do 01", () => {
    const f1 = folheadorDe(build.get("/pt/works/forca/01/"));
    const f2 = folheadorDe(build.get("/pt/works/forca/02/"));
    expect(f1?.runas.map((r) => r.runa).join(" ")).toBe("ᚣ 弓 ♐︎ ᚸ エ ꑭ ⼒ Ⱝ");
    expect(f1?.total).toBe(8);
    expect(f1?.proxima.capitulo).toEqual({ href: "/pt/works/forca/02/#p1", rotulo: "Próximo capítulo: Capítulo 2" });
    expect(f2?.anterior.capitulo).toEqual({ href: "/pt/works/forca/01/#p8", rotulo: "Capítulo anterior: Capítulo 1" });
    expect(f2?.proxima.capitulo).toBeNull();
  });

  test("obra sem page_runes: o leitor de quadrinhos de sempre (sem folheador)", () => {
    expect(folheadorDe(build.get("/pt/works/antiga/01/"))).toBeNull();
  });

  test("o ID dos comentários não muda (works/<obra>/<capítulo>, igual nos dois idiomas): o #pN fica só no endereço", () => {
    const comComentarios = leituras(siteInventado(), false);
    for (const url of ["/pt/works/forca/01/", "/en/works/forca/01/"]) expect(comComentarios.get(url)?.url).toBe(url);
    // (o ID em si é provado no site real: bloco T17d de tests/paginas.test.ts e o teste de todos os IDs × baseline)
  });

  test("erros: runas ≠ páginas, page_runes fora de quadrinho, game em quadrinho", () => {
    expect(() => leituras(siteInventado({ ...ambos("works/forca/03", "pages: [oito/1.png, oito/2.png]") }), false)).toThrow(/forca\/03.*2 página\(s\).*8 runa\(s\)/);
    expect(() => leituras(siteInventado({ "works/prosa/work.json": wj({ title: "P", page_runes: ["ᚣ"] }), ...ambos("works/prosa/01", "date: 2026-01-01", "\nTexto.\n") }), false)).toThrow(/page_runes.*só vale para quadrinho/);
    expect(() => leituras(siteInventado({ "works/hqjogo/work.json": wj({ kind: "comic", title: "J", game: {} }), ...ambos("works/hqjogo/01", "pages_glob: hq/01/*.png") }), false)).toThrow(/game.*não vale para quadrinho/);
  });
});

// ───────────── 3. o schema dos campos novos ─────────────

describe("schema do work.json: page_runes e game", () => {
  const works = criarSchemas({ existe: () => true }).works;
  const ok = (extra: Record<string, unknown>) => works.safeParse({ _origem: { slug: "x" }, ...extra }).success;
  const erro = (extra: Record<string, unknown>) => {
    const r = works.safeParse({ _origem: { slug: "x" }, ...extra });
    return r.success ? "" : r.error.issues.map((i) => i.message).join(" | ");
  };
  test("aceitos", () => {
    expect(ok({ page_runes: RUNAS_DA_FORCA })).toBe(true);
    expect(ok({ game: {} })).toBe(true);
    expect(ok({ game: { demo: "", steam: "" } })).toBe(true);
    expect(ok({ game: { demo: "https://x.itch.io/y", steam: "https://store.steampowered.com/app/1/" } })).toBe(true);
  });
  test("recusados, com a explicação", () => {
    expect(erro({ page_runes: [] })).toMatch(/pelo menos uma runa/);
    expect(erro({ page_runes: ["ᚣ", "a b"] })).toMatch(/runa 2.*sem espaços/);
    expect(erro({ page_runes: ["ᚣ", ""] })).toMatch(/runa 2/);
    expect(erro({ page_runes: "ᚣ 弓" })).toMatch(/lista de runas/);
    expect(erro({ game: { steam: "store.steampowered.com/app/1" } })).toMatch(/https:\/\//);
    expect(erro({ game: { demo: "http://x.itch.io" } })).toMatch(/https:\/\//);
    expect(erro({ game: { demo: "javascript:alert(1)" } })).toMatch(/https:\/\//);
    expect(erro({ game: { link: "https://x" } })).toMatch(/campo desconhecido.*"link".*demo, steam/);
  });
});

// ───────────── 4 e 5. o HTML do componente e as exceções de paridade ─────────────

const container = await AstroContainer.create();
async function mainDe(l: LeituraDoCapitulo): Promise<string> {
  return finalizarMain(await container.renderToString(Leitor, { props: { leitura: l } }), l.lang).html;
}

describe("o HTML do leitor página a página e a exceção de paridade", () => {
  const build = leituras(siteInventado(), false);

  test("8 runas, a 1ª com aria-current; setas no estado da página 1; <noscript> que mostra tudo sem JavaScript", async () => {
    const html = await mainDe(build.get("/pt/works/forca/01/") as LeituraDoCapitulo);
    const runas = [...html.matchAll(/<a class="fl-runa" href="#p(\d)" title="Página \1 de 8" aria-label="Página \1 de 8"( aria-current="page")?><span aria-hidden="true">([^<]+)<\/span><\/a>/g)];
    expect(runas.map((m) => [m[1], !!m[2], m[3]])).toEqual(RUNAS_DA_FORCA.map((r, i) => [String(i + 1), i === 0, r]));
    expect(html).toContain('<a class="side-btn prev fl-seta ghost" aria-hidden="true" data-rotulo-pagina="Página anterior">');
    expect(html).toContain('<a class="side-btn next fl-seta" href="#p2" title="Próxima página" aria-label="Próxima página" data-rotulo-pagina="Próxima página" data-capitulo="/pt/works/forca/02/#p1" data-rotulo-capitulo="Próximo capítulo: Capítulo 2">');
    expect(html).toContain('<nav class="fl-runas" aria-label="Páginas do capítulo">');
    expect(html).toContain('<p class="sr-only" data-fl-status aria-live="polite"></p>');
    expect(html).toMatch(/<noscript><style>[^<]*\.folheador \.comic>img\{display:block!important\}[^<]*<\/style><\/noscript>/);
    // os 8 <img> continuam DENTRO do div.comic, iguais aos do leitor de sempre
    expect((/<div class="comic">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "").match(/<img src="\/oito\/\d\.png" alt="Capítulo 1 \d" loading="lazy">/g)).toHaveLength(8);
  });

  test("sem o folheador (folheadorComoNoPython), o capítulo é IDÊNTICO ao do leitor de quadrinhos de sempre (o que o Python desenha)", async () => {
    for (const url of ["/pt/works/forca/01/", "/en/works/forca/02/", "/pt/works/hq/01/", "/pt/works/hq/04/"]) {
      const l = build.get(url) as LeituraDoCapitulo;
      const r = folheadorComoNoPython(await mainDe(l));
      expect({ trocados: r.trocados, recusados: r.recusados }, url).toEqual({ trocados: 1, recusados: 0 });
      const semFolheador = { ...l, conteudo: { ...l.conteudo, folheador: null } } as LeituraDoCapitulo;
      expect(canonicoDoMiolo(r.html), url).toBe(canonicoDoMiolo(await mainDe(semFolheador)));
    }
  });

  test("a exceção é estreita: qualquer outra forma fica (e apareceria como diferença)", async () => {
    const html = await mainDe(build.get("/pt/works/forca/01/") as LeituraDoCapitulo);
    const bloco = /<div class="folheador"[\s\S]*<\/noscript><\/div>/.exec(html)?.[0] ?? "";
    expect(bloco).not.toBe("");
    const variacoes = [
      bloco.replace('<p class="sr-only" data-fl-status aria-live="polite"></p>', '<p class="sr-only" data-fl-status aria-live="polite">texto</p>'), // texto no aviso
      bloco.replace('<nav class="fl-runas"', '<script>alert(1)</script><nav class="fl-runas"'), // um filho a mais
      bloco.replace('<a class="fl-runa" href="#p2"', '<b class="fl-runa" href="#p2"'), // runa que não é <a>
      bloco.replace('class="folheador"', 'class="folheador outro"'),
      bloco.replace('<div class="comic">', '<div class="comic extra">'),
      bloco.replace("</noscript>", "</noscript>solto"),
      bloco.replace('<div class="fl-palco">', '<div class="fl-palco"><img src="/x.png">'),
    ];
    for (const v of variacoes) expect(folheadorComoNoPython(v), v.slice(0, 80)).toMatchObject({ html: v, trocados: 0, recusados: 1 });
    expect(folheadorComoNoPython('<div class="comic"><img src="/a.png"></div>')).toEqual({ html: '<div class="comic"><img src="/a.png"></div>', trocados: 0, recusados: 0 });
  });
});

describe("a página de jogo (Cat-Crow-Thing)", () => {
  const build = leituras(siteInventado(), false);

  test("janelaDoJogo(): sem game = nada; vazio = janela escura e botão sem link; com endereços = demo e link", () => {
    expect(janelaDoJogo(undefined, "X", "pt")).toBeNull();
    expect(janelaDoJogo({ demo: "", steam: "" }, "Cat-Crow-Thing", "pt")).toEqual({ nome: "Demo de Cat-Crow-Thing", demo: null, emBreve: "Demo em breve", steam: { href: null, texto: "Adicione à Wishlist", linkEmBreve: "Link em breve", logo: "social/logo steam.png" } });
    expect(janelaDoJogo({ demo: "https://a/", steam: "https://b/" }, "Cat-Crow-Thing", "en")).toMatchObject({ nome: "Cat-Crow-Thing demo", demo: "https://a/", steam: { href: "https://b/", texto: "Wishlist on Steam" } });
  });

  test("hoje (sem demo, sem link): a janela vazia, o botão com a logo à esquerda, sem link, e \"Link em breve\"; o texto do capítulo embaixo", async () => {
    const html = await mainDe(build.get("/pt/works/jogo/01/") as LeituraDoCapitulo);
    expect(html).toContain('<hr class="thin"><div class="jogo" data-jogo><div class="jogo-tela vazia" role="img" aria-label="Demo de Jogo: Demo em breve"><span class="jogo-aviso" aria-hidden="true">Demo em breve</span></div>');
    expect(html).toContain('<p class="jogo-steam"><span class="steam-btn sem-link" role="link" aria-disabled="true" aria-describedby="jogo-link-em-breve"><img class="steam-logo" src="/social/logo%20steam.png" alt=""><span>Adicione à Wishlist</span></span><span class="steam-breve" id="jogo-link-em-breve">Link em breve</span></p></div><div class="prose story"><p>Um texto embaixo do botão.</p></div>');
    expect(html).not.toMatch(/<iframe|<a class="steam-btn"|href="https?:/);
    const en = await mainDe(build.get("/en/works/jogo/01/") as LeituraDoCapitulo);
    expect(en).toContain("<span>Wishlist on Steam</span>");
    expect(en).toContain("Link coming soon");
  });

  test("com demo e link: o <iframe> com sandbox e o botão é um link para a Steam, em outra aba", async () => {
    const html = await mainDe(build.get("/pt/works/jogo2/01/") as LeituraDoCapitulo);
    expect(html).toContain(`<div class="jogo-tela"><iframe src="https://example.itch.io/demo" title="Demo de Jogo 2" sandbox="${SANDBOX_DA_DEMO}" allow="fullscreen; gamepad; autoplay" allowfullscreen loading="lazy"></iframe></div>`);
    expect(html).toContain('<a class="steam-btn" href="https://store.steampowered.com/app/1/" target="_blank" rel="noopener"><img class="steam-logo" src="/social/logo%20steam.png" alt=""><span>Adicione à Wishlist</span></a>');
    expect(html).not.toContain("Link em breve");
    expect(SANDBOX_DA_DEMO).not.toMatch(/allow-top-navigation|allow-forms|allow-modals|allow-downloads/);
  });

  test("sem a janela (semJanelaDoJogo), a página é IDÊNTICA à de um capítulo de texto (o que o Python desenha); a exceção é estreita", async () => {
    for (const url of ["/pt/works/jogo/01/", "/en/works/jogo2/01/"]) {
      const l = build.get(url) as LeituraDoCapitulo;
      const r = semJanelaDoJogo(await mainDe(l));
      expect({ removidos: r.removidos.length, foraDoLugar: r.foraDoLugar }, url).toEqual({ removidos: 1, foraDoLugar: 0 });
      const semJogo = { ...l, conteudo: { ...l.conteudo, jogo: null } } as LeituraDoCapitulo;
      expect(canonicoDoMiolo(r.html), url).toBe(canonicoDoMiolo(await mainDe(semJogo)));
    }
    // fora do lugar (não logo depois do hr.thin de um div.reader-box) fica
    for (const v of ['<div class="reader-box"><div class="jogo" data-jogo>x</div></div>', '<div><hr class="thin"><div class="jogo" data-jogo>x</div></div>', '<div class="reader-box"><hr class="thin"><div class="jogo outro" data-jogo>x</div></div>']) {
      expect(semJanelaDoJogo(v)).toEqual({ html: v, removidos: [], foraDoLugar: 1 });
    }
    expect(semJanelaDoJogo('<div class="reader-box"><hr class="thin"><div class="jogo">sem data-jogo</div></div>').removidos).toEqual([]);
  });
});
