// O DESENHO de um comentário formatado (10/11/2026): a árvore de ./formato.ts vira elementos, só por el() (texto sempre como texto)
// e, para as <img> dos GIFs e das imagens enviadas, pelo caminho explícito de imagemDaMidia(), que só aceita o endereço que passou por
// enderecoDoGif() (arquivo do KLIPY) ou enderecoDaImagem() (o balde comment-images do próprio Supabase do site).
//
// Comentário sem nenhuma marca → <div class="c-body"> com UM nó de texto, exatamente como antes (e como o comments.js do site antigo).
//
// ⚠ Vai para o navegador: só importa os outros arquivos dos comentários.
import { el } from "./dom";
import { analisarComentario, enderecoDaImagem, enderecoDoGif, semFormatacao, type Estilo, type Trecho } from "./formato";

/** Os textos que o desenho usa (TEXTOS_DO_EDITOR de ./editor.ts). */
export interface TextosDaMidia {
  spoiler: string;
  gif: string;
  imagem: string;
  ampliar: string;
}

const TAG_DO_ESTILO: Readonly<Record<Exclude<Estilo, "spoiler">, "strong" | "em" | "u" | "s">> = { negrito: "strong", italico: "em", sublinhado: "u", riscado: "s" };

/** Uma <img> de GIF ou de imagem enviada. `endereco` precisa ter passado por enderecoDoGif()/enderecoDaImagem() (confere de novo). */
export function imagemDaMidia(endereco: string, base: string, classe: string, alt: string): HTMLImageElement | null {
  const ok = enderecoDoGif(endereco) === endereco || endereco.startsWith(`${base}/storage/v1/object/public/comment-images/`);
  if (!ok) return null;
  const img = document.createElement("img");
  img.className = classe;
  img.alt = alt;
  img.decoding = "async";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.src = endereco; // só um endereço conferido acima
  return img;
}

function trechos(lista: readonly Trecho[], T: TextosDaMidia): Node[] {
  return lista.map((t) => {
    if (typeof t === "string") return document.createTextNode(t);
    const filhos = trechos(t.filhos, T);
    if (t.estilo === "spoiler") {
      const s = el("span", { attrs: { class: "c-spoiler", role: "button", tabindex: "0", "aria-expanded": "false", title: T.spoiler } }, filhos);
      const abrir = () => {
        s.classList.add("aberto");
        s.setAttribute("aria-expanded", "true");
        s.removeAttribute("role");
        s.removeAttribute("tabindex");
        s.removeAttribute("title");
      };
      s.addEventListener("click", abrir, { once: true });
      s.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          abrir();
        }
      });
      return s;
    }
    return el(TAG_DO_ESTILO[t.estilo], {}, filhos);
  });
}

/** O <div class="c-body"> de um comentário. */
export function corpoDoComentario(corpo: string, base: string, T: TextosDaMidia): HTMLDivElement {
  if (semFormatacao(corpo)) return el("div", { attrs: { class: "c-body" }, texto: corpo });
  const div = el("div", { attrs: { class: "c-body c-formatado" } });
  let midias: HTMLDivElement | null = null;
  for (const b of analisarComentario(corpo)) {
    if (b.tipo === "texto" || b.tipo === "citacao") {
      midias = null;
      div.appendChild(b.tipo === "citacao" ? el("blockquote", { attrs: { class: "c-citacao" } }, trechos(b.trechos, T)) : el("p", {}, trechos(b.trechos, T)));
      continue;
    }
    const endereco = b.tipo === "gif" ? b.endereco : enderecoDaImagem(base, b.caminho);
    const img = endereco ? imagemDaMidia(endereco, base, b.tipo === "gif" ? "c-gif" : "c-imagem", b.tipo === "gif" ? T.gif : T.imagem) : null;
    if (!img) continue;
    // mídias seguidas ficam lado a lado
    if (!midias) {
      midias = el("div", { attrs: { class: "c-midias" } });
      div.appendChild(midias);
    }
    const botao = el("button", { attrs: { type: "button", class: "c-midia", "aria-label": T.ampliar, "aria-pressed": "false" } }, [img]);
    botao.addEventListener("click", () => botao.setAttribute("aria-pressed", String(botao.getAttribute("aria-pressed") !== "true")));
    // o arquivo sumiu (apagado pela moderação, ou o KLIPY tirou o GIF): some do comentário em vez de ficar quebrado
    img.addEventListener("error", () => botao.remove());
    midias.appendChild(botao);
  }
  return div;
}
