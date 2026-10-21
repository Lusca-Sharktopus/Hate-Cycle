// Posts incorporados SÓ COM CLIQUE (T17g, B27): as regras puras, sem DOM e sem imports.
//
// Por que existe: antes, cada notícia com post do Reddit, do X ou do Instagram punha na página o script desses sites
// (widgets.js, embed.js) NO MESMO ENDEREÇO da sessão de quem comenta (o supabase-js guarda a sessão no localStorage do
// domínio). Um script adulterado poderia lê-la, inclusive a do admin. Agora o build tira esses <script> de TODA página
// (src/lib/embedsComClique.ts) e este código, depois do clique do visitante, põe na página um <iframe sandbox> que aponta
// para a PÁGINA DE INCORPORAÇÃO do próprio serviço (embed.reddit.com, platform.twitter.com, www.instagram.com): o código
// do serviço roda na origem DELE, que o navegador mantém separada da nossa. Nenhum script de terceiros é carregado na
// origem do site, nem antes nem depois do clique.
//
// Por que NÃO um <iframe srcdoc sandbox> sem allow-same-origin (o desenho "ideal" do pedido): a janela do srcdoc teria origem
// opaca, e o sandbox é herdado por TODOS os quadros dentro dela. Relato de quem testou no Chrome (maretol/maretol-base,
// PR #1324, setembro de 2026): com widgets.js num srcdoc sem allow-same-origin o X "só mostra o blockquote, sem virar post",
// e com a Tweet.html direta e sem allow-same-origin a tela fica em branco, porque a consulta a cdn.syndication.twimg.com sai com
// "Origin: null" e o CORS recusa. Aqui o `allow-same-origin` existe, mas vale para a origem DO SERVIÇO (diferente da nossa), não
// para a nossa: nunca se usa `srcdoc` e o código confere que o endereço do quadro NÃO é o da página. A tabela completa do raciocínio
// está em docs/aprendendo-astro/08-leitor.md (seção "Posts incorporados só com clique").
//
// ⚠ Vai para o navegador e também é lido pelo build (src/lib/embedsComClique.ts): não importa nada.

export type Servico = "x" | "reddit" | "instagram";
export const SERVICOS: readonly Servico[] = ["x", "reddit", "instagram"];

export interface DadosDoServico {
  /** Como o serviço aparece nos textos ("Mostrar post do X"). */
  rotulo: string;
  /** A classe do <blockquote> do código de incorporação oficial (o que o autor cola). */
  classe: string;
  /** Origem (esquema + domínio) da página de incorporação que vai no <iframe>. É também de quem se aceitam mensagens. */
  origem: string;
  /** Altura, em px, do quadro até chegar a primeira medida (a página do serviço rola por dentro se for maior). */
  alturaPadrao: number;
  /** Domínios do script oficial do serviço (só para o build listar e conferir o que ele tira). */
  dominiosDoScript: readonly string[];
  /**
   * O quadro tem o botão "Mostrar post…"? Com `false` o post NUNCA carrega: fica o blockquote do autor e o link para o original
   * (sem aviso nem botão). É o "plano C" para um serviço cuja página de incorporação não funcione dentro do quadro isolado:
   * desligar aqui é seguro (nenhum script de terceiros é carregado de qualquer jeito) e perde só o post incorporado.
   */
  comBotao: boolean;
}

export const DADOS: Readonly<Record<Servico, DadosDoServico>> = {
  x: { rotulo: "X", classe: "twitter-tweet", origem: "https://platform.twitter.com", alturaPadrao: 560, dominiosDoScript: ["platform.x.com", "platform.twitter.com"], comBotao: true },
  reddit: { rotulo: "Reddit", classe: "reddit-embed-bq", origem: "https://embed.reddit.com", alturaPadrao: 566, dominiosDoScript: ["embed.reddit.com", "www.redditstatic.com"], comBotao: true },
  instagram: { rotulo: "Instagram", classe: "instagram-media", origem: "https://www.instagram.com", alturaPadrao: 720, dominiosDoScript: ["www.instagram.com", "instagram.com"], comBotao: true },
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
 * O endereço canônico é o único que vai ao <iframe> e ao link "abrir o original": nada do que o autor colou (parâmetros de
 * rastreio, "?utm_source=…") passa adiante.
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

/** Idiomas que o site tem (o parâmetro `lang` do X). */
const IDIOMA_DO_X = /^[a-z]{2}$/;

export interface PedidoDoQuadro {
  servico: Servico;
  /** O endereço canônico do post (urlDoPost). */
  post: string;
  /** Instagram: o código tinha `data-instgrm-captioned` (mostra a legenda). */
  comLegenda?: boolean;
  /** Idioma da página ("pt", "en"). */
  idioma: string;
  /** A origem desta página (location.origin): vai ao X, que a pede como `origin`. */
  origemDaPagina: string;
  /** Identificador sorteado do quadro (o X o devolve nas mensagens de altura). */
  idDoQuadro: string;
}

/**
 * O endereço da página de incorporação do serviço, ou null se algo não bate. A conferência final é por ORIGEM: o endereço
 * montado tem de ser da origem do serviço (DADOS[servico].origem). Daí o `allow-same-origin` do sandbox valer para o serviço
 * e não para este site.
 */
export function enderecoDoQuadro(p: PedidoDoQuadro): string | null {
  const dados = DADOS[p.servico];
  const post = urlDoPost(p.servico, p.post);
  if (!post || post !== p.post) return null;
  const u = new URL(post);
  let destino: URL;
  if (p.servico === "x") {
    const id = /status\/([0-9]+)$/.exec(u.pathname)?.[1];
    if (!id) return null;
    destino = new URL("/embed/Tweet.html", dados.origem);
    const lang = IDIOMA_DO_X.test(p.idioma) ? p.idioma : "en";
    for (const [k, v] of [["dnt", "true"], ["embedId", p.idDoQuadro], ["frame", "false"], ["id", id], ["lang", lang], ["origin", p.origemDaPagina], ["theme", "light"]] as const) {
      destino.searchParams.set(k, v);
    }
  } else if (p.servico === "reddit") {
    destino = new URL(u.pathname, dados.origem);
    destino.searchParams.set("embed", "true");
    destino.searchParams.set("theme", "light");
  } else {
    destino = new URL(`${u.pathname}embed/${p.comLegenda ? "captioned/" : ""}`, dados.origem);
  }
  return destino.origin === dados.origem ? destino.href : null;
}

// ───────────────────────── o quadro (iframe) ─────────────────────────

/**
 * O sandbox do quadro. Pode: rodar o script do serviço (allow-scripts), ter a origem DELE (allow-same-origin, outra origem que a
 * nossa: confira com `enderecoDoQuadro`) e abrir links em outra aba (allow-popups + allow-popups-to-escape-sandbox, só por clique).
 * NÃO pode: navegar a nossa página (sem allow-top-navigation*), abrir janelas sem clique, enviar formulários, baixar arquivos,
 * abrir diálogos (sem allow-forms / allow-downloads / allow-modals).
 */
export const SANDBOX_DO_QUADRO = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

/** A menor e a maior altura, em px, que uma mensagem pode pedir. */
export const ALTURA_MINIMA = 60;
export const ALTURA_MAXIMA = 3000;
const TAMANHO_MAXIMO_DA_MENSAGEM = 4000;

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

/**
 * A altura pedida por uma mensagem de um quadro, ou null se a mensagem não é um pedido de altura válido desse serviço.
 * Formatos (de memória dos widgets oficiais; NÃO verificados aqui, sem internet — se algum não bater, o quadro simplesmente
 * fica na altura padrão, com rolagem por dentro): X `{"twttr.embed":{"method":"twttr.private.resize","params":[{"height":N}],"id":…}}`;
 * Reddit `{"type":"resize.embed","data":N}`; Instagram `{"type":"MEASURE","details":{"height":N}}`.
 * A altura é arredondada e limitada a [ALTURA_MINIMA, ALTURA_MAXIMA].
 */
export function alturaDaMensagem(servico: Servico, dados: unknown, idDoQuadro: string): number | null {
  const o = comoObjeto(dados);
  if (!o) return null;
  let bruta: number | null = null;
  if (servico === "x") {
    const e = o["twttr.embed"];
    if (!ehObjeto(e) || e["method"] !== "twttr.private.resize") return null;
    if (e["id"] !== undefined && e["id"] !== idDoQuadro) return null; // se o X devolve o id, tem de ser o deste quadro
    const params = e["params"];
    const primeiro: unknown = Array.isArray(params) ? params[0] : null;
    bruta = ehObjeto(primeiro) ? numeroValido(primeiro["height"]) : null;
  } else if (servico === "reddit") {
    bruta = o["type"] === "resize.embed" ? numeroValido(o["data"]) : null;
  } else {
    const d = o["details"];
    bruta = o["type"] === "MEASURE" && ehObjeto(d) ? numeroValido(d["height"]) : null;
  }
  return bruta === null ? null : Math.min(ALTURA_MAXIMA, Math.max(ALTURA_MINIMA, Math.ceil(bruta)));
}

/** O que identifica uma mensagem: de onde veio. */
export interface RemetenteDaMensagem {
  origin: string;
  source: unknown;
}
/** A mensagem veio DO quadro (a janela dele, não outra) e da origem do serviço? */
export function veioDoQuadro(m: RemetenteDaMensagem, janelaDoQuadro: unknown, servico: Servico): boolean {
  return janelaDoQuadro !== null && janelaDoQuadro !== undefined && m.source === janelaDoQuadro && m.origin === DADOS[servico].origem;
}

/** A altura padrão do quadro: a medida que o Reddit grava no código (data-embed-height), se razoável; senão a do serviço. */
export function alturaInicial(servico: Servico, daPagina: string | null | undefined): number {
  const n = daPagina && /^\d{2,4}$/.test(daPagina) ? Number(daPagina) : NaN;
  return Number.isFinite(n) && n >= ALTURA_MINIMA && n <= ALTURA_MAXIMA ? n : DADOS[servico].alturaPadrao;
}

/** Um identificador sorteado para o quadro (letras e números). `sorteio` devolve bytes; nos testes, um falso. */
export function novoIdDoQuadro(sorteio: (n: number) => Uint8Array): string {
  return Array.from(sorteio(12), (b) => (b % 36).toString(36)).join("");
}
