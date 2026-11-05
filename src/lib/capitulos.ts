// As regras dos CAPÍTULOS: número, título, data, anterior/próximo, o que a página da obra lista.
//
// Funções puras, sem HTML. A quem listar quais capítulos existem (listados × `unlisted`, rascunhos) cabe
// `capitulosDaObra()` de src/lib/visibilidade.ts; aqui fica o que se decide DEPOIS disso. Prova: tests/regras.test.ts.
//
// De onde vem cada regra no build.py:
//   numeroDoCapitulo/tituloDoCapitulo → load_works()   linhas ~224–225
//   paginaDaObra                      → build()        linhas ~775–786 (lista de capítulos, "primeiro" e "último")
//   paginasDosCapitulos               → build()        linhas ~788–828 (cabeçalho, data, anterior/próximo, título da aba)
import { t, tk, type Lang } from "./config";
import { formatarData } from "./datas";
import { capaDaObra, resumoDaObra, tituloDaObra, urlDaObra, urlDoCapitulo, type CapituloComDados, type CapitulosDaObra, type ObraComDados } from "./obras";
import { obraTemPagina } from "./visibilidade";

/** Campos a mais que o leitor de capítulos precisa (o formato da página e os comentários). */
export interface CapituloDeLeitura extends CapituloComDados {
  data: CapituloComDados["data"] & { youtube?: string | undefined; comments?: boolean | undefined };
}

/** O tipo da obra (`kind` do work.json); sem ele, "prose". */
export function tipoDaObra(obra: ObraComDados): string {
  return obra.data.kind ?? "prose";
}

/** O número do capítulo: `chapter:` do front matter ou a posição da pasta entre as pastas da obra (1, 2, 3…). Sempre texto. */
export function numeroDoCapitulo(c: CapituloComDados): string {
  return c.data.chapter || String(c.data._origem.posicao);
}

/**
 * O título: `title:` do front matter; sem ele, o título da obra (obra de capítulo único) ou "Capítulo N" ("Episódio N"
 * nas obras em vídeo).
 */
export function tituloDoCapitulo(c: CapituloComDados, obra: ObraComDados): string {
  const lang = c.data._origem.lang;
  if (c.data.title) return c.data.title;
  if (obra.data.oneshot) return tituloDaObra(obra, lang);
  return `${tk(lang, "chapter", obra.data.kind)} ${numeroDoCapitulo(c)}`;
}

// ───────────── a página da obra ─────────────

/** Uma linha da lista de capítulos da página da obra. */
export interface LinhaDeCapitulo {
  url: string;
  numero: string;
  titulo: string;
  /** A data escrita (ex.: "18 de ago. de 2026"); "" se o capítulo não tem data. */
  data: string;
}

export interface PaginaDaObra {
  titulo: string;
  /** O resumo da obra (também a descrição da página para buscadores). */
  descricao: string;
  /** Capa, relativa a static/; "" = sem capa. */
  capa: string;
  /** "Primeiro capítulo/episódio" e "Último…": para onde levam e o texto do botão. */
  primeiro: { url: string; rotulo: string };
  ultimo: { url: string; rotulo: string };
  /** O título da seção da lista ("Capítulos" ou "Episódios"). */
  tituloDaLista: string;
  capitulos: LinhaDeCapitulo[];
}

/**
 * Os dados da página própria da obra — ou null se a obra não tem uma (sem capítulos listados, `oneshot`, ou com link
 * para fora: nesses casos o botão do cartão já leva direto ao destino).
 */
export function paginaDaObra(obra: ObraComDados, lang: Lang, capitulos: CapitulosDaObra): PaginaDaObra | null {
  const primeiro = capitulos.listados[0];
  const ultimo = capitulos.listados[capitulos.listados.length - 1];
  if (!primeiro || !ultimo || !obraTemPagina(obra, capitulos.listados.length, lang)) return null;
  const tipo = obra.data.kind;
  return {
    titulo: tituloDaObra(obra, lang),
    descricao: resumoDaObra(obra, lang),
    capa: capaDaObra(obra, lang),
    primeiro: { url: urlDoCapitulo(primeiro), rotulo: t(lang, "first_chapter") },
    ultimo: { url: urlDoCapitulo(ultimo), rotulo: tk(lang, "last_chapter", tipo) },
    tituloDaLista: tk(lang, "chapters", tipo),
    capitulos: capitulos.listados.map((c) => ({
      url: urlDoCapitulo(c),
      numero: numeroDoCapitulo(c),
      titulo: tituloDoCapitulo(c, obra),
      data: formatarData(lang, c.data.date ?? ""),
    })),
  };
}

// ───────────── a página de cada capítulo ─────────────

/** O capítulo vizinho (anterior ou próximo) no leitor. */
export interface Vizinho {
  url: string;
  titulo: string;
}

/** Como o capítulo é mostrado: quadrinho (imagens), vídeo (YouTube) ou prosa (texto). */
export type FormatoDeLeitura = "comic" | "video" | "prose";

export interface PaginaDoCapitulo {
  url: string;
  /** Nome da pasta do capítulo (ex.: "01"). */
  pasta: string;
  numero: string;
  titulo: string;
  /** O <h1>: o título do capítulo (em obra de capítulo único, o título da obra). */
  tituloPrincipal: string;
  /** O <title> da aba, antes do " | nome do site": "Obra — Capítulo" (em obra de capítulo único, só a obra). */
  tituloDaPagina: string;
  /** Data do capítulo, mostrada sob o título (nunca em obra de capítulo único); null = não mostra. */
  data: { iso: string; texto: string } | null;
  anterior: Vizinho | null;
  proximo: Vizinho | null;
  /** O botão "Voltar à obra" (nunca em obra de capítulo único nem em capítulo oculto). */
  voltar: { url: string; rotulo: string } | null;
  /** Capítulo `unlisted`: a página existe, mas fica fora dos buscadores e das listas. */
  oculto: boolean;
  /** `summary:` do capítulo (descrição da página); "" = nenhuma. */
  descricao: string;
  /** A capa da obra (imagem de pré-visualização nas redes). */
  imagem: string;
  /** ID da conversa de comentários, igual nos dois idiomas; null = o capítulo tem `comments: false`. */
  idDosComentarios: string | null;
  formato: FormatoDeLeitura;
}

/** A regra do build(): `if kind == "comic"` → quadrinho; `elif youtube or kind == "video"` → vídeo; senão prosa. */
export function formatoDeLeitura(obra: ObraComDados, c: CapituloDeLeitura): FormatoDeLeitura {
  if (obra.data.kind === "comic") return "comic";
  if (c.data.youtube || obra.data.kind === "video") return "video";
  return "prose";
}

/**
 * Os dados de todas as páginas de capítulo de uma obra num idioma, na ordem do build(): primeiro os listados, depois os
 * ocultos. Anterior/próximo: só entre os listados, e nunca em obra de capítulo único nem em capítulo oculto.
 */
export function paginasDosCapitulos(obra: ObraComDados, lang: Lang, capitulos: { listados: readonly CapituloDeLeitura[]; ocultos: readonly CapituloDeLeitura[] }): PaginaDoCapitulo[] {
  const { listados, ocultos } = capitulos;
  const unico = obra.data.oneshot === true;
  const vizinho = (c: CapituloDeLeitura | undefined): Vizinho | null => (c ? { url: urlDoCapitulo(c), titulo: tituloDoCapitulo(c, obra) } : null);
  const todos = [...listados.map((c) => ({ c, oculto: false })), ...ocultos.map((c) => ({ c, oculto: true }))];
  return todos.map(({ c, oculto }, i) => {
    const titulo = tituloDoCapitulo(c, obra);
    const semVizinhos = unico || oculto;
    const tituloDaObraNoIdioma = tituloDaObra(obra, lang);
    return {
      url: urlDoCapitulo(c),
      pasta: c.data._origem.capitulo,
      numero: numeroDoCapitulo(c),
      titulo,
      tituloPrincipal: unico ? tituloDaObraNoIdioma : titulo,
      tituloDaPagina: unico ? tituloDaObraNoIdioma : `${tituloDaObraNoIdioma} — ${titulo}`,
      data: c.data.date && !unico ? { iso: c.data.date, texto: formatarData(lang, c.data.date) } : null,
      anterior: semVizinhos ? null : vizinho(i > 0 ? listados[i - 1] : undefined),
      proximo: semVizinhos ? null : vizinho(listados[i + 1]),
      voltar: semVizinhos ? null : { url: urlDaObra(obra, lang), rotulo: tk(lang, "back_work", obra.data.kind) },
      oculto,
      descricao: c.data.summary ?? "",
      imagem: capaDaObra(obra, lang),
      idDosComentarios: c.data.comments === false ? null : `works/${obra.data._origem.slug}/${c.data._origem.capitulo}`,
      formato: formatoDeLeitura(obra, c),
    };
  });
}
