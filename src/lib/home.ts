// O que só a HOME decide além das atualizações e dos destaques (que moram em atualizacoes.ts e obras.ts).
//
// De onde vem no build.py: a chamada para a página Sobre, no fim da home (linhas ~749 e ~760).
import type { Lang } from "./config";

/** A página "project" (content/pages/project) publicada no idioma, com o que a home usa dela. */
export interface PaginaParaChamada {
  data: { title?: string | undefined; summary?: string | undefined; _origem: { slug: string; lang: Lang } };
}

/**
 * A chamada "Sobre" no fim da home: título e resumo da página `project`, e o botão leva a /<idioma>/about/.
 * Sem a página `project` publicada naquele idioma, a seção não existe (null).
 */
export function chamadaSobre(paginas: readonly PaginaParaChamada[], lang: Lang): { titulo: string; resumo: string; url: string } | null {
  const p = paginas.find((x) => x.data._origem.slug === "project");
  if (!p) return null;
  return { titulo: p.data.title || p.data._origem.slug, resumo: p.data.summary ?? "", url: `/${lang}/about/` };
}
