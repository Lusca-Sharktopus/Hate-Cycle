// Quais itens do menu existem em cada idioma — a regra de `has` no build() do build.py (linhas ~656–669).
//
// Desde a T08 os fatos vêm das coleções de conteúdo (src/lib/conteudo.ts), com as mesmas regras de
// rascunho e de `show_extras` do build.py. A regra (`calcularMenu`) é função pura: o teste
// tests/conteudo.test.ts confere que ela dá o mesmo `has` do Python, com e sem rascunhos.
import { showExtras, t, type Lang } from "./config";
import { COM_RASCUNHOS, itensPublicados, tituloDoItem } from "./conteudo";

export interface MenuLink {
  href: string;
  label: string;
}

/** Quais itens opcionais do menu aparecem. "Histórias" é sempre mostrada, por isso não está aqui. */
export interface Menu {
  about: boolean;
  news: boolean;
  support: boolean;
  /** Itens do menu suspenso "Extras" (vazio = o menu suspenso não existe). */
  extras: MenuLink[];
}

/** O que existe em content/ para um idioma (já sem rascunhos, a não ser na prévia). */
export interface FatosDoConteudo {
  /** Quantidade de notícias. */
  news: number;
  /** Quantidade de páginas de Universo. */
  universe: number;
  /** Quantidade de páginas de Personagens. */
  characters: number;
  /** Páginas soltas de content/pages/ (about, support…). `menu` é o campo `menu:` do front matter. */
  pages: { slug: string; title: string; menu: string }[];
}

/**
 * A regra do menu. Função pura: mesmos fatos, mesmo resultado.
 *  - Sobre / Apoio: aparecem se existir content/pages/about (ou support) naquele idioma;
 *  - Notícias: aparece se houver pelo menos uma notícia;
 *  - Extras: Universo e Personagens (se tiverem páginas) + páginas com `menu: extras`;
 *    com `show_extras: false` no config.json, nada disso existe.
 */
export function calcularMenu(lang: Lang, fatos: FatosDoConteudo, mostrarExtras: boolean): Menu {
  const extras: MenuLink[] = [];
  if (mostrarExtras) {
    if (fatos.universe > 0) extras.push({ href: `/${lang}/universe/`, label: t(lang, "universe") });
    if (fatos.characters > 0) extras.push({ href: `/${lang}/characters/`, label: t(lang, "characters") });
    for (const p of fatos.pages) {
      if (p.menu === "extras") extras.push({ href: `/${lang}/${p.slug}/`, label: p.title });
    }
  }
  return {
    about: fatos.pages.some((p) => p.slug === "about"),
    news: fatos.news > 0,
    support: fatos.pages.some((p) => p.slug === "support"),
    extras,
  };
}

/**
 * O menu de um idioma, a partir das coleções.
 * Rascunhos (`draft: true`) só contam na prévia (`pnpm dev`), como no `python build.py serve`;
 * no `pnpm build` ficam de fora, como no `python build.py`.
 */
export async function menuDoIdioma(lang: Lang, comRascunhos = COM_RASCUNHOS): Promise<Menu> {
  const [news, universe, characters, pages] = await Promise.all([
    itensPublicados("news", lang, comRascunhos),
    itensPublicados("universe", lang, comRascunhos),
    itensPublicados("characters", lang, comRascunhos),
    itensPublicados("pages", lang, comRascunhos),
  ]);
  return calcularMenu(
    lang,
    {
      news: news.length,
      universe: universe.length,
      characters: characters.length,
      pages: pages.map((p) => ({ slug: p.data._origem.slug, title: tituloDoItem(p), menu: p.data.menu ?? "" })),
    },
    showExtras,
  );
}
