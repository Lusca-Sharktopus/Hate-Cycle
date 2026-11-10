// A formatação dos comentários (10/11/2026): as regras puras de src/scripts/comentarios/formato.ts (o que vira negrito, spoiler,
// citação, GIF, imagem; o que fica como texto) e as contas puras do editor (src/scripts/comentarios/editor.ts). O desenho na página
// (só elementos do código, HTML do visitante como texto) é provado em tests/comentarios-dom.test.ts.
import { describe, expect, test } from "vitest";
import {
  alternarCitacao,
  alternarEstilo,
  analisarComentario,
  analisarLinha,
  enderecoDaImagem,
  enderecoDoGif,
  imagensDoComentario,
  inserirTexto,
  juntarMidias,
  MAXIMO_DE_MIDIAS,
  semFormatacao,
  separarMidias,
} from "../src/scripts/comentarios/formato";
import { enderecoDaBusca, lerResultados, tamanhoReduzido, TEXTOS_DO_EDITOR } from "../src/scripts/comentarios/editor";
import { GRUPOS_DE_EMOJIS, recentesDepoisDe, recentesValidos } from "../src/scripts/comentarios/emojis";

const ID = "0f0e0d0c-0b0a-4908-8706-050403020100";

describe("estilos numa linha", () => {
  test("as cinco marcas", () => {
    expect(analisarLinha("**a** *b* __c__ ~~d~~ ||e||")).toEqual([
      { estilo: "negrito", filhos: ["a"] },
      " ",
      { estilo: "italico", filhos: ["b"] },
      " ",
      { estilo: "sublinhado", filhos: ["c"] },
      " ",
      { estilo: "riscado", filhos: ["d"] },
      " ",
      { estilo: "spoiler", filhos: ["e"] },
    ]);
  });
  test("uma dentro da outra", () => {
    expect(analisarLinha("**forte *e inclinado***")).toEqual([{ estilo: "negrito", filhos: ["forte ", { estilo: "italico", filhos: ["e inclinado"] }] }]);
    expect(analisarLinha("*inclinado **e forte** sim*")).toEqual([{ estilo: "italico", filhos: ["inclinado ", { estilo: "negrito", filhos: ["e forte"] }, " sim"] }]);
  });
  test("o que não é marca fica como texto: sem fechar, vazio, espaço grudado, conta de multiplicar, escape", () => {
    expect(analisarLinha("**sem fim")).toEqual(["**sem fim"]);
    expect(analisarLinha("****")).toEqual(["****"]);
    expect(analisarLinha("2 * 3 * 4")).toEqual(["2 * 3 * 4"]);
    expect(analisarLinha("\\*\\*não\\*\\*")).toEqual(["**não**"]);
    expect(analisarLinha("a\\\\b")).toEqual(["a\\b"]);
    expect(analisarLinha("__init__.py")).toEqual([{ estilo: "sublinhado", filhos: ["init"] }, ".py"]);
  });
  test("HTML continua texto", () => {
    expect(analisarLinha("**<img src=x onerror=alert(1)>**")).toEqual([{ estilo: "negrito", filhos: ["<img src=x onerror=alert(1)>"] }]);
  });
  test("profundidade limitada (sem estourar a pilha)", () => {
    const fundo = "**".repeat(200) + "x" + "**".repeat(200);
    expect(() => analisarLinha(fundo)).not.toThrow();
  });
});

describe("o comentário em blocos", () => {
  test("texto, citação, mídias; linhas juntas com \\n", () => {
    const gif = "https://static.klipy.com/a/b.gif";
    expect(analisarComentario(`oi\nsegunda\n> citado\n> mais\n{gif:${gif}}\n{img:${ID}/abcdefghijkl.webp}\nfim`)).toEqual([
      { tipo: "texto", trechos: ["oi\nsegunda"] },
      { tipo: "citacao", trechos: ["citado\nmais"] },
      { tipo: "gif", endereco: gif },
      { tipo: "imagem", caminho: `${ID}/abcdefghijkl.webp` },
      { tipo: "texto", trechos: ["fim"] },
    ]);
  });
  test("uma marca não atravessa a quebra de linha", () => {
    expect(analisarComentario("**a\nb**")).toEqual([{ tipo: "texto", trechos: ["**a\nb**"] }]);
  });
  test(`no máximo ${MAXIMO_DE_MIDIAS} mídias; o resto como texto`, () => {
    const linhas = Array.from({ length: 6 }, (_, n) => `{gif:https://static.klipy.com/${n}.gif}`);
    const b = analisarComentario(linhas.join("\n"));
    expect(b.filter((x) => x.tipo === "gif")).toHaveLength(MAXIMO_DE_MIDIAS);
    expect(b[b.length - 1]).toEqual({ tipo: "texto", trechos: [linhas.slice(4).join("\n")] });
  });
  test("semFormatacao: texto comum (inclusive com HTML) é desenhado como um nó de texto só", () => {
    expect(semFormatacao("<b>oi</b> tudo bem?\nlinha 2")).toBe(true);
    expect(semFormatacao("2 * 3 = 6")).toBe(true);
    expect(semFormatacao("**oi**")).toBe(false);
    expect(semFormatacao("> citação")).toBe(false);
    expect(semFormatacao("\\*escapado\\*")).toBe(false);
  });
});

describe("endereços aceitos", () => {
  test("GIF: só https do KLIPY (klipy.com e subdomínios)", () => {
    expect(enderecoDoGif("https://static.klipy.com/ii/a/b.gif")).toBe("https://static.klipy.com/ii/a/b.gif");
    expect(enderecoDoGif("https://klipy.com/x.webp")).toBe("https://klipy.com/x.webp");
    expect(enderecoDoGif("https://static.klipy.com/a.gif?w=200&h=100")).toBe("https://static.klipy.com/a.gif?w=200&h=100");
    for (const ruim of [
      "http://static.klipy.com/a.gif",
      "javascript:alert(1)",
      "https://klipy.com.evil.test/a.gif",
      "https://evilklipy.com/a.gif",
      "https://user:pw@static.klipy.com/a.gif",
      "https://static.klipy.com:8443/a.gif",
      "https://static.klipy.com/a.gif#x",
      "https://static.klipy.com/a b.gif",
      "https://static.klipy.com/a.gif?x=<script>",
      "//static.klipy.com/a.gif",
      42,
      null,
    ])
      expect(enderecoDoGif(ruim), String(ruim)).toBeNull();
  });
  test("imagem: só caminho <uuid>/<nome>.<webp|jpg|gif> no balde do Supabase do site", () => {
    expect(enderecoDaImagem("https://x.supabase.co", `${ID}/abcdefghijkl.webp`)).toBe(`https://x.supabase.co/storage/v1/object/public/comment-images/${ID}/abcdefghijkl.webp`);
    expect(enderecoDaImagem("https://x.supabase.co", `${ID}/abcdefghijkl.gif`)).not.toBeNull();
    expect(enderecoDaImagem("https://x.supabase.co", `${ID}/../abcdefghijkl.webp`)).toBeNull();
    expect(enderecoDaImagem("https://x.supabase.co", `${ID}/ABC.webp`)).toBeNull();
    expect(enderecoDaImagem("https://x.supabase.co", `${ID}/abcdefghijkl.svg`)).toBeNull();
    expect(enderecoDaImagem("javascript:", `${ID}/abcdefghijkl.webp`)).toBeNull();
  });
});

describe("os botões do editor", () => {
  const s = (valor: string, inicio: number, fim = inicio) => ({ valor, inicio, fim });
  test("põe e tira a marca em volta da seleção (espaços das pontas ficam de fora)", () => {
    expect(alternarEstilo(s("olá mundo", 4, 9), "negrito")).toEqual(s("olá **mundo**", 6, 11));
    expect(alternarEstilo(s("olá **mundo**", 6, 11), "negrito")).toEqual(s("olá mundo", 4, 9));
    expect(alternarEstilo(s("olá **mundo**", 4, 13), "negrito")).toEqual(s("olá mundo", 4, 9));
    expect(alternarEstilo(s("a b c", 1, 4), "spoiler")).toEqual(s("a ||b|| c", 4, 5));
    expect(alternarEstilo(s("", 0), "riscado")).toEqual(s("~~~~", 2, 2));
  });
  test("itálico grudado no negrito não é tirado como itálico", () => {
    expect(alternarEstilo(s("**x**", 2, 3), "italico")).toEqual(s("***x***", 3, 4));
  });
  test("citação: põe '> ' em cada linha da seleção, ou tira de todas", () => {
    expect(alternarCitacao(s("um\ndois\ntres", 1, 5))).toEqual(s("> um\n> dois\ntres", 0, 11));
    expect(alternarCitacao(s("> um\n> dois\ntres", 0, 11))).toEqual(s("um\ndois\ntres", 0, 7));
    expect(alternarCitacao(s("só", 1))).toEqual(s("> só", 0, 4));
  });
  test("emoji entra no lugar da seleção", () => {
    expect(inserirTexto(s("abc", 1, 2), "😀")).toEqual(s("a😀c", 3, 3));
  });
  test("mídias: separar para a edição e juntar para enviar", () => {
    const gif = "https://static.klipy.com/a.gif";
    const corpo = `texto\n{gif:${gif}}\n{img:${ID}/abcdefghijkl.webp}`;
    const sep = separarMidias(corpo);
    expect(sep).toEqual({ texto: "texto", midias: [{ tipo: "gif", endereco: gif }, { tipo: "imagem", caminho: `${ID}/abcdefghijkl.webp` }] });
    expect(juntarMidias(sep.texto, sep.midias)).toBe(corpo);
    expect(juntarMidias("  ", [])).toBeNull();
    expect(juntarMidias("", [{ tipo: "gif", endereco: gif }])).toBe(`{gif:${gif}}`);
    expect(imagensDoComentario(corpo)).toEqual([`${ID}/abcdefghijkl.webp`]);
  });
});

describe("as contas do editor", () => {
  test("imagem reduzida a 1600 px no lado maior, sem aumentar", () => {
    expect(tamanhoReduzido(4000, 3000)).toEqual([1600, 1200]);
    expect(tamanhoReduzido(800, 600)).toEqual([800, 600]);
    expect(tamanhoReduzido(1000, 8000)).toEqual([200, 1600]);
  });
  test("a busca do KLIPY: featured sem termo, search com termo, idioma, filtro de conteúdo", () => {
    expect(enderecoDaBusca("K", "pt", "", null)).toBe("https://api.klipy.com/v2/featured?key=K&limit=24&media_filter=tinygif%2Cmediumgif%2Cgif&locale=pt_BR&contentfilter=medium");
    expect(enderecoDaBusca("K", "en", " gato & rato ", "p2")).toBe("https://api.klipy.com/v2/search?key=K&limit=24&media_filter=tinygif%2Cmediumgif%2Cgif&locale=en_US&contentfilter=medium&q=gato+%26+rato&pos=p2");
  });
  test("a resposta do KLIPY: só GIFs com endereços do KLIPY", () => {
    const r = lerResultados({
      results: [
        { title: "ok", media_formats: { tinygif: { url: "https://static.klipy.com/t.gif", dims: [10, 20] }, mediumgif: { url: "https://static.klipy.com/m.gif" } } },
        { media_formats: { tinygif: { url: "https://evil.test/t.gif" } } },
        { media_formats: null },
        "lixo",
      ],
      next: "",
    });
    expect(r).toEqual({ gifs: [{ previa: "https://static.klipy.com/t.gif", endereco: "https://static.klipy.com/m.gif", titulo: "ok", largura: 10, altura: 20 }], proximo: null });
    expect(lerResultados(null)).toEqual({ gifs: [], proximo: null });
  });
  test("textos pt e en com as mesmas chaves", () => {
    expect(Object.keys(TEXTOS_DO_EDITOR.en).sort()).toEqual(Object.keys(TEXTOS_DO_EDITOR.pt).sort());
  });
  test("emojis: recentes sem repetir e só os que existem nos grupos; a última aba são as runas", () => {
    expect(recentesDepoisDe(["😀", "😂"], "😂")).toEqual(["😂", "😀"]);
    expect(recentesValidos(["😀", "<script>", 3, "✝"])).toEqual(["😀", "✝"]);
    expect(GRUPOS_DE_EMOJIS.map((g) => g.id)).toEqual(["rostos", "gestos", "coracoes", "animais", "comida", "coisas", "simbolos", "runas"]);
    for (const g of GRUPOS_DE_EMOJIS) expect(new Set(g.lista).size, g.id).toBe(g.lista.length);
  });
});

describe("a chave do KLIPY no window.HC (src/lib/comentarios.ts)", () => {
  const base = { ui: { en: { c_title: "Comments" }, pt: { c_title: "Comentários" } }, comRascunhos: false };
  test("sem a chave, o window.HC é o de sempre (igual ao do Python); com ela, ganha `klipy`", async () => {
    const { secaoDeComentarios } = await import("../src/lib/comentarios");
    const sem = secaoDeComentarios("pt", "news/x", { ...base, chaves: { supabase_url: "https://x.supabase.co", supabase_anon_key: "ANON" } });
    const vazia = secaoDeComentarios("pt", "news/x", { ...base, chaves: { supabase_url: "https://x.supabase.co", supabase_anon_key: "ANON", klipy_api_key: "  " } });
    const com = secaoDeComentarios("pt", "news/x", { ...base, chaves: { supabase_url: "https://x.supabase.co", supabase_anon_key: "ANON", klipy_api_key: " KLIPY123 " } });
    expect(sem?.tipo === "caixa" && sem.configuracao).not.toMatch(/klipy/);
    expect(vazia?.tipo === "caixa" && vazia.configuracao).toBe(sem?.tipo === "caixa" && sem.configuracao);
    expect(com?.tipo === "caixa" && com.configuracao).toMatch(/"klipy": "KLIPY123"\}\;$/);
  });
});
