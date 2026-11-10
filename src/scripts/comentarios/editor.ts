// O EDITOR dos comentários (10/11/2026, pedido do autor): a barra de ferramentas embaixo de cada campo de texto da caixa (comentário
// novo, resposta e edição) — negrito, itálico, sublinhado, riscado, spoiler, citação, emojis (comuns + runas), GIFs do KLIPY e imagens —
// e a "bandeja" com os GIFs e imagens anexados. Os botões de estilo escrevem as marcas de ./formato.ts no texto; GIFs e imagens vão
// para o fim do comentário, cada um numa linha ({gif:…}/{img:…}), quando a pessoa envia.
//
//   - GIFs: busca no KLIPY (api.klipy.com/v2, a API no formato da do Tenor), com a chave que o autor põe em config.json →
//     comments.klipy_api_key (pública por desenho, como a anon do Supabase). Sem a chave, o botão GIF não aparece. O navegador só
//     fala com o KLIPY quando a pessoa abre o seletor de GIFs; quem vê um comentário com GIF carrega a imagem do KLIPY.
//   - Imagens: a pessoa escolhe (ou arrasta, ou cola) uma imagem; o navegador reduz para no máximo 1600 px e grava em WebP (JPEG no
//     Safari); GIF animado vai como está, até 2 MB. O arquivo só sobe quando a pessoa envia o comentário, para o balde público
//     "comment-images" do Supabase, na pasta dela (migração 20261110120000_imagens_nos_comentarios.sql).
//
// Textos: TEXTOS_DO_EDITOR (pt/en) aqui mesmo, nunca no config.json (como os da janela da conta).
// ⚠ Vai para o navegador: só importa os arquivos dos comentários e o TIPO do supabase-js.
import type { SupabaseClient } from "@supabase/supabase-js";
import { el } from "./dom";
import { CHAVE_DOS_RECENTES, GRUPOS_DE_EMOJIS, recentesDepoisDe, recentesValidos, type GrupoDeEmojis } from "./emojis";
import {
  alternarCitacao,
  alternarEstilo,
  enderecoDaImagem,
  enderecoDoGif,
  inserirTexto,
  juntarMidias,
  MAXIMO_DE_MIDIAS,
  type Estilo,
  type Midia,
  type Selecao,
} from "./formato";
import { imagemDaMidia, type TextosDaMidia } from "./midia";
import { nomeAleatorio } from "./recorte";

export const TEXTOS_DO_EDITOR = {
  pt: {
    ferramentas: "Formatação",
    negrito: "Negrito (Ctrl+B)",
    italico: "Itálico (Ctrl+I)",
    sublinhado: "Sublinhado (Ctrl+U)",
    riscado: "Riscado",
    spoiler: "Spoiler (fica escondido até clicar)",
    citacao: "Citação",
    emojis: "Emojis",
    gifs: "GIFs",
    imagem: "Enviar imagem",
    remover: "Tirar do comentário",
    buscarGif: "Pesquisar no KLIPY",
    poweredBy: "Powered by KLIPY",
    carregarMais: "Carregar mais",
    carregando: "Carregando…",
    nenhumGif: "Nenhum GIF encontrado.",
    erroGif: "Não deu para falar com o KLIPY agora. Tente de novo daqui a pouco.",
    erroImagem: "Esse arquivo não é uma imagem que o site consiga abrir.",
    imagemGrande: "Essa imagem é grande demais (GIF: até 2 MB).",
    limite: `Cabem no máximo ${MAXIMO_DE_MIDIAS} GIFs ou imagens por comentário.`,
    enviando: "Enviando…",
    erroEnvio: "Não deu para enviar a imagem. Tente de novo.",
    recentes: "Recentes",
    rostos: "Rostos",
    gestos: "Gestos e pessoas",
    coracoes: "Corações",
    animais: "Animais e natureza",
    comida: "Comida",
    coisas: "Atividades e objetos",
    simbolos: "Símbolos",
    runas: "Runas de Hᴀᴛᴇ Cʏᴄʟᴇ",
    fechar: "Fechar",
    spoilerEscondido: "Spoiler: clique para ver",
    gif: "GIF",
    imagemDoComentario: "Imagem do comentário",
    ampliar: "Ampliar ou reduzir",
  },
  en: {
    ferramentas: "Formatting",
    negrito: "Bold (Ctrl+B)",
    italico: "Italic (Ctrl+I)",
    sublinhado: "Underline (Ctrl+U)",
    riscado: "Strikethrough",
    spoiler: "Spoiler (hidden until clicked)",
    citacao: "Quote",
    emojis: "Emoji",
    gifs: "GIFs",
    imagem: "Upload image",
    remover: "Remove from comment",
    buscarGif: "Search KLIPY",
    poweredBy: "Powered by KLIPY",
    carregarMais: "Load more",
    carregando: "Loading…",
    nenhumGif: "No GIFs found.",
    erroGif: "Couldn't reach KLIPY right now. Please try again in a moment.",
    erroImagem: "This file isn't an image the site can open.",
    imagemGrande: "This image is too large (GIF: up to 2 MB).",
    limite: `A comment can have at most ${MAXIMO_DE_MIDIAS} GIFs or images.`,
    enviando: "Sending…",
    erroEnvio: "Couldn't upload the image. Please try again.",
    recentes: "Recent",
    rostos: "Smileys",
    gestos: "Gestures & people",
    coracoes: "Hearts",
    animais: "Animals & nature",
    comida: "Food",
    coisas: "Activities & objects",
    simbolos: "Symbols",
    runas: "Hᴀᴛᴇ Cʏᴄʟᴇ runes",
    fechar: "Close",
    spoilerEscondido: "Spoiler: click to reveal",
    gif: "GIF",
    imagemDoComentario: "Comment image",
    ampliar: "Enlarge or shrink",
  },
} as const;
export type TextosDoEditor = (typeof TEXTOS_DO_EDITOR)["pt"] | (typeof TEXTOS_DO_EDITOR)["en"];

export function textosDoEditor(lang: string): TextosDoEditor {
  return lang === "pt" ? TEXTOS_DO_EDITOR.pt : TEXTOS_DO_EDITOR.en;
}
/** Os textos do desenho do comentário (./midia.ts). */
export function textosDaMidia(lang: string): TextosDaMidia {
  const T = textosDoEditor(lang);
  return { spoiler: T.spoilerEscondido, gif: T.gif, imagem: T.imagemDoComentario, ampliar: T.ampliar };
}

// ───────────── regras (puras) ─────────────

/** A imagem enviada: no máximo 1600 px no lado maior. */
export const LADO_MAXIMO_DA_IMAGEM = 1600;
/** O limite do balde (o mesmo da migração): 2 MB. */
export const TAMANHO_MAXIMO_DA_IMAGEM = 2 * 1024 * 1024;
/** Arquivo escolhido maior que isto nem é aberto. */
export const TAMANHO_MAXIMO_DA_ORIGEM = 25 * 1024 * 1024;

/** O tamanho da imagem reduzida (mantém a proporção; nunca aumenta). */
export function tamanhoReduzido(largura: number, altura: number, lado = LADO_MAXIMO_DA_IMAGEM): [number, number] {
  const maior = Math.max(largura, altura);
  if (maior <= lado) return [largura, altura];
  const f = lado / maior;
  return [Math.max(1, Math.round(largura * f)), Math.max(1, Math.round(altura * f))];
}

/** O idioma da busca do KLIPY (formato xx_YY). */
export function localeDoKlipy(lang: string): string {
  return lang === "pt" ? "pt_BR" : "en_US";
}

/** O endereço de uma busca no KLIPY (ou dos GIFs em destaque, sem `busca`). */
export function enderecoDaBusca(chave: string, lang: string, busca: string, pos: string | null): string {
  const p = new URLSearchParams({ key: chave, limit: "24", media_filter: "tinygif,mediumgif,gif", locale: localeDoKlipy(lang), contentfilter: "medium" });
  const termo = busca.trim().slice(0, 100);
  if (termo) p.set("q", termo);
  if (pos) p.set("pos", pos);
  return `https://api.klipy.com/v2/${termo ? "search" : "featured"}?${p.toString()}`;
}

/** Um GIF do resultado: a prévia (pequena) e o que vai para o comentário (médio). */
export interface GifDoKlipy {
  previa: string;
  endereco: string;
  titulo: string;
  largura: number;
  altura: number;
}

/** A resposta do KLIPY, conferida: só GIFs com endereços do KLIPY; o resto é ignorado. */
export function lerResultados(json: unknown): { gifs: GifDoKlipy[]; proximo: string | null } {
  const saida: GifDoKlipy[] = [];
  const o = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const resultados = Array.isArray(o["results"]) ? (o["results"] as unknown[]) : [];
  for (const r of resultados) {
    if (r === null || typeof r !== "object") continue;
    const formatos = (r as Record<string, unknown>)["media_formats"];
    if (formatos === null || typeof formatos !== "object") continue;
    const f = formatos as Record<string, { url?: unknown; dims?: unknown } | undefined>;
    const previa = enderecoDoGif(f["tinygif"]?.url) ?? enderecoDoGif(f["mediumgif"]?.url);
    const endereco = enderecoDoGif(f["mediumgif"]?.url) ?? enderecoDoGif(f["gif"]?.url) ?? previa;
    if (!previa || !endereco) continue;
    const dims = f["tinygif"]?.dims;
    const [largura, altura] = Array.isArray(dims) && typeof dims[0] === "number" && typeof dims[1] === "number" ? [dims[0], dims[1]] : [0, 0];
    const titulo = (r as Record<string, unknown>)["content_description"] ?? (r as Record<string, unknown>)["title"];
    saida.push({ previa, endereco, titulo: typeof titulo === "string" ? titulo.slice(0, 120) : "GIF", largura, altura });
  }
  const proximo = typeof o["next"] === "string" && o["next"] !== "" && o["next"] !== "0" ? (o["next"] as string) : null;
  return { gifs: saida, proximo };
}

// ───────────── o editor ─────────────

/** Uma mídia na bandeja: já no comentário (GIF, imagem já enviada) ou esperando o envio (imagem do aparelho). */
type NaBandeja = Midia | { tipo: "local"; arquivo: Blob; extensao: "webp" | "jpg" | "gif"; previa: string };

export interface OpcoesDoEditor {
  sb: SupabaseClient;
  /** A URL do Supabase (config.json). */
  base: string;
  lang: string;
  /** A chave do KLIPY (config.json → comments.klipy_api_key); null = sem botão de GIF. */
  klipy: string | null;
  /** Quem está conectado (o id), ou null. */
  quem: () => string | null;
  /** Sem conta, qualquer botão abre a janela de login. */
  pedirLogin: () => void;
  /** Mensagem para a pessoa (erro). */
  avisar: (texto: string) => void;
  /** As mídias de um comentário que está sendo editado. */
  midias?: readonly Midia[];
}

export interface Editor {
  /** A barra de ferramentas (vai embaixo do campo). */
  barra: HTMLDivElement;
  /** Os GIFs e imagens anexados (vai embaixo da barra; vazia = escondida). */
  bandeja: HTMLDivElement;
  /** Sobe as imagens que faltam e devolve o texto final; null = nada para enviar (ou o envio falhou). */
  preparar: () => Promise<{ corpo: string; enviadas: string[] } | null>;
  /** Depois de publicar: limpa a bandeja. Devolve os caminhos das imagens que saíram do comentário (na edição) para apagar. */
  terminar: () => string[];
  /** Se o comentário não foi aceito: apaga as imagens que acabaram de subir. */
  desfazer: (enviadas: readonly string[]) => void;
}

const BOTOES_DE_ESTILO: readonly (readonly [Estilo, string, string])[] = [
  ["negrito", "B", "b"],
  ["italico", "I", "i"],
  ["sublinhado", "U", "u"],
  ["riscado", "S", ""],
  ["spoiler", "", ""],
];

/** Monta a barra e a bandeja de um campo de texto. */
export function montarEditor(campo: HTMLTextAreaElement, o: OpcoesDoEditor): Editor {
  const T = textosDoEditor(o.lang);
  const bandejaInicial: NaBandeja[] = [...(o.midias ?? [])];
  let itens: NaBandeja[] = [...bandejaInicial];
  let painel: HTMLDivElement | null = null;
  let botaoDoPainel: HTMLButtonElement | null = null;

  const barra = el("div", { attrs: { class: "c-ferramentas", role: "toolbar", "aria-label": T.ferramentas } });
  const bandeja = el("div", { attrs: { class: "c-bandeja" } });
  const entrada = el("input", { attrs: { type: "file", accept: "image/*", class: "c-arquivo", tabindex: "-1", "aria-hidden": "true" } });

  const conectado = (): boolean => {
    if (o.quem()) return true;
    o.pedirLogin();
    return false;
  };

  function aplicar(nova: Selecao): void {
    campo.value = nova.valor;
    campo.focus();
    campo.setSelectionRange(nova.inicio, nova.fim);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const selecao = (): Selecao => ({ valor: campo.value, inicio: campo.selectionStart ?? campo.value.length, fim: campo.selectionEnd ?? campo.value.length });

  function botao(classe: string, rotulo: string, titulo: string, acao: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = el("button", { attrs: { type: "button", class: `c-ferramenta ${classe}`, title: titulo, "aria-label": titulo }, texto: rotulo });
    // não tira o foco (nem a seleção) do campo ao clicar
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (conectado()) acao(b);
    });
    return b;
  }

  for (const [estilo, rotulo] of BOTOES_DE_ESTILO) {
    barra.appendChild(botao(`c-f-${estilo}`, rotulo, T[estilo], () => aplicar(alternarEstilo(selecao(), estilo))));
  }
  barra.appendChild(botao("c-f-citacao", "", T.citacao, () => aplicar(alternarCitacao(selecao()))));
  barra.appendChild(el("span", { attrs: { class: "c-f-separador", "aria-hidden": "true" } }));
  barra.appendChild(botao("c-f-emoji", "", T.emojis, (b) => alternarPainel(b, painelDeEmojis)));
  if (o.klipy) barra.appendChild(botao("c-f-gif", "GIF", T.gifs, (b) => alternarPainel(b, painelDeGifs)));
  barra.appendChild(botao("c-f-imagem", "", T.imagem, () => entrada.click()));
  barra.appendChild(entrada);

  // atalhos de teclado no campo
  campo.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const estilo = BOTOES_DE_ESTILO.find(([, , tecla]) => tecla && tecla === e.key.toLowerCase());
    if (!estilo) return;
    e.preventDefault();
    if (conectado()) aplicar(alternarEstilo(selecao(), estilo[0]));
  });

  // ── painéis (emoji, GIF): um aberto por vez, embaixo da barra ──
  function fecharPainel(): void {
    painel?.remove();
    painel = null;
    botaoDoPainel?.setAttribute("aria-expanded", "false");
    botaoDoPainel = null;
    document.removeEventListener("mousedown", foraDoPainel, true);
  }
  function foraDoPainel(e: Event): void {
    const alvo = e.target as Node | null;
    if (painel && alvo && !painel.contains(alvo) && !(botaoDoPainel && botaoDoPainel.contains(alvo))) fecharPainel();
  }
  function alternarPainel(b: HTMLButtonElement, montar: () => HTMLDivElement): void {
    const mesmo = botaoDoPainel === b;
    fecharPainel();
    if (mesmo) return;
    painel = montar();
    botaoDoPainel = b;
    b.setAttribute("aria-expanded", "true");
    painel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fecharPainel();
        campo.focus();
      }
    });
    barra.after(painel);
    document.addEventListener("mousedown", foraDoPainel, true);
    painel.querySelector<HTMLElement>("input, button")?.focus();
  }

  function lerRecentes(): string[] {
    try {
      return recentesValidos(JSON.parse(localStorage.getItem(CHAVE_DOS_RECENTES) ?? "[]"));
    } catch {
      return [];
    }
  }
  function guardarRecente(emoji: string): void {
    try {
      localStorage.setItem(CHAVE_DOS_RECENTES, JSON.stringify(recentesDepoisDe(lerRecentes(), emoji)));
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }

  function painelDeEmojis(): HTMLDivElement {
    const p = el("div", { attrs: { class: "c-painel c-painel-emojis", role: "dialog", "aria-label": T.emojis } });
    const abas = el("div", { attrs: { class: "c-abas", role: "tablist" } });
    const grade = el("div", { attrs: { class: "c-grade-emojis", role: "tabpanel" } });
    const recentes = lerRecentes();
    const grupos: { id: string; icone: string; lista: readonly string[] }[] = [
      ...(recentes.length ? [{ id: "recentes", icone: "🕘", lista: recentes }] : []),
      ...GRUPOS_DE_EMOJIS,
    ];
    function mostrar(g: { id: string; lista: readonly string[] }): void {
      grade.textContent = "";
      grade.classList.toggle("c-runas", g.id === "runas");
      grade.setAttribute("aria-label", T[g.id as GrupoDeEmojis["id"] | "recentes"]);
      for (const b of abas.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset["grupo"] === g.id));
      for (const e of g.lista) {
        grade.appendChild(
          el("button", {
            attrs: { type: "button", class: "c-emoji", title: e },
            texto: e,
            ao: {
              mousedown: (ev) => ev.preventDefault(),
              click: () => {
                aplicar(inserirTexto(selecao(), e));
                guardarRecente(e);
              },
            },
          }),
        );
      }
    }
    for (const g of grupos) {
      abas.appendChild(
        el("button", {
          attrs: { type: "button", class: "c-aba" + (g.id === "runas" ? " c-runas" : ""), role: "tab", "data-grupo": g.id, title: T[g.id as GrupoDeEmojis["id"] | "recentes"], "aria-label": T[g.id as GrupoDeEmojis["id"] | "recentes"] },
          texto: g.icone,
          ao: { click: () => mostrar(g) },
        }),
      );
    }
    p.append(abas, grade);
    mostrar(grupos[0] as (typeof grupos)[number]);
    return p;
  }

  function painelDeGifs(): HTMLDivElement {
    const chave = o.klipy as string;
    const p = el("div", { attrs: { class: "c-painel c-painel-gifs", role: "dialog", "aria-label": T.gifs } });
    const busca = el("input", { attrs: { type: "search", class: "c-busca-gif", placeholder: T.buscarGif, "aria-label": T.buscarGif, maxlength: "100" } });
    const grade = el("div", { attrs: { class: "c-grade-gifs" } });
    const estado = el("p", { attrs: { class: "c-note c-estado-gif", role: "status" } });
    const mais = el("button", { attrs: { type: "button", class: "c-link c-mais-gif" }, texto: T.carregarMais });
    const marca = el("p", { attrs: { class: "c-klipy" }, texto: T.poweredBy });
    mais.hidden = true;
    let proximo: string | null = null;
    let termo = "";
    let pedido = 0;
    let espera: ReturnType<typeof setTimeout> | null = null;

    function carregar(continuar: boolean): void {
      const este = ++pedido;
      if (!continuar) {
        grade.textContent = "";
        proximo = null;
      }
      estado.textContent = T.carregando;
      mais.hidden = true;
      fetch(enderecoDaBusca(chave, o.lang, termo, continuar ? proximo : null), { credentials: "omit", referrerPolicy: "origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: unknown) => {
          if (este !== pedido) return;
          const { gifs, proximo: depois } = lerResultados(json);
          proximo = depois;
          estado.textContent = !continuar && gifs.length === 0 ? T.nenhumGif : "";
          for (const g of gifs) {
            const img = imagemDaMidia(g.previa, o.base, "c-previa-gif", g.titulo);
            if (!img) continue;
            if (g.largura && g.altura) {
              img.width = g.largura;
              img.height = g.altura;
            }
            grade.appendChild(
              el("button", { attrs: { type: "button", class: "c-gif-opcao", title: g.titulo, "aria-label": g.titulo } }, [img]),
            ).addEventListener("click", () => {
              if (anexar({ tipo: "gif", endereco: g.endereco })) {
                fecharPainel();
                campo.focus();
              }
            });
          }
          mais.hidden = !proximo;
        })
        .catch(() => {
          if (este === pedido) estado.textContent = T.erroGif;
        });
    }
    busca.addEventListener("input", () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        termo = busca.value;
        carregar(false);
      }, 400);
    });
    busca.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault(); // não envia o comentário
    });
    mais.addEventListener("click", () => carregar(true));
    p.append(busca, grade, estado, mais, marca);
    carregar(false);
    return p;
  }

  // ── a bandeja ──
  function quantos(): number {
    return itens.length;
  }
  function anexar(m: NaBandeja): boolean {
    if (quantos() >= MAXIMO_DE_MIDIAS) {
      o.avisar(T.limite);
      return false;
    }
    itens.push(m);
    desenharBandeja();
    return true;
  }
  function desenharBandeja(): void {
    bandeja.textContent = "";
    bandeja.hidden = itens.length === 0;
    itens.forEach((m, n) => {
      let img: HTMLImageElement | null = null;
      if (m.tipo === "gif") img = imagemDaMidia(m.endereco, o.base, "c-anexo-img", T.gif);
      else if (m.tipo === "imagem") {
        const endereco = enderecoDaImagem(o.base, m.caminho);
        img = endereco ? imagemDaMidia(endereco, o.base, "c-anexo-img", T.imagemDoComentario) : null;
      } else img = previaLocal(m.previa, T.imagemDoComentario);
      const remover = el("button", {
        attrs: { type: "button", class: "c-anexo-x", title: T.remover, "aria-label": T.remover },
        texto: "×",
        ao: {
          click: () => {
            const [tirado] = itens.splice(n, 1);
            if (tirado && tirado.tipo === "local") URL.revokeObjectURL(tirado.previa);
            desenharBandeja();
            campo.focus();
          },
        },
      });
      bandeja.appendChild(el("div", { attrs: { class: "c-anexo" + (m.tipo === "gif" ? " c-anexo-gif" : "") } }, [img, remover]));
    });
  }
  desenharBandeja();

  // ── imagens do aparelho: escolher, arrastar, colar ──
  function receberArquivos(lista: FileList | readonly File[] | null | undefined): void {
    for (const f of Array.from(lista ?? [])) {
      if (!f.type.startsWith("image/")) continue;
      if (!conectado()) return;
      if (quantos() >= MAXIMO_DE_MIDIAS) {
        o.avisar(T.limite);
        return;
      }
      void prepararArquivo(f).then(
        (r) => {
          if (r) anexar({ tipo: "local", arquivo: r.blob, extensao: r.extensao, previa: URL.createObjectURL(r.blob) });
        },
        (e: unknown) => o.avisar(e instanceof Error && e.message === "grande" ? T.imagemGrande : T.erroImagem),
      );
    }
  }
  entrada.addEventListener("change", () => {
    receberArquivos(entrada.files);
    entrada.value = "";
  });
  campo.addEventListener("paste", (e) => {
    const arquivos = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!arquivos.length) return;
    e.preventDefault();
    receberArquivos(arquivos);
  });
  campo.addEventListener("dragover", (e) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  });
  campo.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    receberArquivos(e.dataTransfer.files);
  });

  async function subir(m: Extract<NaBandeja, { tipo: "local" }>): Promise<string> {
    const id = o.quem();
    if (!id) throw new Error("not allowed");
    const caminho = `${id}/${nomeAleatorio()}.${m.extensao}`;
    const tipo = m.extensao === "gif" ? "image/gif" : m.extensao === "jpg" ? "image/jpeg" : "image/webp";
    const r = await o.sb.storage.from("comment-images").upload(caminho, m.arquivo, { contentType: tipo, cacheControl: "31536000", upsert: false });
    if (r.error) throw r.error;
    return caminho;
  }

  return {
    barra,
    bandeja,
    preparar: async () => {
      fecharPainel();
      const enviadas: string[] = [];
      const finais: Midia[] = [];
      try {
        for (const m of itens) {
          if (m.tipo !== "local") {
            finais.push(m);
            continue;
          }
          const caminho = await subir(m);
          enviadas.push(caminho);
          finais.push({ tipo: "imagem", caminho });
        }
      } catch {
        o.avisar(T.erroEnvio);
        if (enviadas.length) void o.sb.storage.from("comment-images").remove(enviadas);
        return null;
      }
      const corpo = juntarMidias(campo.value, finais);
      if (corpo === null) return null;
      // as imagens já enviadas viram mídias normais (se a pessoa tentar de novo, não sobem duas vezes)
      itens = finais;
      return { corpo, enviadas };
    },
    terminar: () => {
      const ficaram = new Set(itens.filter((m): m is Extract<Midia, { tipo: "imagem" }> => m.tipo === "imagem").map((m) => m.caminho));
      const sairam = bandejaInicial.filter((m): m is Extract<Midia, { tipo: "imagem" }> => m.tipo === "imagem" && !ficaram.has(m.caminho)).map((m) => m.caminho);
      for (const m of itens) if (m.tipo === "local") URL.revokeObjectURL(m.previa);
      itens = [];
      desenharBandeja();
      fecharPainel();
      return sairam;
    },
    desfazer: (enviadas) => {
      if (enviadas.length) void o.sb.storage.from("comment-images").remove([...enviadas]);
    },
  };
}

/** A prévia de uma imagem do aparelho: só endereços blob: criados por URL.createObjectURL nesta página. */
function previaLocal(endereco: string, alt: string): HTMLImageElement | null {
  if (!endereco.startsWith(`blob:${location.origin}/`)) return null;
  const img = document.createElement("img");
  img.className = "c-anexo-img";
  img.alt = alt;
  img.src = endereco; // um blob: desta página
  return img;
}

/** Abre a imagem escolhida e prepara o arquivo que sobe: GIF como está (até 2 MB); o resto reduzido, em WebP (ou JPEG). */
export async function prepararArquivo(f: Blob): Promise<{ blob: Blob; extensao: "webp" | "jpg" | "gif" } | null> {
  if (f.size > TAMANHO_MAXIMO_DA_ORIGEM) throw new Error("grande");
  if (f.type === "image/gif") {
    if (f.size > TAMANHO_MAXIMO_DA_IMAGEM) throw new Error("grande");
    return { blob: f, extensao: "gif" };
  }
  const bitmap = await createImageBitmap(f);
  const [w, h] = tamanhoReduzido(bitmap.width, bitmap.height);
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const gravar = (tipo: string, q: number) => new Promise<Blob | null>((ok) => tela.toBlob(ok, tipo, q));
  for (const q of [0.86, 0.75, 0.6]) {
    const webp = await gravar("image/webp", q);
    if (webp && webp.type === "image/webp") {
      if (webp.size <= TAMANHO_MAXIMO_DA_IMAGEM) return { blob: webp, extensao: "webp" };
      continue;
    }
    // Safari não grava WebP: JPEG
    const jpg = await gravar("image/jpeg", q);
    if (jpg && jpg.size <= TAMANHO_MAXIMO_DA_IMAGEM) return { blob: jpg, extensao: "jpg" };
  }
  throw new Error("grande");
}
