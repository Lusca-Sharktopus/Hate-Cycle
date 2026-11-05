// O marca-página (03/11/2026): as regras puras de src/scripts/marcaPagina/regras.ts e as travas do código que vai para o navegador.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  alturaDaAncora,
  ancoraDaAltura,
  ancoraValida,
  idDoCapitulo,
  lerMarcas,
  marcasQueSobem,
  TEXTOS,
  textosDoIdioma,
  type Bloco,
} from "../src/scripts/marcaPagina/regras";

// três parágrafos de 100 px com 20 px de espaço entre eles: 0–100, 120–220, 240–340
const BLOCOS: Bloco[] = [
  { topo: 0, altura: 100 },
  { topo: 120, altura: 100 },
  { topo: 240, altura: 100 },
];

describe("âncora ↔ altura", () => {
  test("altura dentro de um parágrafo = aquele parágrafo + fração (o espaço até o próximo conta como fim do de cima)", () => {
    expect(ancoraDaAltura(BLOCOS, 0)).toEqual({ paragrafo: 0, fracao: 0 });
    expect(ancoraDaAltura(BLOCOS, 60)).toEqual({ paragrafo: 0, fracao: 0.5 });
    expect(ancoraDaAltura(BLOCOS, 119)).toEqual({ paragrafo: 0, fracao: Math.round((119 / 120) * 1000) / 1000 });
    expect(ancoraDaAltura(BLOCOS, 120)).toEqual({ paragrafo: 1, fracao: 0 });
    expect(ancoraDaAltura(BLOCOS, 290)).toEqual({ paragrafo: 2, fracao: 0.5 });
  });
  test("acima do primeiro = topo dele; abaixo do último = fim dele; sem blocos = 0", () => {
    expect(ancoraDaAltura(BLOCOS, -50)).toEqual({ paragrafo: 0, fracao: 0 });
    expect(ancoraDaAltura(BLOCOS, 9999)).toEqual({ paragrafo: 2, fracao: 1 });
    expect(ancoraDaAltura([], 50)).toEqual({ paragrafo: 0, fracao: 0 });
    expect(alturaDaAncora([], { paragrafo: 3, fracao: 0.5 })).toBe(0);
  });
  test("ida e volta: a altura de uma âncora devolve a mesma âncora", () => {
    for (const y of [0, 10, 59, 100, 130, 219, 240, 300, 340]) {
      const a = ancoraDaAltura(BLOCOS, y);
      expect(ancoraDaAltura(BLOCOS, alturaDaAncora(BLOCOS, a))).toEqual(a);
    }
  });
  test("noutra tela (parágrafos de outro tamanho) o marcador fica no MESMO parágrafo, na mesma fração", () => {
    const a = ancoraDaAltura(BLOCOS, 170); // meio do 2º
    const celular: Bloco[] = [
      { topo: 0, altura: 260 },
      { topo: 280, altura: 300 },
      { topo: 600, altura: 200 },
    ];
    const y = alturaDaAncora(celular, a);
    expect(y).toBeGreaterThan(280);
    expect(y).toBeLessThan(600);
    expect(ancoraDaAltura(celular, y).paragrafo).toBe(1);
  });
  test("texto editado (parágrafo que não existe mais) = o último; fração fora de 0–1 é limitada", () => {
    expect(alturaDaAncora(BLOCOS, { paragrafo: 50, fracao: 0 })).toBe(240);
    expect(alturaDaAncora(BLOCOS, { paragrafo: 0, fracao: 7 })).toBe(120);
    expect(alturaDaAncora(BLOCOS, { paragrafo: -3, fracao: -1 })).toBe(0);
  });
});

describe("ID do capítulo = ID dos comentários (iguais nos dois idiomas)", () => {
  test.each([
    ["/pt/works/firestriker/01/", "works/firestriker/01"],
    ["/en/works/firestriker/01/", "works/firestriker/01"],
    ["/pt/works/light-and-blood/002", "works/light-and-blood/002"],
  ])("%s → %s", (caminho, id) => expect(idDoCapitulo(caminho)).toBe(id));
  test.each(["/pt/works/firestriker/", "/pt/news/2026-01-01-x/", "/pt/works/Fire/01/", "/pt/works/x/1/", "/pt/works/x/01/extra/", "/works/x/01/"])("%s não é capítulo", (c) => {
    expect(idDoCapitulo(c)).toBeNull();
  });
  test("o formato é o mesmo que o banco aceita (check da tabela bookmarks)", () => {
    const sql = readFileSync("supabase/migrations/20261103020000_marca_paginas.sql", "utf8");
    expect(sql).toContain("check (page_id ~ '^works/[a-z0-9-]+/[0-9]{2,3}$' and char_length(page_id) <= 120)");
    for (const pasta of readdirSync("content/works", { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const cap of readdirSync(join("content/works", pasta.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
        expect(idDoCapitulo(`/pt/works/${pasta.name}/${cap.name}/`), `${pasta.name}/${cap.name}`).toBe(`works/${pasta.name}/${cap.name}`);
      }
    }
  });
});

describe("o que vem de fora (navegador, banco) é conferido", () => {
  test("âncora válida: com nomes do banco ou do navegador", () => {
    expect(ancoraValida({ paragrafo: 3, fracao: 0.25 })).toEqual({ paragrafo: 3, fracao: 0.25 });
    expect(ancoraValida({ p: 0, f: 1 })).toEqual({ paragrafo: 0, fracao: 1 });
  });
  test.each([null, undefined, 3, "x", {}, { paragrafo: -1, fracao: 0 }, { paragrafo: 1.5, fracao: 0 }, { paragrafo: 1, fracao: 2 }, { paragrafo: 100001, fracao: 0 }, { paragrafo: 1, fracao: Number.NaN }])("%j é recusado", (x) => {
    expect(ancoraValida(x)).toBeNull();
  });
  test("lerMarcas(): ignora o que estiver estragado, mantém o resto", () => {
    expect(lerMarcas(null)).toEqual({});
    expect(lerMarcas("{nao é json")).toEqual({});
    expect(lerMarcas("[1,2]")).toEqual({});
    const texto = JSON.stringify({
      "works/firestriker/01": { p: 4, f: 0.5, t: 123 },
      "works/firestriker/02": { p: -1, f: 0 },
      "news/2026-01-01-x": { p: 1, f: 0 },
      "works/<script>/01": { p: 1, f: 0 },
      "works/luz/003": { p: 2, f: 0 },
    });
    expect(lerMarcas(texto)).toEqual({ "works/firestriker/01": { p: 4, f: 0.5, t: 123 }, "works/luz/003": { p: 2, f: 0, t: 0 } });
  });
});

describe("ao entrar: a conta tem prioridade (decisão do autor, 02/11)", () => {
  test("só sobem os capítulos que a conta ainda não tem", () => {
    const doNavegador = { "works/a/01": { p: 1, f: 0, t: 9e12 }, "works/b/01": { p: 2, f: 0.5, t: 1 } };
    expect(marcasQueSobem(doNavegador, new Set(["works/a/01"]))).toEqual([{ page_id: "works/b/01", paragrafo: 2, fracao: 0.5 }]);
    expect(marcasQueSobem(doNavegador, new Set(["works/a/01", "works/b/01"]))).toEqual([]);
    expect(marcasQueSobem({}, new Set())).toEqual([]);
  });
});

describe("textos", () => {
  test("pt e en têm as mesmas chaves; idioma da página escolhe", () => {
    expect(Object.keys(TEXTOS.en).sort()).toEqual(Object.keys(TEXTOS.pt).sort());
    expect(textosDoIdioma("pt-BR")).toBe(TEXTOS.pt);
    expect(textosDoIdioma("en")).toBe(TEXTOS.en);
    expect(TEXTOS.pt.onde(2, 10)).toContain("parágrafo 2 de 10");
  });
});

describe("segurança: o código que vai para o navegador", () => {
  const ler = (a: string) =>
    readFileSync(a, "utf8")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
  const arquivos = ["src/scripts/marcaPagina/index.ts", "src/scripts/marcaPagina/regras.ts", "src/scripts/supabase/cliente.ts"];
  test.each(arquivos)("%s não monta HTML com texto (innerHTML e afins) nem usa eval", (a) => {
    expect(ler(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
  });
  test("regras.ts não importa nada; index.ts só importa as regras, a conexão compartilhada e o ícone; ninguém lê src/lib nem o config.json", () => {
    const imports = (a: string) => [...ler(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports("src/scripts/marcaPagina/regras.ts")).toEqual([]);
    expect(imports("src/scripts/marcaPagina/index.ts").sort()).toEqual(["../../assets/marca-pagina/hc-branco.png?url", "../supabase/cliente", "./regras"]);
    expect(imports("src/scripts/supabase/cliente.ts")).toEqual(["@supabase/supabase-js"]);
  });
  test("o marca-página só fala com a tabela bookmarks", () => {
    const tabelas = [...ler("src/scripts/marcaPagina/index.ts").matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tabelas)).toEqual(new Set(["bookmarks"]));
  });
});
