// O corpo de cada entrada de content/ → HTML, no MESMO contexto em que o build.py o renderiza.
//
// src/lib/markdown.ts é o conversor (o make_md() do Python), que recebe tudo por parâmetro. Este arquivo
// monta esses parâmetros a partir do conteúdo, com as regras do build.py:
//   - o idioma de cada arquivo (en.md / pt.md);
//   - o divisor de cena (`divider` do work.json) só para capítulos (make_md(lang, divider) na linha ~802);
//   - o índice dos [[links]] (o INDEX do build.py: só itens publicados naquele idioma; rascunhos só na prévia;
//     capítulos `unlisted` não contam; Universo e Personagens somem com show_extras: false);
//   - os atalhos {{stories}}/{{emissaries}}/{{other-stories}} viram MARCADORES (o HTML deles é das páginas, T11);
//   - a página "about" (Sobre) é renderizada com o texto da página "project" na frente, como o build.py faz
//     (linha ~920: md(proj_body + "\n\n" + p["body"])).
// Usado pelo carregador (src/lib/leitor.ts), que guarda o resultado em `rendered.html` de cada entrada:
// é o HTML que `render(entrada)` / <Content /> devolvem.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { langs, tr, type Lang, type Translatable } from "./config";
import { decodificar } from "./frontmatter";
import type { EntradaBruta } from "./leitor";
import { markdownParaHtml, type IndiceDoIdioma } from "./markdown";
import type { Colecao } from "./schemas";
import { capitulosDaObra, itensDoIdioma, obraNoIndice, passaRascunho, type CapituloVisivel, type ItemVisivel, type ObraVisivel } from "./visibilidade";

// ───────────── atalhos: marcadores que a página troca pelo HTML de verdade ─────────────

/** Os atalhos que o build.py conhece (as chaves de SHORT, linhas ~695–703). Qualquer outro {{nome}} vira "". */
export const ATALHOS = ["stories", "emissaries", "other-stories"] as const;
export type NomeDeAtalho = (typeof ATALHOS)[number];

/** O marcador que fica no HTML no lugar de um atalho: um comentário HTML (invisível se ninguém o trocar). */
export function marcadorDeAtalho(nome: NomeDeAtalho): string {
  return `<!--hc:atalho:${nome}-->`;
}

/** Atalho → marcador. É o "SHORT" que o carregador passa ao conversor. */
export const MARCADORES_DE_ATALHO: Readonly<Record<NomeDeAtalho, string>> = {
  stories: marcadorDeAtalho("stories"),
  emissaries: marcadorDeAtalho("emissaries"),
  "other-stories": marcadorDeAtalho("other-stories"),
};

/**
 * Troca os marcadores de atalho pelo HTML que a página montou (os cards das histórias, dos emissários…).
 * Atalho sem HTML dado vira "" — como no build.py quando não há emissários ou "outras histórias".
 * A página deve trocar os marcadores ANTES de aplicar versaleteEntreTags() no <main> (como o build.py, que
 * põe o HTML dos cards no texto e só depois aplica o versalete).
 */
export function aplicarAtalhos(html: string, conteudos: Readonly<Partial<Record<NomeDeAtalho, string>>>): string {
  return html.replace(RE_MARCADOR, (_t, nome: NomeDeAtalho) => conteudos[nome] ?? "");
}
const RE_MARCADOR = new RegExp(`<!--hc:atalho:(${ATALHOS.join("|")})-->`, "g");

// ───────────── o índice dos [[links]] (INDEX do build.py) ─────────────

/** Um item de news/pages/emissaries/characters/universe, com o que o índice precisa. */
export interface ItemDoIndice extends ItemVisivel {
  data: ItemVisivel["data"] & { title?: unknown };
}
/** Uma obra (work.json), com o que o índice precisa. */
export interface ObraDoIndice extends ObraVisivel {
  data: ObraVisivel["data"] & { title?: Translatable | undefined };
}
/** O conteúdo de que o índice precisa (entradas cruas do carregador ou entradas das coleções: os dois servem). */
export interface ConteudoDoIndice {
  news: readonly ItemDoIndice[];
  universe: readonly ItemDoIndice[];
  characters: readonly ItemDoIndice[];
  pages: readonly ItemDoIndice[];
  emissaries: readonly ItemDoIndice[];
  works: readonly ObraDoIndice[];
  chapters: readonly CapituloVisivel[];
}

/** As seções do load_items(), na ordem em que o build() as carrega. */
const SECOES_DO_INDICE = ["news", "universe", "characters", "pages", "emissaries"] as const;

/**
 * O INDEX do build.py num idioma: "seção/pasta" → [título, endereço]. É o que os [[links]] (e o `related`) consultam.
 * Regras (build.py, load_items/load_works/build):
 *  - itens: entram os publicados no idioma (rascunho só com `comRascunhos`); título = `title` ou o nome da pasta;
 *    endereço /<idioma>/<seção>/<pasta>/ (páginas: /<idioma>/<pasta>/). Emissários e páginas com `route: false`
 *    também entram, como no Python (mesmo sem página própria).
 *  - obras: entram se têm capítulo listado naquele idioma (não `unlisted`, não rascunho fora da prévia) OU link
 *    externo; endereço = o 1º capítulo, se `oneshot`, senão a página da obra. `listed: false` NÃO tira do índice.
 *  - show_extras: false tira Universo e Personagens.
 */
export function indiceDeLinks(c: ConteudoDoIndice, lang: Lang, comRascunhos: boolean, mostrarExtras: boolean): Map<string, readonly [string, string]> {
  const indice = new Map<string, readonly [string, string]>();
  for (const secao of SECOES_DO_INDICE) {
    if (!mostrarExtras && (secao === "universe" || secao === "characters")) continue;
    for (const item of itensDoIdioma(c[secao], lang, comRascunhos)) {
      const slug = item.data._origem.slug;
      const titulo = typeof item.data.title === "string" && item.data.title ? item.data.title : slug;
      indice.set(`${secao}/${slug}`, [titulo, secao === "pages" ? `/${lang}/${slug}/` : `/${lang}/${secao}/${slug}/`]);
    }
  }
  for (const obra of c.works) {
    const slug = obra.data._origem.slug;
    const { listados } = capitulosDaObra(c.chapters, slug, lang, comRascunhos);
    if (!obraNoIndice(obra, listados.length, lang)) continue;
    const primeiro = listados[0];
    const url = obra.data.oneshot && primeiro ? `/${lang}/works/${slug}/${primeiro.data._origem.capitulo}/` : `/${lang}/works/${slug}/`;
    indice.set(`works/${slug}`, [tr(obra.data.title, lang, slug), url]);
  }
  return indice;
}

// ───────────── content/embeds/ ─────────────

/**
 * Leitor de content/embeds/<nome>.html como o embed_html() do Python: `read_text("utf-8-sig")` (tira o BOM,
 * \r\n e \r viram \n); undefined se o arquivo não existe. O caminho é montado como o pathlib monta
 * (`CONTENT / "embeds" / f"{nome}.html"`): por isso resolve() e não join().
 */
export function lerEmbedDoDisco(raizDoConteudo: string): (nome: string) => string | undefined {
  return (nome) => {
    const arquivo = resolve(raizDoConteudo, "embeds", `${nome}.html`);
    if (!existsSync(arquivo)) return undefined;
    try {
      return decodificar(readFileSync(arquivo)).replace(/\r\n?/g, "\n");
    } catch (erro) {
      // o Python também pára aqui (UnicodeDecodeError); a mensagem só diz qual arquivo é
      throw new Error(`${arquivo}: não consegui ler este código de incorporação (o arquivo é UTF-8?): ${(erro as Error).message}`);
    }
  };
}

// ───────────── o HTML de cada entrada ─────────────

/** Todo o content/, lido pelo carregador (entradas cruas, antes da validação). */
export type TodoOConteudo = Readonly<Record<Colecao, readonly EntradaBruta[]>>;

/** As coleções cujas entradas têm corpo em Markdown (os work.json não têm). */
export type ColecaoComCorpo = Exclude<Colecao, "works">;

export interface OpcoesDosCorpos {
  /** DRAFTS do build.py: true na prévia (pnpm dev), false no pnpm build. Muda o índice dos [[links]]. */
  comRascunhos: boolean;
  /** config.json → show_extras. */
  mostrarExtras: boolean;
  /** Leitor de content/embeds/ (normalmente lerEmbedDoDisco). */
  lerEmbed: (nome: string) => string | undefined;
}

/** As entradas cruas vistas com os campos que as regras de visibilidade leem (draft, unlisted, _origem, title…). */
function paraOIndice(t: TodoOConteudo): ConteudoDoIndice {
  // Os campos que as regras leem (title, draft, unlisted, oneshot, external, _origem) têm o mesmo valor cru e
  // validado (os schemas não os transformam), então as entradas cruas servem como estão.
  return t as unknown as ConteudoDoIndice;
}

/** O índice dos [[links]] de cada idioma, a partir do content/ lido pelo carregador. */
export function indicesDeLinks(t: TodoOConteudo, comRascunhos: boolean, mostrarExtras: boolean): Map<Lang, IndiceDoIdioma> {
  return new Map(langs.map((l) => [l, indiceDeLinks(paraOIndice(t), l, comRascunhos, mostrarExtras)]));
}

/** O "lang, divider" do make_md(lang, divider) do build.py para uma entrada. */
export interface ContextoDoCorpo {
  lang: Lang;
  /** Só capítulos: o `divider` do work.json da obra (o build.py passa `w["meta"].get("divider")`). */
  divisor: string | undefined;
}

/** Idioma e divisor com que o build.py renderiza a entrada: capítulos levam o divisor da obra; o resto, nenhum. */
export function contextoDoCorpo(t: TodoOConteudo, colecao: ColecaoComCorpo, entrada: EntradaBruta): ContextoDoCorpo {
  const origem = entrada.data["_origem"] as { lang: Lang; obra?: string };
  if (colecao !== "chapters") return { lang: origem.lang, divisor: undefined };
  const divider = t.works.find((o) => o.id === origem.obra)?.data["divider"];
  return { lang: origem.lang, divisor: typeof divider === "string" ? divider : undefined };
}

/**
 * O texto que o build.py passa ao make_md para a entrada: o próprio corpo — menos na página "about" (Sobre),
 * que é renderizada com o corpo da página "project" (se publicada no idioma) na frente:
 * `md((proj_body(lang) + "\n\n" if p["slug"] == "about" else "") + p["body"])` (build.py, linha ~920).
 * (Renderizar os dois JUNTOS não é o mesmo que juntar os dois HTML: por isso o texto é composto antes.)
 */
export function textoParaRenderizar(t: TodoOConteudo, colecao: ColecaoComCorpo, entrada: EntradaBruta, comRascunhos: boolean): string {
  const corpo = entrada.body ?? "";
  const origem = entrada.data["_origem"] as { lang: Lang; slug?: string };
  if (colecao !== "pages" || origem.slug !== "about") return corpo;
  // proj_body(lang): o corpo de content/pages/project/<idioma>.md, se essa página está publicada (rascunho só na prévia)
  const projeto = t.pages.find((p) => p.id === `project/${origem.lang}`);
  const publicado = projeto !== undefined && passaRascunho({ data: { draft: projeto.data["draft"] === true } }, comRascunhos);
  return (publicado ? (projeto.body ?? "") : "") + "\n\n" + corpo;
}

/**
 * O HTML do corpo de cada entrada de uma coleção (id → HTML), como o build.py o renderiza — SEM o versalete
 * (que a página aplica no <main> inteiro) e com os atalhos como marcadores (que a página troca).
 */
export function htmlDosCorpos(t: TodoOConteudo, colecao: ColecaoComCorpo, opcoes: OpcoesDosCorpos): Map<string, string> {
  const indices = indicesDeLinks(t, opcoes.comRascunhos, opcoes.mostrarExtras);
  const html = new Map<string, string>();
  for (const entrada of t[colecao]) {
    if (entrada.body === undefined) continue;
    const { lang, divisor } = contextoDoCorpo(t, colecao, entrada);
    const texto = textoParaRenderizar(t, colecao, entrada, opcoes.comRascunhos);
    html.set(entrada.id, markdownParaHtml(texto, { indice: indices.get(lang) ?? new Map(), atalhos: MARCADORES_DE_ATALHO, divisor, lerEmbed: opcoes.lerEmbed }));
  }
  return html;
}
