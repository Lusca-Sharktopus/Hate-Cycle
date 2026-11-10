// O recorte da foto de perfil (09/11/2026, design do autor "Icon Edit Design.png"): a imagem escolhida aparece numa área escura, com o
// círculo branco brilhante por cima ("Icon Edit Circle 2.png"); a pessoa arrasta a imagem e aproxima/afasta pela barra (entre a imagem
// pequena e a grande), pela rodinha do mouse ou pelo teclado. "Salvar" grava só o que está dentro do círculo, 256 × 256.
//
// A imagem nunca passa por um endereço: o arquivo vira um ImageBitmap (createImageBitmap) e é DESENHADO num <canvas>; a saída é um
// Blob WebP (ou JPEG, no Safari, que não grava WebP) feito pelo próprio canvas. Nada aqui usa src/href/innerHTML.
//
// A primeira metade são as contas (funções puras, provadas em tests/comentarios.test.ts); a segunda, a tela.
import { el } from "./dom";

/** Lado da foto que vai para o banco (px). */
export const LADO_DA_FOTO = 256;
/** Quanto a barra deixa aproximar, a partir do menor tamanho que ainda cobre o círculo. */
export const ZOOM_MAXIMO = 5;
/** Arquivos maiores que isto nem são abertos (a foto final tem poucos KB; isto só evita travar o navegador com uma imagem enorme). */
export const TAMANHO_MAXIMO_DO_ARQUIVO = 20 * 1024 * 1024;

/** A imagem cobre o círculo (diâmetro `d`) com folga zero: a menor escala permitida. */
export function escalaMinima(larguraDaImagem: number, alturaDaImagem: number, d: number): number {
  return d / Math.max(1, Math.min(larguraDaImagem, alturaDaImagem));
}

/** Barra (0 a 1) → escala, em passos que parecem iguais ao olho (logarítmica). */
export function escalaDaBarra(valor: number, minima: number): number {
  const v = Math.min(1, Math.max(0, valor));
  return minima * ZOOM_MAXIMO ** v;
}
export function barraDaEscala(escala: number, minima: number): number {
  return Math.min(1, Math.max(0, Math.log(escala / minima) / Math.log(ZOOM_MAXIMO)));
}

/**
 * O deslocamento (dx, dy) do centro da imagem em relação ao centro do círculo, em px da tela, preso para o círculo nunca sair da
 * imagem: |dx| ≤ (largura × escala − d) / 2.
 */
export function deslocamentoPreso(dx: number, dy: number, larguraDaImagem: number, alturaDaImagem: number, escala: number, d: number): [number, number] {
  const mx = Math.max(0, (larguraDaImagem * escala - d) / 2);
  const my = Math.max(0, (alturaDaImagem * escala - d) / 2);
  const preso = (v: number, m: number) => (Math.abs(v) < 1e-9 ? 0 : Math.min(m, Math.max(-m, v)));
  return [preso(dx, mx), preso(dy, my)];
}

/** O quadrado da imagem ORIGINAL que está dentro do círculo: [x, y, lado], em px da imagem. */
export function quadradoDoRecorte(larguraDaImagem: number, alturaDaImagem: number, escala: number, dx: number, dy: number, d: number): [number, number, number] {
  const lado = d / escala;
  return [larguraDaImagem / 2 - dx / escala - lado / 2, alturaDaImagem / 2 - dy / escala - lado / 2, lado];
}

/** Um nome aleatório para o arquivo (só letras minúsculas e números, 24 caracteres), como o banco exige. */
export function nomeAleatorio(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export interface TextosDoRecorte {
  envio: string;
  envioDica: string;
  palco: string;
  menor: string;
  maior: string;
  zoom: string;
  salvar: string;
  cancelar: string;
  naoEImagem: string;
  grandeDemais: string;
  semFormato: string;
}

export interface OpcoesDoRecorte {
  T: TextosDoRecorte;
  /** O lugar da janela onde a tela entra (a .c-dialog). */
  caixa: HTMLElement;
  /** A foto pronta (WebP ou JPEG, 256 × 256) e a extensão do arquivo. */
  aoSalvar: (foto: Blob, extensao: "webp" | "jpg") => Promise<void>;
  /** Voltar à janela da conta sem mudar nada. */
  aoVoltar: () => void;
  avisar: (texto: string) => void;
}

/** A tela de escolher a imagem (área escura com o ícone de enviar: clique ou arraste o arquivo). */
export function telaDeEnvio(o: OpcoesDoRecorte): void {
  const { T, caixa } = o;
  caixa.textContent = "";
  caixa.className = "c-dialog c-perfil c-envio";
  const campo = el("input", { attrs: { type: "file", accept: "image/*", class: "c-envio-campo", id: "c-envio-campo", tabindex: "-1" } });
  const area = el(
    "label",
    {
      attrs: { class: "c-envio-area", for: "c-envio-campo", tabindex: "0", role: "button", "aria-describedby": "c-envio-dica" },
      ao: {
        keydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            campo.click();
          }
        },
        dragover: (e) => {
          e.preventDefault();
          area.classList.add("c-envio-sobre");
        },
        dragleave: () => area.classList.remove("c-envio-sobre"),
        drop: (e) => {
          e.preventDefault();
          area.classList.remove("c-envio-sobre");
          const arquivo = e.dataTransfer?.files?.[0];
          if (arquivo) void abrirArquivo(arquivo, o);
        },
      },
    },
    [el("span", { attrs: { class: "c-envio-icone", "aria-hidden": "true" } }), el("span", { attrs: { class: "c-envio-texto" }, texto: T.envio })],
  );
  campo.addEventListener("change", () => {
    const arquivo = campo.files?.[0];
    if (arquivo) void abrirArquivo(arquivo, o);
  });
  caixa.append(area, campo, el("p", { attrs: { class: "c-envio-dica", id: "c-envio-dica" }, texto: T.envioDica }));
  area.focus();
}

async function abrirArquivo(arquivo: File, o: OpcoesDoRecorte): Promise<void> {
  if (!arquivo.type.startsWith("image/")) {
    o.avisar(o.T.naoEImagem);
    return;
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    o.avisar(o.T.grandeDemais);
    return;
  }
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    o.avisar(o.T.naoEImagem);
    return;
  }
  telaDeRecorte(imagem, o);
}

/** A tela do recorte (exportada para os testes, que passam uma imagem falsa). */
export function telaDeRecorte(imagem: { width: number; height: number } & CanvasImageSource, o: OpcoesDoRecorte): void {
  const { T, caixa } = o;
  caixa.textContent = "";
  caixa.className = "c-dialog c-perfil c-recorte";
  const tela = el("canvas", { attrs: { class: "c-recorte-tela", "aria-hidden": "true" } });
  const palco = el(
    "div",
    { attrs: { class: "c-recorte-palco", tabindex: "0", role: "img", "aria-label": T.palco } },
    [tela, el("span", { attrs: { class: "c-recorte-circulo", "aria-hidden": "true" } })],
  );
  const barra = el("input", { attrs: { type: "range", min: "0", max: "1000", step: "1", value: "0", class: "c-recorte-barra", "aria-label": T.zoom } });
  const salvar = el("button", { attrs: { type: "button", class: "button c-recorte-salvar" }, texto: T.salvar });
  const cancelar = el("button", { attrs: { type: "button", class: "c-link c-recorte-cancelar" }, texto: T.cancelar, ao: { click: () => o.aoVoltar() } });
  caixa.append(
    palco,
    el("div", { attrs: { class: "c-recorte-zoom" } }, [
      el("button", { attrs: { type: "button", class: "c-recorte-menor", "aria-label": T.menor }, ao: { click: () => passo(-0.1) } }),
      barra,
      el("button", { attrs: { type: "button", class: "c-recorte-maior", "aria-label": T.maior }, ao: { click: () => passo(0.1) } }),
    ]),
    el("div", { attrs: { class: "c-recorte-botoes" } }, [cancelar, salvar]),
  );

  const iw = imagem.width;
  const ih = imagem.height;
  let w = 0;
  let h = 0;
  let d = 0;
  let minima = 1;
  let escala = 1;
  let dx = 0;
  let dy = 0;

  /** Mede o palco (o círculo ocupa 90% da altura dele, como no desenho) e redesenha. */
  function medir(): void {
    const r = palco.getBoundingClientRect();
    const novoW = Math.max(1, Math.round(r.width));
    const novoH = Math.max(1, Math.round(r.height));
    const valor = d ? barraDaEscala(escala, minima) : 0;
    const proporcao = d ? [dx / d, dy / d] : [0, 0];
    w = novoW;
    h = novoH;
    d = Math.min(w, h) * 0.9;
    minima = escalaMinima(iw, ih, d);
    escala = escalaDaBarra(valor, minima);
    [dx, dy] = deslocamentoPreso((proporcao[0] ?? 0) * d, (proporcao[1] ?? 0) * d, iw, ih, escala, d);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    tela.width = Math.round(w * dpr);
    tela.height = Math.round(h * dpr);
    palco.style.setProperty("--c-d", `${d}px`);
    desenhar();
  }
  function desenhar(): void {
    const ctx = tela.getContext("2d");
    if (!ctx) return;
    const dpr = tela.width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem, w / 2 + dx - (iw * escala) / 2, h / 2 + dy - (ih * escala) / 2, iw * escala, ih * escala);
    // fora do anel, a imagem fica escurecida (design do autor): um véu escuro com um furo redondo do tamanho do círculo
    ctx.beginPath();
    ctx.rect(w / 2 + dx - (iw * escala) / 2, h / 2 + dy - (ih * escala) / 2, iw * escala, ih * escala); // só sobre a imagem: as laterais seguem cinza
    ctx.arc(w / 2, h / 2, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fill("evenodd");
  }
  function mover(ndx: number, ndy: number): void {
    [dx, dy] = deslocamentoPreso(ndx, ndy, iw, ih, escala, d);
    desenhar();
  }
  /** Muda a escala mantendo parado o ponto da imagem que está no centro do círculo. */
  function mudarEscala(nova: number): void {
    const n = Math.min(minima * ZOOM_MAXIMO, Math.max(minima, nova));
    const f = n / escala;
    escala = n;
    barra.value = String(Math.round(barraDaEscala(escala, minima) * 1000));
    mover(dx * f, dy * f);
  }
  function passo(v: number): void {
    mudarEscala(escalaDaBarra(barraDaEscala(escala, minima) + v, minima));
  }
  barra.addEventListener("input", () => mudarEscala(escalaDaBarra(Number(barra.value) / 1000, minima)));

  // arrastar (mouse, dedo, caneta)
  let arrasto: { x: number; y: number; dx: number; dy: number; id: number } | null = null;
  palco.addEventListener("pointerdown", (e) => {
    arrasto = { x: e.clientX, y: e.clientY, dx, dy, id: e.pointerId };
    palco.setPointerCapture?.(e.pointerId);
    palco.classList.add("c-arrastando");
  });
  palco.addEventListener("pointermove", (e) => {
    if (arrasto && e.pointerId === arrasto.id) mover(arrasto.dx + e.clientX - arrasto.x, arrasto.dy + e.clientY - arrasto.y);
  });
  const soltar = () => {
    arrasto = null;
    palco.classList.remove("c-arrastando");
  };
  palco.addEventListener("pointerup", soltar);
  palco.addEventListener("pointercancel", soltar);
  palco.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      passo(e.deltaY < 0 ? 0.05 : -0.05);
    },
    { passive: false },
  );
  palco.addEventListener("keydown", (e) => {
    const p = e.shiftKey ? 40 : 10;
    const teclas: Record<string, () => void> = {
      ArrowLeft: () => mover(dx + p, dy),
      ArrowRight: () => mover(dx - p, dy),
      ArrowUp: () => mover(dx, dy + p),
      ArrowDown: () => mover(dx, dy - p),
      "+": () => passo(0.05),
      "=": () => passo(0.05),
      "-": () => passo(-0.05),
    };
    const f = teclas[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  });

  let ocupado = false;
  salvar.addEventListener("click", () => {
    if (ocupado) return;
    const saida = document.createElement("canvas");
    saida.width = LADO_DA_FOTO;
    saida.height = LADO_DA_FOTO;
    const ctx = saida.getContext("2d");
    if (!ctx) return;
    const [sx, sy, lado] = quadradoDoRecorte(iw, ih, escala, dx, dy, d);
    ctx.fillStyle = "#ecebe8"; // o JPEG não tem transparência: o fundo é o do papel
    ctx.fillRect(0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem, sx, sy, lado, lado, 0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
    ocupado = true;
    salvar.disabled = true;
    caixa.setAttribute("aria-busy", "true");
    const terminar = () => {
      ocupado = false;
      salvar.disabled = false;
      caixa.removeAttribute("aria-busy");
    };
    saida.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") {
          void o.aoSalvar(webp, "webp").finally(terminar);
          return;
        }
        // o Safari devolve PNG quando não sabe gravar WebP: vai JPEG
        saida.toBlob(
          (jpg) => {
            if (jpg && jpg.type === "image/jpeg") void o.aoSalvar(jpg, "jpg").finally(terminar);
            else {
              terminar();
              o.avisar(T.semFormato);
            }
          },
          "image/jpeg",
          0.88,
        );
      },
      "image/webp",
      0.88,
    );
  });

  // o tamanho do palco só existe depois de a tela estar na página
  if (typeof ResizeObserver === "function") new ResizeObserver(() => medir()).observe(palco);
  requestAnimationFrame(() => medir());
  palco.focus();
}
