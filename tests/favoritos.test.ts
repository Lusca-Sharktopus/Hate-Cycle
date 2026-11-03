// Histórias favoritas (03/11/2026, só no Astro): as regras, a configuração da página, o campo star_runes do work.json e as travas do
// código que vai para o navegador. A seção inteira num DOM simulado: tests/favoritos-dom.test.ts. O banco: tools/banco_local.py.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { configuracaoDosFavoritos } from "../src/lib/comentarios";
import { RUNAS_PROVISORIAS, runasDaEstrela } from "../src/lib/runasDaEstrela";
import { criarSchemas } from "../src/lib/schemas";
import {
  cartaoFora,
  favoritosDoBanco,
  lerConfiguracaoDosFavoritos,
  obraValida,
  sequenciaDeRunas,
  TEXTOS_DOS_FAVORITOS,
  textosDosFavoritos,
} from "../src/scripts/favoritos/regras";

const CHAVES = { supabase_url: " https://falso.supabase.co/rest/v1/ ", supabase_anon_key: "__CHAVE_FALSA__" };
const RUNAS = { firestriker: { lista: ["ᚠ", "ᚢ"], final: "ᛟ" } };

describe("a configuração da página (window.HC_FAV)", () => {
  test("sem as duas chaves, nada (a seção fica sem favoritos)", () => {
    expect(configuracaoDosFavoritos("pt", [["Pederneira", "firestriker"]], RUNAS, undefined)).toBeNull();
    expect(configuracaoDosFavoritos("pt", [["Pederneira", "firestriker"]], RUNAS, { supabase_url: "x" })).toBeNull();
  });
  test("com as chaves: URL limpa como a dos comentários, idioma, mapa título → obra e as runas; '</' escapado", () => {
    const s = configuracaoDosFavoritos("pt", [["Pederneira", "firestriker"], ["A</script>B", "hdvr"]], RUNAS, CHAVES) ?? "";
    expect(s.startsWith("window.HC_FAV=")).toBe(true);
    expect(s).not.toContain("</script>");
    const cfg = JSON.parse(s.slice("window.HC_FAV=".length, -1).replaceAll("<\\/", "</")) as Record<string, unknown>;
    expect(cfg).toEqual({
      url: "https://falso.supabase.co",
      key: "__CHAVE_FALSA__",
      lang: "pt",
      obras: { Pederneira: "firestriker", "A</script>B": "hdvr" },
      runas: { firestriker: { lista: ["ᚠ", "ᚢ"], final: "ᛟ" } },
    });
    expect(lerConfiguracaoDosFavoritos(cfg)?.obras).toEqual(cfg["obras"]);
  });
  test("lerConfiguracaoDosFavoritos(): descarta obra com identificador fora do formato e runas inválidas", () => {
    const cfg = lerConfiguracaoDosFavoritos({
      url: "u",
      key: "k",
      lang: "en",
      obras: { A: "firestriker", B: "../x", C: 3 },
      runas: { firestriker: { lista: ["ᚠ", "<b>", "  ", "ᚢ"], final: "ᛟ" }, hdvr: { lista: [], final: "ᛟ" }, "../x": { lista: ["ᚠ"], final: "ᛟ" } },
    });
    expect(cfg?.obras).toEqual({ A: "firestriker" });
    expect(cfg?.runas).toEqual({ firestriker: { lista: ["ᚠ", "ᚢ"], final: "ᛟ" } });
    expect(lerConfiguracaoDosFavoritos({ url: "", key: "k", obras: {} })).toBeNull();
    expect(lerConfiguracaoDosFavoritos(null)).toBeNull();
  });
});

describe("as regras", () => {
  test("identificador da obra = o mesmo formato do banco (check de public.favorites); todas as obras de hoje passam", () => {
    for (const ok of ["firestriker", "all-in-a-nights-work", "hdvr", "a1"]) expect(obraValida(ok), ok).toBe(true);
    for (const ruim of ["", "-a", "a-", "A", "a_b", "a/b", "a".repeat(81), 3, null]) expect(obraValida(ruim), String(ruim)).toBe(false);
    const sql = readFileSync("supabase/migrations/20261103060000_favoritos.sql", "utf8");
    expect(sql).toContain("check (work_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(work_id) <= 80)");
  });
  test("favoritosDoBanco(): só os identificadores certos", () => {
    expect([...favoritosDoBanco([{ work_id: "firestriker" }, { work_id: "../x" }, null, {}])]).toEqual(["firestriker"]);
    expect([...favoritosDoBanco(null)]).toEqual([]);
  });
  test("cartaoFora(): com o filtro, sai quem não é favorita (e o cartão sem obra conhecida)", () => {
    const favs = new Set(["firestriker"]);
    expect(cartaoFora("firestriker", true, favs)).toBe(false);
    expect(cartaoFora("hdvr", true, favs)).toBe(true);
    expect(cartaoFora(undefined, true, favs)).toBe(true);
    expect(cartaoFora("hdvr", false, favs)).toBe(false);
  });
  test("sequenciaDeRunas(): 5 sorteadas da lista (nunca a mesma duas vezes seguidas) e, por último, a final", () => {
    const sempreZero = () => 0;
    expect(sequenciaDeRunas({ lista: ["ᚠ", "ᚢ", "ᚦ"], final: "ᛟ" }, 5, sempreZero)).toEqual(["ᚠ", "ᚢ", "ᚠ", "ᚢ", "ᚠ", "ᛟ"]);
    expect(sequenciaDeRunas({ lista: ["ᚠ"], final: "ᛟ" }, 3, sempreZero)).toEqual(["ᚠ", "ᚠ", "ᚠ", "ᛟ"]);
    const seq = sequenciaDeRunas({ lista: ["ᚠ", "ᚢ", "ᚦ", "ᚨ"], final: "ᛟ" });
    expect(seq).toHaveLength(6);
    expect(seq.at(-1)).toBe("ᛟ");
    for (let i = 1; i < 5; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  test("textos: pt e en com as mesmas chaves; o idioma da página escolhe", () => {
    expect(Object.keys(TEXTOS_DOS_FAVORITOS.en).sort()).toEqual(Object.keys(TEXTOS_DOS_FAVORITOS.pt).sort());
    expect(textosDosFavoritos("pt-BR")).toBe(TEXTOS_DOS_FAVORITOS.pt);
    expect(textosDosFavoritos("en")).toBe(TEXTOS_DOS_FAVORITOS.en);
    expect(TEXTOS_DOS_FAVORITOS.pt.favoritar("Pederneira")).toBe("Favoritar Pederneira");
  });
});

describe("star_runes no work.json", () => {
  const works = criarSchemas({ existe: () => true }).works;
  const ler = (star_runes: unknown) => works.safeParse({ star_runes, _origem: { slug: "x" } });
  test("aceita {list, final}", () => {
    const r = ler({ list: ["ᚠ", "ᚢ", "🜂"], final: "ᛟ" });
    expect(r.success).toBe(true);
  });
  test.each([
    [{ list: [], final: "ᛟ" }, "pelo menos uma"],
    [{ list: ["ᚠ ᚢ"], final: "ᛟ" }, "UM símbolo"],
    [{ list: ["<b>"], final: "ᛟ" }, "UM símbolo"],
    [{ list: ["ᚠ"], final: "" }, "runa final"],
    [{ list: ["ᚠ"] }, "runa final"],
    [{ list: ["ᚠ"], final: "ᛟ", outra: 1 }, "só aceita"],
    [["ᚠ"], "tem de ser"],
  ])("recusa %j (%s)", (valor, trecho) => {
    const r = ler(valor);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(trecho);
  });
  test("sem star_runes: as provisórias (runas do bloco Rúnico que o fundo do site já desenha), final ᛟ", () => {
    expect(runasDaEstrela(undefined)).toBe(RUNAS_PROVISORIAS);
    expect(RUNAS_PROVISORIAS.lista.length).toBeGreaterThan(5);
    for (const r of RUNAS_PROVISORIAS.lista) expect(r).toMatch(/^[ᚠ-᛿]$/u);
    expect(runasDaEstrela({ list: ["ᚠ"], final: "ᚱ" })).toEqual({ lista: ["ᚠ"], final: "ᚱ" });
  });
});

describe("segurança: o código que vai para o navegador", () => {
  const ler = (a: string) =>
    readFileSync(a, "utf8")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
  test.each(["src/scripts/favoritos/index.ts", "src/scripts/favoritos/regras.ts"])("%s não monta HTML com texto (innerHTML e afins) nem usa eval", (a) => {
    expect(ler(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
  });
  test("regras.ts não importa nada; index.ts só as regras, a conexão compartilhada e o TIPO do supabase-js; ninguém lê src/lib nem o config.json", () => {
    const imports = (a: string) => [...ler(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports("src/scripts/favoritos/regras.ts")).toEqual([]);
    expect(imports("src/scripts/favoritos/index.ts").sort()).toEqual(["../supabase/cliente", "./regras", "@supabase/supabase-js"]);
    expect(ler("src/scripts/favoritos/index.ts")).toMatch(/import type \{ SupabaseClient \} from "@supabase\/supabase-js"/);
  });
  test("os favoritos só falam com a tabela favorites", () => {
    const tabelas = [...ler("src/scripts/favoritos/index.ts").matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tabelas)).toEqual(new Set(["favorites"]));
  });
});
