// Consultas ao conteúdo do site: getCollection() + as regras de src/lib/visibilidade.ts.
//
// É por aqui que páginas e componentes pedem conteúdo (em vez de chamar getCollection direto),
// para que TODAS as páginas apliquem as mesmas regras do build.py: rascunho só na prévia, capítulo
// `unlisted` fora das listas, obra `listed: false`/`langs`, `show_extras`, `emissaries.hide`.
//
// Rascunhos: `pnpm dev` (prévia) = com rascunhos, como `python build.py serve`;
//            `pnpm build`        = sem rascunhos, como `python build.py`.
// Todas as funções aceitam `comRascunhos` para quem precisar forçar um modo.
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { emissariosEscondidos, langs, showExtras, type Lang } from "./config";
import type { SecaoDeItens } from "./leitor";
import { capitulosDaObra, emissariosDoIdioma, extrasDoIdioma, itensDoIdioma, obraListada, obraNoIndice, obraTemPagina } from "./visibilidade";

/** true na prévia (`pnpm dev`), false no `pnpm build`. É o DRAFTS do build.py. */
export const COM_RASCUNHOS: boolean = import.meta.env.DEV;

export type Noticia = CollectionEntry<"news">;
export type Pagina = CollectionEntry<"pages">;
export type Emissario = CollectionEntry<"emissaries">;
export type Personagem = CollectionEntry<"characters">;
export type Verbete = CollectionEntry<"universe">;
export type Obra = CollectionEntry<"works">;
export type Capitulo = CollectionEntry<"chapters">;

/**
 * Os itens de uma seção que o site publica num idioma, na ordem das pastas:
 *  - notícias e páginas: sem rascunhos (fora da prévia);
 *  - universo e personagens: idem, e nenhum se `show_extras` for false;
 *  - emissários: idem, e sem os de `emissaries.hide`.
 * (As páginas com `route: false` estão aqui: elas não têm endereço próprio, mas o texto é usado. Ver `temRota`.)
 */
export async function itensPublicados<S extends SecaoDeItens>(secao: S, lang: Lang, comRascunhos = COM_RASCUNHOS): Promise<CollectionEntry<S>[]> {
  const todos: CollectionEntry<S>[] = await getCollection(secao);
  if (secao === "universe" || secao === "characters") return extrasDoIdioma(todos, lang, comRascunhos, showExtras);
  if (secao === "emissaries") return emissariosDoIdioma(todos, lang, comRascunhos, emissariosEscondidos);
  return itensDoIdioma(todos, lang, comRascunhos);
}

/** Página solta com endereço próprio? (`route: false` = não; ex.: content/pages/project, usada dentro de "Sobre".) */
export function temRota(pagina: Pagina): boolean {
  return pagina.data.route !== false;
}

/** Título de um item: `title:` do front matter ou, sem ele, o nome da pasta (como o build.py). */
export function tituloDoItem(item: Noticia | Pagina | Emissario | Personagem | Verbete): string {
  return item.data.title || item.data._origem.slug;
}

/** Todas as obras (pastas de content/works/ com work.json), em ordem alfabética da pasta. */
export async function obras(): Promise<Obra[]> {
  return (await getCollection("works")).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Uma obra pelo nome da pasta (ex.: "firestriker"), ou undefined. */
export async function obra(slug: string): Promise<Obra | undefined> {
  return getEntry("works", slug);
}

/** Obras que aparecem nas listas de um idioma (`listed` e `langs`), como wlisted(). */
export async function obrasListadas(lang: Lang): Promise<Obra[]> {
  return (await obras()).filter((o) => obraListada(o, lang, langs));
}

/** Capítulos de uma obra num idioma: `listados` (na lista da obra) e `ocultos` (`unlisted: true`), em ordem natural. */
export async function capitulos(slugDaObra: string, lang: Lang, comRascunhos = COM_RASCUNHOS): Promise<{ listados: Capitulo[]; ocultos: Capitulo[] }> {
  return capitulosDaObra(await getCollection("chapters"), slugDaObra, lang, comRascunhos);
}

/** A obra tem página própria naquele idioma? (capítulos listados, não oneshot, sem link para fora) */
export async function temPaginaDeObra(o: Obra, lang: Lang, comRascunhos = COM_RASCUNHOS): Promise<boolean> {
  return obraTemPagina(o, (await capitulos(o.id, lang, comRascunhos)).listados.length, lang);
}

/** A obra pode ser citada em [[works/x]] e related naquele idioma? (capítulos listados ou link para fora) */
export async function obraCitavel(o: Obra, lang: Lang, comRascunhos = COM_RASCUNHOS): Promise<boolean> {
  return obraNoIndice(o, (await capitulos(o.id, lang, comRascunhos)).listados.length, lang);
}
