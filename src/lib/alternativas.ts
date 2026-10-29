// "Esta mesma página no outro idioma": os endereços que alimentam o <link hreflang> e o seletor de idioma.
//
// Funções puras. Cada uma devolve só os idiomas em que a página EXISTE (os outros ficam de fora; o seletor então leva
// à home do idioma). O próprio idioma da página entra sempre no layout (BaseLayout), como o `alt.setdefault(lang, url)` do page().
// Prova: tests/regras.test.ts compara com o `alt` que o build() do Python entrega a cada uma das páginas.
//
// De onde vem cada regra no build.py:
//   alternativasDeItem      → alt_for()                 linha ~678  (notícia, universo, personagem, página solta)
//   alternativasDoCapitulo  → alt_c                     linha ~826  (só capítulos LISTADOS contam: um capítulo `unlisted`
//                                                                   não aponta para ninguém, nem para si mesmo)
//   alternativasDaObra      → alt_w                     linha ~771
//   alternativasDaLista     → linhas ~848, ~890, ~902   (Notícias, Universo, Personagens: só nos idiomas que têm itens)
import { langs, type Lang } from "./config";

export type Alternativas = Partial<Record<Lang, string>>;

type PorIdioma<T> = Readonly<Record<Lang, readonly T[]>>;

/** Itens de seções com uma pasta por item. Páginas soltas (`pages`) ficam na raiz do idioma: /<idioma>/<pasta>/. */
export type SecaoAlternativa = "news" | "universe" | "characters" | "pages";

/** Endereço de um item de seção, como o load_items() monta (`url`). */
export function urlDoItem(secao: SecaoAlternativa, lang: Lang, slug: string): string {
  return secao === "pages" ? `/${lang}/${slug}/` : `/${lang}/${secao}/${slug}/`;
}

/** alt_for(): o item de pasta `slug` existe (publicado) em cada idioma? */
export function alternativasDeItem(secao: SecaoAlternativa, slug: string, publicados: PorIdioma<{ data: { _origem: { slug: string } } }>): Alternativas {
  const saida: Alternativas = {};
  for (const l of langs) if (publicados[l].some((i) => i.data._origem.slug === slug)) saida[l] = urlDoItem(secao, l, slug);
  return saida;
}

/** alt_c: o capítulo de pasta `pasta` da obra existe entre os capítulos LISTADOS de cada idioma? */
export function alternativasDoCapitulo(obra: string, pasta: string, listadosPorIdioma: PorIdioma<{ data: { _origem: { capitulo: string } } }>): Alternativas {
  const saida: Alternativas = {};
  for (const l of langs) if (listadosPorIdioma[l].some((c) => c.data._origem.capitulo === pasta)) saida[l] = `/${l}/works/${obra}/${pasta}/`;
  return saida;
}

/** alt_w: a página da obra, nos idiomas em que a obra tem algum capítulo listado. */
export function alternativasDaObra(obra: string, listadosPorIdioma: PorIdioma<unknown>): Alternativas {
  const saida: Alternativas = {};
  for (const l of langs) if (listadosPorIdioma[l].length > 0) saida[l] = `/${l}/works/${obra}/`;
  return saida;
}

/** As páginas de lista (Notícias, Universo, Personagens): só os idiomas que têm pelo menos um item. */
export function alternativasDaLista(secao: "news" | "universe" | "characters", quantosPorIdioma: Readonly<Record<Lang, number>>): Alternativas {
  const saida: Alternativas = {};
  for (const l of langs) if (quantosPorIdioma[l] > 0) saida[l] = `/${l}/${secao}/`;
  return saida;
}
