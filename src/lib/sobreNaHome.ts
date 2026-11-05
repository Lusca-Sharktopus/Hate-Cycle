// A página Sobre MORA NA HOME desde 05/11/2026 (pedido do autor, depois da virada: "suma com a página sobre, coloque todo o conteúdo
// dela na homepage, logo abaixo das últimas histórias atualizadas").
//   - o texto continua em content/pages/about/{en,pt}.md (com o "Sobre o projeto" de content/pages/project na frente, src/lib/corpos.ts);
//   - a home o desenha inteiro logo depois do carrossel de histórias, num <article id="sobre"> (pt) / id="about" (en);
//   - /pt/about/ e /en/about/ continuam existindo, como página de redirecionamento para /pt/#sobre e /en/#about (links antigos e
//     buscadores não quebram: invariante 1 do CLAUDE.md);
//   - o item "Sobre" do menu leva à âncora da home; o sitemap não lista mais /about/.
// O site Python continua com a página Sobre: as exceções de paridade estão em tests/ajudantes/html.ts (sobreNaHomeComoNoPython).
import type { Lang } from "./config";

/** A pasta de content/pages/ que vai para a home. */
export const PASTA_DO_SOBRE = "about";

/** A âncora da seção na home, por idioma. */
export const ANCORA_DO_SOBRE: Readonly<Record<Lang, string>> = { pt: "sobre", en: "about" };

/** O endereço do Sobre: a home do idioma, na âncora da seção. */
export function enderecoDoSobre(lang: Lang): string {
  return `/${lang}/#${ANCORA_DO_SOBRE[lang]}`;
}

/** O endereço antigo da página (/pt/about/), que agora só redireciona. */
export function enderecoAntigoDoSobre(lang: Lang): string {
  return `/${lang}/${PASTA_DO_SOBRE}/`;
}
