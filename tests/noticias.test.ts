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
import { secaoDeComentarios, type ChavesDoSupabase, type TextosDaInterface } from "../src/lib/comentarios";
import { langs, tDoConfig, type Lang } from "../src/lib/config";
import { CHAVES_DO_BLOG, TEXTOS_DO_BLOG } from "../src/lib/textosDoBlog";
import { dadosDoIdioma } from "../src/lib/idioma";
import { barraDePaginas, combinaComBusca, ITENS_POR_PAGINA, itensDaPagina, normalizarBusca, paginaPedida, paginaValida, palavrasDaBusca, totalDePaginas } from "../src/lib/paginacao";
import { finalizarMain } from "../src/lib/pagina";
import { blogComoNoPython, canonicoDoMiolo, RE_SCRIPT_DOS_COMENTARIOS, resumoCortadoComoNoPython, semScriptsAntigosDosComentarios } from "./ajudantes/html";
import { CARACTERES_DO_DEGRADE, partesDoResumoCortado, resumoAutomatico, resumoFoiCortado, textoDeBuscaDaNoticia, textoPuro } from "../src/lib/resumos";
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

const container = await AstroContainer.create();

/** T17n: o HTML do Astro com os textos do blog ("Blog", "Todos os posts"…) como os do config.json, que o build.py usa (tests/blog.test.ts). */
const textosDoBlogNoConfig = (l: Lang) => Object.fromEntries(CHAVES_DO_BLOG.map((k) => [k, tDoConfig(l, k)])) as Record<(typeof CHAVES_DO_BLOG)[number], string>;
const blogComoNoPythonEm = (html: string, l: Lang) => blogComoNoPython(html, TEXTOS_DO_BLOG[l], textosDoBlogNoConfig(l)).html;

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
      secaoDeComentarios(lang, id, { chaves: amb.config.comments, ui: amb.config.ui_c, comRascunhos: amb.rascunhos }),
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
      // T17n: o título da lista é "Blog" (src/lib/textosDoBlog.ts); o do Python, o do config.json
      expect(pagina.titulo, url).toBe(TEXTOS_DO_BLOG[pagina.lang].news);
      expect({ titulo: tDoConfig(pagina.lang, "news"), alt: pagina.alternativas, cls: "", desc: "", imagem: "", noindex: false }, url).toEqual(py.shell);
      const pronto = finalizarMain(await container.renderToString(ListaDeNoticias, { props: { pagina } }), pagina.lang);
      // T17j: o resumo cortado termina num degradê e o "…" vai para o link; desfeito só isso (resumoCortadoComoNoPython, provada abaixo)
      // T17n: "Blog", "Buscar no blog…", "Nenhum post encontrado." voltam aos textos do config.json (blogComoNoPython)
      expect(canonicoDoMiolo(resumoCortadoComoNoPython(blogComoNoPythonEm(pronto.html, pagina.lang)).html), url).toBe(canonicoDoMiolo(py.main));
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
      // T15: o Python tem o supabase-js do CDN e o /comments.js depois do window.HC; o Astro, o script empacotado no fim da página
      const semAntigos = semScriptsAntigosDosComentarios(py.main);
      const temCaixa = artigo.comentarios?.tipo === "caixa";
      expect({ pares: semAntigos.quantos, sobrou: semAntigos.sobrou }, url).toEqual({ pares: temCaixa ? 1 : 0, sobrou: false });
      // T17n: o botão do meio ("Todos os posts") volta ao texto do config.json (blogComoNoPython)
      expect(canonicoDoMiolo(blogComoNoPythonEm(pronto.html, artigo.lang)), url).toBe(canonicoDoMiolo(semAntigos.html));
      // JavaScript só onde precisa: o dos comentários (só com a caixa de verdade) e a carta que vira / os posts alternados
      const doComentario = pronto.scripts.match(RE_SCRIPT_DOS_COMENTARIOS) ?? [];
      expect(doComentario.length, `${url}: script dos comentários`).toBe(temCaixa ? 1 : 0);
      expect(pronto.scripts.replace(RE_SCRIPT_DOS_COMENTARIOS, "") !== "", `${url}: scripts de componente`).toBe(artigo.temCartaQueVira || artigo.temPostsAlternados);
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
    // T17k (B22): o versalete Unicode (Hᴀᴛᴇ Cʏᴄʟᴇ) vale como letra comum na busca ("hate", "Hate", "HATE", "cycle"), sem perder o resto
    const titulo = normalizarBusca("Novidades do Hᴀᴛᴇ Cʏᴄʟᴇ: Ação");
    expect(titulo).toBe("novidades do hate cycle: acao");
    for (const consulta of ["hate", "Hate", "HATE", "cycle", "CYCLE", "hate cycle", "hᴀᴛᴇ", "acao", "ação"]) expect(combinaComBusca(titulo, palavrasDaBusca(consulta)), consulta).toBe(true);
    expect(combinaComBusca(titulo, palavrasDaBusca("hate zzz"))).toBe(false);
    // o alfabeto todo: cada letra de versalete vira a sua letra comum (o "ǫ" do q não pode virar "o" pela decomposição)
    expect(normalizarBusca("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ")).toBe("abcdefghijklmnopqrstuvwyz");
    expect(normalizarBusca("ǫᴜᴀʀᴛᴢ Quartz")).toBe("quartz quartz");
  });

  test("páginas: ?p= fora dos limites, texto ou zero; 10 por página; a barra com '…'", () => {
    expect(ITENS_POR_PAGINA).toBe(10);
    expect(paginaPedida("?p=3")).toBe(3);
    expect(paginaPedida("")).toBe(1);
    expect(paginaPedida("?p=abc")).toBe(1);
    expect(paginaPedida("?p=0")).toBe(1);
    // T17k (B22): só dígitos valem; o resto é página 1 (antes "2x" valia 2 por causa do parseInt)
    for (const estranho of ["?p=2x", "?p=x2", "?p=2.5", "?p=1e3", "?p=0x5", "?p=+2", "?p= 2", "?p=2 ", "?p=-3", "?p=", "?outro=1", "?p=%32%78"]) expect(paginaPedida(estranho), estranho).toBe(1);
    expect(paginaPedida("?p=007")).toBe(7);
    expect(paginaPedida("?p=99")).toBe(99); // fora do intervalo: corrigido depois por paginaValida (vira a última)
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

// ───────────── T17j: o degradê no fim do resumo cortado (pedido do autor, 21/10/2026, "print gradient.png") ─────────────

describe("T17j: resumo cortado → degradê no fim e \"…leia mais\"", () => {
  const LONGO = "Olivia Purinna tem absoluta certeza de que dragões existem, e ela vai provar isso não importa o quão desastrosa a jornada dela seja, custe o que custar.";
  test("cortado = só o resumo automático que não coube; o `summary:` do autor e o texto curto não são cortados", () => {
    expect(resumoFoiCortado(undefined, LONGO)).toBe(true);
    expect(resumoFoiCortado("", LONGO)).toBe(true);
    expect(resumoFoiCortado("Resumo do autor, mesmo que termine assim…", LONGO)).toBe(false);
    expect(resumoFoiCortado(undefined, "Curto.")).toBe(false);
    expect(resumoFoiCortado(undefined, "")).toBe(false);
  });
  test("as duas partes são o resumo sem o \"…\" (nenhuma letra some); o fim são as últimas palavras, com pelo menos CARACTERES_DO_DEGRADE letras", () => {
    const r = resumoAutomatico(LONGO);
    expect(r.endsWith("…")).toBe(true);
    const { inicio, fim } = partesDoResumoCortado(r);
    expect(inicio + fim).toBe(r.slice(0, -1));
    expect(Array.from(fim).length).toBeGreaterThanOrEqual(CARACTERES_DO_DEGRADE);
    expect(inicio.endsWith(" ")).toBe(true);
    expect(fim.startsWith(" ")).toBe(false);
    expect(partesDoResumoCortado("uma palavra comprida demais…")).toEqual({ inicio: "uma palavra ", fim: "comprida demais" });
    expect(partesDoResumoCortado("a b c de…")).toEqual({ inicio: "", fim: "a b c de" });
    expect(partesDoResumoCortado("semespaconenhumcomprido…")).toEqual({ inicio: "", fim: "semespaconenhumcomprido" });
  });
  test("a busca não perde palavras: o data-search continua sendo o texto inteiro (não depende do corte)", () => {
    const busca = textoDeBuscaDaNoticia("pt", { titulo: "T", tags: [], data: "2026-01-01", corpo: LONGO });
    expect(busca).toContain(textoPuro(LONGO));
    expect(busca).toContain("custe o que custar");
  });
  test("a exceção de paridade desfaz SÓ a forma exata do Astro", () => {
    const astro = '<p>começo da frase <span class="news-fade">fim dela</span> <a class="more" href="/pt/news/x/">…leia mais</a></p>';
    expect(resumoCortadoComoNoPython(astro)).toEqual({ html: '<p>começo da frase fim dela… <a class="more" href="/pt/news/x/">leia mais</a></p>', trocados: 1 });
    for (const outro of [
      '<p>texto <a class="more" href="/pt/news/x/">leia mais</a></p>', // sem corte: fica
      '<p>a <span class="news-fade">b<b>c</b></span> <a class="more" href="/x/">…leia mais</a></p>', // tag dentro do span
      '<p>a <span class="news-fade" id="z">b</span> <a class="more" href="/x/">…leia mais</a></p>', // outro atributo
      '<p>a <span class="news-fade">b</span><a class="more" href="/x/">…leia mais</a></p>', // sem o espaço
      '<p>a <span class="news-fade">b</span> <a class="more" href="/x/">leia mais</a></p>', // link sem "…"
      '<p>a <span class="news-fade">b</span> <a class="outra" href="/x/">…leia mais</a></p>', // outro link
    ]) {
      expect(resumoCortadoComoNoPython(outro), outro).toEqual({ html: outro, trocados: 0 });
    }
  });
  test("o componente: cortado → span.news-fade + \"…\" no link; não cortado → como antes", async () => {
    const pagina = {
      lang: "pt" as Lang,
      url: "/pt/news/",
      titulo: "Notícias",
      alternativas: {},
      busca: { placeholder: "Buscar", semResultados: "Nada" },
      paginacao: { rotulo: "Páginas", anterior: "Anterior", proximo: "Próxima", porPagina: 10 },
      rotuloDoLink: "leia mais",
      linhas: [
        { url: "/pt/news/a/", titulo: "A", data: "1", miniatura: undefined, tags: [], resumo: "começo da frase fim dela…", corte: { inicio: "começo da frase ", fim: "fim dela" }, busca: "A começo da frase fim dela e mais", escondidaNoInicio: false },
        { url: "/pt/news/b/", titulo: "B", data: "2", miniatura: undefined, tags: [], resumo: "Resumo do autor…", corte: null, busca: "B", escondidaNoInicio: false },
      ],
    };
    const html = await container.renderToString(ListaDeNoticias, { props: { pagina: pagina as never } });
    expect(html).toContain('<p>começo da frase <span class="news-fade">fim dela</span> <a class="more" href="/pt/news/a/">…leia mais</a></p>');
    expect(html).toContain('<p>Resumo do autor… <a class="more" href="/pt/news/b/">leia mais</a></p>');
    expect(html).toContain('data-search="A começo da frase fim dela e mais"');
  });
  test("o CSS: degradê da cor do texto ao transparente (some no papel), só com background-clip: text, e desligado no alto contraste", () => {
    const css = readFileSync(new URL("../src/components/ListaDeNoticias.astro", import.meta.url), "utf8");
    expect(css).toMatch(/@supports \(\(-webkit-background-clip: text\) or \(background-clip: text\)\) \{\s*\.news-fade \{ background-image: linear-gradient\(to right, var\(--ink\) [^,]*, transparent 100%\)/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{ \.news-fade \{ background-image: none;/);
  });
});
