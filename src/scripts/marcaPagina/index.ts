// O marca-página no navegador (03/11/2026): só nos capítulos de texto (Leitor.astro → MarcaPagina.astro). Regras em ./regras.ts.
//
// Monta, ao lado do texto (.reader-box .prose.story), uma FAIXA na margem direita (clique = o marcador vai para a altura do clique) e o
// MARCADOR (a aba com a logo, que dá para arrastar; com o teclado, as setas andam de parágrafo em parágrafo). Nada disso existe no HTML
// do servidor: sem JavaScript, o capítulo fica como sempre.
//
// Onde guarda: sem conta, no localStorage deste navegador (CHAVE_DAS_MARCAS); com conta, na tabela public.bookmarks (migração
// 20261103020000), pela MESMA conexão da caixa de comentários (src/scripts/supabase/cliente.ts). Ao entrar, os do navegador sobem para a
// conta só onde a conta não tem (a conta tem prioridade) e saem do navegador. Sem nenhum aviso ou convite (decisão do autor, 03/11).
import iconeUrl from "../../assets/marca-pagina/hc-branco.png?url";
import { clienteDoSupabase } from "../supabase/cliente";
import {
  alturaDaAncora,
  ancoraDaAltura,
  ancoraValida,
  CHAVE_DAS_MARCAS,
  idDoCapitulo,
  lerMarcas,
  marcasQueSobem,
  textosDoIdioma,
  type Ancora,
  type Bloco,
} from "./regras";

const texto = document.querySelector<HTMLElement>(".reader-box .prose.story");
const caixa = texto?.closest<HTMLElement>(".reader-box") ?? null;
const id = idDoCapitulo(location.pathname);
if (texto && caixa && id) iniciar(texto, caixa, id);

function guardado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function guardar(chave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    /* navegador sem localStorage (janela privada…): o marca-página dura até fechar a página */
  }
}

function iniciar(texto: HTMLElement, caixa: HTMLElement, id: string): void {
  const T = textosDoIdioma(document.documentElement.lang || "pt");
  const hc = (window as unknown as { HC?: { url?: unknown; key?: unknown } }).HC;
  const sb = hc && typeof hc.url === "string" && typeof hc.key === "string" && hc.url && hc.key ? clienteDoSupabase(hc.url, hc.key) : null;

  let ancora: Ancora | null = null;
  let usuario: string | null = null;
  let salvarDepois: number | undefined;

  // ── os elementos ──
  caixa.classList.add("mp-caixa");
  const faixa = document.createElement("div");
  faixa.className = "mp-faixa";
  faixa.title = T.faixa;
  faixa.setAttribute("aria-hidden", "true");
  const marcador = document.createElement("button");
  marcador.type = "button";
  marcador.className = "mp-marcador mp-vazio";
  marcador.title = T.dica;
  const ponta = document.createElement("span");
  ponta.className = "mp-ponta";
  ponta.setAttribute("aria-hidden", "true");
  const aba = document.createElement("span");
  aba.className = "mp-aba";
  const icone = document.createElement("img");
  icone.src = iconeUrl;
  icone.alt = "";
  icone.draggable = false;
  aba.appendChild(icone);
  marcador.append(ponta, aba);
  caixa.append(faixa, marcador);

  // ── medidas (tudo em px, relativo à caixa) ──
  const blocos = (): Bloco[] => {
    const base = texto.getBoundingClientRect().top;
    return [...texto.children]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { topo: r.top - base, altura: r.height };
      });
  };
  let y = 0; // altura do marcador, do topo do texto
  function desenhar(): void {
    const rc = caixa.getBoundingClientRect();
    const rt = texto.getBoundingClientRect();
    const larguraDaTela = document.documentElement.clientWidth;
    const topo = rt.top - rc.top;
    // espaço à direita do texto até a borda da tela: a faixa ocupa tudo; a aba cabe nele (entre 28 e 96 px)
    const inicio = rt.right - rc.left + 4;
    const fim = Math.min(larguraDaTela - rc.left - 2, rc.width + 200);
    // a aba (s) e a ponta (~0,3·s à esquerda dela) cabem entre o texto e a borda da tela; no celular a aba fica pequena (22 px)
    const s = Math.max(22, Math.min(96, (fim - inicio - 6) / 1.3));
    const esquerdaDaAba = Math.max(inicio + s * 0.3, Math.min(rc.width, fim - s - 4));
    caixa.style.setProperty("--mp-s", `${s}px`);
    faixa.style.left = `${inicio}px`;
    faixa.style.width = `${Math.max(0, fim - inicio)}px`;
    faixa.style.top = `${topo}px`;
    faixa.style.height = `${rt.height}px`;
    marcador.style.left = `${esquerdaDaAba}px`;
    marcador.style.top = `${topo + Math.max(0, Math.min(rt.height, y))}px`;
  }
  function colocar(novaAltura: number): void {
    const h = texto.getBoundingClientRect().height;
    y = Math.max(0, Math.min(h, novaAltura));
    desenhar();
  }
  function mostrarAncora(a: Ancora | null): void {
    ancora = a;
    marcador.classList.toggle("mp-vazio", !a);
    colocar(a ? alturaDaAncora(blocos(), a) : 0);
    const total = blocos().length;
    marcador.setAttribute("aria-label", a ? T.onde(a.paragrafo + 1, total) : `${T.rotulo}. ${T.dica}`);
  }

  // ── guardar ──
  function guardarAqui(): void {
    const a = ancoraDaAltura(blocos(), y);
    ancora = a;
    marcador.classList.remove("mp-vazio");
    marcador.setAttribute("aria-label", T.onde(a.paragrafo + 1, blocos().length));
    window.clearTimeout(salvarDepois);
    salvarDepois = window.setTimeout(() => void enviar(a), 500);
  }
  async function enviar(a: Ancora): Promise<void> {
    if (sb && usuario) {
      await sb
        .from("bookmarks")
        .upsert({ user_id: usuario, page_id: id, paragrafo: a.paragrafo, fracao: a.fracao }, { onConflict: "user_id,page_id" });
      // com conta, nunca cai no navegador (revisão de 03/11): num computador compartilhado, a posição de uma pessoa ficaria para a
      // próxima e subiria para a conta dela; sem rede, o marcador fica onde está nesta página e a próxima gravação tenta de novo
      return;
    }
    const marcas = lerMarcas(guardado(CHAVE_DAS_MARCAS));
    marcas[id] = { p: a.paragrafo, f: a.fracao, t: Date.now() };
    guardar(CHAVE_DAS_MARCAS, JSON.stringify(marcas));
  }

  // ── ler (navegador ou conta) ──
  function doNavegador(): Ancora | null {
    const m = lerMarcas(guardado(CHAVE_DAS_MARCAS))[id];
    return m ? { paragrafo: m.p, fracao: m.f } : null;
  }
  async function daConta(): Promise<Ancora | null> {
    if (!sb || !usuario) return null;
    // .eq("user_id") além do RLS (revisão de 03/11): se um dia uma policy deixar alguém ler mais (um admin), aqui continua só o próprio
    const { data, error } = await sb.from("bookmarks").select("paragrafo, fracao").eq("user_id", usuario).eq("page_id", id).maybeSingle();
    if (error) return doNavegador();
    return ancoraValida(data);
  }
  async function subirDoNavegador(): Promise<void> {
    if (!sb || !usuario) return;
    const marcas = lerMarcas(guardado(CHAVE_DAS_MARCAS));
    if (!Object.keys(marcas).length) return;
    const { data, error } = await sb.from("bookmarks").select("page_id").eq("user_id", usuario);
    if (error) return;
    const jaTem = new Set(((data ?? []) as { page_id: string }[]).map((l) => l.page_id));
    const sobem = marcasQueSobem(marcas, jaTem).map((m) => ({ ...m, user_id: usuario }));
    if (sobem.length) {
      const r = await sb.from("bookmarks").upsert(sobem, { onConflict: "user_id,page_id", ignoreDuplicates: true });
      if (r.error) return; // fica no navegador; tenta de novo na próxima entrada
    }
    guardar(CHAVE_DAS_MARCAS, null);
  }

  // ── eventos ──
  faixa.addEventListener("click", (e) => {
    colocar(e.clientY - texto.getBoundingClientRect().top);
    guardarAqui();
  });
  let arrastando = false;
  marcador.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    arrastando = true;
    marcador.setPointerCapture(e.pointerId);
    marcador.classList.add("mp-arrastando");
    e.preventDefault();
  });
  marcador.addEventListener("pointermove", (e) => {
    if (arrastando) colocar(e.clientY - texto.getBoundingClientRect().top);
  });
  const soltar = () => {
    if (!arrastando) return;
    arrastando = false;
    marcador.classList.remove("mp-arrastando");
    guardarAqui();
  };
  marcador.addEventListener("pointerup", soltar);
  marcador.addEventListener("pointercancel", soltar);
  marcador.addEventListener("keydown", (e) => {
    const bs = blocos();
    if (!bs.length) return;
    const atual = ancora ?? ancoraDaAltura(bs, y);
    let i = atual.paragrafo;
    if (e.key === "ArrowDown") i = Math.min(bs.length - 1, i + 1);
    else if (e.key === "ArrowUp") i = Math.max(0, atual.fracao > 0.05 ? i : i - 1);
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = bs.length - 1;
    else return;
    e.preventDefault();
    colocar(alturaDaAncora(bs, { paragrafo: i, fracao: 0 }));
    guardarAqui();
    marcador.scrollIntoView({ block: "nearest" });
  });
  // a página muda de tamanho (tela girada, fontes e imagens carregando): o marcador volta para a mesma âncora
  const refazer = () => (ancora ? mostrarAncora(ancora) : desenhar());
  new ResizeObserver(refazer).observe(texto);
  window.addEventListener("resize", refazer);

  // ── começo ──
  mostrarAncora(doNavegador());
  if (sb) {
    sb.auth.onAuthStateChange((_evento, sessao) => {
      const novo = sessao?.user?.id ?? null;
      if (novo === usuario) return;
      usuario = novo;
      // fora do callback do supabase-js (ele pede para não esperar outras chamadas aqui dentro)
      window.setTimeout(() => {
        if (usuario) void subirDoNavegador().then(daConta).then((a) => mostrarAncora(a));
        else mostrarAncora(doNavegador());
      }, 0);
    });
  }
}
