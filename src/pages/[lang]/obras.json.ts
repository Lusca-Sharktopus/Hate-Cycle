// /pt/obras.json e /en/obras.json (09/11/2026): a lista das obras publicadas daquele idioma, com a capa leve e o link de cada uma, para
// "Meus Favoritos" da janela da conta (src/scripts/comentarios/conta.ts). A janela só baixa este arquivo quando abre; o HTML das páginas
// não muda. Mesmas obras e mesmos links dos cartões de Histórias (dadosDosAtalhos → cartaoDaObra); a capa é a versão leve de 360 px do
// perfil das capas do carrossel (src/lib/imagens.ts), ou o arquivo original quando ele já é leve.
import type { APIRoute, GetStaticPaths } from "astro";
import { emissariosMostramTextos, langs, type Lang } from "../../lib/config";
import { COM_RASCUNHOS, dadosDoIdioma } from "../../lib/conteudo";
import { enderecoDaImagem, otimizar, PERFIS } from "../../lib/imagens";
import { dadosDosAtalhos } from "../../lib/paginas";

export const getStaticPaths = (() => langs.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

/** Do srcset ("a.webp 200w, b.webp 360w, …"), o endereço mais perto de 360w; sem srcset, o original. */
function capaLeve(srcset: string | undefined, original: string): string {
  if (!srcset) return original;
  const opcoes = srcset.split(",").map((p) => p.trim().split(/\s+/)).filter((p) => p[0]);
  const escolhida = opcoes.find((p) => p[1] === "360w") ?? opcoes[opcoes.length - 1];
  return escolhida?.[0] ?? original;
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params["lang"] as Lang;
  const dados = await dadosDoIdioma(lang);
  const { historias, outras } = dadosDosAtalhos(dados, COM_RASCUNHOS, emissariosMostramTextos);
  const obras = [];
  for (const c of [...historias.cartoes, ...outras]) {
    if (!c.imagem) continue;
    const leve = await otimizar(c.imagem, PERFIS.capaDoCarrossel);
    obras.push({
      id: c.slug,
      titulo: c.titulo,
      capa: capaLeve(leve?.srcset, enderecoDaImagem(c.imagem)),
      link: c.botao.tipo === "link" ? c.botao.href : null,
    });
  }
  return new Response(JSON.stringify({ obras }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
