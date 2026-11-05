// As regras de UNIVERSO e PERSONAGENS (as páginas "Extras", hoje desligadas por `show_extras: false`) e dos [[links]] relacionados.
//
// Quais itens existem (rascunhos e `show_extras`) é de `extrasDoIdioma()` em src/lib/visibilidade.ts.
// Prova: tests/regras.test.ts (referência: tools/regras_ref.py).
//
// De onde vem cada regra no build.py:
//   ordenarUniverso / ordenarPersonagens → build()  linhas ~672–673
//   agruparUniverso                       → build()  linhas ~885–886 (seções por categoria)
//   obrasEmQueAparece                     → build()  linhas ~905–907 ("Aparece em:")
//   relacionados                          → related_html()  linha ~615
import { compararComoPython, compararNatural } from "./ordem";
import type { Lang } from "./config";
import { linkDaObra, tituloDaObra, type CapituloComDados, type ObraComDados } from "./obras";
import type { IndiceDoIdioma } from "./markdown";

export interface ItemExtra {
  data: { title?: string | undefined; category?: string | undefined; order?: string | undefined; _origem: { slug: string; lang: Lang } };
}

const ORDEM_PADRAO = "99";
const titulo = (i: ItemExtra) => i.data.title || i.data._origem.slug;
const porPasta = (a: ItemExtra, b: ItemExtra) => compararComoPython(a.data._origem.slug, b.data._origem.slug);

/** Universo: por categoria (A→Z), depois `order:` (natural; ausente = 99), depois título. Empate total: ordem das pastas. */
export function ordenarUniverso<T extends ItemExtra>(itens: readonly T[]): T[] {
  return [...itens].sort(porPasta).sort(
    (a, b) =>
      compararComoPython(a.data.category ?? "", b.data.category ?? "") ||
      compararNatural(a.data.order ?? ORDEM_PADRAO, b.data.order ?? ORDEM_PADRAO) ||
      compararComoPython(titulo(a), titulo(b)),
  );
}

/** Personagens: `order:` (natural; ausente = 99), depois título. Empate total: ordem das pastas. */
export function ordenarPersonagens<T extends ItemExtra>(itens: readonly T[]): T[] {
  return [...itens].sort(porPasta).sort((a, b) => compararNatural(a.data.order ?? ORDEM_PADRAO, b.data.order ?? ORDEM_PADRAO) || compararComoPython(titulo(a), titulo(b)));
}

/** A página Universo agrupa por categoria (sem categoria = "—"), na ordem em que cada categoria aparece. Use a lista JÁ ordenada. */
export function agruparUniverso<T extends ItemExtra>(ordenados: readonly T[]): { categoria: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const i of ordenados) {
    const categoria = i.data.category || "—";
    grupos.set(categoria, [...(grupos.get(categoria) ?? []), i]);
  }
  return [...grupos].map(([categoria, itens]) => ({ categoria, itens }));
}

/**
 * "Aparece em:" de um personagem: as obras citadas em `appears_in`, NA ORDEM EM QUE O AUTOR AS ESCREVEU (a lista do personagem
 * manda, não a ordem das obras), cada uma com o título e para onde levar (link externo, capítulo/página da obra, ou "#" se
 * ainda não há nada). Entram também obras escondidas (`listed: false`): o Python procura entre todas. Nome de obra que não
 * existe é ignorado (o schema já recusa, mas a regra é essa).
 */
export function obrasEmQueAparece<T extends ObraComDados>(
  appearsIn: readonly string[] | undefined,
  obras: readonly T[],
  lang: Lang,
  capitulosListados: (obra: T) => readonly CapituloComDados[],
): { titulo: string; href: string; externo: boolean }[] {
  const citadas = appearsIn ?? [];
  return citadas.flatMap((slug) =>
    obras
      .filter((o) => o.data._origem.slug === slug)
      .map((o) => {
        const link = linkDaObra(o, lang, capitulosListados(o));
        return { titulo: tituloDaObra(o, lang), href: link.href ?? "#", externo: link.externo };
      }),
  );
}

/**
 * "Veja também": os itens de `related:` que existem naquele idioma (no índice dos [[links]]), com título e endereço.
 * Referência a algo que não está publicado naquele idioma simplesmente não aparece.
 */
export function relacionados(related: readonly string[] | undefined, indice: IndiceDoIdioma): { titulo: string; url: string }[] {
  return (related ?? []).flatMap((chave) => {
    const achado = indice.get(chave);
    return achado ? [{ titulo: achado[0], url: achado[1] }] : [];
  });
}
