// /pt/novidades.json e /en/novidades.json (28/11/2026, pedido do autor): as novidades publicadas daquele idioma (hoje as notícias; o
// Blog entra aqui quando a seção existir), as mais recentes primeiro. Quem usa:
//   - o sino da janela da conta e a bolinha do botão da conta (src/scripts/conta/novidades.ts), só quando a pessoa tem conta;
//   - a função do Supabase que manda as notificações (supabase/functions/avisar-novidades/), depois de cada publicação.
// `versao` = o commit que gerou o site (GITHUB_SHA, que só existe no GitHub Actions): o passo "Avisar" do deploy espera o site no ar
// mostrar a versão nova antes de chamar a função (tools/avisar_novidades.mjs). Formato e limites: src/scripts/conta/regrasDasNovidades.ts.
import type { APIRoute, GetStaticPaths } from "astro";
import { langs, type Lang } from "../../lib/config";
import { dadosDoIdioma } from "../../lib/conteudo";
import { ordenarNoticias, tituloDaNoticia, urlDaNoticia } from "../../lib/noticias";
import { resumoDaNoticia } from "../../lib/resumos";
import { NOVIDADES_NO_ARQUIVO, type ArquivoDeNovidades } from "../../scripts/conta/regrasDasNovidades";

export const getStaticPaths = (() => langs.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const lang = params["lang"] as Lang;
  const dados = await dadosDoIdioma(lang);
  const arquivo: ArquivoDeNovidades = {
    versao: /^[0-9a-f]{40}$/.test(process.env["GITHUB_SHA"] ?? "") ? (process.env["GITHUB_SHA"] as string) : "",
    itens: ordenarNoticias(dados.noticias)
      .slice(0, NOVIDADES_NO_ARQUIVO)
      .map((n) => ({
        id: `news/${n.data._origem.slug}`,
        titulo: tituloDaNoticia(n),
        url: urlDaNoticia(n),
        data: n.data.date ?? "",
        resumo: resumoDaNoticia(n.data.summary, n.body ?? ""),
      })),
  };
  return new Response(JSON.stringify(arquivo), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
