// O passo final de TODA página HTML do site, no build (o site é estático: isto roda uma vez por página, ao gerar o dist/).
// Hoje só: o versalete "Hate Cycle" com as letras pequenas em semibold (src/lib/versaleteSemibold.ts, pedido do autor de 09/11/2026).
// Endpoints que não são HTML (feed.xml, sitemap.xml, redirects .html.ts que não têm versalete) passam sem mudança.
import { defineMiddleware } from "astro:middleware";
import { versaleteSemibold } from "./lib/versaleteSemibold";

export const onRequest = defineMiddleware(async (_contexto, seguir) => {
  const resposta = await seguir();
  if (!(resposta.headers.get("content-type") ?? "").includes("text/html")) return resposta;
  const html = await resposta.text();
  if (!html.includes('<span class="hc">Hate Cycle</span>')) return new Response(html, { status: resposta.status, headers: resposta.headers });
  return new Response(versaleteSemibold(html), { status: resposta.status, headers: resposta.headers });
});
