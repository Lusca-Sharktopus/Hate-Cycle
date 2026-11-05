// Os endereços do SITE ANTIGO que ainda funcionam: /PT.html, /firestriker.html, /light.html, /luz.html, /nights.html, /ossos.html, /pederneira.html.
// A lista vem de config.json → redirects (lida em src/lib/config.ts; nada é copiado para cá): trocar um destino lá troca a página aqui.
// Cada uma é uma páginazinha de uma linha (canonical + meta refresh + link), idêntica à do build.py (src/lib/raiz.ts).
// Invariante 3 do CLAUDE.md. Lição: docs/aprendendo-astro/09-endpoints.md.
import type { APIRoute, GetStaticPaths } from "astro";
import { redirectsDoSiteAntigo } from "../lib/config";
import { paginaDeRedirecionamento, redirecionamentosQueViramPagina } from "../lib/raiz";

export const getStaticPaths = (() =>
  redirecionamentosQueViramPagina(redirectsDoSiteAntigo).map(([arquivo, destino]) => {
    // Só nomes simples terminados em ".html" (como "PT.html") viram página aqui; qualquer outra coisa no config.json é erro avisado, não sumiço calado.
    if (!/^[^/]+\.html$/.test(arquivo)) throw new Error(`config.json → redirects: "${arquivo}" não é um nome simples terminado em ".html" (como "PT.html"). Só esses viram página de redirecionamento.`);
    // "PT.html" → o [antigo] é "PT" (o ".html" já está no nome deste arquivo)
    return { params: { antigo: arquivo.slice(0, -".html".length) }, props: { destino } };
  })) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(paginaDeRedirecionamento((props as { destino: string }).destino), { headers: { "Content-Type": "text/html; charset=utf-8" } });
