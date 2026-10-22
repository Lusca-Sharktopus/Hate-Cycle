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
import { parse, parseFragment, type DefaultTreeAdapterMap } from "parse5";

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

/**
 * T17 — a única diferença aceita nas <img>: as versões leves. O Astro acrescenta ao fim da tag `srcset`, `sizes`, `width`, `height` e
 * (nas preguiçosas) `decoding="async"`; o site Python não tem nada disso (nunca tem `srcset`). Então, numa <img> COM `srcset`, esses cinco
 * atributos não entram na comparação — todo o resto (src, class, alt, loading, style, a ordem) tem de ser igual ao do Python.
 * Se o autor já tivesse `width`/`height` ou `decoding` numa imagem com versões leves, o Python teria o atributo e o Astro (que o
 * descarta aqui) não: a página apareceria como diferente, e é o que se quer (o build nunca duplica atributo do autor; tests/imagens.test.ts).
 * O que cada versão leve É (arquivo certo, mesma imagem, proporção) é provado em tests/imagens.test.ts, para todas as páginas.
 */
const ATRIBUTOS_DAS_VERSOES_LEVES = new Set(["srcset", "sizes", "width", "height", "decoding"]);
const ehImagemComVersoesLeves = (e: Elemento) => e.tagName === "img" && e.attrs.some((a) => a.name === "srcset");

function atributos(e: Elemento): string {
  const leve = ehImagemComVersoesLeves(e);
  return e.attrs
    .filter((a) => !a.name.startsWith("data-astro-cid-") && !(leve && ATRIBUTOS_DAS_VERSOES_LEVES.has(a.name)))
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

// T17 — as únicas diferenças aceitas no <head>, todas sobre FONTES e ÍCONE (o texto delas está em docs/aprendendo-astro/11-imagens-e-fontes.md):
//   - o site Python pede as fontes ao Google Fonts (2 <link rel="preconnect"> + 1 <link> das fontes do texto + 20 das runas); o Astro as serve
//     do próprio site (@font-face no CSS empacotado) e só pré-carrega as duas do começo da página (<link rel="preload" as="font">).
//     Todos esses <link> saem da comparação, dos dois lados; que o Astro NÃO fala com o Google e que os dois pré-carregamentos existem e
//     apontam para arquivos de verdade está em tests/imagens.test.ts (fontes), para todas as páginas.
//   - o ícone: o Python tem um <link rel="icon">; o Astro tem dois (32x32 e 192x192, versões leves do mesmo desenho). Comparam-se como um só.
const ehLinkDeFonte = (e: Elemento) => {
  const href = attr(e, "href") ?? "";
  return /^https:\/\/fonts\.(googleapis|gstatic)\.com\b/.test(href) || (attr(e, "rel") === "preload" && attr(e, "as") === "font");
};
const ehIcone = (e: Elemento) => attr(e, "rel") === "icon" && /^\/logos\/favicon(_[A-Za-z0-9]+)?\.png$/.test(attr(e, "href") ?? "");

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
      return !(href.startsWith("/_astro/") || href.startsWith("/style.css")) && !ehLinkDeFonte(e);
    })
    .map((e) => (ehIcone(e) ? '<link rel="icon" href="/logos/favicon.png" type="image/png">' : `<link${atributos(e).replace(/ href="\/custom\.css\?v=[0-9a-f]+"/, ' href="/custom.css"')}>`))
    .filter((l, i, todos) => i === 0 || l !== todos[i - 1] || !l.startsWith('<link rel="icon"')); // os dois tamanhos do ícone viram um só
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

// ───────────── T15: a única diferença aceita no HTML dos comentários ─────────────
//
// O site Python carrega a caixa de comentários com DOIS <script src> logo depois do <script>window.HC=…</script>: o
// supabase-js do jsDelivr (versão "2", sem fixar) e o /comments.js?v=…. Desde a T15 o Astro não tem nenhum dos dois: o
// script dos comentários é empacotado (src/components/CaixaDeComentarios.astro → /_astro/CaixaDeComentarios…js, no fim
// da página, fora do <main>). Para comparar o resto do <main> com o do Python, tira-se do HTML do PYTHON exatamente esse
// par, e só quando ele vem colado no window.HC. Qualquer outro script continua sendo comparado.

/** O par de <script src> do comments() do build.py, colado ao window.HC (o grupo 1 é o window.HC, que fica). */
const RE_SCRIPTS_ANTIGOS_DOS_COMENTARIOS =
  /(<script>window\.HC=\{[\s\S]*?\};<\/script>)<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script><script src="\/comments\.js\?v=[0-9a-f]+"><\/script>/g;

/**
 * O HTML do Python sem o supabase-js do CDN e sem o /comments.js (só o par que vem depois de um window.HC). Devolve também
 * quantos pares saíram e se sobrou algum desses dois endereços em outro lugar (não deveria: o teste confere).
 */
export function semScriptsAntigosDosComentarios(htmlDoPython: string): { html: string; quantos: number; sobrou: boolean } {
  let quantos = 0;
  const html = htmlDoPython.replace(RE_SCRIPTS_ANTIGOS_DOS_COMENTARIOS, (_tudo, hc: string) => (quantos++, hc));
  const sobrou = /cdn\.jsdelivr\.net\/npm\/@supabase|\/comments\.js\?v=/.test(html);
  return { html, quantos, sobrou };
}

/** O <script type="module"> do script empacotado dos comentários (o nome do arquivo leva o nome do componente). */
export const RE_SCRIPT_DOS_COMENTARIOS = /<script type="module" src="[^"]*CaixaDeComentarios\.astro[^"]*"><\/script>/g;

/** Os IDs das conversas de comentários de uma página: todo atributo data-page, na ordem (o mesmo critério de tools/baseline.py). */
export function idsDeComentarios(html: string): string[] {
  return varrer(parse(html), (e) => attr(e, "data-page") !== undefined).map((e) => attr(e, "data-page") ?? "");
}

// ───────────── T17c: a única diferença aceita no <main> dos capítulos ─────────────
//
// O bloco "estou lendo em ordem…" (src/components/ProximaHistoria.astro) só existe no Astro: o build.py não o tem (funcionalidade nova,
// o gerador Python está congelado). Para comparar o resto do <main> do capítulo com o do Python, tira-se do HTML do ASTRO exatamente
// as <section> que levam o atributo `data-story-order` — o atributo só esse componente usa. Nada mais é removido: tests/ordem.test.ts
// confere que, em toda página, saem 0 (fora dos capítulos) ou 1 (capítulos) dessas seções, que cada uma é filha direta do <main>,
// fica entre a caixa do capítulo e a dos comentários, e que não leva nem comentários, nem script, nem texto do autor.

export interface SemBlocoDeOrdem {
  /** O HTML sem as seções do bloco. */
  html: string;
  /** O HTML de cada seção removida, na ordem. */
  removidos: string[];
  /** Para cada removida: o `<main>` é o pai direto? */
  filhasDiretasDoMain: boolean[];
}

/** O HTML do Astro (página inteira ou pedaço do miolo) sem o bloco "estou lendo em ordem…". */
export function semBlocoDeOrdem(html: string): SemBlocoDeOrdem {
  const arvore = /<html[\s>]/i.test(html) ? parse(html, { sourceCodeLocationInfo: true }) : parseFragment(html, { sourceCodeLocationInfo: true });
  const achadas = varrer(arvore as unknown as No, (e) => e.tagName === "section" && attr(e, "data-story-order") !== undefined);
  const cortes = achadas.map((e) => ({ de: e.sourceCodeLocation?.startOffset ?? -1, ate: e.sourceCodeLocation?.endOffset ?? -1, pai: (e.parentNode as Elemento | null)?.tagName }));
  if (cortes.some((c) => c.de < 0 || c.ate < c.de)) throw new Error("não consegui achar onde o bloco de ordem começa e termina");
  let saida = "";
  let pos = 0;
  const removidos: string[] = [];
  for (const c of [...cortes].sort((a, b) => a.de - b.de)) {
    saida += html.slice(pos, c.de);
    removidos.push(html.slice(c.de, c.ate));
    pos = c.ate;
  }
  saida += html.slice(pos);
  return { html: saida, removidos, filhasDiretasDoMain: cortes.map((c) => c.pai === "main") };
}

// ───────────── T17g/T17j: a única diferença aceita nos posts incorporados (B27) ─────────────
//
// No site Python, cada post do X, do Reddit e do Instagram traz o <script src> do serviço logo depois do <blockquote>, dentro do
// <div class="embed">. O Astro não tem nenhum desses scripts: o build os tira (src/lib/postsIncorporados.ts) e NÃO acrescenta nada (a
// moldura isolada é criada no navegador, por src/scripts/embeds/). Para comparar o <main>, só o Python muda:
//   - do HTML do PYTHON sai SÓ: <script> com src de um dos domínios dos três serviços (DOMINIOS_DOS_SCRIPTS_DOS_POSTS), DENTRO de um
//     div.embed. Script de outro domínio, ou fora do .embed, fica.
// tests/embeds.test.ts prova que nada além disso sai (inclusive casos negativos) e que, em toda página, o número de scripts tirados
// do Python é igual ao de posts que o Astro tem.

/** Os domínios dos scripts oficiais dos três serviços (X, Reddit, Instagram). */
export const DOMINIOS_DOS_SCRIPTS_DOS_POSTS: ReadonlySet<string> = new Set(["platform.x.com", "platform.twitter.com", "embed.reddit.com", "www.instagram.com"]);
const temClasse = (e: Elemento, c: string) => (attr(e, "class") ?? "").split(ESPACO).includes(c);

function arvoreComPosicoes(html: string) {
  return /<html[\s>]/i.test(html) ? parse(html, { sourceCodeLocationInfo: true }) : parseFragment(html, { sourceCodeLocationInfo: true });
}
function cortar(html: string, cortes: { de: number; ate: number; texto?: string }[]): string {
  let saida = "";
  let pos = 0;
  for (const c of [...cortes].sort((a, b) => a.de - b.de)) {
    if (c.de < pos) throw new Error("cortes que se sobrepõem");
    saida += html.slice(pos, c.de) + (c.texto ?? "");
    pos = c.ate;
  }
  return saida + html.slice(pos);
}

export interface SemScriptsDosPosts {
  html: string;
  /** O src de cada <script> que saiu, na ordem. */
  removidos: string[];
}
/** O HTML do Python (página inteira ou pedaço) sem os <script src> dos três serviços que estão dentro de um div.embed. */
export function semScriptsDosPosts(html: string): SemScriptsDosPosts {
  const cortes: { de: number; ate: number }[] = [];
  const removidos: string[] = [];
  for (const embed of varrer(arvoreComPosicoes(html) as unknown as No, (e) => e.tagName === "div" && temClasse(e, "embed"))) {
    for (const s of varrer(embed, (e) => e.tagName === "script")) {
      const src = attr(s, "src");
      if (!src) continue;
      let dominio = "";
      try {
        dominio = new URL(src.startsWith("//") ? `https:${src}` : src).hostname;
      } catch {
        continue;
      }
      if (!DOMINIOS_DOS_SCRIPTS_DOS_POSTS.has(dominio)) continue;
      const loc = s.sourceCodeLocation;
      if (!loc) throw new Error("não achei onde o script começa e termina");
      cortes.push({ de: loc.startOffset, ate: loc.endOffset });
      removidos.push(src);
    }
  }
  return { html: cortar(html, cortes), removidos };
}

// ───────────── T17h: a única diferença aceita no rodapé (o canal do YouTube por idioma) ─────────────
//
// Pedido do autor (21/10): as páginas em inglês levam ao canal @HateCycleEn e as em português ao @HateCycleBR. O Astro faz isso no rodapé
// (src/lib/canais.ts → redesDoRodape); o build.py, congelado, e o config.json (do autor) continuam com o endereço antigo @HateCycle. Para
// comparar o resto do rodapé, troca-se no HTML do ASTRO, e só nele, o `href` desta <a> exata (a do ícone do YouTube do rodapé):
//   <a href="https://www.youtube.com/@HateCycleEn|BR" target="_blank" rel="noopener" title="YouTube"[ data-astro-cid-…]>  →  href="https://www.youtube.com/@HateCycle"
// Só vale se o canal for o do idioma da página (`lang`: en → En, pt → BR); se não for (ou se a <a> não tiver exatamente esta forma), nada
// é trocado e a comparação falha. Quem chama confere que saiu exatamente 1 por página (tests/canais.test.ts prova a regra).

export interface CanalDoYoutubeComoNoPython {
  html: string;
  /** Quantas <a> foram trocadas (esperado: 1 por página). */
  trocados: number;
  /** Quantas <a> do YouTube do rodapé têm o canal do OUTRO idioma (esperado: 0). */
  errados: number;
}

/** O HTML do Astro com o href do ícone do YouTube do rodapé como o do Python. `lang` desconhecido (404, raiz): aceita qualquer um dos dois. */
export function canalDoYoutubeComoNoPython(html: string, lang?: "en" | "pt"): CanalDoYoutubeComoNoPython {
  let trocados = 0;
  let errados = 0;
  const esperado = lang === "en" ? "En" : lang === "pt" ? "BR" : undefined;
  const saida = html.replace(/(<a href=")https:\/\/www\.youtube\.com\/@HateCycle(En|BR)(" target="_blank" rel="noopener" title="YouTube"(?: data-astro-cid-[a-z0-9]+)?>)/g, (todo, antes: string, sufixo: string, depois: string) => {
    if (esperado !== undefined && sufixo !== esperado) {
      errados += 1;
      return todo;
    }
    trocados += 1;
    return `${antes}https://www.youtube.com/@HateCycle${depois}`;
  });
  return { html: saida, trocados, errados };
}

// ───────────── T17j: o resumo cortado das Notícias (degradê) ─────────────
//
// Pedido do autor (21/10): na lista de Notícias, quando o resumo automático foi cortado, as últimas palavras somem num degradê e o "…"
// passa para o link. O Astro desenha `<p>começo<span class="news-fade">fim</span> <a class="more" href="…">…leia mais</a></p>`; o Python,
// `<p>começo fim… <a class="more" href="…">leia mais</a></p>`. Para comparar, no HTML do ASTRO, e só nele, cada trecho com EXATAMENTE
// esta forma (o span sem atributos além da classe, sem tags dentro, seguido de um espaço e do link "more" que começa com "…") volta a
// ser o do Python. Qualquer outra forma fica e aparece como diferença. tests/noticias.test.ts prova a regra (casos negativos).

export interface ResumoCortadoComoNoPython {
  html: string;
  /** Quantos resumos foram desfeitos. */
  trocados: number;
}
const RE_RESUMO_CORTADO = /<span class="news-fade">([^<]*)<\/span> (<a class="more" href="[^"]*">)…/g;
/** O HTML do Astro com cada resumo cortado escrito como no Python. */
export function resumoCortadoComoNoPython(html: string): ResumoCortadoComoNoPython {
  let trocados = 0;
  const saida = html.replace(RE_RESUMO_CORTADO, (_t, fim: string, link: string) => {
    trocados += 1;
    return `${fim}… ${link}`;
  });
  return { html: saida, trocados };
}

// ───────────── T17j: a home com 4 histórias e a seta que é o link "Ver todas as histórias" ─────────────
//
// Pedido do autor (21/10): a home mostra no máximo 4 histórias, e a seta da direita é um link de verdade (src/components/Carrossel.astro).
// O Astro desenha `<div class="rail rail-home"><div class="works" data-more-url…>cartões</div><a class="rail-btn rail-next rail-more" …>…</a></div>`;
// o Python, só `<div class="works" data-more-url…>cartões</div>` (o trilho e as setas nasciam no navegador), com até 5 cartões.
//   - do HTML do ASTRO sai SÓ: o <div class="rail rail-home"> (a tag de abertura e a de fechamento; o que está dentro fica) e o
//     <a class="rail-btn rail-next rail-more"> que é o ÚLTIMO filho dele, quando o primeiro filho é um div.works com data-more-url;
//   - do HTML do PYTHON sai SÓ: os div.work-card depois do 4º, dentro de um div.works com data-more-url.
// tests/home.test.ts prova as duas regras (inclusive casos negativos).

export interface HomeComoNoPython {
  html: string;
  /** Quantos trilhos (div.rail-home) foram desfeitos. */
  trilhos: number;
}
/** O HTML do Astro sem o trilho e o link da home. */
export function homeComoNoPython(html: string): HomeComoNoPython {
  const cortes: { de: number; ate: number }[] = [];
  let trilhos = 0;
  for (const rail of varrer(arvoreComPosicoes(html) as unknown as No, (e) => e.tagName === "div" && attr(e, "class") === "rail rail-home")) {
    const filhos = filhosDe(rail);
    const primeiro = filhos[0];
    const ultimo = filhos.at(-1);
    if (filhos.length !== 2 || !primeiro || !ultimo || !ehElemento(primeiro) || !ehElemento(ultimo)) continue;
    if (primeiro.tagName !== "div" || !temClasse(primeiro, "works") || attr(primeiro, "data-more-url") === undefined) continue;
    if (ultimo.tagName !== "a" || attr(ultimo, "class") !== "rail-btn rail-next rail-more" || attr(ultimo, "href") !== attr(primeiro, "data-more-url")) continue;
    const r = rail.sourceCodeLocation;
    const u = ultimo.sourceCodeLocation;
    if (!r?.startTag || !r.endTag || !u) throw new Error("não achei onde o trilho da home começa e termina");
    cortes.push({ de: r.startTag.startOffset, ate: r.startTag.endOffset }, { de: u.startOffset, ate: u.endOffset }, { de: r.endTag.startOffset, ate: r.endTag.endOffset });
    trilhos++;
  }
  return { html: cortar(html, cortes), trilhos };
}

export interface SoQuatroHistoriasNaHome {
  html: string;
  /** Quantos cartões saíram (os do 5º em diante). */
  tirados: number;
}
/** O HTML do Python só com os 4 primeiros cartões do carrossel da home. */
export function soQuatroHistoriasNaHome(html: string, quantas = 4): SoQuatroHistoriasNaHome {
  const cortes: { de: number; ate: number }[] = [];
  for (const works of varrer(arvoreComPosicoes(html) as unknown as No, (e) => e.tagName === "div" && temClasse(e, "works") && attr(e, "data-more-url") !== undefined)) {
    const cartoes = filhosDe(works).filter((f): f is Elemento => ehElemento(f) && temClasse(f, "work-card"));
    for (const c of cartoes.slice(quantas)) {
      const loc = c.sourceCodeLocation;
      if (!loc) throw new Error("não achei onde o cartão começa e termina");
      cortes.push({ de: loc.startOffset, ate: loc.endOffset });
    }
  }
  return { html: cortar(html, cortes), tirados: cortes.length };
}
