// As coleções de conteúdo do site: o Astro passa a "conhecer" tudo o que está em content/.
// Explicação passo a passo: docs/aprendendo-astro/04-colecoes.md.
//
// Cada coleção = um CARREGADOR (lê os arquivos de content/ no lugar, com o mesmo parser do build.py:
// src/lib/leitor.ts) + um SCHEMA (os campos aceitos e seus tipos: src/lib/schemas.ts).
// Um campo errado em qualquer arquivo pára o `pnpm build` com uma mensagem que diz o arquivo, o campo e o valor.
//
// IDs (não mudam: deles saem os endereços e os IDs dos comentários):
//   news, pages, emissaries, characters, universe → "<pasta>/<idioma>"         ex.: "2023-08-18-orcs/pt"
//   chapters                                     → "<obra>/<capítulo>/<idioma>" ex.: "firestriker/01/en"
//   works (os work.json)                          → "<obra>"                     ex.: "firestriker"
// Fica de fora: content/embeds/*.html (códigos de incorporação, usados pelo {{embed:…}} — T09/T13).
import { join } from "node:path";
import { defineCollection } from "astro:content";
import { carregador, indiceDoDisco } from "./lib/leitor";
import { criarSchemas } from "./lib/schemas";

const schemas = criarSchemas(indiceDoDisco(join(process.cwd(), "content")));

export const collections = {
  news: defineCollection({ loader: carregador("news"), schema: schemas.news }),
  pages: defineCollection({ loader: carregador("pages"), schema: schemas.pages }),
  emissaries: defineCollection({ loader: carregador("emissaries"), schema: schemas.emissaries }),
  characters: defineCollection({ loader: carregador("characters"), schema: schemas.characters }),
  universe: defineCollection({ loader: carregador("universe"), schema: schemas.universe }),
  works: defineCollection({ loader: carregador("works"), schema: schemas.works }),
  chapters: defineCollection({ loader: carregador("chapters"), schema: schemas.chapters }),
};
