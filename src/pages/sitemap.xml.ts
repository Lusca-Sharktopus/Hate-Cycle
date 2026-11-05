// O sitemap do site: /sitemap.xml (dist/sitemap.xml). A lista de páginas vem de src/lib/sitemap.ts, que usa os MESMOS dados que as rotas.
// Sem `site_url` no config.json não há endereço absoluto para escrever, então nada é gerado (como o RSS).
// Lição: docs/aprendendo-astro/09-endpoints.md.
import type { APIRoute } from "astro";
import { siteUrl } from "../lib/config";
import { dadosDeTodosOsIdiomas } from "../lib/conteudo";
import { enderecosDoSitemap, sitemapXml } from "../lib/sitemap";

export const GET: APIRoute = async () => {
  const dadosDe = await dadosDeTodosOsIdiomas();
  return new Response(sitemapXml(siteUrl, enderecosDoSitemap(Object.values(dadosDe))), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
