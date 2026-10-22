// Posts incorporados EM MOLDURA ISOLADA (T17j, B27): o que o navegador faz com cada post do X, do Reddit e do Instagram.
//
// O servidor entregou o <blockquote> do autor exatamente como no código de incorporação (sem o <script> do serviço, que o build tira).
// Sem JavaScript, é ele que fica, como antes. Aqui, ao carregar a página, sem clique, cada post vira o que o script oficial criaria:
//   - X: um <div class="twitter-tweet twitter-tweet-rendered"> ANTES do blockquote, com o <iframe> da Tweet.html. Enquanto a primeira
//     altura não chega, o blockquote continua à vista e a moldura fica escondida (sem ocupar lugar); na primeira altura, a moldura
//     aparece com os estilos do widgets.js e o blockquote sai (como o widgets.js faz).
//   - Reddit e Instagram: o <iframe> TOMA O LUGAR do blockquote logo de saída (como os scripts deles fazem), com a altura inicial do
//     código (Reddit) ou a do próprio blockquote (Instagram), e cresce quando a medida chega.
//   - Post dentro de um painel escondido (.embed-alt): a moldura só é criada quando o painel aparece (antes, o PostsAlternados mandava
//     o script do serviço redesenhar; criar só quando aparece dá o mesmo resultado e o post já nasce com o tamanho certo).
//   - Se o serviço não disser nada em TEMPO_SEM_RESPOSTA_MS (bloqueado, sem rede), a moldura sai e o blockquote volta: o mesmo que o
//     visitante via antes quando o script do serviço não carregava.
//   - Mensagens: só da janela daquela moldura E da origem do serviço (veioDaMoldura), no formato do serviço, com altura limitada
//     (alturaDaMensagem); qualquer outra é ignorada.
//
// SEGURANÇA — o que este arquivo NUNCA faz (tests/embeds-dom.test.ts procura estas palavras e testa o comportamento):
//   - criar <script>, usar innerHTML/outerHTML/insertAdjacentHTML/document.write/DOMParser/createContextualFragment, eval ou Function;
//   - usar `srcdoc` ou about:blank na moldura (o `allow-same-origin` só é seguro porque o endereço é de OUTRA origem: enderecoDaMoldura
//     devolve null se a origem não for a do serviço, e aqui se recusa também um endereço da origem da página);
//   - montar HTML com texto da página: tudo entra por setAttribute, com valores que as regras montam e conferem.
//
// ⚠ Vai para o navegador: só importa ./regras (que não importa nada).
import {
  DADOS,
  ESTILOS,
  alturaDaMensagem,
  alturaInicialDoInstagram,
  alturaInicialDoReddit,
  atributosDaMoldura,
  enderecoDaMoldura,
  idDaMoldura,
  opcoesDoX,
  postDoBlockquote,
  servicoPelaClasse,
  veioDaMoldura,
  type OpcoesDoX,
  type Servico,
} from "./regras";

/** Quanto tempo esperar a PRIMEIRA mensagem do serviço antes de desistir e devolver o blockquote. */
export const TEMPO_SEM_RESPOSTA_MS = 30_000;

interface Post {
  servico: Servico;
  embed: HTMLElement;
  blockquote: HTMLElement;
  post: string;
  numero: number;
  opcoesDoX: OpcoesDoX;
  iframe: HTMLIFrameElement | null;
  /** X: o <div class="twitter-tweet twitter-tweet-rendered"> em volta do iframe. */
  caixa: HTMLElement | null;
  /** X: a moldura já apareceu (chegou a primeira altura)? */
  mostrado: boolean;
  respondeu: boolean;
  limite: ReturnType<typeof setTimeout> | null;
  desistirDeEsperar: (() => void) | null;
}

/** O que muda entre o navegador e os testes. */
export interface Ambiente {
  janela: Window;
  /** A janela de dentro do <iframe> (no navegador, `contentWindow`; nos testes, uma de mentira). */
  janelaDaMoldura?: (iframe: HTMLIFrameElement) => unknown;
  /** Chama `pronto` quando o elemento passa a ocupar lugar na tela (já, se já ocupa). Devolve a função que desiste de esperar. */
  quandoAparecer?: (el: HTMLElement, pronto: () => void) => () => void;
  /** Para os testes: tempo até desistir de um serviço que não responde. */
  tempoSemResposta?: number;
}

function quandoAparecerNoNavegador(janela: Window): NonNullable<Ambiente["quandoAparecer"]> {
  return (el, pronto) => {
    const Observador = (janela as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (el.getClientRects().length > 0 || typeof Observador !== "function") {
      pronto();
      return () => {};
    }
    const ro = new Observador((entradas) => {
      if (!entradas.some((e) => e.contentRect.width > 0)) return;
      ro.disconnect();
      pronto();
    });
    ro.observe(el);
    return () => ro.disconnect();
  };
}

/** Os data-* de um elemento como objeto simples (o widgets.js do X lê data-theme, data-cards, data-conversation, data-width, data-lang). */
function dadosDe(el: HTMLElement): Record<string, string | undefined> {
  return { ...el.dataset };
}

function limparLimite(p: Post): void {
  if (p.limite !== null) clearTimeout(p.limite);
  p.limite = null;
}

/** Desiste do post: a moldura sai e o blockquote do autor fica (ou volta) no lugar. Mensagens dele passam a ser ignoradas. */
function desistir(p: Post): void {
  limparLimite(p);
  if (p.servico === "x") p.caixa?.remove();
  else if (p.iframe && !p.blockquote.isConnected) p.iframe.replaceWith(p.blockquote);
  p.iframe?.remove();
  p.iframe = null;
  p.caixa = null;
}

/** X: a primeira altura chegou → a moldura aparece com os estilos do widgets.js e o blockquote sai. */
function mostrarX(p: Post, altura: number): void {
  if (!p.iframe || !p.caixa) return;
  p.caixa.setAttribute("style", ESTILOS.caixaDoX);
  p.iframe.setAttribute("style", ESTILOS.x(p.opcoesDoX.largura, altura));
  p.blockquote.remove();
  p.mostrado = true;
}

/** Liga todos os posts de `raiz`. Devolve a função que desliga tudo (escuta de mensagens, relógios, observadores) — para os testes. */
export function iniciarPosts(raiz: ParentNode, ambiente: Ambiente): () => void {
  const { janela } = ambiente;
  const doc = janela.document;
  const janelaDaMoldura = ambiente.janelaDaMoldura ?? ((f: HTMLIFrameElement) => f.contentWindow);
  const quandoAparecer = ambiente.quandoAparecer ?? quandoAparecerNoNavegador(janela);
  const tempo = ambiente.tempoSemResposta ?? TEMPO_SEM_RESPOSTA_MS;
  const posts: Post[] = [];
  const pagina = { origin: janela.location.origin, pathname: janela.location.pathname };
  const idioma = doc.documentElement.lang || "en";

  const aoReceber = (e: Event): void => {
    const m = e as MessageEvent;
    for (const p of posts) {
      if (!p.iframe) continue;
      if (!veioDaMoldura({ origin: m.origin, source: m.source }, janelaDaMoldura(p.iframe), p.servico)) continue;
      p.respondeu = true;
      limparLimite(p);
      const altura = alturaDaMensagem(p.servico, m.data, idDaMoldura("x", p.numero));
      if (altura === null) return;
      if (p.servico === "x") {
        if (!p.mostrado) mostrarX(p, altura);
        else p.iframe.style.height = `${altura}px`;
      } else {
        p.iframe.setAttribute("height", String(altura));
        p.iframe.setAttribute("scrolling", "no");
      }
      return;
    }
  };
  janela.addEventListener("message", aoReceber);

  const criar = (p: Post): void => {
    p.desistirDeEsperar = null;
    if (p.iframe || !p.blockquote.isConnected) return;
    const larguraDoBlockquote = p.blockquote.getBoundingClientRect().width;
    const alturaDoBlockquote = p.blockquote.getBoundingClientRect().height;
    const src = enderecoDaMoldura({
      servico: p.servico,
      post: p.post,
      pagina,
      idioma,
      numero: p.numero,
      x: p.opcoesDoX,
      comLegenda: p.blockquote.hasAttribute("data-instgrm-captioned"),
      versao: p.blockquote.getAttribute("data-instgrm-version"),
      larguraNaTela: larguraDoBlockquote,
    });
    // a origem da moldura tem de ser a do serviço e NUNCA a desta página (o allow-same-origin vale para o dono do endereço)
    if (!src || new URL(src).origin !== DADOS[p.servico].origem || new URL(src).origin === janela.location.origin) return;
    const alturaInicial = p.servico === "reddit" ? alturaInicialDoReddit(p.blockquote.getAttribute("data-embed-height")) : alturaInicialDoInstagram(alturaDoBlockquote);
    const f = doc.createElement("iframe");
    for (const [nome, valor] of atributosDaMoldura(p.servico, { src, numero: p.numero, idioma, idDoPost: /(\d+)$/.exec(p.post)?.[1] ?? "", alturaInicial })) f.setAttribute(nome, valor);
    p.iframe = f;
    if (p.servico === "x") {
      // escondida e fora do fluxo, mas com a largura que vai ter, para o X medir a altura certa
      const largura = Math.min(p.opcoesDoX.largura, Math.round(p.embed.clientWidth) || p.opcoesDoX.largura);
      const caixa = doc.createElement("div");
      caixa.className = "twitter-tweet twitter-tweet-rendered";
      caixa.setAttribute("style", ESTILOS.caixaDoX);
      caixa.style.setProperty("position", "absolute");
      caixa.style.setProperty("visibility", "hidden");
      caixa.style.setProperty("width", `${largura}px`);
      caixa.style.setProperty("pointer-events", "none");
      f.setAttribute("style", `position: static; visibility: hidden; width: ${largura}px; height: 0px; display: block; flex-grow: 1;`);
      caixa.append(f);
      p.caixa = caixa;
      p.blockquote.before(caixa);
    } else {
      p.blockquote.replaceWith(f);
    }
    p.limite = setTimeout(() => {
      p.limite = null;
      if (!p.respondeu) desistir(p);
    }, tempo);
  };

  const numeros: Record<Servico, number> = { x: 0, reddit: 0, instagram: 0 };
  const vistos = new Set<Element>();
  for (const embed of raiz.querySelectorAll<HTMLElement>(".embed")) {
    for (const bq of embed.querySelectorAll<HTMLElement>("blockquote")) {
      const servico = servicoPelaClasse(bq.classList);
      if (!servico || vistos.has(bq)) continue;
      vistos.add(bq);
      const links = Array.from(bq.querySelectorAll("a[href]"), (a) => a.getAttribute("href") ?? "");
      const post = postDoBlockquote(servico, links, bq.getAttribute("data-instgrm-permalink"));
      if (!post) continue;
      const p: Post = {
        servico,
        embed,
        blockquote: bq,
        post,
        numero: numeros[servico]++,
        opcoesDoX: opcoesDoX(dadosDe(bq)),
        iframe: null,
        caixa: null,
        mostrado: false,
        respondeu: false,
        limite: null,
        desistirDeEsperar: null,
      };
      posts.push(p);
      break; // um post por .embed, como o código de incorporação
    }
  }
  for (const p of posts) p.desistirDeEsperar = quandoAparecer(p.embed, () => criar(p));

  return () => {
    janela.removeEventListener("message", aoReceber);
    for (const p of posts) {
      limparLimite(p);
      p.desistirDeEsperar?.();
    }
  };
}
