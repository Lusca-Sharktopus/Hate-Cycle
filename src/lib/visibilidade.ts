// Quem aparece no site: as regras de visibilidade do build.py, como funções puras (mesma entrada, mesma saída).
//
// Funções puras não leem arquivo nem sabem se é prévia ou build: recebem tudo por parâmetro. Assim o teste
// (tests/conteudo.test.ts) roda as MESMAS regras com e sem rascunhos e compara com o Python.
// Quem as usa no site é src/lib/conteudo.ts (com getCollection e o modo certo).
//
// De onde vem cada regra no build.py:
//   draft      → load_items()/load_works(): `fm.get("draft") is True and not DRAFTS` → fica de fora
//   draft de OBRA → load_works(): `meta.get("draft") is True and not DRAFTS` → a obra inteira fica de fora (T17c)
//   unlisted   → load_works(): `fm.get("unlisted") is True` → capítulo vai para "hidden" (página existe, fora das listas)
//   listed/langs → wlisted(): `meta.get("listed", True) and l in meta.get("langs", LANGS)`
//   external   → load_works()/wlink(): obra com link para fora e sem capítulos ainda entra no índice de links
//   show_extras → build(): `if not CFG.get("show_extras", True)` → Universo e Personagens somem
//   emissaries.hide → build(): `emis[l] = [e for e in emis[l] if e["slug"] not in hide_emi]`
import { tr, type Lang, type Translatable } from "./config";
import { compararComoPython, compararNatural } from "./ordem";

// Formatos mínimos que as regras precisam (as entradas das coleções têm isso e mais).
export interface ItemVisivel {
  data: { draft?: boolean | undefined; _origem: { slug: string; lang: Lang } };
}
export interface CapituloVisivel {
  data: { draft?: boolean | undefined; unlisted?: boolean | undefined; _origem: { obra: string; capitulo: string; lang: Lang } };
}
export interface ObraVisivel {
  data: {
    draft?: boolean | undefined;
    listed?: boolean | undefined;
    langs?: Lang[] | undefined;
    oneshot?: boolean | undefined;
    external?: Translatable | undefined;
    _origem: { slug: string };
  };
}

/** Rascunho só aparece com `comRascunhos` (prévia). Como no Python, só `draft: true` conta. */
export function passaRascunho(item: { data: { draft?: boolean | undefined } }, comRascunhos: boolean): boolean {
  return item.data.draft !== true || comRascunhos;
}

/** Itens de uma seção num idioma, sem os rascunhos (fora da prévia), na ordem das pastas (load_items). */
export function itensDoIdioma<T extends ItemVisivel>(itens: readonly T[], lang: Lang, comRascunhos: boolean): T[] {
  return itens
    .filter((i) => i.data._origem.lang === lang && passaRascunho(i, comRascunhos))
    .sort((a, b) => compararComoPython(a.data._origem.slug, b.data._origem.slug));
}

/** Universo e Personagens: com `show_extras: false` no config.json, nenhum item aparece. */
export function extrasDoIdioma<T extends ItemVisivel>(itens: readonly T[], lang: Lang, comRascunhos: boolean, mostrarExtras: boolean): T[] {
  return mostrarExtras ? itensDoIdioma(itens, lang, comRascunhos) : [];
}

/** Emissários: tira também os escondidos em config.json → emissaries.hide. */
export function emissariosDoIdioma<T extends ItemVisivel>(itens: readonly T[], lang: Lang, comRascunhos: boolean, escondidos: readonly string[]): T[] {
  return itensDoIdioma(itens, lang, comRascunhos).filter((e) => !escondidos.includes(e.data._origem.slug));
}

/**
 * Obra inteira em rascunho (`"draft": true` no work.json): fora do site publicado, na prévia aparece como as outras.
 * Quem usa: o load_works() do build.py (pula a obra) e `dadosDoIdioma()` (só entram as obras que passam por aqui).
 */
export function obrasPublicadas<T extends ObraVisivel>(obras: readonly T[], comRascunhos: boolean): T[] {
  return obras.filter((o) => passaRascunho(o, comRascunhos));
}

/** wlisted(): a obra aparece nas listas daquele idioma? (`listed: false` esconde; `langs` limita os idiomas.) */
export function obraListada(obra: ObraVisivel, lang: Lang, todosOsIdiomas: readonly Lang[]): boolean {
  return obra.data.listed !== false && (obra.data.langs ?? todosOsIdiomas).includes(lang);
}

/** Capítulos de uma obra num idioma, separados como no load_works(): listados e ocultos (`unlisted: true`). */
export function capitulosDaObra<T extends CapituloVisivel>(
  capitulos: readonly T[],
  obra: string,
  lang: Lang,
  comRascunhos: boolean,
): { listados: T[]; ocultos: T[] } {
  const daObra = capitulos
    .filter((c) => c.data._origem.obra === obra && c.data._origem.lang === lang && passaRascunho(c, comRascunhos))
    .sort((a, b) => compararNatural(a.data._origem.capitulo, b.data._origem.capitulo));
  return { listados: daObra.filter((c) => c.data.unlisted !== true), ocultos: daObra.filter((c) => c.data.unlisted === true) };
}

/** Link para fora da obra naquele idioma ("" = não tem). */
export function linkExterno(obra: ObraVisivel, lang: Lang): string {
  return tr(obra.data.external, lang);
}

/**
 * A obra tem página própria (/<idioma>/works/<obra>/) naquele idioma? Como no build():
 * tem capítulos listados, não é oneshot (oneshot vai direto ao capítulo) e não tem link para fora.
 * (Independe de `listed`: obra escondida das listas ainda tem página, se tiver capítulos.)
 */
export function obraTemPagina(obra: ObraVisivel, capitulosListados: number, lang: Lang): boolean {
  return capitulosListados > 0 && obra.data.oneshot !== true && !linkExterno(obra, lang);
}

/** A obra entra no índice de links ([[works/x]], related) naquele idioma? (load_works: capítulos OU link externo.) */
export function obraNoIndice(obra: ObraVisivel, capitulosListados: number, lang: Lang): boolean {
  return capitulosListados > 0 || linkExterno(obra, lang) !== "";
}
