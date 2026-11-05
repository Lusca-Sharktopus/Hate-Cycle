// A LISTA de notícias e o ARTIGO de cada notícia: tudo o que as duas páginas mostram, já decidido (T13).
//
// Funções puras: recebem as notícias (já ordenadas, com o HTML do texto pronto em `rendered.html`) e as "ferramentas" que
// dependem de fora (a seção de comentários, os "Veja também"), e devolvem dados. Quem desenha são os componentes
// src/components/ListaDeNoticias.astro e ArtigoDeNoticia.astro, sem decidir nada. Quem chama são as rotas
// src/pages/[lang]/news/ e (nos testes) tests/noticias.test.ts, com sites inventados.
//
// As regras que já existiam (ordem, linhas da lista, vizinhas, ID dos comentários, páginas da lista) continuam em
// src/lib/noticias.ts (T10) e são reaproveitadas aqui. O que é novo na T13 é "qual desenho a notícia tem" e o que ele leva.
//
// De onde vem no build.py: o bloco "# ── NOTÍCIAS" do build() (linhas ~830–880): a lista (busca, páginas, miniatura,
// etiquetas, resumo), o artigo comum (figura grande), o artigo com backdrop (backdrop_top/backdrop_bottom) e a colagem
// (stickers + overlay), o pager com "Todas as notícias", o "Veja também" (related_html) e os comentários.
import { alternativasDaLista, alternativasDeItem, type Alternativas } from "./alternativas";
import type { SecaoDeComentarios } from "./comentarios";
import { t, type Lang } from "./config";
import { pyStrip } from "./frontmatter";
import { paginador, usaClasse, type Paginador } from "./leitura";
import { CLASSES_DO_PYTHON } from "./markdown";
import { linhasDaListaDeNoticias, NOTICIAS_POR_PAGINA, paginasDasNoticias, type LinhaDaListaDeNoticias, type NoticiaComDados } from "./noticias";
import { assetUrl } from "./assets";

/** O que o artigo lê de uma notícia, além do que as regras da T10 já leem. */
export interface NoticiaParaArtigo extends NoticiaComDados {
  data: NoticiaComDados["data"] & {
    draft?: boolean | undefined;
    related?: readonly string[] | undefined;
    backdrop_top?: string | undefined;
    backdrop_bottom?: string | undefined;
    stickers?: readonly string[] | undefined;
    overlay?: string | undefined;
  };
  /** O HTML do texto, feito pelo carregador (src/lib/leitor.ts → corpos.ts → markdown.ts), sem versalete. */
  rendered?: { html?: string | undefined } | undefined;
}

// ───────────── a lista (/pt/news/) ─────────────

export interface PaginaDaLista {
  lang: Lang;
  url: string;
  /** O <h1> e a aba: "Notícias" / "News". */
  titulo: string;
  /** A lista nos outros idiomas (só nos que têm notícias). */
  alternativas: Alternativas;
  /** As notícias, da mais nova para a mais antiga; a partir da 11ª já nascem escondidas (a barra de páginas mostra o resto). */
  linhas: LinhaDaListaDeNoticias[];
  /** "leia mais" */
  rotuloDoLink: string;
  busca: { placeholder: string; semResultados: string };
  /** A barra de páginas (<nav class="pagination">): o rótulo e os textos dos botões, e quantas notícias por página. */
  paginacao: { rotulo: string; anterior: string; proximo: string; porPagina: number };
}

/**
 * A página Notícias de `lang`. null = o idioma não tem nenhuma notícia: a página (e o link no menu) não existe.
 * `noticias`: as publicadas no idioma, JÁ ordenadas (ordenarNoticias); `quantasPorIdioma`: quantas há em cada idioma
 * (para o seletor de idioma).
 */
export function paginaDaListaDeNoticias(noticias: readonly NoticiaParaArtigo[], lang: Lang, quantasPorIdioma: Readonly<Record<Lang, number>>): PaginaDaLista | null {
  if (noticias.length === 0) return null;
  return {
    lang,
    url: `/${lang}/news/`,
    titulo: t(lang, "news"),
    alternativas: alternativasDaLista("news", quantasPorIdioma),
    linhas: linhasDaListaDeNoticias(noticias, lang),
    rotuloDoLink: t(lang, "more"),
    busca: { placeholder: t(lang, "news_search_ph"), semResultados: t(lang, "news_none") },
    paginacao: { rotulo: t(lang, "news"), anterior: t(lang, "page_prev"), proximo: t(lang, "page_next"), porPagina: NOTICIAS_POR_PAGINA },
  };
}

// ───────────── o artigo (/pt/news/<pasta>/) ─────────────

/** Uma figurinha da colagem: a imagem e o estilo (posição, largura, giro) que o `style` leva. */
export interface Figurinha {
  /** Relativo a static/. */
  arquivo: string;
  /** "left:3%;top:2%;width:26%;--a:-4deg" — vazio se a linha não tinha posições. */
  estilo: string;
}

export type DesenhoDoArtigo =
  /** O comum: folha de papel do site, a figura grande (`image:`) abaixo do título, se houver. */
  | { tipo: "comum"; imagem: string }
  /** Com imagens de fundo no topo e no pé (backdrop_top / backdrop_bottom), que sangram até as bordas da folha; "" = sem aquele lado. */
  | { tipo: "fundo"; topo: string; pe: string }
  /** A colagem: figurinhas espalhadas e, por cima, a imagem de papel amassado (`overlay:`, "" = sem papel). */
  | { tipo: "colagem"; figurinhas: Figurinha[]; papel: string };

export interface ArtigoDaNoticia {
  lang: Lang;
  url: string;
  /** Nome da pasta da notícia: o [slug] do endereço. */
  pasta: string;
  /** Para o <head> (BaseLayout): título da aba, descrição, imagem de pré-visualização e a mesma notícia nos outros idiomas. */
  tituloDaPagina: string;
  descricao: string;
  imagem: string;
  alternativas: Alternativas;
  /** Classe do <body>: "news-page" (o cls="news-page" do build.py). Faz o <main> virar só o espaço das duas caixas: a da notícia e a dos comentários. */
  classeDoCorpo: string;
  /** "Rascunho — só aparece na prévia"; null = não é rascunho. */
  avisoDeRascunho: string | null;
  data: string;
  titulo: string;
  tags: string[];
  desenho: DesenhoDoArtigo;
  /** O HTML do texto do autor (rendered.html), sem versalete. */
  html: string;
  /** "Veja também: …" (related:) com o que existe publicado neste idioma; null = nada a mostrar. */
  relacionados: { rotulo: string; links: { titulo: string; url: string }[] } | null;
  /** Anterior / próximo / "Todas as notícias". */
  paginador: Paginador;
  /** A seção de comentários (src/lib/comentarios.ts); null = `comments: false` (ou site sem chaves, fora da prévia). */
  comentarios: SecaoDeComentarios | null;
  /** O texto traz uma carta que vira (.flip-card) / posts com botão para alternar (.embed-alt)? Então a página leva o script. */
  temCartaQueVira: boolean;
  temPostsAlternados: boolean;
}

/** O que vem de fora das regras. */
export interface FerramentasDoArtigo {
  /** As notícias publicadas em CADA idioma (para o seletor de idioma: a mesma notícia no outro idioma). */
  noticiasPorIdioma: Readonly<Record<Lang, readonly NoticiaComDados[]>>;
  /** "Veja também": os itens de `related:` que existem naquele idioma (dadosDoIdioma().relacionadosDe). */
  relacionadosDe: (noticia: NoticiaParaArtigo) => { titulo: string; url: string }[];
  /** A seção de comentários de uma página (o ID é null quando a notícia tem `comments: false`). */
  comentarios: (lang: Lang, idDaPagina: string | null) => SecaoDeComentarios | null;
}

const RE_POSICAO = new RegExp(`^(l|r|t|b|w|a)(-?[.${CLASSES_DO_PYTHON.d}]+)$`, "u");
const RE_ESPACOS = new RegExp(`[${CLASSES_DO_PYTHON.s}]+`, "u");
const PROPRIEDADE: Record<string, string> = { l: "left", r: "right", t: "top", b: "bottom", w: "width" };

/**
 * Uma linha de `stickers:` ("arquivo | l3 t2 w26 a-4") → a imagem e o estilo. Cada posição é uma letra e um número:
 * l/r/t/b = distância da borda esquerda/direita/de cima/de baixo, em %; w = largura, em %; a = giro, em graus.
 * Palavra que não é posição é ignorada (o schema recusa antes disso, com uma mensagem que explica o formato).
 */
export function figurinhaDaLinha(linha: string): Figurinha {
  const barra = linha.indexOf("|");
  const arquivo = pyStrip(barra < 0 ? linha : linha.slice(0, barra));
  const posicoes = barra < 0 ? "" : linha.slice(barra + 1);
  const css: string[] = [];
  for (const palavra of posicoes.split(RE_ESPACOS).filter(Boolean)) {
    const m = RE_POSICAO.exec(palavra);
    if (!m) continue;
    const [, letra = "", valor = ""] = m;
    css.push(letra === "a" ? `--a:${valor}deg` : `${PROPRIEDADE[letra] ?? ""}:${valor}%`);
  }
  return { arquivo, estilo: css.join(";") };
}

/** O desenho da notícia, na ordem do build(): `stickers` (colagem) vence `backdrop_*` (fundo), que vence o comum. */
export function desenhoDaNoticia(n: NoticiaParaArtigo): DesenhoDoArtigo {
  const d = n.data;
  if (d.stickers && d.stickers.length > 0) return { tipo: "colagem", figurinhas: d.stickers.map((l) => figurinhaDaLinha(String(l))), papel: d.overlay || "" };
  if (d.backdrop_top || d.backdrop_bottom) return { tipo: "fundo", topo: d.backdrop_top || "", pe: d.backdrop_bottom || "" };
  return { tipo: "comum", imagem: d.image || "" };
}

/** O estilo do papel amassado: `background-image:url(…)`, com o endereço do arquivo (sem aspas, como no build.py). */
export function estiloDaImagemDeFundo(arquivo: string): string {
  return `background-image:url(${assetUrl(arquivo)})`;
}

/**
 * Os artigos de todas as notícias de um idioma, na ordem da lista (a mais nova primeiro).
 * `ordenadas`: as publicadas no idioma, JÁ ordenadas (ordenarNoticias).
 */
export function artigosDasNoticias(ordenadas: readonly NoticiaParaArtigo[], lang: Lang, ferramentas: FerramentasDoArtigo): ArtigoDaNoticia[] {
  const paginas = paginasDasNoticias(ordenadas, lang);
  return ordenadas.map((n, i) => {
    const p = paginas[i];
    if (!p) throw new Error("paginasDasNoticias devolve uma página por notícia");
    const html = n.rendered?.html ?? "";
    const links = ferramentas.relacionadosDe(n);
    return {
      lang,
      url: p.url,
      pasta: n.data._origem.slug,
      tituloDaPagina: p.titulo,
      descricao: p.descricao,
      imagem: p.imagem,
      alternativas: alternativasDeItem("news", n.data._origem.slug, ferramentas.noticiasPorIdioma),
      classeDoCorpo: "news-page",
      avisoDeRascunho: n.data.draft === true ? t(lang, "draft") : null,
      data: p.data,
      titulo: p.titulo,
      tags: p.tags,
      desenho: desenhoDaNoticia(n),
      html,
      relacionados: links.length > 0 ? { rotulo: t(lang, "see_also"), links } : null,
      // sempre existe: o botão do meio ("Todas as notícias") está em todas
      paginador: paginador(lang, p.anterior, p.proximo, { url: `/${lang}/news/`, rotulo: t(lang, "all_news") }) as Paginador,
      comentarios: ferramentas.comentarios(lang, p.idDosComentarios),
      temCartaQueVira: usaClasse(html, "flip-card"),
      temPostsAlternados: usaClasse(html, "embed-alt"),
    };
  });
}
