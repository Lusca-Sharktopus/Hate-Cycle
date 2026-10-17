// Tudo o que as páginas de UM idioma precisam saber, num só lugar: quem aparece, em que ordem, o que a home mostra.
//
// É a "cola" entre as regras soltas (visibilidade, obras, notícias, atualizações, emissários, extras): em vez de cada
// página decidir quais funções chamar e em que ordem, ela pede `dadosDoIdioma()` — que reproduz o começo do loop
// `for lang in LANGS` do build() (linhas ~670–741 do build.py). Função pura: recebe as entradas das coleções já lidas
// (conteudo.ts as busca com getCollection) e as opções (prévia ou build, show_extras, emissários escondidos).
// Prova: tests/regras.test.ts usa EXATAMENTE esta função para comparar com o estado que o build() do Python tem na home.
import type { Lang } from "./config";
import { atualizacoes, type Atualizacao } from "./atualizacoes";
import { indiceDeLinks, type ConteudoDoIndice } from "./corpos";
import { ordenarEmissarios, type EmissarioComDados } from "./emissarios";
import { ordenarPersonagens, ordenarUniverso, relacionados, type ItemExtra } from "./extras";
import { chamadaSobre, type PaginaParaChamada } from "./home";
import type { IndiceDoIdioma } from "./markdown";
import { ordenarNoticias, type NoticiaComDados } from "./noticias";
import { destaquesDaHome, obrasPorPasta, separarObras, type ObraComDados } from "./obras";
import type { CapituloDeLeitura } from "./capitulos";
import { capitulosDaObra, emissariosDoIdioma, extrasDoIdioma, itensDoIdioma, type CapituloVisivel, type ItemVisivel, type ObraVisivel } from "./visibilidade";

/** As entradas das sete coleções (todas as obras, em todos os idiomas), como o Astro ou o leitor de content/ as entregam. */
export interface EntradasDoSite<
  N extends NoticiaComDados & ItemVisivel,
  O extends ObraComDados & ObraVisivel,
  K extends CapituloDeLeitura & CapituloVisivel,
  E extends EmissarioComDados & ItemVisivel,
  X extends ItemExtra & ItemVisivel,
  Y extends ItemExtra & ItemVisivel,
  P extends PaginaParaChamada & ItemVisivel,
> {
  news: readonly N[];
  works: readonly O[];
  chapters: readonly K[];
  emissaries: readonly E[];
  universe: readonly X[];
  characters: readonly Y[];
  pages: readonly P[];
}

/** O que muda o resultado além do conteúdo. */
export interface OpcoesDoSite {
  /** true na prévia (`pnpm dev`), false no `pnpm build` (o DRAFTS do build.py). */
  comRascunhos: boolean;
  /** config.json → show_extras. */
  mostrarExtras: boolean;
  /** config.json → emissaries.hide. */
  emissariosEscondidos: readonly string[];
  /** Os idiomas do site (config.json → languages), para `langs:` das obras. */
  todosOsIdiomas: readonly Lang[];
}

export interface DadosDoIdioma<
  N extends NoticiaComDados,
  O extends ObraComDados,
  K extends CapituloDeLeitura,
  E extends EmissarioComDados,
  X extends ItemExtra,
  Y extends ItemExtra,
  P extends PaginaParaChamada,
> {
  lang: Lang;
  /** Todas as obras na ordem das pastas (inclusive as escondidas das listas: as páginas delas existem). */
  obras: O[];
  /** Capítulos listados e ocultos de uma obra neste idioma. */
  capitulosDe: (obra: O) => { listados: K[]; ocultos: K[] };
  /** Histórias do universo, em ordem de lançamento (a grade de Histórias). */
  universo: O[];
  /** "Outras histórias" (universe: false). */
  outras: O[];
  /** As 5 obras do carrossel da home. */
  destaques: O[];
  /** Notícias publicadas, da mais nova para a mais antiga. */
  noticias: N[];
  /** "Últimas atualizações", completas (a home mostra as primeiras; o RSS, as 30 primeiras). */
  atualizacoes: Atualizacao[];
  /** Emissários que aparecem, em ordem. */
  emissarios: E[];
  /** Páginas de Universo / Personagens (vazias se show_extras for false), em ordem. */
  universoExtra: X[];
  personagens: Y[];
  /** Páginas soltas publicadas (about, project, support…). */
  paginas: P[];
  /** A chamada "Sobre" no fim da home, ou null. */
  sobre: ReturnType<typeof chamadaSobre>;
  /** O índice dos [[links]] deste idioma e a lista de "Veja também" de um item. */
  indice: IndiceDoIdioma;
  relacionadosDe: (item: { data: { related?: readonly string[] | undefined } }) => { titulo: string; url: string }[];
}

/** O estado que o build() do Python tem na home de `lang`: ver o alto do arquivo. */
export function dadosDoIdioma<
  N extends NoticiaComDados & ItemVisivel,
  O extends ObraComDados & ObraVisivel,
  K extends CapituloDeLeitura & CapituloVisivel,
  E extends EmissarioComDados & ItemVisivel,
  X extends ItemExtra & ItemVisivel,
  Y extends ItemExtra & ItemVisivel,
  P extends PaginaParaChamada & ItemVisivel,
>(entradas: EntradasDoSite<N, O, K, E, X, Y, P>, lang: Lang, opcoes: OpcoesDoSite): DadosDoIdioma<N, O, K, E, X, Y, P> {
  const { comRascunhos, mostrarExtras, emissariosEscondidos, todosOsIdiomas } = opcoes;
  const obras = obrasPorPasta(entradas.works);
  const memoria = new Map<string, { listados: K[]; ocultos: K[] }>();
  const capitulosDe = (obra: O) => {
    const slug = obra.data._origem.slug;
    let c = memoria.get(slug);
    if (!c) memoria.set(slug, (c = capitulosDaObra(entradas.chapters, slug, lang, comRascunhos)));
    return c;
  };
  const noticias = ordenarNoticias(itensDoIdioma(entradas.news, lang, comRascunhos));
  const paginas = itensDoIdioma(entradas.pages, lang, comRascunhos);
  const { universo, outras } = separarObras(obras, lang, todosOsIdiomas);
  const indice = indiceDeLinks(entradas as unknown as ConteudoDoIndice, lang, comRascunhos, mostrarExtras);
  return {
    lang,
    obras,
    capitulosDe,
    universo,
    outras,
    destaques: destaquesDaHome(universo, lang, (o) => capitulosDe(o).listados),
    noticias,
    atualizacoes: atualizacoes(lang, noticias, obras.map((o) => ({ obra: o, listados: capitulosDe(o).listados }))),
    emissarios: ordenarEmissarios(emissariosDoIdioma(entradas.emissaries, lang, comRascunhos, emissariosEscondidos)),
    universoExtra: ordenarUniverso(extrasDoIdioma(entradas.universe, lang, comRascunhos, mostrarExtras)),
    personagens: ordenarPersonagens(extrasDoIdioma(entradas.characters, lang, comRascunhos, mostrarExtras)),
    paginas,
    sobre: chamadaSobre(paginas, lang),
    indice,
    relacionadosDe: (item) => relacionados(item.data.related, indice),
  };
}
