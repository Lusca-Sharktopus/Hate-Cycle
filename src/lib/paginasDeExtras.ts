// As páginas "EXTRAS": Universo (lista + verbetes) e Personagens (lista + fichas). Hoje desligadas por `show_extras: false`
// no config.json; quando o autor ligar, estas funções entregam o que cada página mostra (o componente só desenha).
//
// Funções puras, sem HTML. De onde vem no build.py: os blocos "UNIVERSO" e "PERSONAGENS" do build() (linhas ~883–911):
//   - lista do Universo: uma seção por categoria (sem categoria = "—"), na ordem em que cada categoria aparece (agruparUniverso);
//   - verbete: "Universo" como migalha, título, figura (`image:`), texto, "Veja também" (`related:`);
//   - lista de Personagens: cartões com foto (ou bloco liso sem foto) e o papel (`role:`);
//   - ficha: retrato, migalha, título, papel, texto, "Aparece em:" (`appears_in:`, na ordem em que o autor escreveu) e "Veja também";
//   - as duas listas só existem nos idiomas que têm itens (alt das listas), e cada item só tem o outro idioma se existir lá.
// Quais itens existem (rascunho, show_extras) e a ordem: src/lib/visibilidade.ts e src/lib/extras.ts, já provadas.
// Prova: tests/paginas.test.ts (grupo t14) e tests/paginasAvulsas.test.ts (sites inventados, com show_extras ligado).
import { t, type Lang } from "./config";
import { alternativasDaLista, alternativasDeItem, urlDoItem, type Alternativas } from "./alternativas";
import { agruparUniverso, obrasEmQueAparece, type ItemExtra } from "./extras";
import { usaClasse } from "./leitura";
import type { CapituloComDados, ObraComDados } from "./obras";

/** Campos comuns de um item de Universo / Personagens, mais o que as páginas leem. */
export interface ItemParaExtras extends ItemExtra {
  data: ItemExtra["data"] & {
    summary?: string | undefined;
    image?: string | undefined;
    role?: string | undefined;
    draft?: boolean | undefined;
    related?: readonly string[] | undefined;
    appears_in?: readonly string[] | undefined;
  };
  rendered?: { html?: string | undefined } | undefined;
}

type PorIdioma<T> = Readonly<Record<Lang, readonly T[]>>;

/** Um "Veja também: …" / "Aparece em: …" (o componente Relacionados). */
export interface Rotulados {
  rotulo: string;
  links: { titulo: string; url: string }[];
}

const tituloDe = (i: ItemExtra) => i.data.title || i.data._origem.slug;

// ───────────── Universo ─────────────

export interface ListaDoUniverso {
  lang: Lang;
  url: string;
  tituloDaPagina: string;
  alternativas: Alternativas;
  titulo: string;
  grupos: { categoria: string; itens: { titulo: string; resumo: string; url: string }[] }[];
}

/** A página /<idioma>/universe/, ou null se o idioma não tem verbetes. `ordenados` = dadosDoIdioma().universoExtra. */
export function listaDoUniverso<I extends ItemParaExtras>(ordenados: readonly I[], lang: Lang, quantosPorIdioma: Readonly<Record<Lang, number>>): ListaDoUniverso | null {
  if (ordenados.length === 0) return null;
  return {
    lang,
    url: `/${lang}/universe/`,
    tituloDaPagina: t(lang, "universe"),
    alternativas: alternativasDaLista("universe", quantosPorIdioma),
    titulo: t(lang, "universe"),
    grupos: agruparUniverso(ordenados).map((g) => ({
      categoria: g.categoria,
      itens: g.itens.map((i) => ({ titulo: tituloDe(i), resumo: i.data.summary ?? "", url: urlDoItem("universe", lang, i.data._origem.slug) })),
    })),
  };
}

export interface VerbeteDoUniverso {
  lang: Lang;
  pasta: string;
  url: string;
  tituloDaPagina: string;
  descricao: string;
  imagem: string;
  alternativas: Alternativas;
  avisoDeRascunho: string | null;
  /** A migalha "Universo" (texto e endereço da lista). */
  migalha: { rotulo: string; url: string };
  titulo: string;
  html: string;
  relacionados: Rotulados | null;
  temCartaQueVira: boolean;
  temPostsAlternados: boolean;
}

export function verbetesDoUniverso<I extends ItemParaExtras>(
  ordenados: readonly I[],
  lang: Lang,
  ferramentas: { publicadosPorIdioma: PorIdioma<ItemExtra>; relacionadosDe: (item: I) => { titulo: string; url: string }[] },
): VerbeteDoUniverso[] {
  return ordenados.map((i) => {
    const pasta = i.data._origem.slug;
    const html = i.rendered?.html ?? "";
    const links = ferramentas.relacionadosDe(i);
    return {
      lang,
      pasta,
      url: urlDoItem("universe", lang, pasta),
      tituloDaPagina: tituloDe(i),
      descricao: i.data.summary ?? "",
      imagem: i.data.image ?? "",
      alternativas: alternativasDeItem("universe", pasta, ferramentas.publicadosPorIdioma),
      avisoDeRascunho: i.data.draft === true ? t(lang, "draft") : null,
      migalha: { rotulo: t(lang, "universe"), url: `/${lang}/universe/` },
      titulo: tituloDe(i),
      html,
      relacionados: links.length > 0 ? { rotulo: t(lang, "see_also"), links } : null,
      temCartaQueVira: usaClasse(html, "flip-card"),
      temPostsAlternados: usaClasse(html, "embed-alt"),
    };
  });
}

// ───────────── Personagens ─────────────

export interface ListaDePersonagens {
  lang: Lang;
  url: string;
  tituloDaPagina: string;
  alternativas: Alternativas;
  titulo: string;
  cartoes: { url: string; imagem: string; titulo: string; papel: string }[];
}

/** A página /<idioma>/characters/, ou null se o idioma não tem personagens. `ordenados` = dadosDoIdioma().personagens. */
export function listaDePersonagens<I extends ItemParaExtras>(ordenados: readonly I[], lang: Lang, quantosPorIdioma: Readonly<Record<Lang, number>>): ListaDePersonagens | null {
  if (ordenados.length === 0) return null;
  return {
    lang,
    url: `/${lang}/characters/`,
    tituloDaPagina: t(lang, "characters"),
    alternativas: alternativasDaLista("characters", quantosPorIdioma),
    titulo: t(lang, "characters"),
    cartoes: ordenados.map((c) => ({ url: urlDoItem("characters", lang, c.data._origem.slug), imagem: c.data.image ?? "", titulo: tituloDe(c), papel: c.data.role ?? "" })),
  };
}

export interface FichaDePersonagem {
  lang: Lang;
  pasta: string;
  url: string;
  tituloDaPagina: string;
  descricao: string;
  imagem: string;
  alternativas: Alternativas;
  avisoDeRascunho: string | null;
  migalha: { rotulo: string; url: string };
  titulo: string;
  papel: string;
  html: string;
  /** "Aparece em: …": para onde cada obra leva (link externo, capítulo/página da obra, ou "#" se ainda não há nada). */
  apareceEm: Rotulados | null;
  relacionados: Rotulados | null;
  temCartaQueVira: boolean;
  temPostsAlternados: boolean;
}

export function fichasDePersonagens<I extends ItemParaExtras, O extends ObraComDados>(
  ordenados: readonly I[],
  lang: Lang,
  ferramentas: {
    publicadosPorIdioma: PorIdioma<ItemExtra>;
    relacionadosDe: (item: I) => { titulo: string; url: string }[];
    /** Todas as obras (inclusive as escondidas das listas: o Python procura entre todas) e os capítulos listados de cada uma. */
    obras: readonly O[];
    capitulosListados: (obra: O) => readonly CapituloComDados[];
  },
): FichaDePersonagem[] {
  return ordenados.map((c) => {
    const pasta = c.data._origem.slug;
    const html = c.rendered?.html ?? "";
    const aparece = obrasEmQueAparece(c.data.appears_in, ferramentas.obras, lang, ferramentas.capitulosListados);
    const links = ferramentas.relacionadosDe(c);
    return {
      lang,
      pasta,
      url: urlDoItem("characters", lang, pasta),
      tituloDaPagina: tituloDe(c),
      descricao: c.data.summary ?? "",
      imagem: c.data.image ?? "",
      alternativas: alternativasDeItem("characters", pasta, ferramentas.publicadosPorIdioma),
      avisoDeRascunho: c.data.draft === true ? t(lang, "draft") : null,
      migalha: { rotulo: t(lang, "characters"), url: `/${lang}/characters/` },
      titulo: tituloDe(c),
      papel: c.data.role ?? "",
      html,
      apareceEm: aparece.length > 0 ? { rotulo: t(lang, "appears_in"), links: aparece.map((a) => ({ titulo: a.titulo, url: a.href })) } : null,
      relacionados: links.length > 0 ? { rotulo: t(lang, "see_also"), links } : null,
      temCartaQueVira: usaClasse(html, "flip-card"),
      temPostsAlternados: usaClasse(html, "embed-alt"),
    };
  });
}
