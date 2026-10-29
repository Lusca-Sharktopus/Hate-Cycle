// O cabeçalho dos capítulos (28/10, pedidos do autor; só no Astro): sem a data sob o título, com o aviso `chapter_note` ("Turn Close
// Captions on!" em Luz & Sangue e O Pêndulo, só em inglês) e a linha fina (hr.thin) também no vídeo e no quadrinho. Prova as duas
// exceções de paridade (tests/ajudantes/html.ts), inclusive o que elas NÃO podem tirar, e a regra do aviso (src/lib/leitura.ts).
import { describe, expect, test } from "vitest";
import { cabecalhoDoCapituloComoNoPython, semDataDoCapitulo } from "./ajudantes/html";
import { avisoDoCapitulo } from "../src/lib/leitura";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

describe("avisoDoCapitulo (chapter_note do work.json)", () => {
  test("só no idioma escrito: sem cair para o outro idioma", () => {
    expect(avisoDoCapitulo({ en: "Turn Close Captions on!" }, "en")).toBe("Turn Close Captions on!");
    expect(avisoDoCapitulo({ en: "Turn Close Captions on!" }, "pt")).toBeNull();
    expect(avisoDoCapitulo("Igual nos dois", "pt")).toBe("Igual nos dois");
    expect(avisoDoCapitulo(undefined, "en")).toBeNull();
    expect(avisoDoCapitulo({ en: "  " }, "en")).toBeNull();
  });
  test("Luz & Sangue e O Pêndulo têm o aviso do autor, só em inglês", () => {
    for (const obra of ["light-and-blood", "the-pendulum"]) {
      const wj = JSON.parse(readFileSync(join(RAIZ, "content/works", obra, "work.json"), "utf8"));
      expect(wj.chapter_note, obra).toEqual({ en: "Turn Close Captions on!" });
    }
  });
});

describe("cabecalhoDoCapituloComoNoPython (HTML do Astro)", () => {
  const logo = '<a href="/en/works/light-and-blood/"><img class="title-image" src="/logos/x.png" alt="Light &amp; Blood" srcset="/x.webp 380w" sizes="380px"></a>';
  const logoSemLink = '<img class="title-image" src="/logos/p.png" alt="Pederneira">';
  const h1 = '<h1 class="chapter-title">Luke 10:3</h1>';
  const zero = { avisos: 0, linhas: 0, devolvidas: 0, semLogo: 0 };
  test("vídeo: tira a linha de logo abaixo da logo e o aviso (o Python não tem nenhum dos dois)", () => {
    const astro = `${logo}<hr class="thin">${h1}<p class="chapter-note">Turn Close Captions on!</p><div class="player-row">x</div>`;
    expect(cabecalhoDoCapituloComoNoPython(astro)).toEqual({ html: `${logo}${h1}<div class="player-row">x</div>`, ...zero, avisos: 1, linhas: 1 });
  });
  test("texto: a linha volta para depois do título (onde o Python a desenha), também antes da janela do jogo", () => {
    const sr = '<h1 class="sr-only">Pederneira</h1>';
    for (const depois of ['<div class="prose story font-times">', '<div class="prose story">', '<div class="jogo" data-jogo>']) {
      expect(cabecalhoDoCapituloComoNoPython(`${logoSemLink}<hr class="thin">${sr}${depois}`), depois).toEqual({ html: `${logoSemLink}${sr}<hr class="thin">${depois}`, ...zero, linhas: 1, devolvidas: 1 });
    }
  });
  test("o alt da logo pode ter \">\" sem escape (\"Setas -> B\")", () => {
    const comSeta = '<img class="title-image" src="/logos/setas.png" alt="Setas -> B">';
    expect(cabecalhoDoCapituloComoNoPython(`${comSeta}<hr class="thin">${h1}<nav class="pager">`)).toEqual({ html: `${comSeta}${h1}<nav class="pager">`, ...zero, linhas: 1 });
  });
  test("sem logo: o texto já está como no Python; no vídeo/quadrinho sai a linha depois do título", () => {
    expect(cabecalhoDoCapituloComoNoPython(`${h1}<hr class="thin"><div class="prose story">`)).toEqual({ html: `${h1}<hr class="thin"><div class="prose story">`, ...zero });
    for (const depois of ['<nav class="pager">', '<div class="comic">', '<div class="folheador" data-folheador>', '<div class="video-wrapper">', '<div class="player-row">']) {
      expect(cabecalhoDoCapituloComoNoPython(`${h1}<hr class="thin">${depois}`), depois).toEqual({ html: `${h1}${depois}`, ...zero, semLogo: 1 });
    }
  });
  test("NÃO mexe em linha ou aviso fora do lugar", () => {
    const casos = [
      `<p>x</p><hr class="thin"><div class="player-row">`,
      `<img src="/outra.png"><hr class="thin">`,
      `<p>x</p><p class="chapter-note">Turn Close Captions on!</p>`,
      `<p>x</p><div class="prose">`,
      `<h1>About</h1><div class="prose">`, // página avulsa: o <h1> dela não é o do capítulo
      `<h1 class="sr-only">About the author</h1><div class="prose">`, // a Sobre: <h1> escondido, mas o texto não é o de capítulo (prose story)
    ];
    for (const c of casos) expect(cabecalhoDoCapituloComoNoPython(c), c).toEqual({ html: c, ...zero });
  });
});

describe("semDataDoCapitulo (HTML do Python)", () => {
  const h1 = '<h1 class="chapter-title">Luke 10:3</h1>';
  test("tira a data logo depois do </h1>", () => {
    expect(semDataDoCapitulo(`${h1}<p class="chapter-date"><time datetime="2026-06-06">Jun 6, 2026</time></p><div>`)).toEqual({ html: `${h1}<div>`, tiradas: 1 });
  });
  test("NÃO tira data em outro lugar (lista de capítulos, notícias)", () => {
    for (const c of ['<li><time>Jun 6, 2026</time></li>', '<p>x</p><p class="chapter-date"><time datetime="2026-06-06">Jun 6, 2026</time></p>']) {
      expect(semDataDoCapitulo(c), c).toEqual({ html: c, tiradas: 0 });
    }
  });
});
