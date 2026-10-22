// As PÁGINAS AVULSAS (Sobre, Apoio… = content/pages/): o que cada uma mostra, decidido aqui e só desenhado pelo componente.
//
// Função pura, sem HTML. De onde vem no build.py: o laço "PÁGINAS AVULSAS" do build() (linhas ~917–922):
//   - `route: false` (content/pages/project) não ganha endereço próprio: o texto é usado dentro de "Sobre";
//   - `layout: wide` → coluna larga e título só para leitor de tela (sr-only); sem isso, coluna estreita;
//   - classe `page-<pasta>` no <article> (é onde o CSS da página Sobre se agarra);
//   - o texto de "Sobre" já vem com o de "project" na frente: isso é feito pelo carregador (src/lib/corpos.ts, textoParaRenderizar);
//   - o aviso de rascunho ("Rascunho — só aparece na prévia") só aparece na prévia, que é o único lugar onde rascunho existe;
//   - `summary:` vira a descrição da página (<meta name="description">); sem ele vale a frase padrão do site;
//   - "esta página em outro idioma" (alt_for): só nos idiomas em que a página existe publicada.
// Prova: tests/paginas.test.ts (grupo t14, páginas reais) e tests/paginasAvulsas.test.ts (sites inventados).
import { t, type Lang } from "./config";
import { alternativasDeItem, urlDoItem, type Alternativas } from "./alternativas";
import { marcadorDeAtalho, type NomeDeAtalho } from "./corpos";
import { usaClasse } from "./leitura";

/** O que uma página avulsa precisa ter (a entrada da coleção `pages` tem isto e mais). */
export interface PaginaParaDesenhar {
  data: {
    title?: string | undefined;
    summary?: string | undefined;
    layout?: "wide" | undefined;
    route?: boolean | undefined;
    draft?: boolean | undefined;
    _origem: { slug: string; lang: Lang };
  };
  rendered?: { html?: string | undefined } | undefined;
}

export interface PaginaAvulsa {
  lang: Lang;
  /** Nome da pasta em content/pages/: "about", "support"… */
  pasta: string;
  /** Endereço: /<idioma>/<pasta>/ */
  url: string;
  /** O que vai para o <head> (BaseLayout): título da aba, descrição e a mesma página nos outros idiomas. */
  tituloDaPagina: string;
  descricao: string;
  alternativas: Alternativas;
  /** Coluna do texto: "wide" (`layout: wide`) ou "narrow". */
  largura: "wide" | "narrow";
  /** Classe de contexto do <article>: "page-about". */
  classe: string;
  avisoDeRascunho: string | null;
  titulo: string;
  /** O HTML do texto do autor (rendered.html), sem versalete e com os atalhos ainda como marcadores. */
  html: string;
  /** Quais atalhos ({{emissaries}}, {{stories}}…) o texto usa: a página só monta os componentes de que precisa. */
  atalhos: NomeDeAtalho[];
  /** O texto traz uma carta que vira / posts com botão para alternar? Então a página leva o script. */
  temCartaQueVira: boolean;
  temPostsAlternados: boolean;
}

/** Tem endereço próprio? (`route: false` = não: content/pages/project é usada dentro de "Sobre".) */
export function paginaTemRota(p: { data: { route?: boolean | undefined } }): boolean {
  return p.data.route !== false;
}

/** Os atalhos que o texto usa (cada um deixou um marcador no HTML). */
export function atalhosUsados(html: string): NomeDeAtalho[] {
  return (["stories", "emissaries", "other-stories"] as const).filter((nome) => html.includes(marcadorDeAtalho(nome)));
}

/**
 * As páginas avulsas de um idioma, na ordem das pastas.
 * `publicadasPorIdioma`: as páginas publicadas em CADA idioma (para o seletor de idioma: a mesma página no outro).
 */
export function paginasAvulsas<P extends PaginaParaDesenhar>(
  doIdioma: readonly P[],
  lang: Lang,
  publicadasPorIdioma: Readonly<Record<Lang, readonly PaginaParaDesenhar[]>>,
): PaginaAvulsa[] {
  return doIdioma.filter(paginaTemRota).map((p) => {
    const pasta = p.data._origem.slug;
    const html = p.rendered?.html ?? "";
    const titulo = p.data.title || pasta;
    return {
      lang,
      pasta,
      url: urlDoItem("pages", lang, pasta),
      tituloDaPagina: titulo,
      descricao: p.data.summary ?? "",
      alternativas: alternativasDeItem("pages", pasta, publicadasPorIdioma),
      largura: p.data.layout === "wide" ? "wide" : "narrow",
      classe: `page-${pasta}`,
      avisoDeRascunho: p.data.draft === true ? t(lang, "draft") : null,
      titulo,
      html,
      atalhos: atalhosUsados(html),
      temCartaQueVira: usaClasse(html, "flip-card"),
      temPostsAlternados: usaClasse(html, "embed-alt"),
    };
  });
}
