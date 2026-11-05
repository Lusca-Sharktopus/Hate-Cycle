// /pt/about/ e /en/about/ depois de 05/11/2026: a página Sobre mora na home (src/lib/sobreNaHome.ts). O endereço antigo continua
// existindo (links e buscadores: invariante 1 do CLAUDE.md), como uma páginazinha de redirecionamento igual às do site antigo
// (src/lib/raiz.ts → paginaDeRedirecionamento), para /pt/#sobre e /en/#about. Só nos idiomas em que a Sobre está publicada.
import type { APIRoute, GetStaticPaths } from "astro";
import { langs, type Lang } from "../../../lib/config";
import { dadosDoIdioma } from "../../../lib/conteudo";
import { paginaDeRedirecionamento } from "../../../lib/raiz";
import { enderecoDoSobre, PASTA_DO_SOBRE } from "../../../lib/sobreNaHome";

export const getStaticPaths = (async () => {
  const caminhos = [];
  for (const lang of langs) {
    const dados = await dadosDoIdioma(lang);
    if (dados.paginas.some((p) => p.data._origem.slug === PASTA_DO_SOBRE)) caminhos.push({ params: { lang } });
  }
  return caminhos;
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(paginaDeRedirecionamento(enderecoDoSobre(params.lang as Lang)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
