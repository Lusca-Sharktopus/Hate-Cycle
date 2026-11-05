// As versões leves (WebP animado, sem perda) dos GIFs animados de static/ (src/lib/animadas.ts): /animadas/apollo-site-1a2b3c4d.webp…
// São arquivos gerados no build (e na prévia); não existem em static/. Quem aponta para eles: o `srcset` das <img> dos GIFs
// (src/lib/imagensDoHtml.ts). O GIF original continua publicado no endereço de sempre, e continua sendo o `src` da <img>.
import type { APIRoute, GetStaticPaths } from "astro";
import { animadasDoSite, gerarWebpAnimado } from "../../lib/animadas";

export const getStaticPaths = (async () => {
  const animadas = await animadasDoSite();
  return animadas.map((a) => ({ params: { nome: a.nome.replace(/\.webp$/, "") }, props: { arquivo: a.arquivo } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const webp = await gerarWebpAnimado(props["arquivo"] as string);
  return new Response(new Uint8Array(webp), { headers: { "Content-Type": "image/webp" } });
};
