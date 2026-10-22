// Posts incorporados do X, do Reddit e do Instagram EM MOLDURA ISOLADA (T17g → T17j, B27): as regras puras, sem DOM e sem imports.
//
// Por que existe: antes, cada notícia com post do Reddit, do X ou do Instagram punha na página o script desses sites (widgets.js,
// embed.js) NO MESMO ENDEREÇO da sessão de quem comenta (o supabase-js guarda a sessão no localStorage do domínio). Um script
// adulterado poderia lê-la, inclusive a do admin. Agora o build tira esses <script> de TODA página (src/lib/postsIncorporados.ts) e
// este código, ao carregar a página (sem clique, decisão do autor de 21/10/2026), faz o que o script oficial fazia por fora: põe no
// lugar do post o MESMO <iframe> que o script oficial criaria, apontando para a PÁGINA DE INCORPORAÇÃO do próprio serviço
// (platform.twitter.com, embed.reddit.com, www.instagram.com), com os mesmos atributos e estilos, mais um `sandbox`. O programa do
// serviço roda lá dentro, na origem DELE, que o navegador mantém separada da nossa. Nenhum script de terceiros roda na origem do site.
//
// Por que não um <iframe srcdoc sandbox> sem allow-same-origin: a janela do srcdoc teria origem opaca, herdada por todos os quadros
// de dentro; o X fica em branco (a consulta a cdn.syndication.twimg.com sai com "Origin: null"). Aqui o `allow-same-origin` vale para a
// origem DO SERVIÇO (a do endereço do iframe), nunca para a nossa: nunca se usa `srcdoc` e o código confere a origem do endereço.
// A tabela do raciocínio está em docs/aprendendo-astro/08-leitor.md (seção "Posts incorporados em moldura isolada").
//
// ⚠ Vai para o navegador e também é lido pelo build (src/lib/postsIncorporados.ts): não importa nada.

export type Servico = "x" | "reddit" | "instagram";
export const SERVICOS: readonly Servico[] = ["x", "reddit", "instagram"];

export interface DadosDoServico {
  /** O nome do serviço ("X", "Reddit", "Instagram"), para os avisos do build. */
  rotulo: string;
  /** A classe do <blockquote> do código de incorporação oficial (o que o autor cola). */
  classe: string;
  /** Origem (esquema + domínio) da página de incorporação que vai no <iframe>. É também de quem se aceitam mensagens. */
  origem: string;
  /** Domínios do script oficial do serviço (só para o build listar e conferir o que ele tira). */
  dominiosDoScript: readonly string[];
}

export const DADOS: Readonly<Record<Servico, DadosDoServico>> = {
  x: { rotulo: "X", classe: "twitter-tweet", origem: "https://platform.twitter.com", dominiosDoScript: ["platform.x.com", "platform.twitter.com"] },
  reddit: { rotulo: "Reddit", classe: "reddit-embed-bq", origem: "https://embed.reddit.com", dominiosDoScript: ["embed.reddit.com", "www.redditstatic.com"] },
  instagram: { rotulo: "Instagram", classe: "instagram-media", origem: "https://www.instagram.com", dominiosDoScript: ["www.instagram.com", "instagram.com"] },
};

/** O serviço de um <blockquote> pela classe, ou null (TikTok em blockquote, por exemplo, não é reconhecido). */
export function servicoPelaClasse(classes: Iterable<string>): Servico | null {
  const lista = new Set(classes);
  return SERVICOS.find((s) => lista.has(DADOS[s].classe)) ?? null;
}

// ───────────────────────── o endereço do post ─────────────────────────

const USUARIO_X = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})(?:\/.*)?$/;
const POST_REDDIT = /^\/(r\/[A-Za-z0-9_]{1,60}\/comments\/[A-Za-z0-9]{1,16}(?:\/[A-Za-z0-9_%.-]{1,200})?)\/?$/;
const POST_INSTAGRAM = /^\/(?:[A-Za-z0-9_.]{1,40}\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,30})(?:\/.*)?$/;
const HOSTS_X = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const HOSTS_REDDIT = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "embed.reddit.com"]);
const HOSTS_INSTAGRAM = new Set(["instagram.com", "www.instagram.com"]);

function lerUrl(href: string): URL | null {
  if (href.length > 600) return null;
  try {
    const u = new URL(href.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * O endereço CANÔNICO do post (https, sem parâmetros nem âncora) ou null se `href` não é um post daquele serviço.
 * É dele que sai o endereço do <iframe>: nada do que o autor colou (parâmetros de rastreio, "?utm_source=…") passa adiante.
 */
export function urlDoPost(servico: Servico, href: string): string | null {
  const u = lerUrl(href);
  if (!u) return null;
  let m: RegExpExecArray | null;
  if (servico === "x") {
    if (!HOSTS_X.has(u.hostname) || !(m = USUARIO_X.exec(u.pathname))) return null;
    return `https://x.com/${m[1]}/status/${m[2]}`;
  }
  if (servico === "reddit") {
    if (!HOSTS_REDDIT.has(u.hostname) || !(m = POST_REDDIT.exec(u.pathname))) return null;
    return `https://www.reddit.com/${m[1]}/`;
  }
  if (!HOSTS_INSTAGRAM.has(u.hostname) || !(m = POST_INSTAGRAM.exec(u.pathname))) return null;
  return `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
}

/**
 * O post de um <blockquote>, a partir dos `href` dos links dele (na ordem do HTML) e do `data-instgrm-permalink` (Instagram).
 * O X põe o link do post por ÚLTIMO (depois do texto e do nome do autor); o Reddit e o Instagram, por primeiro. O build e o
 * navegador usam esta mesma função.
 */
export function postDoBlockquote(servico: Servico, links: readonly string[], permalink?: string | null): string | null {
  const todos = servico === "instagram" && permalink ? [permalink, ...links] : [...links];
  const validos = todos.map((h) => urlDoPost(servico, h)).filter((u): u is string => u !== null);
  return (servico === "x" ? validos.at(-1) : validos[0]) ?? null;
}

// ───────────────────────── o endereço da moldura ─────────────────────────

/** As opções do código do X (os data-* do <blockquote class="twitter-tweet">), já conferidas. */
export interface OpcoesDoX {
  /** data-theme: "light" (padrão) ou "dark". */
  tema: "light" | "dark";
  /** data-cards="hidden": esconde o cartão de link/mídia. */
  semCartao: boolean;
  /** data-conversation="none": esconde o post anterior da conversa. */
  semConversa: boolean;
  /** data-width: 250 a 550 (padrão 550). */
  largura: number;
  /** data-lang, se o autor pôs; senão o idioma da página. */
  idioma: string | null;
}

/** Os data-* do blockquote do X → opções (o que não se reconhece fica no padrão, como no widgets.js). */
export function opcoesDoX(dados: Readonly<Record<string, string | undefined>>): OpcoesDoX {
  const n = Number(dados["width"]);
  return {
    tema: dados["theme"] === "dark" ? "dark" : "light",
    semCartao: dados["cards"] === "hidden",
    semConversa: dados["conversation"] === "none",
    largura: Number.isFinite(n) && n >= 250 && n <= 550 ? Math.round(n) : 550,
    idioma: dados["lang"] && /^[a-z]{2}(-[a-z]{2})?$/i.test(dados["lang"]) ? dados["lang"].slice(0, 2).toLowerCase() : null,
  };
}

/** O idioma que vai ao serviço: o da página (<html lang="pt-BR"> → "pt"); fora do formato, "en". */
export function idiomaDaPagina(lang: string): string {
  const l = lang.slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(l) ? l : "en";
}

export interface PedidoDaMoldura {
  servico: Servico;
  /** O endereço canônico do post (urlDoPost). */
  post: string;
  /** O endereço da página: só a origem e o caminho entram (nunca a busca nem a âncora: lá pode estar o #access_token do login). */
  pagina: { origin: string; pathname: string };
  /** Idioma da página ("pt", "en"). */
  idioma: string;
  /** O número do post daquele serviço na página (0, 1, 2…): o id que o script oficial daria ao iframe. */
  numero: number;
  /** X: as opções do blockquote. */
  x?: OpcoesDoX;
  /** Instagram: o código tinha `data-instgrm-captioned` (mostra a legenda). */
  comLegenda?: boolean;
  /** Instagram: data-instgrm-version (padrão 14). */
  versao?: string | null;
  /** Instagram: a largura do blockquote na tela, em px (o `wp` do embed.js); 0 = desconhecida. */
  larguraNaTela?: number;
}

/** O identificador que o script oficial dá ao iframe de cada serviço (X: também o `embedId` que volta nas mensagens). */
export function idDaMoldura(servico: Servico, numero: number): string {
  return servico === "x" ? `twitter-widget-${numero}` : servico === "instagram" ? `instagram-embed-${numero}` : "";
}

/**
 * O endereço da página de incorporação do serviço, ou null se algo não bate. Os parâmetros são os que o script oficial manda
 * (medidos no navegador em 21/10/2026), menos os que são só telemetria do serviço (X: features, sessionId, widgetsVersion;
 * Instagram: a âncora com tempos). A conferência final é por ORIGEM: o endereço montado tem de ser da origem do serviço; daí o
 * `allow-same-origin` do sandbox valer para o serviço e não para este site.
 */
export function enderecoDaMoldura(p: PedidoDaMoldura): string | null {
  const dados = DADOS[p.servico];
  const post = urlDoPost(p.servico, p.post);
  if (!post || post !== p.post) return null;
  const pagina = `${p.pagina.origin}${p.pagina.pathname}`;
  if (!/^https?:\/\/[^/?#]+\/[^?#]*$/.test(pagina)) return null;
  const idioma = idiomaDaPagina(p.idioma);
  const u = new URL(post);
  let destino: URL;
  const por = (pares: readonly (readonly [string, string])[]) => {
    for (const [k, v] of pares) destino.searchParams.set(k, v);
  };
  if (p.servico === "x") {
    const id = /status\/([0-9]+)$/.exec(u.pathname)?.[1];
    if (!id) return null;
    const o = p.x ?? opcoesDoX({});
    destino = new URL("/embed/Tweet.html", dados.origem);
    por([
      ["dnt", "true"],
      ["embedId", idDaMoldura("x", p.numero)],
      ["frame", "false"],
      ["hideCard", String(o.semCartao)],
      ["hideThread", String(o.semConversa)],
      ["id", id],
      ["lang", o.idioma ?? idioma],
      ["origin", pagina],
      ["theme", o.tema],
      ["width", `${o.largura}px`],
    ]);
  } else if (p.servico === "reddit") {
    destino = new URL(u.pathname, dados.origem);
    por([
      ["embed", "true"],
      ["ref_source", "embed"],
      ["ref", "share"],
      ["utm_medium", "widgets"],
      ["utm_source", "embedv2"],
      ["utm_term", "23"],
      ["utm_name", "post_embed"],
      ["embed_host_url", pagina],
    ]);
  } else {
    destino = new URL(`${u.pathname}embed/${p.comLegenda ? "captioned/" : ""}`, dados.origem);
    const versao = p.versao && /^\d{1,3}$/.test(p.versao) ? p.versao : "14";
    const wp = p.larguraNaTela && p.larguraNaTela > 0 ? Math.min(540, Math.max(326, Math.round(p.larguraNaTela))) : 540;
    por([
      ["cr", "1"],
      ["v", versao],
      ["wp", String(wp)],
      ["rd", p.pagina.origin],
      ["rp", p.pagina.pathname],
    ]);
  }
  return destino.origin === dados.origem && destino.protocol === "https:" ? destino.href : null;
}

// ───────────────────────── a moldura (iframe): atributos e estilos ─────────────────────────

/**
 * O sandbox da moldura do X e do Instagram. Pode: rodar o programa do serviço (allow-scripts), ter a origem DELE
 * (allow-same-origin, outra origem que a nossa: confira com `enderecoDaMoldura`) e abrir links em outra aba (allow-popups +
 * allow-popups-to-escape-sandbox, só por clique). NÃO pode: navegar a nossa página (sem allow-top-navigation*), enviar formulários,
 * baixar arquivos, abrir diálogos (sem allow-forms / allow-downloads / allow-modals).
 */
export const SANDBOX_DA_MOLDURA = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
/** O Reddit já põe `sandbox` no iframe que o widgets.js dele cria: usamos exatamente o dele. */
export const SANDBOX_DO_REDDIT = "allow-scripts allow-same-origin allow-popups";

export const sandboxDe = (s: Servico): string => (s === "reddit" ? SANDBOX_DO_REDDIT : SANDBOX_DA_MOLDURA);

/** Os estilos que o script oficial deixa no fim (copiados do navegador, 21/10/2026). */
export const ESTILOS = {
  /** O <div> que o widgets.js do X põe antes do blockquote. */
  caixaDoX: "display: flex; max-width: 550px; width: 100%; margin-top: 10px; margin-bottom: 10px;",
  /** O iframe do X depois de desenhado (a altura entra no lugar de {altura}). */
  x: (largura: number, altura: number) => `position: static; visibility: visible; width: ${largura}px; height: ${altura}px; display: block; flex-grow: 1;`,
  reddit: "border: none; max-width: 100%; border-radius: 8px; display: block; margin: 0px auto;",
  /** Inclui o que a mensagem MOUNTED do Instagram pede (boxShadow, border, margin): aplicado fixo, sem aceitar estilo vindo de mensagem. */
  instagram: "background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;",
} as const;

/** O nome da moldura para o leitor de tela (o `title` do iframe), no idioma da página. */
export function tituloDaMoldura(servico: Servico, idioma: string): string {
  const r = DADOS[servico].rotulo;
  return idiomaDaPagina(idioma) === "pt" ? `Post do ${r}` : servico === "x" ? "X Post" : `${r} post`;
}

/** Um atributo do iframe: nome e valor, na ordem em que o script oficial os põe. */
export type Atributo = readonly [string, string];

/**
 * Os atributos do iframe de cada serviço, na ordem do script oficial, mais o sandbox (e o `title`, que o Reddit e o Instagram não
 * põem). `alturaInicial` = o `height` com que o iframe nasce (Reddit: o data-embed-height; Instagram: a altura do blockquote).
 */
export function atributosDaMoldura(servico: Servico, o: { src: string; numero: number; idioma: string; idDoPost?: string; largura?: number; alturaInicial: number }): Atributo[] {
  const titulo = tituloDaMoldura(servico, o.idioma);
  if (servico === "x") {
    return [
      ["id", idDaMoldura("x", o.numero)],
      ["scrolling", "no"],
      ["frameborder", "0"],
      ["allowtransparency", "true"],
      ["allowfullscreen", "true"],
      ["class", ""],
      ["title", titulo],
      ["src", o.src],
      ["data-tweet-id", o.idDoPost ?? ""],
      ["sandbox", sandboxDe(servico)],
    ];
  }
  if (servico === "reddit") {
    return [
      ["height", String(o.alturaInicial)],
      ["src", o.src],
      ["width", "640px"],
      ["scrolling", "no"],
      ["allowfullscreen", "true"],
      ["sandbox", sandboxDe(servico)],
      ["allow", "clipboard-read; clipboard-write"],
      ["title", titulo],
      ["style", ESTILOS.reddit],
    ];
  }
  return [
    ["class", "instagram-media instagram-media-rendered"],
    ["id", idDaMoldura("instagram", o.numero)],
    ["src", o.src],
    ["allowtransparency", "true"],
    ["allowfullscreen", "true"],
    ["frameborder", "0"],
    ["height", String(o.alturaInicial)],
    ["data-instgrm-payload-id", `instagram-media-payload-${o.numero}`],
    ["scrolling", "no"],
    ["sandbox", sandboxDe(servico)],
    ["title", titulo],
    ["style", ESTILOS.instagram],
  ];
}

// ───────────────────────── as mensagens ─────────────────────────

/** A menor e a maior altura, em px, que uma mensagem pode pedir. 0 ou menos é ignorado (é falta de layout, não um post vazio). */
export const ALTURA_MINIMA = 60;
export const ALTURA_MAXIMA = 5000;
const TAMANHO_MAXIMO_DA_MENSAGEM = 20000;

function numeroValido(v: unknown): number | null {
  const n = typeof v === "string" && /^\d{1,5}(\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** O conteúdo da mensagem como objeto: os serviços mandam ou o objeto ou o JSON dele em texto. */
function comoObjeto(dados: unknown): Record<string, unknown> | null {
  if (ehObjeto(dados)) return dados;
  if (typeof dados !== "string" || dados.length > TAMANHO_MAXIMO_DA_MENSAGEM) return null;
  try {
    const v: unknown = JSON.parse(dados);
    return ehObjeto(v) ? v : null;
  } catch {
    return null;
  }
}

const limitar = (h: number) => Math.min(ALTURA_MAXIMA, Math.max(ALTURA_MINIMA, Math.ceil(h)));

/**
 * A altura pedida por uma mensagem da moldura, ou null se a mensagem não é um pedido de altura válido desse serviço.
 * Formatos (vistos no navegador com os serviços de verdade em 21/10/2026, menos a do X, que é a do widgets.js):
 *   X         {"twttr.embed":{"jsonrpc":"2.0","method":"twttr.private.resize","id":"twitter-widget-0","params":[{"width":550,"height":N,"data":{…}}]}}
 *   Reddit    {"type":"resize.embed","data":N}          (em texto JSON)
 *   Instagram {"type":"MEASURE","details":{"height":N}} (em texto JSON)
 * `idDaMolduraDoX`: se a mensagem do X traz `id`, tem de ser o desta moldura. A altura é arredondada para cima e limitada a
 * [ALTURA_MINIMA, ALTURA_MAXIMA]; 0, negativa ou que não é número → null (o iframe fica como está).
 */
export function alturaDaMensagem(servico: Servico, dados: unknown, idDaMolduraDoX = ""): number | null {
  const o = comoObjeto(dados);
  if (!o) return null;
  let bruta: number | null = null;
  if (servico === "x") {
    const e = o["twttr.embed"];
    if (!ehObjeto(e) || e["method"] !== "twttr.private.resize") return null;
    if (e["id"] !== undefined && e["id"] !== idDaMolduraDoX) return null;
    const params = e["params"];
    const primeiro: unknown = Array.isArray(params) ? params[0] : null;
    bruta = ehObjeto(primeiro) ? numeroValido(primeiro["height"]) : null;
  } else if (servico === "reddit") {
    bruta = o["type"] === "resize.embed" ? numeroValido(o["data"]) : null;
  } else {
    const d = o["details"];
    bruta = o["type"] === "MEASURE" && ehObjeto(d) ? numeroValido(d["height"]) : null;
  }
  return bruta === null ? null : limitar(bruta);
}

/** O que identifica uma mensagem: de onde veio. */
export interface RemetenteDaMensagem {
  origin: string;
  source: unknown;
}
/** A mensagem veio DA moldura (a janela dela, não outra) e da origem do serviço? */
export function veioDaMoldura(m: RemetenteDaMensagem, janelaDaMoldura: unknown, servico: Servico): boolean {
  return janelaDaMoldura !== null && janelaDaMoldura !== undefined && m.source === janelaDaMoldura && m.origin === DADOS[servico].origem;
}

/** A altura com que o iframe do Reddit nasce: a que o código grava (data-embed-height), se razoável; senão 566 (a do markdown.ts). */
export const ALTURA_PADRAO_DO_REDDIT = 566;
export function alturaInicialDoReddit(daPagina: string | null | undefined): number {
  const n = daPagina && /^\d{2,4}$/.test(daPagina) ? Number(daPagina) : NaN;
  return Number.isFinite(n) && n >= ALTURA_MINIMA && n <= ALTURA_MAXIMA ? n : ALTURA_PADRAO_DO_REDDIT;
}
/** A altura com que o iframe do Instagram nasce: a do blockquote na tela (sem pulo até a medida chegar), ou 540. */
export function alturaInicialDoInstagram(doBlockquote: number): number {
  return Number.isFinite(doBlockquote) && doBlockquote >= ALTURA_MINIMA ? limitar(doBlockquote) : 540;
}
