// Posts incorporados SÓ COM CLIQUE (T17g, B27): o que o navegador faz com cada quadro `.embed[data-embed-servico]`.
//
// O servidor já entregou o quadro (src/lib/embedsComClique.ts): o <blockquote> do autor, o aviso e o botão (os dois `hidden`), o link
// para o post original e a linha de status. Sem JavaScript, fica só o blockquote e o link. Aqui:
//   - o script LIGA o botão (tira o `hidden` dele e do aviso) — nenhum pedido a terceiros acontece até o clique;
//   - no clique, cria UM <iframe sandbox> que aponta para a página de incorporação do serviço (enderecoDoQuadro: confere a ORIGEM),
//     põe o foco nele e espera a primeira resposta;
//   - ouve as mensagens de altura só desse quadro (veioDoQuadro: a janela do quadro E a origem do serviço; formato e limites em
//     alturaDaMensagem) e ajusta a altura;
//   - se o quadro não terminar de carregar em 20 s, mostra o erro e devolve o botão (tentar de novo); o link para o original
//     fica sempre visível.
//
// SEGURANÇA — o que este arquivo NUNCA faz (tests/embeds-dom.test.ts procura estas palavras e testa o comportamento):
//   - criar <script>, usar innerHTML/outerHTML/insertAdjacentHTML/document.write/DOMParser/createContextualFragment, eval ou Function;
//   - usar `srcdoc` ou about:blank no quadro (o `allow-same-origin` só é seguro porque o endereço é de OUTRA origem; enderecoDoQuadro
//     devolve null se a origem não for a do serviço, e aqui se recusa também um endereço da origem da página);
//   - montar HTML com texto da página: os textos vêm de atributos data-t-* e entram com textContent / setAttribute.
//
// ⚠ Vai para o navegador: só importa ./regras (que não importa nada).
import {
  DADOS,
  SANDBOX_DO_QUADRO,
  SERVICOS,
  alturaDaMensagem,
  alturaInicial,
  enderecoDoQuadro,
  novoIdDoQuadro,
  urlDoPost,
  veioDoQuadro,
  type Servico,
} from "./regras";

export const TEMPO_PARA_CARREGAR_MS = 20_000;

type Estado = "inicial" | "carregando" | "carregado" | "erro";

interface Quadro {
  embed: HTMLElement;
  servico: Servico;
  botao: HTMLButtonElement;
  status: HTMLElement;
  textos: { carregando: string; pronto: string; erro: string; titulo: string };
  iframe: HTMLIFrameElement | null;
  id: string;
  estado: Estado;
  limite: ReturnType<typeof setTimeout> | null;
}

/** O que muda entre o navegador e os testes: a janela, o sorteio e como achar a janela de dentro do <iframe>. */
export interface Ambiente {
  janela: Window;
  sorteio?: (n: number) => Uint8Array;
  janelaDoQuadro?: (iframe: HTMLIFrameElement) => unknown;
  /** Para os testes: tempo até o aviso de erro. */
  tempoParaCarregar?: number;
}

function sorteioDoNavegador(janela: Window): (n: number) => Uint8Array {
  return (n) => {
    const bytes = new Uint8Array(n);
    janela.crypto.getRandomValues(bytes);
    return bytes;
  };
}

function definirStatus(q: Quadro, texto: string): void {
  q.status.textContent = texto;
}

function mostrarEstado(q: Quadro, estado: Estado): void {
  q.estado = estado;
  q.embed.dataset["estado"] = estado;
  // o botão só aparece no começo e depois de um erro (tentar de novo)
  q.botao.hidden = !(estado === "inicial" || estado === "erro");
}

function limparLimite(q: Quadro): void {
  if (q.limite !== null) clearTimeout(q.limite);
  q.limite = null;
}

/** Cria o <iframe> do quadro. Devolve null se o endereço não passa nas conferências (nesse caso não cria nada). */
function criarQuadro(q: Quadro, janela: Window, sorteio: (n: number) => Uint8Array): HTMLIFrameElement | null {
  const doc = janela.document;
  const link = q.embed.querySelector<HTMLAnchorElement>("a.embed-origin");
  const post = link ? urlDoPost(q.servico, link.getAttribute("href") ?? "") : null;
  if (!post) return null;
  q.id = novoIdDoQuadro(sorteio);
  const gate = q.embed.querySelector<HTMLElement>(".embed-gate");
  const src = enderecoDoQuadro({
    servico: q.servico,
    post,
    comLegenda: gate?.hasAttribute("data-legendado") ?? false,
    idioma: doc.documentElement.lang.slice(0, 2).toLowerCase(),
    origemDaPagina: janela.location.origin,
    idDoQuadro: q.id,
  });
  // a origem do quadro tem de ser a do serviço e NUNCA a desta página (o allow-same-origin vale para o dono do endereço)
  if (!src || new URL(src).origin !== DADOS[q.servico].origem || new URL(src).origin === janela.location.origin) return null;
  const f = doc.createElement("iframe");
  f.className = "embed-frame";
  f.setAttribute("src", src);
  f.setAttribute("sandbox", SANDBOX_DO_QUADRO);
  f.setAttribute("title", q.textos.titulo);
  f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  f.setAttribute("allowfullscreen", "");
  f.style.height = `${alturaInicial(q.servico, gate?.getAttribute("data-altura"))}px`;
  return f;
}

/** Liga todos os quadros de `raiz`. Devolve a função que desliga a escuta de mensagens (para os testes). */
export function iniciarEmbeds(raiz: ParentNode, ambiente: Ambiente): () => void {
  const { janela } = ambiente;
  const sorteio = ambiente.sorteio ?? sorteioDoNavegador(janela);
  const janelaDoQuadro = ambiente.janelaDoQuadro ?? ((f: HTMLIFrameElement) => f.contentWindow);
  const tempo = ambiente.tempoParaCarregar ?? TEMPO_PARA_CARREGAR_MS;
  const quadros: Quadro[] = [];

  const aoReceber = (e: Event): void => {
    const m = e as MessageEvent;
    for (const q of quadros) {
      if (!q.iframe || q.estado === "inicial") continue;
      if (!veioDoQuadro({ origin: m.origin, source: m.source }, janelaDoQuadro(q.iframe), q.servico)) continue;
      const altura = alturaDaMensagem(q.servico, m.data, q.id);
      if (altura !== null) q.iframe.style.height = `${altura}px`;
      return;
    }
  };
  janela.addEventListener("message", aoReceber);

  const carregar = (q: Quadro): void => {
    if (q.estado === "carregando" || q.estado === "carregado") return;
    q.iframe?.remove();
    q.iframe = null;
    limparLimite(q);
    const f = criarQuadro(q, janela, sorteio);
    if (!f) {
      mostrarEstado(q, "erro");
      definirStatus(q, q.textos.erro);
      return;
    }
    q.iframe = f;
    mostrarEstado(q, "carregando");
    definirStatus(q, q.textos.carregando);
    f.addEventListener("load", () => {
      limparLimite(q);
      mostrarEstado(q, "carregado");
      definirStatus(q, q.textos.pronto);
    });
    q.embed.append(f);
    f.focus();
    q.limite = setTimeout(() => {
      q.limite = null;
      if (q.estado === "carregando") {
        mostrarEstado(q, "erro");
        definirStatus(q, q.textos.erro);
      }
    }, tempo);
  };

  for (const embed of raiz.querySelectorAll<HTMLElement>(".embed[data-embed-servico]")) {
    const servico = SERVICOS.find((s) => s === embed.dataset["embedServico"]);
    const gate = embed.querySelector<HTMLElement>(".embed-gate");
    const botao = gate?.querySelector<HTMLButtonElement>("button.embed-load");
    const status = gate?.querySelector<HTMLElement>(".embed-status");
    if (!servico || !gate || !botao || !status) continue;
    const q: Quadro = {
      embed,
      servico,
      botao,
      status,
      textos: {
        carregando: gate.dataset["tCarregando"] ?? "",
        pronto: gate.dataset["tPronto"] ?? "",
        erro: gate.dataset["tErro"] ?? "",
        titulo: gate.dataset["tTitulo"] ?? "",
      },
      iframe: null,
      id: "",
      estado: "inicial",
      limite: null,
    };
    quadros.push(q);
    const aviso = gate.querySelector<HTMLElement>(".embed-gate-aviso");
    if (aviso) aviso.hidden = false;
    mostrarEstado(q, "inicial");
    botao.addEventListener("click", () => carregar(q));
  }

  return () => {
    janela.removeEventListener("message", aoReceber);
    for (const q of quadros) limparLimite(q);
  };
}
