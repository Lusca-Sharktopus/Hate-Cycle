// Ajudante dos testes: lê uma pasta content/ (a de verdade ou uma inventada) com o MESMO leitor e os MESMOS schemas do site
// e devolve as entradas validadas — no formato que `dadosDoIdioma()` (src/lib/idioma.ts) espera —, com o HTML dos
// emissários, dos capítulos (T12) e das notícias (T13) em `rendered.html` (é o que o carregador do Astro guarda).
import { htmlDosCorpos, lerEmbedDoDisco } from "../../src/lib/corpos";
import { indiceDoDisco, lerTudo } from "../../src/lib/leitor";
import { criarSchemas } from "../../src/lib/schemas";

export function carregarConteudo(raiz: string, opcoes: { comRascunhos: boolean; mostrarExtras: boolean }) {
  const schemas = criarSchemas(indiceDoDisco(raiz));
  const tudo = lerTudo(raiz);
  const htmlDosEmissarios = htmlDosCorpos(tudo, "emissaries", { ...opcoes, lerEmbed: lerEmbedDoDisco(raiz) });
  const htmlDosCapitulos = htmlDosCorpos(tudo, "chapters", { ...opcoes, lerEmbed: lerEmbedDoDisco(raiz) });
  const htmlDasNoticias = htmlDosCorpos(tudo, "news", { ...opcoes, lerEmbed: lerEmbedDoDisco(raiz) });
  return {
    news: tudo.news.map((e) => ({ id: e.id, body: e.body, data: schemas.news.parse(e.data), rendered: { html: htmlDasNoticias.get(e.id) ?? "" } })),
    pages: tudo.pages.map((e) => ({ id: e.id, body: e.body, data: schemas.pages.parse(e.data) })),
    emissaries: tudo.emissaries.map((e) => ({ id: e.id, body: e.body, data: schemas.emissaries.parse(e.data), rendered: { html: htmlDosEmissarios.get(e.id) ?? "" } })),
    characters: tudo.characters.map((e) => ({ id: e.id, body: e.body, data: schemas.characters.parse(e.data) })),
    universe: tudo.universe.map((e) => ({ id: e.id, body: e.body, data: schemas.universe.parse(e.data) })),
    works: tudo.works.map((e) => ({ id: e.id, data: schemas.works.parse(e.data) })),
    chapters: tudo.chapters.map((e) => ({ id: e.id, body: e.body, data: schemas.chapters.parse(e.data), rendered: { html: htmlDosCapitulos.get(e.id) ?? "" } })),
  };
}
