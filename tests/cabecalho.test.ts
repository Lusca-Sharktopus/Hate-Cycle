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
  const h1 = '<h1 class="chapter-title">Luke 10:3</h1>';
  test("tira o aviso logo depois do </h1> e a linha antes do vídeo", () => {
    const astro = `${h1}<p class="chapter-note">Turn Close Captions on!</p><hr class="thin"><div class="player-row">x</div>`;
    expect(cabecalhoDoCapituloComoNoPython(astro)).toEqual({ html: `${h1}<div class="player-row">x</div>`, avisos: 1, linhas: 1 });
  });
  test("tira a linha antes do quadrinho (pager, comic, folheador) e do vídeo sem setas", () => {
    for (const depois of ['<nav class="pager">', '<div class="comic">', '<div class="folheador" data-folheador>', '<div class="video-wrapper">']) {
      expect(cabecalhoDoCapituloComoNoPython(`${h1}<hr class="thin">${depois}`), depois).toEqual({ html: `${h1}${depois}`, avisos: 0, linhas: 1 });
    }
  });
  test("NÃO tira a linha do texto (ela existe nos dois geradores), nem linha ou aviso fora do lugar", () => {
    const casos = [
      `${h1}<hr class="thin"><div class="prose story">`,
      `${h1}<hr class="thin"><div class="jogo" data-jogo>`,
      `<p>x</p><hr class="thin"><div class="player-row">`,
      `<p>x</p><p class="chapter-note">Turn Close Captions on!</p>`,
      `${h1}<p class="chapter-note"><b>x</b></p>`,
    ];
    for (const c of casos) expect(cabecalhoDoCapituloComoNoPython(c), c).toEqual({ html: c, avisos: 0, linhas: 0 });
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
