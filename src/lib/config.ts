// Ponte entre o config.json (o mesmo que o build.py lê) e as páginas do Astro.
//
// O arquivo é lido NO LUGAR, sem cópia: o caminho ../../config.json sai de src/lib/ e volta à raiz.
// Só os campos importados abaixo entram no site; o resto do config.json (inclusive as chaves
// do Supabase em `comments`, além de `base_url`, `email`, `redirects`…) não é importado
// aqui. NUNCA importe nem exporte `comments` neste arquivo.
import { site_name, site_url, logo, author, show_extras, socials, languages, intro, ui, emissaries } from "../../config.json";

/** Os idiomas do site. Têm de ser os mesmos de config.json → languages e de astro.config.mjs → i18n.locales. */
export type Lang = "en" | "pt";

/** Todos os textos da interface (config.json → ui). Cada idioma tem de ter TODAS as chaves. */
export interface UiText {
  // menu e navegação geral
  home: string;
  news: string;
  works: string;
  universe: string;
  characters: string;
  about: string;
  extras: string;
  support: string;
  // frase de efeito e home
  tagline: string;
  hero_sub: string;
  start: string;
  explore: string;
  latest: string;
  tag_news: string;
  tag_chapter: string;
  tag_chapter_ep: string;
  all_news: string;
  read_more: string;
  hate_stories: string;
  hate_stories_sub: string;
  other_stories: string;
  other_stories_sub: string;
  // histórias, capítulos, episódios
  read: string;
  watch: string;
  open: string;
  soon: string;
  chapters: string;
  chapters_ep: string;
  chapter: string;
  chapter_ep: string;
  first_chapter: string;
  last_chapter: string;
  last_chapter_ep: string;
  prev: string;
  next: string;
  back_work: string;
  back_work_ep: string;
  back_home: string;
  appears_in: string;
  see_also: string;
  draft: string;
  preview: string;
  empty: string;
  rights: string;
  rss: string;
  not_found: string;
  not_found_sub: string;
  // ordenação, busca e paginação
  sort_by: string;
  sort_release: string;
  sort_chrono: string;
  sort_alpha: string;
  search_ph: string;
  search_none: string;
  more: string;
  all_stories: string;
  news_search_ph: string;
  news_none: string;
  page_prev: string;
  page_next: string;
  // emissários
  emissaries: string;
  emissaries_sub: string;
  // datas
  date_fmt: string;
  // comentários
  comments: string;
  c_title: string;
  c_login: string;
  c_signup: string;
  c_logout: string;
  c_email: string;
  c_password: string;
  c_username: string;
  c_forgot: string;
  c_login_to: string;
  c_write: string;
  c_post: string;
  c_reply: string;
  c_delete: string;
  c_cancel: string;
  c_confirm_delete: string;
  c_none: string;
  c_hello: string;
  c_check_email: string;
  c_reset_sent: string;
  c_new_password: string;
  c_save_password: string;
  c_password_changed: string;
  c_err_login: string;
  c_err_rate: string;
  c_err_generic: string;
  c_loading: string;
  c_not_configured: string;
  // listas (use tList(), não t())
  months: readonly string[];
  dir_release: readonly string[];
  dir_chrono: readonly string[];
  dir_alpha: readonly string[];
}

/** As chaves de ui cujo valor é um texto simples (as que t() aceita). */
export type UiKey = { [K in keyof UiText]: UiText[K] extends string ? K : never }[keyof UiText];

/** As chaves de ui cujo valor é uma lista de textos (as que tList() aceita). */
export type UiListKey = { [K in keyof UiText]: UiText[K] extends string ? never : K }[keyof UiText];

/** As chaves que têm versão "episódio" (chave + "_ep"), como `chapter` → `chapter_ep`: as que tk() aceita. */
export type UiEpKey = { [K in UiKey]: `${K}_ep` extends UiKey ? K : never }[UiKey];

/** Uma rede social do rodapé (config.json → socials). */
export interface Social {
  name: string;
  url: string;
  icon: string;
}

/** Tela de abertura (config.json → intro). Usada por src/components/Abertura.astro (T07). */
export interface IntroConfig {
  enabled: boolean;
  video: string;
  background: string;
  min_ms: number;
  max_ms: number;
}

/** Emissários (config.json → emissaries): textos ligados/desligados e pastas escondidas. Usado desde a T08. */
export interface EmissariesConfig {
  show_texts: boolean;
  hide: string[];
}

/** O pedaço do config.json que o Astro usa. Campo novo entra aqui quando for usado. */
interface SiteConfig {
  site_name: string;
  site_url: string;
  logo: string;
  author: string;
  show_extras: boolean;
  emissaries: EmissariesConfig;
  socials: Social[];
  languages: Record<Lang, { name: string; html: string }>;
  intro: IntroConfig;
  ui: Record<Lang, UiText>;
}

// Se algum desses campos sumir, mudar de tipo ou de nome no config.json, `pnpm check` acusa erro AQUI
// (em vez de o site sair com um buraco).
const config: SiteConfig = { site_name, site_url, logo, author, show_extras, socials, languages, intro, ui, emissaries };

// Trava contra o outro erro: uma chave de `ui` que o tipo UiText não conhece (por exemplo, um texto novo
// que alguém acrescentou no config.json e esqueceu de declarar acima). Se isso acontecer, o tipo abaixo
// vira `never` e a linha seguinte deixa de compilar.
type UiSemSobras = Exclude<keyof typeof ui.en | keyof typeof ui.pt, keyof UiText> extends never ? true : never;
export const uiSemSobras: UiSemSobras = true;

/** Nome do site, ex.: "Hᴀᴛᴇ Cʏᴄʟᴇ" (o mesmo CFG["site_name"] do build.py). */
export const siteName = config.site_name;

/** Endereço público do site (config.json → site_url). Vazio = sem link de RSS, como no build.py. */
export const siteUrl = config.site_url;

/** Arquivo da logo do cabeçalho, relativo a static/ (ex.: "logos/Hate Cycle Glow.png"). */
export const logoFile = config.logo;

/** Nome do autor, usado no "© 2023 - ano by …" do rodapé. */
export const authorName = config.author;

/** `show_extras` do config.json: liga/desliga Universo e Personagens (hoje desligado). */
export const showExtras = config.show_extras;

/** `emissaries.hide` do config.json: pastas de content/emissaries/ que não aparecem no site (ex.: ["saf"]). */
export const emissariosEscondidos: readonly string[] = config.emissaries.hide;

/** `emissaries.show_texts` do config.json: o texto de apresentação de cada emissário aparece no card? (hoje não) */
export const emissariosMostramTextos: boolean = config.emissaries.show_texts;

/** Redes sociais do rodapé (config.json → socials). */
export const socialLinks: readonly Social[] = config.socials;

/** Tela de abertura (config.json → intro): liga/desliga, vídeo, fundo e tempos mínimo/máximo em milissegundos. */
export const introConfig: Readonly<IntroConfig> = config.intro;

/** Os idiomas, na ordem do config.json (usada no seletor de idioma e nos hreflang). */
export const langs = Object.keys(config.languages) as Lang[];

/** Código usado em <html lang="…">: "en" ou "pt-BR" (config.json → languages → html). */
export function htmlLang(lang: Lang): string {
  return config.languages[lang].html;
}

/** Nome do idioma como o visitante o lê ("English", "Português"). */
export function langName(lang: Lang): string {
  return config.languages[lang].name;
}

/** Textos da interface (config.json → ui), como a função T(lang, chave) do build.py.
 *  A chave é conferida pelo `pnpm check`: t("pt", "chave_errada") não compila. */
export function t(lang: Lang, key: UiKey): string {
  return config.ui[lang][key];
}

/** Como t(), mas para as listas de ui (meses, rótulos de ordem…). */
export function tList(lang: Lang, key: UiListKey): readonly string[] {
  return config.ui[lang][key];
}

/** Como TK() do build.py: usa a versão "episódio" (chave + "_ep") quando a obra é em vídeo. */
export function tk(lang: Lang, key: UiEpKey, kind?: string): string {
  return kind === "video" ? config.ui[lang][`${key}_ep`] : config.ui[lang][key];
}

/** Valor traduzível dos arquivos de conteúdo: texto simples ou { en, pt }. Como tr() do build.py. */
export type Translatable = string | { [L in Lang]?: string | undefined };

/**
 * tr() do build.py (linha ~78), caso a caso:
 *  - texto simples: ele mesmo; vazio → `fallback`;
 *  - { en, pt }: o idioma pedido, senão o inglês, senão o PRIMEIRO valor do objeto — mesmo que esteja vazio.
 *    Só um objeto sem nenhum valor ({}) cai no `fallback`.
 * (T10, "herdado da T09": antes, o último passo aqui era `|| fallback`, e um título {"en": "", "pt": ""} virava o
 * nome da pasta, enquanto o Python mostra o texto vazio. Agora os dois fazem a mesma coisa; ver 06-regras.md.)
 */
export function tr(value: Translatable | undefined, lang: Lang, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  return value[lang] || value.en || (Object.values(value)[0] ?? fallback);
}
