// Otimização das imagens do <main> (T17): acha cada <img> do HTML da página, decide pelo LUGAR onde ela está qual perfil usar
// (src/lib/imagens.ts → PERFIS) e acrescenta à tag `srcset`, `sizes`, `width` e `height` (e `decoding="async"` nas preguiçosas).
//
// Por que aqui e não em cada componente: o <main> de TODA página (componentes do Astro + o HTML que o autor escreveu em content/)
// passa pelo acabamento do BaseLayout (src/lib/pagina.ts). Este é o passo seguinte: uma regra só, num lugar só, vale para a
// capa do carrossel, para a miniatura da lista de notícias e para a figura que o autor pôs no meio do texto. Os componentes e o
// markdown.ts não mudam, e o HTML do autor continua sendo o dele (só ganha atributos).
//
// O que NUNCA muda na tag: o `src` (continua sendo o arquivo original de static/), a classe, o `alt`, o `loading`, o `style`,
// a ordem dos atributos que já estavam lá. Os atributos novos entram no fim da tag. Para achar o <img> e o lugar exato dele no
// texto sem reescrever o resto, usa-se o parse5 (o mesmo leitor de HTML que os testes usam), só para LER as posições.
//
// Casos em que a tag fica como está: já tem `srcset`; o `src` não é um arquivo PNG/JPEG de static/; o arquivo é leve ou animado
// (ver lerImagem em imagens.ts); o <img> está dentro de <noscript> (o parse5 trata o conteúdo de <noscript> como texto: é o
// "sem JavaScript", que não precisa de pressa).
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { lerImagem, otimizar, PERFIS, type Perfil } from "./imagens";

type No = DefaultTreeAdapterMap["node"];
type Elemento = DefaultTreeAdapterMap["element"];

const ehElemento = (n: No): n is Elemento => "tagName" in n;
const filhosDe = (n: No): No[] => {
  const alvo = "content" in n ? n.content : n; // <template> guarda os filhos em `content`
  return "childNodes" in alvo ? alvo.childNodes : [];
};
const atributo = (e: Elemento, nome: string): string | undefined => e.attrs.find((a) => a.name === nome)?.value;

// ───────────────────────── o LUGAR da imagem → o perfil ─────────────────────────

/** As classes da própria <img> e as de todos os elementos em volta (do mais próximo ao mais distante). */
export interface Lugar {
  propria: ReadonlySet<string>;
  /** Classes dos ancestrais (o <main> e o que estiver acima não entra: o fragmento começa dentro dele). */
  ancestrais: ReadonlySet<string>;
}

/**
 * Escolhe o perfil de uma imagem pelo lugar dela. `null` = deixar como está (e a imagem do texto sem lugar conhecido cai no
 * perfil geral, `imagemDoTexto`). A ordem importa: a primeira regra que serve vale.
 */
export function perfilDoLugar(lugar: Lugar): Perfil | null {
  const { propria: p, ancestrais: a } = lugar;
  const em = (c: string) => p.has(c) || a.has(c);
  // ── o que os componentes do Astro desenham ──
  if (em("work-card")) return a.has("rail") ? PERFIS.capaDoCarrossel : PERFIS.capaDaGrade;
  if (em("char-card") || em("portrait")) return PERFIS.capaDaGrade;
  if (em("update")) return PERFIS.atualizacao;
  if (em("emi-photo")) return PERFIS.emissario;
  if (em("news-thumb")) return PERFIS.miniatura;
  if (p.has("news-stk")) return PERFIS.figurinha;
  if (p.has("cover") && a.has("work-head")) return PERFIS.capaDaObra;
  if (p.has("so-img")) return PERFIS.ordemDeLeitura;
  if (p.has("so-layer")) return PERFIS.camadaDaOrdem;
  if (p.has("title-image")) return PERFIS.tituloDeCapitulo;
  if (a.has("comic")) return PERFIS.paginaDeQuadrinho;
  if (a.has("lead")) return PERFIS.figuraDeNoticia;
  // ── o que o autor escreve nos textos (content/**) ──
  if (em("embed-btn")) return null; // ícones de 24 px dos botões de post incorporado
  if (p.has("scene-divider")) return null; // o divisor de cena: uma faixa de ~12 KB
  if (p.has("jusep")) return PERFIS.contornada;
  if (p.has("autor-foto")) return PERFIS.fotoDoAutor;
  if (em("s1-art")) return PERFIS.ilustracaoGrande;
  if (em("strip") || em("strip-row")) return PERFIS.tira;
  if (em("flip-card")) return PERFIS.carta;
  return PERFIS.imagemDoTexto;
}

// ───────────────────────── achar o arquivo de static/ a partir do `src` ─────────────────────────

/**
 * O caminho relativo a static/ que um `src` aponta ("/covers/PT/Capa%20X.png?v=3" → "covers/PT/Capa X.png"), ou null se o `src` não é um
 * caminho local do site (endereço completo, data:, caminho relativo, "//…", "..").
 */
export function arquivoDoSrc(src: string): string | null {
  if (!src.startsWith("/") || src.startsWith("//")) return null;
  const semConsulta = src.replace(/[?#].*$/, "");
  let caminho: string;
  try {
    caminho = decodeURIComponent(semConsulta);
  } catch {
    return null;
  }
  const relativo = caminho.replace(/^\/+/, "");
  if (relativo === "" || relativo.split("/").includes("..")) return null;
  return relativo;
}

// ───────────────────────── o texto novo da tag ─────────────────────────

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** O que acrescentar ao fim de uma <img> que ganha as versões leves de `imagem`. */
export function atributosNovos(
  imagem: { srcset: string; sizes: string; width: number; height: number },
  tag: { temWidthOuHeight: boolean; styleComHeight: boolean; temDecoding: boolean; preguicosa: boolean },
): string {
  let s = ` srcset="${escAttr(imagem.srcset)}" sizes="${escAttr(imagem.sizes)}"`;
  // width/height dão ao navegador a PROPORÇÃO antes de a imagem chegar (evita o pulo do texto). Só quando não atrapalham o desenho:
  // se o autor já pôs largura/altura, ou uma altura no style, a tag não é tocada nesses dois.
  if (!tag.temWidthOuHeight && !tag.styleComHeight) s += ` width="${imagem.width}" height="${imagem.height}"`;
  if (tag.preguicosa && !tag.temDecoding) s += ` decoding="async"`;
  return s;
}

interface Achado {
  /** Posição, no texto, onde entram os atributos novos (logo antes do ">" ou do "/>" que fecha a tag). */
  em: number;
  arquivo: string;
  perfil: Perfil;
  tag: Parameters<typeof atributosNovos>[1];
}

/** Anda pela árvore e junta as <img> que merecem versões leves. */
function acharImagens(html: string): Achado[] {
  const doc = parseFragment(html, { sourceCodeLocationInfo: true });
  const achados: Achado[] = [];
  const andar = (n: No, ancestrais: string[]) => {
    for (const f of filhosDe(n)) {
      if (!ehElemento(f)) continue;
      const classes = (atributo(f, "class") ?? "").split(/\s+/).filter(Boolean);
      if (f.tagName === "img") {
        const achado = avaliar(f, html, new Set(ancestrais));
        if (achado) achados.push(achado);
      } else andar(f, [...ancestrais, ...classes]);
    }
  };
  andar(doc, []);
  return achados;
}

function avaliar(img: Elemento, html: string, ancestrais: ReadonlySet<string>): Achado | null {
  const inicio = img.sourceCodeLocation?.startTag;
  const src = atributo(img, "src");
  if (!inicio || src === undefined || atributo(img, "srcset") !== undefined) return null;
  const arquivo = arquivoDoSrc(src);
  if (!arquivo) return null;
  const perfil = perfilDoLugar({ propria: new Set((atributo(img, "class") ?? "").split(/\s+/).filter(Boolean)), ancestrais });
  if (!perfil) return null;
  // onde fecha a tag: o último ">" da tag (e, se vier "/>", antes da barra)
  let em = inicio.endOffset - 1;
  if (html[em] !== ">") return null;
  if (/[\s"']\/>$/.test(html.slice(inicio.startOffset, inicio.endOffset))) em -= 1; // "<img … />": antes da barra
  const style = atributo(img, "style") ?? "";
  return {
    em,
    arquivo,
    perfil,
    tag: {
      temWidthOuHeight: atributo(img, "width") !== undefined || atributo(img, "height") !== undefined,
      styleComHeight: /height/i.test(style),
      temDecoding: atributo(img, "decoding") !== undefined,
      preguicosa: atributo(img, "loading") === "lazy",
    },
  };
}

/**
 * O HTML de uma página (ou de um pedaço dela) com as versões leves nas imagens que valem a pena. Só acrescenta atributos ao fim das
 * tags <img>; o resto do texto fica byte a byte como entrou.
 */
export async function otimizarImagensDoHtml(html: string): Promise<string> {
  if (!html.includes("<img")) return html;
  const achados = acharImagens(html);
  let saida = "";
  let pos = 0;
  for (const a of achados) {
    // lerImagem() antes: se o arquivo não existe, é leve ou animado, a tag fica como está, sem chamar o getImage
    if (!(await lerImagem(a.arquivo))) continue;
    const imagem = await otimizar(a.arquivo, a.perfil);
    if (!imagem) continue;
    saida += html.slice(pos, a.em) + atributosNovos(imagem, a.tag);
    pos = a.em;
  }
  return saida + html.slice(pos);
}
