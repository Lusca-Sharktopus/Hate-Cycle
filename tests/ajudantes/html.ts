// Ajudante dos testes de PÁGINAS (T11 em diante): lê o HTML de uma página inteira e o transforma numa forma "canônica"
// que dá para comparar com o HTML do site Python sem se importar com o que não muda o que o visitante vê.
//
// Compara de forma ESTRUTURAL e estrita (é um parser de HTML de verdade, o parse5, não expressões regulares):
//   - a árvore de tags, na mesma ordem;
//   - os atributos, com os mesmos valores e na mesma ordem (a lista de classes: token por token, na mesma ordem);
//   - o texto, com os espaços colapsados — e só o espaço que importa para o olho:
//       * sequências de espaços/quebras de linha viram um espaço só;
//       * espaço no começo/fim de um bloco, ou colado a um elemento de bloco (<div>, <p>, <section>…), é invisível e some;
//       * espaço ENTRE dois elementos de linha (<a> e <a>, <span> e <span>) ou junto de texto continua valendo;
//   - `&#x27;` × `&#39;` e outras formas de escrever o mesmo caractere são iguais (o parser decodifica as duas).
// Não conta: comentários HTML e atributos `data-astro-cid-*` (a marca de escopo dos estilos do Astro — nenhum dos componentes
// da T11 tem, mas o Header e o Footer da T06 têm; é uma diferença técnica documentada em docs/aprendendo-astro/07-paginas.md).
import { parse, type DefaultTreeAdapterMap } from "parse5";

type No = DefaultTreeAdapterMap["node"];
type Elemento = DefaultTreeAdapterMap["element"];

/** Elementos de bloco: o espaço colado a eles (ou no começo/fim deles) não aparece na tela. */
const BLOCOS = new Set([
  "html", "head", "body", "main", "header", "footer", "nav", "section", "article", "aside", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "figure", "figcaption", "form", "fieldset", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "hr", "br", "details", "summary", "select", "option", "optgroup", "pre", "address", "template", "noscript", "script", "style", "link", "meta", "title",
]);
const VAZIOS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** Dentro destes, o texto vale exatamente como está (espaços e quebras de linha incluídos). */
const TEXTO_CRU = new Set(["script", "style", "pre", "textarea"]);

const ESPACO = /[ \t\n\r\f]+/g;

function ehElemento(n: No): n is Elemento {
  return "tagName" in n;
}
function ehTexto(n: No): n is DefaultTreeAdapterMap["textNode"] {
  return n.nodeName === "#text";
}
function filhosDe(n: No): No[] {
  const alvo = "content" in n ? n.content : n; // <template> guarda os filhos em `content`
  return "childNodes" in alvo ? alvo.childNodes : [];
}

function atributos(e: Elemento): string {
  return e.attrs
    .filter((a) => !a.name.startsWith("data-astro-cid-"))
    .map((a) => (a.name === "class" ? ` class="${a.value.split(ESPACO).filter(Boolean).join(" ")}"` : ` ${a.name}=${JSON.stringify(a.value)}`))
    .join("");
}

/** Os nós de um elemento como linhas canônicas, já com os espaços tratados. */
function linhasDosFilhos(pai: No, recuo: string): string[] {
  const paiEhBloco = !ehElemento(pai) || BLOCOS.has(pai.tagName);
  const cru = ehElemento(pai) && TEXTO_CRU.has(pai.tagName);
  // 1. junta textos vizinhos e joga fora os comentários
  const itens: ({ texto: string } | { el: Elemento })[] = [];
  for (const f of filhosDe(pai)) {
    if (ehTexto(f)) {
      const ultimo = itens[itens.length - 1];
      if (ultimo && "texto" in ultimo) ultimo.texto += f.value;
      else itens.push({ texto: f.value });
    } else if (ehElemento(f)) itens.push({ el: f });
  }
  // 2. trata os espaços de cada texto
  const saida: string[] = [];
  itens.forEach((item, i) => {
    if ("el" in item) {
      saida.push(...linhasDoElemento(item.el, recuo));
      return;
    }
    let texto = item.texto;
    if (!cru) {
      texto = texto.replace(ESPACO, " ");
      const antes = itens[i - 1];
      const depois = itens[i + 1];
      const colaNoBlocoAntes = antes === undefined ? paiEhBloco : "el" in antes && BLOCOS.has(antes.el.tagName);
      const colaNoBlocoDepois = depois === undefined ? paiEhBloco : "el" in depois && BLOCOS.has(depois.el.tagName);
      if (colaNoBlocoAntes) texto = texto.replace(/^ /, "");
      if (colaNoBlocoDepois) texto = texto.replace(/ $/, "");
    }
    if (texto !== "") saida.push(`${recuo}${JSON.stringify(texto)}`);
  });
  return saida;
}

function linhasDoElemento(e: Elemento, recuo: string): string[] {
  const abre = `${recuo}<${e.tagName}${atributos(e)}>`;
  if (VAZIOS.has(e.tagName)) return [abre];
  return [abre, ...linhasDosFilhos(e, recuo + "  "), `${recuo}</${e.tagName}>`];
}

/** A forma canônica de um elemento: uma linha por tag/texto, recuada. Serve para comparar e, quando difere, para mostrar a diferença. */
export function canonico(e: Elemento): string {
  return linhasDoElemento(e, "").join("\n");
}

// ───────────── achar partes da página ─────────────

function varrer(n: No, quando: (e: Elemento) => boolean, achados: Elemento[] = []): Elemento[] {
  if (ehElemento(n) && quando(n)) achados.push(n);
  for (const f of filhosDe(n)) varrer(f, quando, achados);
  return achados;
}
function attr(e: Elemento, nome: string): string | undefined {
  return e.attrs.find((a) => a.name === nome)?.value;
}
function textoDe(e: Elemento): string {
  return filhosDe(e).map((f) => (ehTexto(f) ? f.value : ehElemento(f) ? textoDe(f) : "")).join("");
}

export interface PaginaLida {
  /** <html lang="…"> */
  lang: string;
  /** Tudo do <head> que o visitante, os buscadores e as redes sociais veem. */
  cabeca: {
    titulo: string;
    /** <meta name="…"> e <meta property="…"> (description, robots, og:*), na ordem. */
    metas: string[];
    /** <link> que não é o CSS empacotado do Astro (nem o style.css do site Python): ícone, fontes, alternate (hreflang, RSS)… na ordem. */
    links: string[];
    /** <script> do <head> sem src e que não é módulo (a abertura). */
    scriptsInline: string[];
  };
  /** class do <body>. */
  classeDoCorpo: string;
  /** O fundo de runas (.runes) inteiro. */
  runas: string;
  cabecalho: string;
  /** O miolo: <main> e tudo dentro. */
  main: string;
  rodape: string;
}

export function lerPagina(html: string): PaginaLida {
  const doc = parse(html);
  const todos = (quando: (e: Elemento) => boolean) => varrer(doc, quando);
  const um = (quando: (e: Elemento) => boolean, nome: string) => {
    const [e] = todos(quando);
    if (!e) throw new Error(`a página não tem ${nome}`);
    return e;
  };
  const raiz = um((e) => e.tagName === "html", "<html>");
  const cabeca = um((e) => e.tagName === "head", "<head>");
  const corpo = um((e) => e.tagName === "body", "<body>");
  const metas = varrer(cabeca, (e) => e.tagName === "meta" && (attr(e, "name") !== undefined || attr(e, "property") !== undefined)).map(
    (e) => `${attr(e, "name") ?? attr(e, "property")}=${JSON.stringify(attr(e, "content") ?? "")}`,
  );
  const links = varrer(cabeca, (e) => e.tagName === "link")
    .filter((e) => {
      const href = attr(e, "href") ?? "";
      return !(href.startsWith("/_astro/") || href.startsWith("/style.css"));
    })
    .map((e) => `<link${atributos(e).replace(/ href="\/custom\.css\?v=[0-9a-f]+"/, ' href="/custom.css"')}>`);
  const scriptsInline = varrer(cabeca, (e) => e.tagName === "script" && attr(e, "src") === undefined && attr(e, "type") !== "module").map((e) => textoDe(e));
  return {
    lang: attr(raiz, "lang") ?? "",
    cabeca: { titulo: textoDe(um((e) => e.tagName === "title", "<title>")), metas, links, scriptsInline },
    classeDoCorpo: attr(corpo, "class") ?? "",
    runas: canonico(um((e) => (attr(e, "class") ?? "").split(ESPACO).includes("runes"), "as runas")),
    cabecalho: canonico(um((e) => e.tagName === "header", "<header>")),
    main: canonico(um((e) => e.tagName === "main", "<main>")),
    rodape: canonico(um((e) => e.tagName === "footer", "<footer>")),
  };
}

/** Só o miolo (<main>) de um HTML que pode ser um pedaço (o resultado de um componente, sem <html>). */
export function canonicoDoMiolo(htmlDoMiolo: string): string {
  const doc = parse(`<!doctype html><html><head></head><body><main id="main">${htmlDoMiolo}</main></body></html>`);
  const [main] = varrer(doc, (e) => e.tagName === "main");
  if (!main) throw new Error("sem <main>");
  return canonico(main);
}
