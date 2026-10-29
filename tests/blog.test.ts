// T17n — "Feed de Notícias" → "Blog" (pedido do autor de 27/10/2026), só no Astro e só no que o visitante lê.
//
// O que é provado aqui:
//   1. a troca cobre TODOS os textos da interface (config.json → ui) que chamam a seção de "Notícias"/"News", e só eles;
//   2. t() devolve os textos novos nessas chaves e, em TODAS as outras, exatamente o texto do config.json (nada mais mudou);
//   3. a exceção de paridade blogComoNoPython() (tests/ajudantes/html.ts) troca só essas palavras, só nos nove lugares de sempre (casos
//      negativos: o mesmo texto em outro lugar fica). Que, depois dela, cada página do Astro é igual à do build.py (ou seja, que nada mais
//      mudou nas páginas) é o tests/paginas.test.ts; nas listas e posts de sites inventados, o tests/noticias.test.ts.
// Endereços (/pt/news/…), pastas de content/news/ e IDs de comentários (news/<slug>) não mudam: tests/paginas.test.ts (lista de endereços
// e IDs contra baseline/).
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { langs, t, tDoConfig, type Lang, type UiKey } from "../src/lib/config";
import { CHAVES_DO_BLOG, ehChaveDoBlog, TEXTOS_DO_BLOG, type ChaveDoBlog } from "../src/lib/textosDoBlog";
import { blogComoNoPython, type FormaDoBlog } from "./ajudantes/html";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")) as { ui: Record<Lang, Record<string, unknown>> };
const doConfig = (l: Lang) => Object.fromEntries(CHAVES_DO_BLOG.map((k) => [k, tDoConfig(l, k)])) as Record<ChaveDoBlog, string>;
const textos = (l: Lang) => ({ astro: TEXTOS_DO_BLOG[l], python: doConfig(l) });
const FALA_DE_NOTICIAS = /\bnews\b|not[ií]cia/i;

describe("os textos do blog (src/lib/textosDoBlog.ts)", () => {
  test("cobrem toda chave de config.json → ui que fala em Notícias/News (em qualquer idioma), e só elas", () => {
    const falam = new Set<string>();
    for (const l of langs) for (const [k, v] of Object.entries(config.ui[l] ?? {})) if (typeof v === "string" && FALA_DE_NOTICIAS.test(v)) falam.add(k);
    expect([...falam].sort()).toEqual([...CHAVES_DO_BLOG].sort());
  });

  test.each(langs)("%s: cada texto novo existe, é diferente do config.json, não fala mais em notícias e não tem caractere especial de HTML", (l) => {
    for (const k of CHAVES_DO_BLOG) {
      const novo = TEXTOS_DO_BLOG[l][k];
      expect(novo.trim(), k).not.toBe("");
      expect(novo, k).not.toBe(tDoConfig(l, k));
      expect(novo, k).not.toMatch(FALA_DE_NOTICIAS);
      expect(novo, k).not.toMatch(/[&<>"']/);
    }
  });

  test("os textos combinados com o autor: \"Blog\" no menu, no título e na aba, nas duas línguas", () => {
    expect(TEXTOS_DO_BLOG.pt.news).toBe("Blog");
    expect(TEXTOS_DO_BLOG.en.news).toBe("Blog");
  });

  test.each(langs)("%s: t() devolve o texto novo nas chaves do blog e o do config.json em TODAS as outras", (l) => {
    for (const k of Object.keys(config.ui[l] ?? {}) as UiKey[]) {
      if (typeof config.ui[l]?.[k] !== "string") continue; // listas (meses…) passam por tList(), não por t()
      if (ehChaveDoBlog(k)) expect(t(l, k), k).toBe(TEXTOS_DO_BLOG[l][k]);
      else expect(t(l, k), k).toBe(config.ui[l]?.[k]);
    }
  });

  test("o config.json (do autor) continua com os textos antigos, que o build.py usa", () => {
    expect(config.ui.en?.["news"]).toBe("News Feed");
    expect(config.ui.pt?.["news"]).toBe("Notícias");
  });
});

describe("a exceção de paridade blogComoNoPython (só essas palavras, só nesses lugares)", () => {
  const SITE = "Hᴀᴛᴇ Cʏᴄʟᴇ";
  /** Os nove lugares, com o texto do Astro (`a`) ou do Python (`p`) de cada idioma. */
  function lugares(l: Lang, x: Record<ChaveDoBlog, string>): Record<FormaDoBlog, string> {
    return {
      titulo: `<title>${x.news} | ${SITE}</title>`,
      "og:title": `<meta property="og:title" content="${x.news} | ${SITE}">`,
      menu: `<a href="/${l}/news/" aria-current="page" data-astro-cid-nen7h5rs>${x.news}</a>`,
      h1: `<div class="wrap block news-wrap"><h1>${x.news}</h1></div>`,
      busca: `<input type="search" class="news-search" placeholder="${x.news_search_ph}" aria-label="${x.news_search_ph}" autocomplete="off">`,
      nenhum: `<p class="news-none" hidden>${x.news_none}</p>`,
      paginacao: `<nav class="pagination" aria-label="${x.news}" data-prev="a" data-next="b" data-per="10"></nav>`,
      todos: `<a class="mid" href="/${l}/news/">${x.all_news}</a>`,
      etiqueta: `<span class="tag">${x.tag_news}</span><time>1 de jan. de 2026</time>`,
    };
  }

  test.each(langs)("%s: cada um dos nove lugares volta ao texto do config.json, uma troca cada", (l) => {
    const { astro, python } = textos(l);
    const doAstro = lugares(l, astro);
    const doPython = lugares(l, python);
    for (const forma of Object.keys(doAstro) as FormaDoBlog[]) {
      const r = blogComoNoPython(doAstro[forma], astro, python);
      expect(r.html, forma).toBe(doPython[forma]);
      expect(Object.entries(r.trocas).filter(([, n]) => n > 0), forma).toEqual([[forma, 1]]);
    }
    // a página inteira de uma vez: as trocas somam
    const tudo = Object.values(doAstro).join("\n");
    expect(blogComoNoPython(tudo, astro, python).html).toBe(Object.values(doPython).join("\n"));
    // e o menu sem aria-current (fora da lista) e sem a marca de escopo também
    expect(blogComoNoPython(`<a href="/${l}/news/">${astro.news}</a>`, astro, python).html).toBe(`<a href="/${l}/news/">${python.news}</a>`);
  });

  test.each(langs)("%s: o mesmo texto em qualquer outro lugar fica como está (zero trocas)", (l) => {
    const { astro, python } = textos(l);
    const fora = [
      `<p>Leia no ${astro.news} | do autor</p>`, // texto de um post
      `<h1>${astro.news}</h1>`, // <h1> que não é o da lista
      `<div class="wrap block"><h1>${astro.news}</h1></div>`,
      `<a href="/${l}/works/">${astro.news}</a>`, // outro link do menu
      `<a href="/${l}/news/x/">${astro.news}</a>`, // link para um post
      `<a href="/${l}/news/" class="x">${astro.news}</a>`, // outra forma de tag
      `<a class="mid" href="/${l}/works/x/">${astro.all_news}</a>`, // o botão do meio de um capítulo
      `<span class="tag">${astro.tag_news}</span>`, // etiqueta do autor numa notícia (sem a data logo depois)
      `<span class="tag">${astro.tag_news}</span> <time>`,
      `<input type="search" class="search" placeholder="${astro.news_search_ph}" aria-label="${astro.news_search_ph}">`, // a busca de Histórias
      `<input type="search" class="news-search" placeholder="${astro.news_search_ph}" aria-label="outro">`,
      `<p class="news-none">${astro.news_none}</p>`,
      `<nav class="pager" aria-label="${astro.news}">`,
      `<title>${astro.news}</title>`, // sem o " | site"
      `<meta property="og:description" content="${astro.news} | ${SITE}">`,
      `<title>${python.news} | ${SITE}</title>`, // já é o do Python
    ];
    for (const html of fora) {
      const r = blogComoNoPython(html, astro, python);
      expect(r.html, html).toBe(html);
      expect(Object.values(r.trocas).reduce((a, b) => a + b, 0), html).toBe(0);
    }
  });

  test("os textos do outro idioma não são trocados (a página em português só aceita os do português)", () => {
    const en = textos("en");
    const pt = textos("pt");
    const doIngles = Object.values(lugares("pt", en.astro)).filter((h) => !h.includes(">Blog<") && !h.includes('"Blog"') && !h.includes("Blog |")).join("\n");
    expect(blogComoNoPython(doIngles, pt.astro, pt.python).html).toBe(doIngles);
  });
});
