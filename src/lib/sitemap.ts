// O SITEMAP (/sitemap.xml): a lista de páginas que os buscadores devem conhecer. O Python não tinha; é novo na T14.
//
// Entram só as páginas REAIS e PUBLICADAS, as mesmas que as rotas de src/pages/ geram:
//   home e Histórias de cada idioma; a página de cada obra que tem uma; cada capítulo LISTADO; a lista de Notícias e cada notícia;
//   cada página avulsa com endereço (Sobre…); Universo e Personagens (só com show_extras). Rascunho só existe na prévia.
// Ficam de fora: a raiz `/` (só redireciona), a 404, as páginas do site antigo (`/PT.html`…, só redirecionam), o `/dev/` (ferramenta
// da prévia) e os capítulos `unlisted` (têm <meta robots noindex>: estão no site, mas não querem estar no Google).
// Os endereços saem absolutos (https://hatecycle.com/pt/…), que é o que o formato exige. O teste (tests/sitemap.test.ts) confere a lista
// contra o dist/ de verdade: tudo que o site gera, menos a raiz, a 404, os redirects e os noindex, tem de estar aqui — e nada além.
import type { Lang } from "./config";
import { esc } from "./markdown";
import { paginaTemRota } from "./paginasAvulsas";
import { obraTemPagina, type ObraVisivel } from "./visibilidade";

/** O que o sitemap lê de `dadosDoIdioma()` (o resultado completo serve). */
export interface DadosParaOSitemap<O extends ObraVisivel> {
  lang: Lang;
  obras: readonly O[];
  capitulosDe: (obra: O) => { listados: readonly { data: { _origem: { capitulo: string } } }[] };
  noticias: readonly { data: { _origem: { slug: string } } }[];
  paginas: readonly { data: { route?: boolean | undefined; _origem: { slug: string } } }[];
  universoExtra: readonly { data: { _origem: { slug: string } } }[];
  personagens: readonly { data: { _origem: { slug: string } } }[];
}

/** Os endereços (a partir da raiz do site, ex.: "/pt/news/x/") das páginas do sitemap, idioma por idioma. */
export function enderecosDoSitemap<O extends ObraVisivel>(dadosDe: readonly DadosParaOSitemap<O>[]): string[] {
  const urls: string[] = [];
  for (const dados of dadosDe) {
    const l = dados.lang;
    urls.push(`/${l}/`, `/${l}/works/`);
    for (const obra of dados.obras) {
      const slug = obra.data._origem.slug;
      const listados = dados.capitulosDe(obra).listados;
      if (obraTemPagina(obra, listados.length, l)) urls.push(`/${l}/works/${slug}/`);
      for (const c of listados) urls.push(`/${l}/works/${slug}/${c.data._origem.capitulo}/`);
    }
    if (dados.noticias.length > 0) urls.push(`/${l}/news/`, ...dados.noticias.map((n) => `/${l}/news/${n.data._origem.slug}/`));
    urls.push(...dados.paginas.filter(paginaTemRota).map((p) => `/${l}/${p.data._origem.slug}/`));
    if (dados.universoExtra.length > 0) urls.push(`/${l}/universe/`, ...dados.universoExtra.map((i) => `/${l}/universe/${i.data._origem.slug}/`));
    if (dados.personagens.length > 0) urls.push(`/${l}/characters/`, ...dados.personagens.map((i) => `/${l}/characters/${i.data._origem.slug}/`));
  }
  return urls;
}

/** O XML do sitemap (formato sitemaps.org). `enderecoDoSite` = config.json → site_url. */
export function sitemapXml(enderecoDoSite: string, enderecos: readonly string[]): string {
  const site = enderecoDoSite.replace(/\/+$/, "");
  const itens = enderecos.map((e) => `  <url><loc>${esc(site + encodeURI(e))}</loc></url>\n`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens}</urlset>\n`;
}
