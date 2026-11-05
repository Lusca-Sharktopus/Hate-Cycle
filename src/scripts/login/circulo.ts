// O círculo mágico dos botões de login (05/11/2026, design do autor: "circulo login.png"; só no site novo).
//
// Com o mouse em cima (ou o foco do teclado) de um botão de Google/Twitter/Discord, a moldura do autor é DESENHADA, como por uma
// caneta que sai das duas bolinhas (em cima à esquerda e embaixo à direita) e corre pelos traços; ao sair, ela desvanece rápido.
// Vídeo aprovado pelo autor em 05/11 (versão 1, com o desvanecer rápido da versão 2).
//
// Como funciona: duas imagens do mesmo tamanho (src/assets/login/):
//   - circulo.png = o desenho do autor (metade do PNG original, com o brilho);
//   - tempo.png   = o "mapa de tempo": em que momento (0 a 1) a caneta passa por cada pixel, em 16 bits (R = parte alta,
//                   G = parte baixa). Feito uma vez, fora do build, a partir do esqueleto dos traços brancos (receita em
//                   guardados/login/LEIA-ME.md).
// A cada quadro, cada pixel aparece quando o tempo dele chega (com uma borda suave). As imagens só são baixadas no primeiro mouse em
// cima de um botão. Com movimento reduzido, o círculo aparece pronto, de uma vez.
//
// ⚠ Vai para o navegador: só importa os dois PNG (como endereço).
import urlDoDesenho from "../../assets/login/circulo.png?url";
import urlDoTempo from "../../assets/login/tempo.png?url";

/** A imagem: 1136 × 279; a moldura (o retângulo do botão) vai de x 33 a 1103 e começa em y 75. O CSS (EstiloDoLogin.astro) usa os mesmos números. */
export const MOLDURA = { largura: 1136, altura: 279, x0: 33, x1: 1103, y0: 75 } as const;
/** Quanto tempo a caneta leva para desenhar o círculo inteiro (ms). */
export const DURACAO = 900;
/** A borda suave da caneta (fração do tempo total). */
export const SUAVE = 0.035;
/** O desvanecer ao tirar o mouse (ms; o CSS tem o mesmo número). */
export const SAIDA = 150;

/** Quanto de cada pixel aparece no instante `t` (0 a 1 + SUAVE), dado o tempo dele no mapa. Função pura (o teste usa). */
export function quantoAparece(t: number, tempoDoPixel: number): number {
  return Math.max(0, Math.min(1, (t - tempoDoPixel) / SUAVE));
}

/** O tempo de um pixel no mapa (R parte alta, G parte baixa) → 0 a 1. */
export function tempoDoMapa(r: number, g: number): number {
  return (r * 256 + g) / 65535;
}

interface Dados {
  /** Os índices (no RGBA) dos pixels que não são transparentes. */
  pixels: Uint32Array;
  /** O tempo de cada um desses pixels. */
  tempos: Float32Array;
  /** O desenho (RGBA). */
  desenho: Uint8ClampedArray;
}

let carregando: Promise<Dados | null> | null = null;

function imagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error("imagem do círculo"));
    i.src = src;
  });
}

/** Baixa e prepara as duas imagens (uma vez por página). Sem canvas ou sem rede: null (o botão fica sem o círculo). */
function dados(): Promise<Dados | null> {
  carregando ??= Promise.all([imagem(urlDoDesenho), imagem(urlDoTempo)])
    .then(([d, t]) => {
      const { largura: w, altura: h } = MOLDURA;
      const tela = document.createElement("canvas");
      tela.width = w;
      tela.height = h;
      const c = tela.getContext("2d", { willReadFrequently: true });
      if (!c) return null;
      c.drawImage(d, 0, 0, w, h);
      const desenho = c.getImageData(0, 0, w, h).data;
      c.clearRect(0, 0, w, h);
      c.drawImage(t, 0, 0, w, h);
      const mapa = c.getImageData(0, 0, w, h).data;
      const lista: number[] = [];
      for (let j = 3; j < desenho.length; j += 4) if (desenho[j]) lista.push(j - 3);
      const pixels = Uint32Array.from(lista);
      const tempos = new Float32Array(pixels.length);
      pixels.forEach((j, i) => (tempos[i] = tempoDoMapa(mapa[j] ?? 0, mapa[j + 1] ?? 0)));
      return { pixels, tempos, desenho };
    })
    .catch(() => null);
  return carregando;
}

/** element.matches() que não quebra em navegador (ou DOM de teste) que não conhece o seletor. */
function combina(n: Element, seletor: string): boolean {
  try {
    return n.matches(seletor);
  } catch {
    return false;
  }
}

/** Liga o círculo a um botão de login: põe o <canvas> dentro dele e desenha com o mouse em cima ou o foco do teclado. */
export function ligarCirculo(botao: HTMLElement): void {
  const tela = document.createElement("canvas");
  tela.className = "c-circulo";
  tela.setAttribute("aria-hidden", "true");
  tela.width = MOLDURA.largura;
  tela.height = MOLDURA.altura;
  botao.appendChild(tela);
  const ctx = tela.getContext("2d");
  if (!ctx) return;
  let quadro: ImageData | null = null;
  let anim = 0;
  let dentro = false;
  let inicio = 0;

  function pintar(d: Dados, t: number): void {
    quadro ??= ctx!.createImageData(MOLDURA.largura, MOLDURA.altura);
    const saida = quadro.data;
    const { pixels, tempos, desenho } = d;
    for (let i = 0; i < pixels.length; i++) {
      const j = pixels[i] as number;
      saida[j] = desenho[j] as number;
      saida[j + 1] = desenho[j + 1] as number;
      saida[j + 2] = desenho[j + 2] as number;
      saida[j + 3] = (desenho[j + 3] as number) * quantoAparece(t, tempos[i] as number);
    }
    ctx!.putImageData(quadro, 0, 0);
  }

  function entrar(): void {
    if (dentro) return;
    dentro = true;
    cancelAnimationFrame(anim);
    ctx!.clearRect(0, 0, MOLDURA.largura, MOLDURA.altura);
    tela.classList.add("c-circulo-ver");
    const semMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    void dados().then((d) => {
      if (!d || !dentro) return;
      if (semMovimento) return pintar(d, 1 + SUAVE);
      inicio = performance.now();
      const passo = (agora: number) => {
        if (!dentro) return;
        const t = Math.min(1 + SUAVE, ((agora - inicio) / DURACAO) * (1 + SUAVE));
        pintar(d, t);
        if (t < 1 + SUAVE) anim = requestAnimationFrame(passo);
      };
      anim = requestAnimationFrame(passo);
    });
  }
  function sair(): void {
    if (!dentro) return;
    // o mouse saiu mas o foco continua (ou o contrário): o círculo fica
    if (combina(botao, ":hover") || combina(botao, ":focus-visible")) return;
    dentro = false;
    cancelAnimationFrame(anim);
    tela.classList.remove("c-circulo-ver"); // o CSS desvanece em SAIDA ms
  }
  botao.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") entrar();
  });
  botao.addEventListener("pointerleave", () => setTimeout(sair, 0));
  botao.addEventListener("focus", () => {
    if (combina(botao, ":focus-visible")) entrar();
  });
  botao.addEventListener("blur", () => setTimeout(sair, 0));
}
