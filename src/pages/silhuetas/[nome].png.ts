// As silhuetas dos desenhos que o texto contorna (src/lib/silhuetas.ts): /silhuetas/giuseppe.png, /silhuetas/autor.png…
// São arquivos gerados no build (e na prévia); não existem em static/. Quem usa: o `shape-outside` do prosa.css e da PaginaAvulsa.astro.
import type { APIRoute, GetStaticPaths } from "astro";
import { gerarSilhueta, SILHUETAS, type NomeDaSilhueta } from "../../lib/silhuetas";

export const getStaticPaths = (() => Object.keys(SILHUETAS).map((nome) => ({ params: { nome } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const arquivo = SILHUETAS[params["nome"] as NomeDaSilhueta];
  const png = await gerarSilhueta(arquivo);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
