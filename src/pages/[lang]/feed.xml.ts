// O feed RSS de cada idioma: /en/feed.xml e /pt/feed.xml (dist/en/feed.xml, dist/pt/feed.xml). Os mesmos itens de "Últimas atualizações"
// (notícias + capítulos com data, os 30 mais novos), no XML exato do build.py (src/lib/rss.ts). Sem `site_url` no config.json, nada é gerado.
// Lição: docs/aprendendo-astro/09-endpoints.md.
import type { APIRoute, GetStaticPaths } from "astro";
import { langs, siteName, siteUrl, t, type Lang } from "../../lib/config";
import { dadosDoIdioma } from "../../lib/conteudo";
import { feedRss } from "../../lib/rss";
import { itensDoRss } from "../../lib/atualizacoes";

export const getStaticPaths = (() => (siteUrl ? langs.map((lang) => ({ params: { lang } })) : [])) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const lang = params["lang"] as Lang;
  const dados = await dadosDoIdioma(lang);
  const xml = feedRss({ nomeDoSite: siteName, enderecoDoSite: siteUrl, lang, descricao: t(lang, "hero_sub"), itens: itensDoRss(dados.atualizacoes) });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
