// O LEITOR PÁGINA A PÁGINA dos quadrinhos (T17d): o que o script faz com o capítulo (src/components/Folheador.astro).
//
// O servidor já desenhou tudo: as páginas (uma embaixo da outra, como sem JavaScript), as duas setas e a fileira de runas, no estado
// da página 1. Este script só: (1) mostra UMA página — a que o endereço pede (`#p5`), ou a 1ª —, escondendo as outras com `hidden`;
// (2) marca a runa dela (`aria-current="page"`, que o CSS faz brilhar); (3) troca o destino das setas (atributos href, title e
// aria-label, com as regras de ./regras); (4) segue o endereço: clicar numa runa ou numa seta muda o `#pN` (o navegador guarda no
// histórico, então "voltar" volta uma página), e o script mostra a página nova; (5) ← e → do teclado fazem o mesmo que as setas.
// Também baixa já a página seguinte e a anterior (loading="eager"), para aparecerem sem espera.
// Nenhum HTML é criado aqui (nada de innerHTML): só atributos, `hidden` e o textContent do aviso para leitor de tela.
//
// ⚠ Vai para o navegador: só importa ./regras (que não importa nada).
import { direcaoDaTecla, paginaDoFragmento, paginasParaBaixar, setasDaPagina, type Destino, type Vizinhanca } from "./regras";

/** O que o script controla, para os testes. */
export interface FolheadorLigado {
  /** A página mostrada (1, 2, 3…). */
  atual(): number;
  /** Mostra a página n (como se o endereço tivesse mudado). */
  mostrar(n: number): void;
}

const ehCampoDeTexto = (alvo: EventTarget | null): boolean => {
  if (!alvo || !(alvo as Element).tagName) return false;
  const el = alvo as HTMLElement;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
};

function ligarSeta(seta: HTMLAnchorElement, destino: Destino | null): void {
  if (destino) {
    seta.setAttribute("href", destino.href);
    seta.setAttribute("title", destino.rotulo);
    seta.setAttribute("aria-label", destino.rotulo);
    seta.classList.remove("ghost");
    seta.removeAttribute("aria-hidden");
  } else {
    seta.removeAttribute("href");
    seta.removeAttribute("title");
    seta.removeAttribute("aria-label");
    seta.classList.add("ghost");
    seta.setAttribute("aria-hidden", "true");
  }
}

/** Liga um leitor. `janela` = a janela do navegador (nos testes, a do DOM simulado). Devolve null se o HTML não tem as peças esperadas. */
export function iniciarFolheador(el: HTMLElement, janela: Window = window): FolheadorLigado | null {
  const paginas = Array.from(el.querySelectorAll<HTMLImageElement>(".comic > img"));
  const runas = Array.from(el.querySelectorAll<HTMLAnchorElement>("a.fl-runa"));
  const anterior = el.querySelector<HTMLAnchorElement>("a.fl-seta.prev");
  const proxima = el.querySelector<HTMLAnchorElement>("a.fl-seta.next");
  const aviso = el.querySelector<HTMLElement>("[data-fl-status]");
  const total = paginas.length;
  if (total === 0 || runas.length !== total || !anterior || !proxima) return null;

  const doCapitulo = (seta: HTMLAnchorElement): Destino | null => {
    const href = seta.dataset["capitulo"];
    return href ? { href, rotulo: seta.dataset["rotuloCapitulo"] ?? "" } : null;
  };
  const vizinhanca: Vizinhanca = {
    capituloAnterior: doCapitulo(anterior),
    proximoCapitulo: doCapitulo(proxima),
    paginaAnterior: anterior.dataset["rotuloPagina"] ?? "",
    proximaPagina: proxima.dataset["rotuloPagina"] ?? "",
  };

  let atual = 0;
  const mostrar = (n: number, porVisitante: boolean): void => {
    if (n === atual) return;
    const focoNaSeta = janela.document.activeElement;
    paginas.forEach((img, i) => {
      img.hidden = i !== n - 1;
    });
    for (const p of paginasParaBaixar(n, total)) paginas[p - 1]?.setAttribute("loading", "eager");
    runas.forEach((runa, i) => (i === n - 1 ? runa.setAttribute("aria-current", "page") : runa.removeAttribute("aria-current")));
    const setas = setasDaPagina(n, total, vizinhanca);
    ligarSeta(anterior, setas.anterior);
    ligarSeta(proxima, setas.proxima);
    el.dataset["pagina"] = String(n);
    atual = n;
    if (!porVisitante) return;
    if (aviso) aviso.textContent = runas[n - 1]?.getAttribute("aria-label") ?? "";
    // a seta que estava com o foco sumiu (fim do capítulo mais recente): o foco vai para a runa da página
    if ((focoNaSeta === anterior || focoNaSeta === proxima) && focoNaSeta.classList.contains("ghost")) runas[n - 1]?.focus();
    // quem estava lá embaixo (no fim de uma página comprida) volta ao começo da página nova
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  };

  const paginaDoEndereco = (): number | null => {
    const fragmento = janela.location.hash;
    // sem fragmento (o "voltar" até o endereço do capítulo) = página 1; outro fragmento (ex.: a volta do login) não é com o leitor
    return paginaDoFragmento(fragmento, total) ?? (fragmento === "" || fragmento === "#" ? 1 : null);
  };

  mostrar(paginaDoEndereco() ?? 1, false);
  el.dataset["ligado"] = "";

  janela.addEventListener("hashchange", () => {
    if (!el.isConnected) return;
    const n = paginaDoEndereco();
    if (n !== null) mostrar(n, true);
  });

  janela.document.addEventListener("keydown", (e) => {
    const direcao = direcaoDaTecla({ key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, emCampoDeTexto: ehCampoDeTexto(e.target) });
    if (!direcao || !el.isConnected) return;
    // só quando o leitor está na tela (quem está lendo os comentários lá embaixo usa as setas para outra coisa)
    const caixa = el.getBoundingClientRect();
    if (caixa.bottom <= 0 || caixa.top >= janela.innerHeight) return;
    const href = (direcao === "anterior" ? anterior : proxima).getAttribute("href");
    if (!href) return;
    e.preventDefault();
    if (href.startsWith("#")) janela.location.hash = href;
    else janela.location.assign(href);
  });

  return { atual: () => atual, mostrar: (n) => mostrar(n, true) };
}

/** Liga todos os leitores da página (só há um por capítulo). */
export function iniciarFolheadores(raiz: ParentNode = document): void {
  for (const el of raiz.querySelectorAll<HTMLElement>("[data-folheador]")) iniciarFolheador(el);
}
