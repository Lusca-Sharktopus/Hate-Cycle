// Histórias favoritas no navegador (03/11/2026, só no site novo; regras em ./regras.ts).
//
// Quem carrega: src/components/Favoritos.astro, só nas páginas com a seção de Histórias (SecaoHistorias) e só se o site tem login
// (as chaves do Supabase). Nada disso existe no HTML do servidor: sem JavaScript, a página fica como sempre.
//
// O que monta: uma estrela no canto de cima de cada capa (aparece com o mouse em cima da capa; fica à vista quando a história é
// favorita) e, no começo do seletor, o botão de estrela que mostra só as favoritas. Sem conta, os dois abrem a janela que avisa que o
// recurso exige login. Com conta, os favoritos ficam na tabela public.favorites (migração 20261103060000), pela MESMA conexão dos
// comentários e do marca-página (src/scripts/supabase/cliente.ts).
//
// Segurança: tudo é criado com createElement/textContent/setAttribute (nada de innerHTML); o título do cartão só entra como texto.
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteDoSupabase } from "../supabase/cliente";
import {
  sequenciaDeRunas,
  TEMPO_DA_RUNA_FINAL,
  TEMPO_DE_CADA_RUNA,
  cartaoFora,
  favoritosDoBanco,
  lerConfiguracaoDosFavoritos,
  textosDosFavoritos,
  type ConfiguracaoDosFavoritos,
  type TextosDosFavoritos,
} from "./regras";

const SVG = "http://www.w3.org/2000/svg";
const PONTAS_DA_ESTRELA = "M12 2.6l2.85 6.05 6.65.75-4.95 4.5 1.4 6.55L12 17.1l-5.95 3.35 1.4-6.55L2.5 9.4l6.65-.75z";

function estrela(): SVGSVGElement {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", PONTAS_DA_ESTRELA);
  s.appendChild(p);
  return s;
}

/** Liga as estrelas e o filtro numa seção de Histórias. Exportada para o teste (tests/favoritos-dom.test.ts). */
export function iniciarFavoritos(secao: HTMLElement, cfg: ConfiguracaoDosFavoritos, sb: SupabaseClient): void {
  const grade = secao.querySelector<HTMLElement>(".works");
  const seletor = secao.querySelector<HTMLElement>(".sorter");
  if (!grade) return;
  const T: TextosDosFavoritos = textosDosFavoritos(cfg.lang);

  let usuario: string | null = null;
  let favoritos = new Set<string>();
  let filtro = false;

  // ── a mensagem (lista vazia com o filtro, erro ao salvar) ──
  const aviso = document.createElement("p");
  aviso.className = "fav-aviso";
  aviso.setAttribute("role", "status");
  aviso.hidden = true;
  grade.after(aviso);
  let erroAte = 0;

  // ── as estrelas das capas ──
  // Cada capa ganha uma "janelinha" recortada no canto de cima (.fav-janela, overflow: hidden): a caixinha da estrela mora ali, escondida
  // acima da borda, e desce quando o mouse entra na capa (classe fav-ver), passando pelas runas da obra antes de virar estrela.
  const semMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cartoes = [...grade.querySelectorAll<HTMLElement>(".work-card")].map((el) => {
    const titulo = el.dataset["title"] ?? "";
    const obra = cfg.obras[titulo];
    el.classList.add("fav-card");
    const janela = document.createElement("span");
    janela.className = "fav-janela";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "fav-estrela";
    const runa = document.createElement("span");
    runa.className = "fav-runa";
    runa.setAttribute("aria-hidden", "true");
    botao.append(estrela(), runa);
    janela.appendChild(botao);
    botao.addEventListener("click", (e) => {
      e.preventDefault();
      if (!usuario) return abrirAviso(botao);
      if (obra) void alternar(obra);
    });
    const capa = el.querySelector(":scope > img, :scope > .nocover");
    if (capa) capa.after(janela);
    else el.prepend(janela);
    const c = { el, titulo, obra, botao, janela, runa, relogios: [] as number[] };
    // a capa pode virar um bloco liso se a imagem não carregar (WorkCard.astro): por isso a capa é procurada na hora
    const naCapa = (n: EventTarget | null) =>
      n instanceof Node && (janela.contains(n) || n === el.querySelector(":scope > img, :scope > .nocover"));
    el.addEventListener("pointerover", (e) => {
      if (naCapa(e.target) && !el.classList.contains("fav-ver")) revelar(c);
    });
    el.addEventListener("pointerout", (e) => {
      if (naCapa(e.target) && !naCapa(e.relatedTarget)) esconder(c);
    });
    botao.addEventListener("focus", () => {
      if (!el.classList.contains("fav-ver")) revelar(c);
    });
    botao.addEventListener("blur", () => {
      if (!botao.matches(":hover")) esconder(c);
    });
    return c;
  });

  type Cartao = (typeof cartoes)[number];
  function parar(c: Cartao): void {
    for (const r of c.relogios) clearTimeout(r);
    c.relogios = [];
    c.botao.classList.remove("fav-girando");
  }
  function revelar(c: Cartao): void {
    parar(c);
    c.el.classList.add("fav-ver");
    // já favorita (a estrela cheia estava à vista), sem movimento, ou obra sem runas: só a estrela
    const runas = c.obra ? cfg.runas[c.obra] : undefined;
    if (semMovimento || !runas || c.botao.getAttribute("aria-pressed") === "true") return;
    const seq = sequenciaDeRunas(runas);
    c.botao.classList.add("fav-girando");
    seq.forEach((r, i) => {
      c.relogios.push(window.setTimeout(() => (c.runa.textContent = r), i * TEMPO_DE_CADA_RUNA));
    });
    c.relogios.push(window.setTimeout(() => c.botao.classList.remove("fav-girando"), (seq.length - 1) * TEMPO_DE_CADA_RUNA + TEMPO_DA_RUNA_FINAL));
  }
  function esconder(c: Cartao): void {
    parar(c);
    c.el.classList.remove("fav-ver");
  }

  // ── o filtro, no começo do seletor ──
  const botaoDoFiltro = document.createElement("button");
  botaoDoFiltro.type = "button";
  botaoDoFiltro.className = "fav-filtro";
  botaoDoFiltro.appendChild(estrela());
  botaoDoFiltro.addEventListener("click", () => {
    if (!usuario) return abrirAviso(botaoDoFiltro);
    filtro = !filtro;
    desenhar();
  });
  if (seletor) seletor.prepend(botaoDoFiltro);
  else grade.before(botaoDoFiltro);
  // o seletor (busca, tipo, ordem) mexe nos cartões: depois de cada mudança dele, refaz a mensagem
  seletor?.addEventListener("input", () => setTimeout(desenhar, 0));
  seletor?.addEventListener("change", () => setTimeout(desenhar, 0));

  function desenhar(): void {
    for (const c of cartoes) {
      const fav = c.obra !== undefined && favoritos.has(c.obra);
      c.botao.setAttribute("aria-pressed", String(fav));
      const rotulo = fav ? T.desfavoritar(c.titulo) : T.favoritar(c.titulo);
      c.botao.setAttribute("aria-label", rotulo);
      c.botao.title = rotulo;
      c.el.classList.toggle("fav-fora", cartaoFora(c.obra, filtro, favoritos));
    }
    botaoDoFiltro.setAttribute("aria-pressed", String(filtro));
    const rotulo = filtro ? T.filtroDesligar : T.filtroLigar;
    botaoDoFiltro.setAttribute("aria-label", rotulo);
    botaoDoFiltro.title = rotulo;
    // lista vazia por causa do filtro (e não da busca: aí o "Nenhuma história encontrada" do seletor já aparece)
    const semResultadoDaBusca = secao.querySelector<HTMLElement>(".no-results:not([hidden])");
    const sobrou = cartoes.some((c) => !c.el.hidden && !c.el.classList.contains("fav-fora"));
    if (Date.now() < erroAte) return;
    if (filtro && !sobrou && !semResultadoDaBusca) {
      aviso.textContent = favoritos.size ? T.nenhumaAqui : T.vazio;
      aviso.hidden = false;
    } else aviso.hidden = true;
  }

  async function alternar(obra: string): Promise<void> {
    if (!usuario) return;
    const tinha = favoritos.has(obra);
    if (tinha) favoritos.delete(obra);
    else favoritos.add(obra);
    desenhar();
    const r = tinha
      ? await sb.from("favorites").delete().eq("user_id", usuario).eq("work_id", obra)
      : await sb.from("favorites").upsert({ user_id: usuario, work_id: obra }, { onConflict: "user_id,work_id", ignoreDuplicates: true });
    if (!r.error) return;
    // não salvou: volta como estava e avisa por alguns segundos
    if (tinha) favoritos.add(obra);
    else favoritos.delete(obra);
    erroAte = Date.now() + 4000;
    aviso.textContent = T.erro;
    aviso.hidden = false;
    desenhar();
    setTimeout(desenhar, 4100);
  }

  async function carregar(): Promise<void> {
    if (!usuario) {
      favoritos = new Set();
      filtro = false;
      desenhar();
      return;
    }
    const eu = usuario;
    const { data, error } = await sb.from("favorites").select("work_id").eq("user_id", eu);
    if (eu !== usuario) return; // a pessoa saiu (ou trocou de conta) no meio do caminho
    favoritos = error ? new Set() : favoritosDoBanco(data);
    desenhar();
  }

  // ── a janela "este recurso exige login" ──
  function abrirAviso(origem: HTMLElement): void {
    document.querySelector(".fav-modal")?.remove();
    const janela = document.createElement("div");
    janela.className = "fav-modal";
    janela.setAttribute("role", "dialog");
    janela.setAttribute("aria-modal", "true");
    janela.setAttribute("aria-labelledby", "fav-modal-titulo");
    const caixa = document.createElement("div");
    caixa.className = "fav-dialogo";
    const x = document.createElement("button");
    x.type = "button";
    x.className = "fav-x";
    x.setAttribute("aria-label", T.fechar);
    x.textContent = "×";
    const titulo = document.createElement("h3");
    titulo.id = "fav-modal-titulo";
    titulo.appendChild(estrela());
    titulo.append(T.janelaTitulo);
    const texto = document.createElement("p");
    texto.textContent = T.janelaTexto;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "button";
    ok.textContent = T.entendi;
    caixa.append(x, titulo, texto, ok);
    janela.appendChild(caixa);
    const fechar = () => {
      janela.remove();
      document.documentElement.classList.remove("fav-modal-aberta");
      if (origem.isConnected) origem.focus({ preventScroll: true });
    };
    x.addEventListener("click", fechar);
    ok.addEventListener("click", fechar);
    janela.addEventListener("mousedown", (e) => {
      if (e.target === janela) fechar();
    });
    janela.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "Tab") {
        // só dois botões: o foco fica dentro da janela
        e.preventDefault();
        (document.activeElement === ok ? x : ok).focus();
      }
    });
    document.body.appendChild(janela);
    document.documentElement.classList.add("fav-modal-aberta");
    ok.focus();
  }

  desenhar();
  sb.auth.onAuthStateChange((_evento, sessao) => {
    const novo = sessao?.user?.id ?? null;
    if (novo === usuario) return;
    usuario = novo;
    // fora do callback do supabase-js (ele pede para não esperar outras chamadas aqui dentro)
    setTimeout(() => void carregar(), 0);
  });
}

declare global {
  interface Window {
    HC_FAV?: unknown;
  }
}

const cfg = typeof window !== "undefined" ? lerConfiguracaoDosFavoritos(window.HC_FAV) : null;
if (cfg) {
  const sb = clienteDoSupabase(cfg.url, cfg.key);
  document.querySelectorAll<HTMLElement>(".stories-block").forEach((secao) => iniciarFavoritos(secao, cfg, sb));
}
