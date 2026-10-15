// Quais itens do menu existem em cada idioma — a regra de `has` no build() do build.py (linhas ~656–669).
//
// PROVISÓRIO ATÉ A T08: as coleções de conteúdo ainda não existem no Astro, então este arquivo olha
// direto as pastas de content/ para saber o que existe. Na T08 a leitura (`lerFatos`) é trocada por
// getCollection(); a regra (`calcularMenu`) é função pura e fica como está.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { showExtras, t, type Lang } from "./config";

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

// ───────────── leitura provisória de content/ (sai na T08) ─────────────

/** Front matter mínimo (o mesmo YAML simples de parse()/scalar() do build.py): só campos de uma linha. */
function frontMatter(texto: string): Record<string, string | boolean> {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(texto.replace(/^﻿/, "").replace(/\r\n/g, "\n"));
  const campos: Record<string, string | boolean> = {};
  for (const linha of (m?.[1] ?? "").split("\n")) {
    if (!linha.trim() || linha.trimStart().startsWith("#") || /^\s+-(\s|$)/.test(linha)) continue;
    const i = linha.indexOf(":");
    if (i < 0) continue;
    const valor = linha.slice(i + 1).trim();
    const entreAspas = valor.length > 1 && valor[0] === valor.at(-1) && (valor[0] === '"' || valor[0] === "'");
    campos[linha.slice(0, i).trim()] = entreAspas ? valor.slice(1, -1) : valor.toLowerCase() === "true" ? true : valor.toLowerCase() === "false" ? false : valor;
  }
  return campos;
}

/** As subpastas de content/<seção>/ que têm <idioma>.md, em ordem alfabética (como load_items). */
function itensDaSecao(secao: string, lang: Lang, comRascunhos: boolean) {
  const pasta = join(process.cwd(), "content", secao);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .flatMap((slug) => {
      const arquivo = join(pasta, slug, `${lang}.md`);
      if (!existsSync(arquivo)) return [];
      const fm = frontMatter(readFileSync(arquivo, "utf-8"));
      if (fm["draft"] === true && !comRascunhos) return [];
      const titulo = fm["title"];
      return [{ slug, title: typeof titulo === "string" && titulo ? titulo : slug, menu: String(fm["menu"] ?? "") }];
    });
}

/**
 * O menu de um idioma, lendo content/ (provisório até a T08).
 * Rascunhos (`draft: true`) só contam na prévia (`pnpm dev`), como no `python build.py serve`;
 * no `pnpm build` ficam de fora, como no `python build.py`.
 */
export function menuDoIdioma(lang: Lang): Menu {
  const comRascunhos = import.meta.env.DEV;
  return calcularMenu(
    lang,
    {
      news: itensDaSecao("news", lang, comRascunhos).length,
      universe: itensDaSecao("universe", lang, comRascunhos).length,
      characters: itensDaSecao("characters", lang, comRascunhos).length,
      pages: itensDaSecao("pages", lang, comRascunhos),
    },
    showExtras,
  );
}
