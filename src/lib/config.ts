// Ponte entre o config.json (o mesmo que o build.py lê) e as páginas do Astro.
//
// O arquivo é lido NO LUGAR, sem cópia: o caminho ../../config.json sai de src/lib/ e volta à raiz.
// Só os campos importados abaixo entram no site; o resto do config.json (inclusive as chaves
// do Supabase em `comments`) não é importado aqui. Nunca importe nem mostre `comments` neste arquivo.
import { site_name, languages, ui } from "../../config.json";

/** Os idiomas do site. Têm de ser os mesmos de config.json → languages e de astro.config.mjs → i18n.locales. */
export type Lang = "en" | "pt";

/** O pedacinho do config.json que o Astro usa por enquanto (T05). Campos novos entram aqui quando forem usados. */
interface SiteConfig {
  site_name: string;
  languages: Record<Lang, { name: string; html: string }>;
  ui: Record<Lang, { tagline: string; hero_sub: string }>;
}

// Se alguém apagar ou renomear um desses campos no config.json, `pnpm check` acusa erro aqui.
const config: SiteConfig = { site_name, languages, ui };

/** Nome do site, ex.: "Hᴀᴛᴇ Cʏᴄʟᴇ" (o mesmo CFG["site_name"] do build.py). */
export const siteName = config.site_name;

/** Código usado em <html lang="…">: "en" ou "pt-BR" (config.json → languages → html). */
export function htmlLang(lang: Lang): string {
  return config.languages[lang].html;
}

/** Textos da interface (config.json → ui), como a função T(lang, chave) do build.py. */
export function t(lang: Lang, key: keyof SiteConfig["ui"][Lang]): string {
  return config.ui[lang][key];
}
