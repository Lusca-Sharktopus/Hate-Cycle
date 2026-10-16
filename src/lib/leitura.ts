// O LEITOR DE CAPÍTULOS: tudo o que a página de um capítulo mostra (/pt/works/<obra>/<capítulo>/), já decidido.
//
// Funções puras: recebem a obra, os capítulos (com o HTML do texto já pronto em `rendered.html`) e as "ferramentas"
// que dependem de fora (o glob de static/ para os quadrinhos, a seção de comentários), e devolvem dados. Quem desenha é
// src/components/Leitor.astro, sem decidir nada. Quem chama é a rota src/pages/[lang]/works/[obra]/[capitulo]/index.astro
// (e o teste tests/leitor.test.ts, com sites inventados).
//
// De onde vem no build.py: o laço dos capítulos dentro do build(), linhas ~788–828 (cabeçalho com logo/título/data,
// prosa/quadrinho/vídeo, pager, aviso de rascunho, comentários, título da aba, noindex dos `unlisted`), e pager(),
// arrow(), draft_banner() (~600–613). O que já era regra de capítulo (título, número, anterior/próximo, "voltar à obra",
// ID dos comentários) continua em src/lib/capitulos.ts (paginasDosCapitulos, T10) e é reaproveitado aqui.
import { alternativasDoCapitulo, type Alternativas } from "./alternativas";
import { paginasDosCapitulos, tipoDaObra, type CapituloDeLeitura, type PaginaDoCapitulo, type Vizinho } from "./capitulos";
import type { SecaoDeComentarios } from "./comentarios";
import { langs, t, type Lang } from "./config";
import { pyStrip } from "./frontmatter";
import { logoDaObra, tituloDaObra, urlDaObra, type ObraComDados } from "./obras";
import { paginasDoQuadrinho } from "./quadrinhos";

/** Uma obra, com o que o leitor lê do work.json além do que as regras da T10 já leem. */
export interface ObraParaLer extends ObraComDados {
  data: ObraComDados["data"] & { reading_font?: string | undefined };
}

/** Um capítulo, com o texto e o que só o leitor usa (páginas de quadrinho). */
export interface CapituloParaLer extends CapituloDeLeitura {
  data: CapituloDeLeitura["data"] & { pages?: readonly string[] | undefined; pages_glob?: string | undefined };
  /** O Markdown cru (o build.py só mostra o texto se ele tiver algo além de espaços). */
  body?: string | undefined;
  /** O HTML do texto, feito pelo carregador (src/lib/leitor.ts → corpos.ts → markdown.ts), sem versalete. */
  rendered?: { html?: string | undefined } | undefined;
}

// ───────────── as peças da página ─────────────

/** Anterior / próximo / "voltar" — a barra pager() do build.py. Também serve às notícias (T13). */
export interface Paginador {
  anterior: Vizinho | null;
  proximo: Vizinho | null;
  /** O botão do meio ("Voltar à obra", "Todas as notícias"); null = não tem. */
  meio: { url: string; rotulo: string } | null;
  /** "Anterior" e "Próximo" no idioma da página. */
  rotuloAnterior: string;
  rotuloProximo: string;
}

/** Botão redondo ao lado do vídeo (Luz & Sangue). null = o lugar fica vazio (invisível), para o vídeo não sair do centro. */
export interface BotaoLateral {
  url: string;
  /** "Anterior: Episódio 1" (vira title e aria-label). */
  rotulo: string;
}

export interface CabecalhoDoCapitulo {
  /** A logo da obra (relativa a static/) e o texto alternativo; null = a obra não tem logo. */
  logo: { arquivo: string; alt: string } | null;
  /** A logo vira link para a página da obra (nunca em obra de capítulo único). */
  linkDaLogo: string | null;
  /** O <h1>: o título do capítulo (em obra de capítulo único, o da obra). */
  titulo: string;
  /** "sr-only" (só para leitores de tela) quando a logo já mostra o título: obra de capítulo único com logo. */
  classeDoTitulo: "chapter-title" | "sr-only";
  /** A data sob o título (nunca em obra de capítulo único). */
  data: { iso: string; texto: string } | null;
}

export type ConteudoDoCapitulo =
  /** Texto: a "folha" com o título, uma linha fina, o texto (fonte de leitura da obra) e o pager. */
  | { formato: "prose"; fonteTimes: boolean; nota: string; paginador: Paginador | null }
  /** Vídeo do YouTube (com setas ao lado quando há episódio anterior/próximo), a nota do autor e o "voltar". */
  | { formato: "video"; youtube: string; tituloDoVideo: string; lados: { anterior: BotaoLateral | null; proximo: BotaoLateral | null } | null; nota: string; paginador: Paginador | null }
  /** Quadrinho: as páginas (imagens) entre dois pagers, e a nota do autor. */
  | { formato: "comic"; paginas: { arquivo: string; alt: string }[]; nota: string; paginador: Paginador | null };

/** Tudo de uma página de capítulo. */
export interface LeituraDoCapitulo {
  lang: Lang;
  url: string;
  /** Nome da pasta do capítulo ("01"): o [capitulo] do endereço. */
  pasta: string;
  /** Para o <head> (BaseLayout): título da aba, descrição, imagem, noindex, a mesma página nos outros idiomas e a classe do <body>. */
  tituloDaPagina: string;
  descricao: string;
  imagem: string;
  noindex: boolean;
  /** O mesmo capítulo em cada idioma — o alt_c do build.py: só capítulos LISTADOS contam, e o idioma em que ele não existe
   *  (ou é `unlisted`) vale null, INCLUSIVE o próprio: por isso a página de um capítulo `unlisted` não tem hreflang nenhum. */
  alternativas: Partial<Record<Lang, string | null>>;
  /** "reader reader-<kind>": sem a "folha" de papel no <main> (o leitor tem as suas). */
  classeDoCorpo: string;
  /** "Rascunho — só aparece na prévia" (só existe na prévia); null = não é rascunho. */
  avisoDeRascunho: string | null;
  cabecalho: CabecalhoDoCapitulo;
  conteudo: ConteudoDoCapitulo;
  /** A seção de comentários (src/lib/comentarios.ts); null = nenhuma (a caixinha de baixo fica vazia, como no site atual). */
  comentarios: SecaoDeComentarios | null;
  /** O texto do autor tem uma carta que vira (.flip-card)? Então a página leva o script dela. */
  temCartaQueVira: boolean;
  /** O texto do autor tem posts incorporados com botões para alternar (.embed-alt)? Então leva o script deles. */
  temPostsAlternados: boolean;
}

/** O que vem de fora das regras. */
export interface FerramentasDaLeitura {
  /** sorted(STATIC.glob(padrao), key=natural(nome)): src/lib/quadrinhos.ts → arquivosDoGlob. */
  glob: (padrao: string) => string[];
  /** A seção de comentários de uma página (o ID é null quando o capítulo tem `comments: false`). */
  comentarios: (lang: Lang, idDaPagina: string | null) => SecaoDeComentarios | null;
}

// ───────────── as regras ─────────────

/** Uma classe (palavra inteira) aparece em algum class="…" do HTML? (o site.js procura por seletor de classe na página toda) */
export function usaClasse(html: string, classe: string): boolean {
  const re = /\bclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
  for (const m of html.matchAll(re)) {
    const valor = m[2] ?? m[3] ?? m[4] ?? "";
    if (valor.split(/[\t\n\f\r ]+/).includes(classe)) return true;
  }
  return false;
}

/** Todos os idiomas, com null onde a página não existe (o alt_c do build.py tem uma chave por idioma). */
function comNulos(alt: Alternativas): Partial<Record<Lang, string | null>> {
  return Object.fromEntries(langs.map((l) => [l, alt[l] ?? null]));
}

/** pager(lang, prev, nxt, mid) do build.py: só existe se tiver ao menos um dos três. */
export function paginador(lang: Lang, anterior: Vizinho | null, proximo: Vizinho | null, meio: { url: string; rotulo: string } | null): Paginador | null {
  if (!anterior && !proximo && !meio) return null;
  return { anterior, proximo, meio, rotuloAnterior: t(lang, "prev"), rotuloProximo: t(lang, "next") };
}

/** O texto do capítulo, se tiver algo além de espaços (`make_md(...)(body) if body.strip() else ""`). */
export function notaDoCapitulo(c: CapituloParaLer): string {
  return pyStrip(c.body ?? "") ? (c.rendered?.html ?? "") : "";
}

/** O cabeçalho do capítulo (logo, título, data): build() linhas ~792–799. */
export function cabecalhoDoCapitulo(obra: ObraParaLer, lang: Lang, p: PaginaDoCapitulo): CabecalhoDoCapitulo {
  const unico = obra.data.oneshot === true;
  const logo = logoDaObra(obra, lang);
  return {
    logo: logo ? { arquivo: logo, alt: tituloDaObra(obra, lang) } : null,
    linkDaLogo: logo && !unico ? urlDaObra(obra, lang) : null,
    titulo: p.tituloPrincipal,
    classeDoTitulo: unico && logo ? "sr-only" : "chapter-title",
    data: p.data,
  };
}

/** O miolo conforme o formato (quadrinho, vídeo ou prosa): build() linhas ~800–824. */
export function conteudoDoCapitulo(obra: ObraParaLer, lang: Lang, c: CapituloParaLer, p: PaginaDoCapitulo, glob: FerramentasDaLeitura["glob"]): ConteudoDoCapitulo {
  const nota = notaDoCapitulo(c);
  if (p.formato === "comic") {
    const arquivos = paginasDoQuadrinho(c.data.pages, c.data.pages_glob, glob);
    return {
      formato: "comic",
      paginas: arquivos.map((arquivo, i) => ({ arquivo, alt: `${p.titulo} ${i + 1}` })),
      nota,
      paginador: paginador(lang, p.anterior, p.proximo, p.voltar),
    };
  }
  if (p.formato === "video") {
    const lado = (v: Vizinho | null, d: "prev" | "next"): BotaoLateral | null => (v ? { url: v.url, rotulo: `${t(lang, d)}: ${v.titulo}` } : null);
    return {
      formato: "video",
      youtube: c.data.youtube ?? "",
      tituloDoVideo: p.titulo,
      lados: p.anterior || p.proximo ? { anterior: lado(p.anterior, "prev"), proximo: lado(p.proximo, "next") } : null,
      nota,
      // abaixo do vídeo, só o "voltar" (as setas ficam ao lado do vídeo)
      paginador: paginador(lang, null, null, p.voltar),
    };
  }
  return { formato: "prose", fonteTimes: obra.data.reading_font === "times", nota, paginador: paginador(lang, p.anterior, p.proximo, p.voltar) };
}

/**
 * Todas as páginas de capítulo de uma obra num idioma (listados e `unlisted`), na ordem do build().
 * `capitulosPorIdioma`: os capítulos da obra em CADA idioma (para os links de idioma: só capítulos listados contam).
 */
export function leiturasDaObra<C extends CapituloParaLer>(
  obra: ObraParaLer,
  lang: Lang,
  capitulosPorIdioma: Readonly<Record<Lang, { listados: readonly C[]; ocultos: readonly C[] }>>,
  ferramentas: FerramentasDaLeitura,
): LeituraDoCapitulo[] {
  const doIdioma = capitulosPorIdioma[lang];
  const capitulos = [...doIdioma.listados, ...doIdioma.ocultos];
  const listadosPorIdioma = Object.fromEntries(langs.map((l) => [l, capitulosPorIdioma[l].listados])) as Record<Lang, readonly C[]>;
  return paginasDosCapitulos(obra, lang, doIdioma).map((p, i) => {
    const c = capitulos[i] as C; // paginasDosCapitulos devolve uma página por capítulo, na mesma ordem (listados, depois ocultos)
    const nota = notaDoCapitulo(c);
    return {
      lang,
      url: p.url,
      pasta: p.pasta,
      tituloDaPagina: p.tituloDaPagina,
      descricao: p.descricao,
      imagem: p.imagem,
      noindex: p.oculto,
      alternativas: comNulos(alternativasDoCapitulo(obra.data._origem.slug, p.pasta, listadosPorIdioma)),
      classeDoCorpo: `reader reader-${tipoDaObra(obra)}`,
      avisoDeRascunho: c.data.draft === true ? t(lang, "draft") : null,
      cabecalho: cabecalhoDoCapitulo(obra, lang, p),
      conteudo: conteudoDoCapitulo(obra, lang, c, p, ferramentas.glob),
      comentarios: ferramentas.comentarios(lang, p.idDosComentarios),
      temCartaQueVira: usaClasse(nota, "flip-card"),
      temPostsAlternados: usaClasse(nota, "embed-alt"),
    };
  });
}
