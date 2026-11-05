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
import { animarEntrada } from "../comentarios/dom";
import { textosComPadrao } from "../comentarios/regras";
import { erroDoRetornoDoLogin, janelaDeLogin, textosDoLogin, type EstadoDoLogin } from "../login/janela";
import { clienteDoSupabase } from "../supabase/cliente";
import {
  horariosDaSequencia,
  RUNAS_SORTEADAS,
  sequenciaDeRunas,
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

/** O "pulo" da estrela ao ser clicada (05/11, GIF do autor): encolhe, cresce e volta, com um círculo que sai dela e desvanece (CSS). */
function pular(botao: HTMLElement): void {
  botao.classList.remove("fav-pulo");
  void botao.offsetWidth; // recomeça a animação se o clique anterior ainda não terminou
  botao.classList.add("fav-pulo");
  setTimeout(() => botao.classList.remove("fav-pulo"), 700);
}

/** A cena da estrela grande do aviso: a estrela (vazia e cheia, uma por cima da outra), o círculo do clique e o cursor. */
function cenaDaEstrela(): HTMLDivElement {
  const cena = document.createElement("div");
  cena.className = "fav-cena";
  cena.setAttribute("aria-hidden", "true");
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "fav-grande");
  s.setAttribute("focusable", "false");
  const defs = document.createElementNS(SVG, "defs");
  const g = document.createElementNS(SVG, "linearGradient");
  g.id = "fav-degrade";
  for (const [k, v] of [["x1", "0"], ["y1", "0"], ["x2", "0"], ["y2", "1"]] as const) g.setAttribute(k, v);
  for (const [offset, cor] of [["0", "#2ee0b0"], ["1", "#00e9fd"]] as const) {
    const st = document.createElementNS(SVG, "stop");
    st.setAttribute("offset", offset);
    st.setAttribute("stop-color", cor);
    g.appendChild(st);
  }
  defs.appendChild(g);
  const vazia = document.createElementNS(SVG, "path");
  vazia.setAttribute("d", PONTAS_DA_ESTRELA);
  vazia.setAttribute("class", "fav-grande-vazia");
  const cheia = document.createElementNS(SVG, "path");
  cheia.setAttribute("d", PONTAS_DA_ESTRELA);
  cheia.setAttribute("class", "fav-grande-cheia");
  s.append(defs, vazia, cheia);
  const circulo = document.createElement("span");
  circulo.className = "fav-cena-circulo";
  const cursor = document.createElementNS(SVG, "svg");
  cursor.setAttribute("viewBox", "0 0 24 24");
  cursor.setAttribute("class", "fav-cursor");
  cursor.setAttribute("focusable", "false");
  const seta = document.createElementNS(SVG, "path");
  seta.setAttribute("d", "M4 2.5l14.5 8.7-6.3 1.3 3.6 7.4-2.9 1.4-3.5-7.5L4.6 18.5z");
  cursor.appendChild(seta);
  const estrelaQuePula = document.createElement("span");
  estrelaQuePula.className = "fav-cena-estrela";
  estrelaQuePula.appendChild(s);
  cena.append(circulo, estrelaQuePula, cursor);
  return cena;
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
    const obra = Object.hasOwn(cfg.obras, titulo) ? cfg.obras[titulo] : undefined;
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
      pular(botao);
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
    const runas = c.obra && Object.hasOwn(cfg.runas, c.obra) ? cfg.runas[c.obra] : undefined;
    if (semMovimento || !runas || c.botao.getAttribute("aria-pressed") === "true") return;
    const seq = sequenciaDeRunas(runas);
    const { entradas, estrela } = horariosDaSequencia(RUNAS_SORTEADAS, runas.finais.length);
    c.botao.classList.add("fav-girando");
    seq.forEach((r, i) => {
      c.relogios.push(window.setTimeout(() => (c.runa.textContent = r), entradas[i] ?? 0));
    });
    c.relogios.push(window.setTimeout(() => c.botao.classList.remove("fav-girando"), estrela));
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

  // um pedido por obra de cada vez: clique enquanto o anterior não voltou é ignorado (dois cliques rápidos podiam chegar ao banco fora
  // de ordem e deixar a estrela diferente do que ficou gravado; revisão de 03/11)
  const pendentes = new Set<string>();
  async function alternar(obra: string): Promise<void> {
    if (!usuario || pendentes.has(obra)) return;
    pendentes.add(obra);
    try {
      await alternarAgora(obra);
    } finally {
      pendentes.delete(obra);
    }
  }
  async function alternarAgora(obra: string): Promise<void> {
    if (!usuario) return;
    const eu = usuario;
    const conjunto = favoritos;
    const tinha = favoritos.has(obra);
    if (tinha) favoritos.delete(obra);
    else favoritos.add(obra);
    desenhar();
    const r = tinha
      ? await sb.from("favorites").delete().eq("user_id", usuario).eq("work_id", obra)
      : await sb.from("favorites").upsert({ user_id: usuario, work_id: obra }, { onConflict: "user_id,work_id", ignoreDuplicates: true });
    if (!r.error) return;
    // a pessoa saiu (ou trocou de conta) enquanto o pedido ia e voltava: não mexe nos favoritos de agora
    if (eu !== usuario || conjunto !== favoritos) return;
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

  // ── a janela de login (a mesma da caixa de comentários, ../login/janela.ts) ──
  const estadoDoLogin: EstadoDoLogin = { modo: "login", trocandoSenha: false, erro: null, aviso: null };
  const login = janelaDeLogin({
    sb,
    T: textosComPadrao(cfg.ui),
    lang: cfg.lang,
    titulo: textosDoLogin(cfg.lang).titulo,
    estado: estadoDoLogin,
    depoisDaSenhaNova: () => (usuario ? login.fechar() : login.redesenhar()),
  });

  // ── a janela "este recurso exige login" (05/11, design do autor "favorito design.png") ──
  // A estrela grande em cima tem uma cena que se repete (só CSS, Favoritos.astro): o cursor aparece, clica na estrela (ela enche, com o
  // mesmo "pulo" da estrela das capas), vai embora, volta e clica de novo (ela esvazia). Criar conta / Entrar fecham o aviso e abrem a
  // janela de login na aba certa.
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
    titulo.textContent = T.janelaTitulo;
    const texto = document.createElement("p");
    texto.textContent = T.janelaTexto;
    const botoes = document.createElement("div");
    botoes.className = "fav-botoes";
    const criar = document.createElement("button");
    criar.type = "button";
    criar.className = "button";
    criar.textContent = T.criarConta;
    const entrar = document.createElement("button");
    entrar.type = "button";
    entrar.className = "button";
    entrar.textContent = T.entrar;
    botoes.append(criar, entrar);
    caixa.append(x, cenaDaEstrela(), titulo, texto, botoes);
    janela.appendChild(caixa);
    const fechar = (devolverFoco = true) => {
      janela.remove();
      document.documentElement.classList.remove("fav-modal-aberta");
      if (devolverFoco && origem.isConnected) origem.focus({ preventScroll: true });
    };
    const irParaOLogin = (modo: EstadoDoLogin["modo"]) => {
      fechar(false);
      // ao fechar a janela de login, o foco volta para a estrela (ou o filtro) que abriu o aviso
      if (origem.isConnected) origem.focus({ preventScroll: true });
      estadoDoLogin.modo = modo;
      login.abrir();
    };
    x.addEventListener("click", () => fechar());
    criar.addEventListener("click", () => irParaOLogin("signup"));
    entrar.addEventListener("click", () => irParaOLogin("login"));
    janela.addEventListener("mousedown", (e) => {
      if (e.target === janela) fechar();
    });
    const focaveis = [x, criar, entrar];
    janela.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "Tab") {
        // o foco fica dentro da janela
        e.preventDefault();
        const i = focaveis.indexOf(document.activeElement as HTMLButtonElement);
        const proximo = focaveis[(i + (e.shiftKey ? focaveis.length - 1 : 1)) % focaveis.length] ?? criar;
        proximo.focus();
      }
    });
    document.body.appendChild(janela);
    document.documentElement.classList.add("fav-modal-aberta");
    animarEntrada(janela, caixa);
    entrar.focus();
  }

  desenhar();
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "PASSWORD_RECOVERY") {
      estadoDoLogin.trocandoSenha = true;
      setTimeout(() => login.abrir(), 0);
    }
    const novo = sessao?.user?.id ?? null;
    if (novo && login.aberta() && !estadoDoLogin.trocandoSenha) setTimeout(() => login.fechar(), 0);
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
  // 05/11: o login pode ter começado aqui (aviso dos favoritos → Entrar): se voltou com erro, ele aparece na mensagem da seção
  const erroDoLogin = erroDoRetornoDoLogin(location.hash, location.search, cfg.lang);
  if (erroDoLogin) {
    const aviso = document.createElement("p");
    aviso.className = "c-msg fav-erro-do-login";
    aviso.setAttribute("role", "alert");
    aviso.textContent = erroDoLogin;
    document.querySelector(".stories-block .stories-head")?.after(aviso);
  }
  const sb = clienteDoSupabase(cfg.url, cfg.key);
  document.querySelectorAll<HTMLElement>(".stories-block").forEach((secao) => iniciarFavoritos(secao, cfg, sb));
}
