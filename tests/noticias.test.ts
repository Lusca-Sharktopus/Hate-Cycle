// Prova de que a LISTA e o ARTIGO das notícias (T13) desenham o mesmo que o build.py também no que o conteúdo de hoje não tem:
// notícia sem título, data, resumo ou imagem; só em um idioma; rascunho (só na prévia); `comments: false`; backdrop só no topo,
// só no pé e nos dois; colagem com e sem papel, com figurinhas sem posição, com decimais e com backdrop junto (a colagem vence);
// posts alternados (A | B e A | B | C), post de arquivo, Short vertical e carta que vira; etiquetas vazias, com HTML e com
// versalete; "Veja também" que não existe no idioma ou é rascunho; título e resumo com & < > e aspas; mais de 10 notícias;
// idioma que só tem rascunho; comentários sem chaves, com uma chave só e com chaves "sujas".
//
// A referência (tests/fixtures/paginas-t13-python.json → "ambientes") vem de `python3 tools/paginas_ref.py`: o build() de
// verdade sobre cada site inventado (os de tools/regras_ref.py e os de notícias), em build e em prévia. De cada página: os
// argumentos que o Python passou ao shell() e o <main> final. Aqui, o mesmo site é recriado numa pasta temporária, lido com o
// MESMO carregador e as MESMAS regras do Astro (src/lib/idioma.ts, src/lib/artigos.ts), desenhado pelos componentes
// ListaDeNoticias e ArtigoDeNoticia (Container API do Astro) e acabado pelo MESMO finalizarMain() do layout. Comparação
// estrutural (tests/ajudantes/html.ts). As páginas REAIS (as 2 listas e as 166 notícias do site construído de verdade) são
// provadas em tests/paginas.test.ts, grupo t13.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import ArtigoDeNoticia from "../src/components/ArtigoDeNoticia.astro";
import ListaDeNoticias from "../src/components/ListaDeNoticias.astro";
import { artigosDasNoticias, desenhoDaNoticia, estiloDaImagemDeFundo, figurinhaDaLinha, paginaDaListaDeNoticias, type NoticiaParaArtigo } from "../src/lib/artigos";
import { assetVersioned } from "../src/lib/assets";
import { secaoDeComentarios, type ChavesDoSupabase, type TextosDaInterface } from "../src/lib/comentarios";
import { langs, type Lang } from "../src/lib/config";
import { dadosDoIdioma } from "../src/lib/idioma";
import { barraDePaginas, combinaComBusca, ITENS_POR_PAGINA, itensDaPagina, normalizarBusca, paginaPedida, paginaValida, palavrasDaBusca, totalDePaginas } from "../src/lib/paginacao";
import { finalizarMain } from "../src/lib/pagina";
import { canonicoDoMiolo } from "./ajudantes/html";
import { carregarConteudo } from "./ajudantes/conteudo";

interface Shell {
  titulo: string;
  alt: Record<string, string>;
  cls: string;
  desc: string;
  imagem: string;
  noindex: boolean;
}
interface Ambiente {
  nome: string;
  rascunhos: boolean;
  arquivos_sha1: string;
  config: { show_extras: boolean; comments: ChavesDoSupabase; ui_c: TextosDaInterface };
  noticias: Record<string, { shell: Shell; main: string }>;
}
const ref: { ambientes: Ambiente[]; arquivos_das_noticias: Record<string, Record<string, string>> } = JSON.parse(
  readFileSync(new URL("./fixtures/paginas-t13-python.json", import.meta.url), "utf8"),
);
const regras: { cenarios: { nome: string; arquivos: Record<string, string> }[] } = JSON.parse(readFileSync(new URL("./fixtures/regras-python.json", import.meta.url), "utf8"));
const REFAZER = "A referência está velha: rode `python3 tools/regras_ref.py` e `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-noticias-teste-"));
  pastas.push(raiz);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return raiz;
}
/** json.dumps(x, sort_keys=True, ensure_ascii=False) do Python (o carimbo dos arquivos de cada cenário). */
function pythonJson(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(pythonJson).join(", ")}]`;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${pythonJson((o as Record<string, unknown>)[k])}`).join(", ")}}`;
}
const sha = (arquivos: Record<string, string>) => createHash("sha1").update(pythonJson(arquivos)).digest("hex");

const SCRIPT_DOS_COMENTARIOS = assetVersioned("comments.js");
const container = await AstroContainer.create();

let comparadas = 0;
afterAll(() => console.log(`\nNotícias — ${comparadas} páginas (listas e artigos) de sites inventados comparadas com o build.py (<main> e argumentos do shell()).\n`));

for (const amb of ref.ambientes) {
  // os cenários de notícias vêm no próprio arquivo; os outros (variado…) são os de tools/regras_ref.py
  const arquivos = amb.nome === "noticias-so-pt" ? ref.arquivos_das_noticias["noticias-so-pt"] : amb.nome.startsWith("noticias") ? ref.arquivos_das_noticias["noticias"] : regras.cenarios.find((c) => c.nome === amb.nome)?.arquivos;
  if (!arquivos) throw new Error(`sem arquivos para o ambiente ${amb.nome}`);
  const raiz = pastaTemporaria(arquivos);
  const entradas = carregarConteudo(raiz, { comRascunhos: amb.rascunhos, mostrarExtras: amb.config.show_extras });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos: amb.rascunhos, mostrarExtras: amb.config.show_extras, emissariosEscondidos: [], todosOsIdiomas: langs });
  const dadosDe = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  const noticiasPorIdioma = Object.fromEntries(langs.map((l) => [l, dadosDe[l].noticias])) as Record<Lang, ReturnType<typeof montar>["noticias"]>;
  const quantas = Object.fromEntries(langs.map((l) => [l, dadosDe[l].noticias.length])) as Record<Lang, number>;
  const ferramentas = {
    noticiasPorIdioma,
    comentarios: (lang: Lang, id: string | null) =>
      secaoDeComentarios(lang, id, { chaves: amb.config.comments, ui: amb.config.ui_c, comRascunhos: amb.rascunhos, scriptDosComentarios: SCRIPT_DOS_COMENTARIOS }),
  };
  const listas = langs.flatMap((l) => {
    const p = paginaDaListaDeNoticias(dadosDe[l].noticias, l, quantas);
    return p ? [p] : [];
  });
  const artigos = langs.flatMap((l) => artigosDasNoticias(dadosDe[l].noticias, l, { ...ferramentas, relacionadosDe: dadosDe[l].relacionadosDe }));

  describe(`${amb.nome} · ${amb.rascunhos ? "prévia" : "build"}`, () => {
    test("a referência é do mesmo conteúdo", () => {
      expect(sha(arquivos), REFAZER).toBe(amb.arquivos_sha1);
    });

    test("as mesmas páginas (nenhuma a mais, nenhuma a menos; lista só em idioma com notícia; rascunho só na prévia)", () => {
      expect([...listas.map((p) => p.url), ...artigos.map((a) => a.url)].sort(), REFAZER).toEqual(Object.keys(amb.noticias).sort());
    });

    test.each(listas.map((p) => [p.url, p] as const))("lista %s", async (url, pagina) => {
      const py = amb.noticias[url];
      if (!py) throw new Error(`o Python não gerou ${url}`);
      expect({ titulo: pagina.titulo, alt: pagina.alternativas, cls: "", desc: "", imagem: "", noindex: false }, url).toEqual(py.shell);
      const pronto = finalizarMain(await container.renderToString(ListaDeNoticias, { props: { pagina } }), pagina.lang);
      expect(canonicoDoMiolo(pronto.html), url).toBe(canonicoDoMiolo(py.main));
      // a lista sempre leva o JavaScript da busca e das páginas
      expect(pronto.scripts, `${url}: script da lista`).not.toBe("");
      comparadas++;
    });

    test.each(artigos.map((a) => [a.url, a] as const))("artigo %s", async (url, artigo) => {
      const py = amb.noticias[url];
      if (!py) throw new Error(`o Python não gerou ${url}`);
      // o que vai para o <head> e o <body> (BaseLayout): os mesmos argumentos do shell()
      expect({ titulo: artigo.tituloDaPagina, alt: artigo.alternativas, cls: artigo.classeDoCorpo, desc: artigo.descricao, imagem: artigo.imagem, noindex: false }, url).toEqual(py.shell);
      // o <main>: o artigo + o acabamento do layout (versalete, data-prev/next; scripts de componente vão para o fim)
      const pronto = finalizarMain(await container.renderToString(ArtigoDeNoticia, { props: { artigo } }), artigo.lang);
      expect(canonicoDoMiolo(pronto.html), url).toBe(canonicoDoMiolo(py.main));
      // JavaScript só onde precisa: a carta que vira / os posts alternados
      expect(pronto.scripts !== "", `${url}: scripts de componente`).toBe(artigo.temCartaQueVira || artigo.temPostsAlternados);
      comparadas++;
    });
  });
}

describe("o cenário de notícias exercita o que promete", () => {
  const amb = ref.ambientes.find((a) => a.nome === "noticias" && a.rascunhos);
  const paginas = Object.entries(amb?.noticias ?? {});
  const main = (url: string) => amb?.noticias[url]?.main ?? "";
  test("os três desenhos, o Short, o A | B, o A | B | C e a carta aparecem no HTML do Python", () => {
    expect(paginas.length).toBeGreaterThan(40);
    expect(main("/pt/news/2026-02-06-colagem/")).toContain("news-collage");
    expect(main("/pt/news/2026-02-06-colagem/")).toContain("news-paper");
    expect(main("/en/news/2026-02-07-colagem-sem-papel/")).not.toContain("news-paper");
    expect(main("/en/news/2026-02-07-colagem-sem-papel/")).toContain('style=""'); // figurinha sem posição
    expect(main("/en/news/2026-02-08-fundo-topo/")).toMatch(/news-bd top/);
    expect(main("/en/news/2026-02-08-fundo-topo/")).not.toMatch(/news-bd bottom/);
    expect(main("/en/news/2026-02-09-fundo-pe/")).toMatch(/news-bd bottom/);
    expect(main("/en/news/2026-02-09-fundo-pe/")).not.toMatch(/news-bd top/);
    expect(main("/en/news/2026-02-11-embeds/")).toContain("short-embed");
    expect(main("/en/news/2026-02-11-embeds/")).toContain("embed-alt");
    expect(main("/en/news/2026-02-11-embeds/")).toContain("flip-card");
    expect((main("/en/news/2026-02-11-embeds/").match(/class="embed-btn/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(main("/en/news/2026-02-05-sem-comentarios/")).not.toContain("hc-comments");
    expect(main("/pt/news/2026-02-20-rascunho/")).toContain("draft-banner");
    expect(main("/pt/news/")).toContain('hidden data-search="'); // da 11ª em diante
  });
});

describe("peças soltas", () => {
  test("figurinhaDaLinha(): letras viram propriedades; a vira --a em graus; espaços e decimais; sem posições = estilo vazio", () => {
    expect(figurinhaDaLinha("news/stickers/formula.png | l3 t2 w26 a-4")).toEqual({ arquivo: "news/stickers/formula.png", estilo: "left:3%;top:2%;width:26%;--a:-4deg" });
    expect(figurinhaDaLinha("x.png | r4 b1.5 a8")).toEqual({ arquivo: "x.png", estilo: "right:4%;bottom:1.5%;--a:8deg" });
    expect(figurinhaDaLinha("  com espaco.png  |   t5    w10   ")).toEqual({ arquivo: "com espaco.png", estilo: "top:5%;width:10%" });
    expect(figurinhaDaLinha("solta.png")).toEqual({ arquivo: "solta.png", estilo: "" });
    expect(figurinhaDaLinha("x.png | l3 xx t2")).toEqual({ arquivo: "x.png", estilo: "left:3%;top:2%" }); // palavra que não é posição é ignorada
    expect(figurinhaDaLinha("x.png|l3 t2")).toEqual({ arquivo: "x.png", estilo: "left:3%;top:2%" }); // espaço sem quebra também separa (str.split() do Python)
  });

  test("desenhoDaNoticia(): colagem vence fundo, que vence o comum; vazios não contam", () => {
    const n = (data: Record<string, unknown>) => ({ data: { _origem: { slug: "x", lang: "pt" as Lang }, ...data } }) as NoticiaParaArtigo;
    expect(desenhoDaNoticia(n({ stickers: ["a.png"], backdrop_top: "t.jpg", image: "i.png" })).tipo).toBe("colagem");
    expect(desenhoDaNoticia(n({ stickers: [], backdrop_top: "t.jpg" })).tipo).toBe("fundo");
    expect(desenhoDaNoticia(n({ backdrop_top: "", backdrop_bottom: "p.jpg" }))).toEqual({ tipo: "fundo", topo: "", pe: "p.jpg" });
    expect(desenhoDaNoticia(n({ backdrop_top: "", backdrop_bottom: "", image: "i.png" }))).toEqual({ tipo: "comum", imagem: "i.png" });
    expect(desenhoDaNoticia(n({}))).toEqual({ tipo: "comum", imagem: "" });
  });

  test("estiloDaImagemDeFundo(): url() sem aspas, com o endereço do arquivo codificado", () => {
    expect(estiloDaImagemDeFundo("news/fundo papel.jpg")).toBe("background-image:url(/news/fundo%20papel.jpg)");
  });

  test("busca: minúsculas e sem acentos; todas as palavras precisam aparecer; vazia combina com tudo", () => {
    expect(normalizarBusca("Residência  Ação")).toBe("residencia  acao");
    expect(normalizarBusca(undefined)).toBe("");
    expect(palavrasDaBusca("  Luz   e SANGUE ")).toEqual(["luz", "e", "sangue"]);
    expect(palavrasDaBusca("")).toEqual([]);
    const texto = normalizarBusca("Bem-vindos a Luz & Sangue — nova obra");
    expect(combinaComBusca(texto, palavrasDaBusca("luz sangue"))).toBe(true);
    expect(combinaComBusca(texto, palavrasDaBusca("LUZ falta"))).toBe(false);
    expect(combinaComBusca(texto, palavrasDaBusca(""))).toBe(true);
    // letras de versalete (Hᴀᴛᴇ) não são "a" para a busca: no site atual, "hate" não acha o que está escrito em versalete
    expect(combinaComBusca(normalizarBusca("Hᴀᴛᴇ Cʏᴄʟᴇ"), palavrasDaBusca("hate"))).toBe(false);
  });

  test("páginas: ?p= fora dos limites, texto ou zero; 10 por página; a barra com '…'", () => {
    expect(ITENS_POR_PAGINA).toBe(10);
    expect(paginaPedida("?p=3")).toBe(3);
    expect(paginaPedida("")).toBe(1);
    expect(paginaPedida("?p=abc")).toBe(1);
    expect(paginaPedida("?p=0")).toBe(1);
    expect(paginaPedida("?p=2x")).toBe(2); // parseInt
    expect(paginaPedida("?p=-3")).toBe(-3); // corrigido depois por paginaValida
    expect(paginaValida(-3, 83)).toBe(1);
    expect(paginaValida(99, 83)).toBe(9);
    expect(totalDePaginas(83)).toBe(9);
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(10)).toBe(1);
    expect(totalDePaginas(11)).toBe(2);
    expect(itensDaPagina([...Array(83).keys()], 9)).toEqual([80, 81, 82]);
    const rotulos = (atual: number, total: number) => barraDePaginas(atual, total).map((i) => (i.tipo === "numero" ? (i.atual ? `[${i.pagina}]` : String(i.pagina)) : i.tipo === "reticencias" ? "…" : i.tipo === "anterior" ? "‹" : "›"));
    expect(rotulos(1, 1)).toEqual([]);
    expect(rotulos(1, 9)).toEqual(["[1]", "2", "3", "…", "9", "›"]);
    expect(rotulos(5, 9)).toEqual(["‹", "1", "…", "3", "4", "[5]", "6", "7", "…", "9", "›"]);
    expect(rotulos(9, 9)).toEqual(["‹", "1", "…", "7", "8", "[9]"]);
    expect(rotulos(2, 4)).toEqual(["‹", "1", "[2]", "3", "4", "›"]);
  });
});
