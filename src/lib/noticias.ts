// As regras das NOTÍCIAS: em que ordem aparecem, o que a lista mostra de cada uma, anterior/próximo, páginas da lista.
//
// Funções puras, sem HTML. Quais notícias existem (rascunhos) é de `itensDoIdioma()` em src/lib/visibilidade.ts.
// Prova: tests/regras.test.ts (referência: tools/regras_ref.py).
//
// De onde vem cada regra no build.py:
//   ordenarNoticias        → build()   linha ~671   (mais nova primeiro)
//   linhaDaLista…          → build()   linhas ~833–842 (miniatura, etiquetas, resumo, texto de busca)
//   vizinhasDaNoticia      → build()   linha ~852
//   barraDePaginas e cia   → static/site.js, bloco 6 (10 por página, números com "…"): src/lib/paginacao.ts
import type { Lang } from "./config";
import { formatarData } from "./datas";
import { resumoDaNoticia, textoDeBuscaDaNoticia } from "./resumos";
import { compararComoPython } from "./ordem";
import { ITENS_POR_PAGINA } from "./paginacao";

/** O que as regras leem de uma notícia (front matter validado, corpo cru e de onde veio). */
export interface NoticiaComDados {
  body?: string | undefined;
  data: {
    title?: string | undefined;
    date?: string | undefined;
    summary?: string | undefined;
    thumb?: string | undefined;
    image?: string | undefined;
    tags?: readonly string[] | undefined;
    comments?: boolean | undefined;
    _origem: { slug: string; lang: Lang };
  };
}

/** Endereço da notícia: /<idioma>/news/<pasta>/. */
export function urlDaNoticia(n: NoticiaComDados): string {
  return `/${n.data._origem.lang}/news/${n.data._origem.slug}/`;
}

/** O título: `title:` do front matter ou o nome da pasta. */
export function tituloDaNoticia(n: NoticiaComDados): string {
  return n.data.title || n.data._origem.slug;
}

/**
 * Notícias da mais nova para a mais antiga (pelo `date:` escrito como texto, AAAA-MM-DD). Mesma data: a ordem das pastas
 * (que começam pela data e depois seguem pelo nome). Notícia sem data vai para o fim.
 */
export function ordenarNoticias<T extends NoticiaComDados>(noticias: readonly T[]): T[] {
  return [...noticias]
    .sort((a, b) => compararComoPython(a.data._origem.slug, b.data._origem.slug))
    .sort((a, b) => compararComoPython(b.data.date ?? "", a.data.date ?? ""));
}

// ───────────── a lista de notícias ─────────────

/** Quantas notícias aparecem por página da lista (`data-per` do HTML, usado por static/site.js). */
export const NOTICIAS_POR_PAGINA = ITENS_POR_PAGINA;

export interface LinhaDaListaDeNoticias {
  url: string;
  titulo: string;
  data: string;
  /** Miniatura: `thumb:` ou, sem ele, `image:`; undefined = sem miniatura. Relativa a static/. */
  miniatura: string | undefined;
  tags: string[];
  /** `summary:` do autor ou o resumo automático do texto. */
  resumo: string;
  /** O que a busca da lista enxerga (título + etiquetas + data + início do texto). */
  busca: string;
  /** Já nasce escondida no HTML (a partir da 11ª); o JavaScript mostra a página certa. */
  escondidaNoInicio: boolean;
}

/** As linhas da página Notícias, na ordem dada (use `ordenarNoticias` antes). */
export function linhasDaListaDeNoticias(noticias: readonly NoticiaComDados[], lang: Lang): LinhaDaListaDeNoticias[] {
  return noticias.map((n, k) => {
    const tags = [...(n.data.tags ?? [])];
    const corpo = n.body ?? "";
    return {
      url: urlDaNoticia(n),
      titulo: tituloDaNoticia(n),
      data: formatarData(lang, n.data.date ?? ""),
      miniatura: n.data.thumb || n.data.image || undefined,
      tags,
      resumo: resumoDaNoticia(n.data.summary, corpo),
      busca: textoDeBuscaDaNoticia(lang, { titulo: tituloDaNoticia(n), tags, data: n.data.date, corpo }),
      escondidaNoInicio: k >= NOTICIAS_POR_PAGINA,
    };
  });
}

// ───────────── a página de cada notícia ─────────────

export interface PaginaDaNoticia {
  url: string;
  titulo: string;
  data: string;
  tags: string[];
  /** `summary:` (descrição da página para buscadores); "" = nenhuma. */
  descricao: string;
  /** `image:` — a figura grande do topo e a imagem de pré-visualização nas redes; "" = nenhuma. */
  imagem: string;
  /** A notícia mais antiga seguinte (o botão "anterior") e a mais nova (o "próximo"). */
  anterior: { url: string; titulo: string } | null;
  proximo: { url: string; titulo: string } | null;
  /** ID da conversa de comentários, igual nos dois idiomas; null = `comments: false`. */
  idDosComentarios: string | null;
}

/** Os dados da página de cada notícia, a partir da lista JÁ ordenada (`ordenarNoticias`): anterior = a mais antiga ao lado. */
export function paginasDasNoticias(ordenadas: readonly NoticiaComDados[], lang: Lang): PaginaDaNoticia[] {
  const vizinha = (n: NoticiaComDados | undefined) => (n ? { url: urlDaNoticia(n), titulo: tituloDaNoticia(n) } : null);
  return ordenadas.map((n, i) => ({
    url: urlDaNoticia(n),
    titulo: tituloDaNoticia(n),
    data: formatarData(lang, n.data.date ?? ""),
    tags: [...(n.data.tags ?? [])],
    descricao: n.data.summary ?? "",
    imagem: n.data.image ?? "",
    anterior: vizinha(ordenadas[i + 1]),
    proximo: vizinha(i > 0 ? ordenadas[i - 1] : undefined),
    idDosComentarios: n.data.comments === false ? null : `news/${n.data._origem.slug}`,
  }));
}

// ───────────── páginas da lista (static/site.js, bloco 6) ─────────────
// As regras de busca e de páginas moram em src/lib/paginacao.ts (sem imports, porque vão para o navegador). Reexportadas aqui
// para quem já as pedia de "noticias".
export { barraDePaginas, itensDaPagina, paginaValida, totalDePaginas, type ItemDaBarraDePaginas } from "./paginacao";
