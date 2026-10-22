// @vitest-environment happy-dom
//
// O script dos posts em moldura isolada (src/scripts/embeds/bloco.ts → iniciarPosts(), a mesma função que o site chama) num DOM simulado
// (happy-dom, no padrão de tests/comentarios-dom.test.ts). O HTML é o que o build produz de verdade (tirarScriptsDosPosts sobre o código
// de incorporação do Reddit, do X e do Instagram). Confere:
//   - sem o script: só o blockquote do autor (o que o visitante sem JavaScript vê, como antes);
//   - com o script, SEM CLIQUE: cada post vira a moldura com os MESMOS atributos, estilos e estrutura do script oficial (X: caixa antes do
//     blockquote, escondida até a primeira altura; Reddit/Instagram: o iframe no lugar do blockquote), mais o sandbox; nunca srcdoc; a
//     origem é a do serviço; nenhum <script> criado;
//   - mensagens: só a da janela da moldura, da origem do serviço, no formato do serviço (os formatos reais), com altura limitada e 0
//     ignorado — qualquer outra é ignorada;
//   - serviço que não responde: a moldura sai e o blockquote fica/volta;
//   - painéis escondidos (.embed-alt): a moldura só nasce quando o painel aparece;
//   - o endereço da página que vai ao serviço nunca leva a busca nem a âncora (#access_token).
// Como o happy-dom não tem a janela de dentro do <iframe> nem layout, o teste entrega uma janela de mentira (`janelaDaMoldura`) e diz
// quando cada .embed "aparece" (`quandoAparecer`); mensagens são entregues com `dispatchEvent(new MessageEvent(...))`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { tirarScriptsDosPosts } from "../src/lib/postsIncorporados";
import { iniciarPosts, TEMPO_SEM_RESPOSTA_MS } from "../src/scripts/embeds/bloco";
import { SANDBOX_DA_MOLDURA, SANDBOX_DO_REDDIT } from "../src/scripts/embeds/regras";

const REDDIT = `<div class="embed"><blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="658"><a href="https://www.reddit.com/r/SpeculativeEvolution/comments/1pdn94f/day_3_of_drawing_a_spec_evo_creature_from_my/">Day 3</a><br> by <a href="https://www.reddit.com/user/LuscaSharktopus/">u/LuscaSharktopus</a></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script></div>`;
const X = `<div class="embed"><blockquote class="twitter-tweet"><p lang="pt" dir="ltr">Nova raça</p>&mdash; Lusca (@KingOfAllOceans) <a href="https://x.com/KingOfAllOceans/status/1785040192421663088?ref_src=twsrc%5Etfw">April 29, 2024</a></blockquote><script async src="https://platform.x.com/widgets.js" charset="utf-8"></script></div>`;
const X2 = `<div class="embed"><blockquote class="twitter-tweet"><a href="https://x.com/KingOfAllOceans/status/1786071228421148897"></a></blockquote><script async src="https://platform.x.com/widgets.js" charset="utf-8"></script></div>`;
const INSTA = `<div class="embed"><blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"><a href="https://www.instagram.com/reel/DIb1JCngpAL/">v</a></blockquote><script async src="//www.instagram.com/embed.js"></script></div>`;
const ALT = `<div class="embed-alt"><div class="embed-panels"><div class="embed-panel is-on">${X}</div><div class="embed-panel">${REDDIT}</div><div class="embed-panel">${INSTA}</div></div></div>`;

const PAGINA = "https://hatecycle.com/pt/news/2024-04-29-hygranocianos/";
const ORIGEM = { x: "https://platform.twitter.com", reddit: "https://embed.reddit.com", instagram: "https://www.instagram.com" } as const;

/** A "janela de dentro" de cada iframe: um objeto qualquer, para o teste dizer de quem veio a mensagem. */
const janelas = new Map<Element, object>();
const janelaDaMoldura = (f: HTMLIFrameElement): object => {
  let j = janelas.get(f);
  if (!j) janelas.set(f, (j = { nome: "janela da moldura" }));
  return j;
};

// O happy-dom escreve, a cada <iframe> criado, "Iframe page loading is disabled" (é de propósito: nenhum pedido de rede nos testes).
const escreverNoStderr = process.stderr.write.bind(process.stderr);
beforeAll(() => {
  process.stderr.write = ((texto: string | Uint8Array, ...resto: unknown[]) =>
    String(texto).includes("Iframe page loading is disabled") ? true : (escreverNoStderr as (...a: unknown[]) => boolean)(texto, ...resto)) as typeof process.stderr.write;
});
afterAll(() => {
  process.stderr.write = escreverNoStderr;
});

/** Quem "aparece" na tela: por padrão, todo .embed que não está num .embed-panel desligado. `mostrarPainel(i)` faz o painel i aparecer. */
let esperando: { el: HTMLElement; pronto: () => void }[] = [];
const visivel = (el: HTMLElement) => !el.closest(".embed-panel:not(.is-on)");
const quandoAparecer = (el: HTMLElement, pronto: () => void) => {
  if (visivel(el)) {
    pronto();
    return () => {};
  }
  const item = { el, pronto };
  esperando.push(item);
  return () => {
    esperando = esperando.filter((e) => e !== item);
  };
};
function mostrarPainel(i: number) {
  document.querySelectorAll(".embed-panel").forEach((p, j) => p.classList.toggle("is-on", i === j));
  for (const e of [...esperando]) {
    if (!visivel(e.el)) continue;
    esperando = esperando.filter((x) => x !== e);
    e.pronto();
  }
}

let desligar: () => void = () => {};
function montar(html: string, opcoes: { tempoSemResposta?: number; semScript?: boolean } = {}) {
  document.body.innerHTML = `<main>${tirarScriptsDosPosts(html).html}</main>`; // (só o teste monta HTML; o código do site não)
  if (!opcoes.semScript) desligar = iniciarPosts(document, { janela: window, janelaDaMoldura, quandoAparecer, ...(opcoes.tempoSemResposta === undefined ? {} : { tempoSemResposta: opcoes.tempoSemResposta }) });
}
const iframes = () => [...document.querySelectorAll<HTMLIFrameElement>("iframe")];
const quadro = (servico: keyof typeof ORIGEM) => iframes().find((f) => (f.getAttribute("src") ?? "").startsWith(ORIGEM[servico])) ?? null;
const mensagem = (dados: unknown, origin: string, source: unknown) => window.dispatchEvent(new MessageEvent("message", { data: dados, origin, source: source as MessageEventSource }));
const atributos = (e: Element) => e.getAttributeNames().map((n) => [n, e.getAttribute(n)]);
const resizeDoX = (h: number, id = "twitter-widget-0") => JSON.stringify({ "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.resize", id, params: [{ width: 550, height: h, data: { tweet_id: "1785040192421663088" } }] } });

beforeEach(() => {
  const w = window as unknown as { happyDOM: { setURL(u: string): void; settings: { disableIframePageLoading: boolean } } };
  w.happyDOM.setURL(PAGINA);
  w.happyDOM.settings.disableIframePageLoading = true; // nenhum pedido de rede, nunca
  document.documentElement.lang = "pt-BR";
  document.body.replaceChildren();
  esperando = [];
});
afterEach(() => {
  desligar();
  desligar = () => {};
  janelas.clear();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("sem JavaScript: o blockquote do autor, como antes", () => {
  test.each([["Reddit", REDDIT], ["X", X], ["Instagram", INSTA]])("%s: blockquote, nenhum iframe, nenhum script", (_n, html) => {
    montar(html, { semScript: true });
    expect(document.querySelectorAll("blockquote").length).toBe(1);
    expect(iframes().length).toBe(0);
    expect(document.querySelectorAll("script").length).toBe(0);
  });
});

describe("com JavaScript, sem clique: a moldura do script oficial", () => {
  test("Reddit: o iframe TOMA O LUGAR do blockquote, com os atributos do widgets.js do Reddit, o sandbox dele e a altura do código", () => {
    montar(REDDIT);
    expect(document.querySelector("blockquote")).toBeNull();
    const f = quadro("reddit") as HTMLIFrameElement;
    expect(f.parentElement?.className).toBe("embed");
    expect(atributos(f)).toEqual([
      ["height", "658"],
      ["src", "https://embed.reddit.com/r/SpeculativeEvolution/comments/1pdn94f/day_3_of_drawing_a_spec_evo_creature_from_my/?embed=true&ref_source=embed&ref=share&utm_medium=widgets&utm_source=embedv2&utm_term=23&utm_name=post_embed&embed_host_url=https%3A%2F%2Fhatecycle.com%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F"],
      ["width", "640px"],
      ["scrolling", "no"],
      ["allowfullscreen", "true"],
      ["sandbox", SANDBOX_DO_REDDIT],
      ["allow", "clipboard-read; clipboard-write"],
      ["title", "Post do Reddit"],
      ["style", "border: none; max-width: 100%; border-radius: 8px; display: block; margin: 0px auto;"],
    ]);
  });

  test("Instagram: o iframe no lugar do blockquote, com os atributos do embed.js e os estilos finais (os do MOUNTED, fixos)", () => {
    montar(INSTA);
    expect(document.querySelector("blockquote")).toBeNull();
    const f = quadro("instagram") as HTMLIFrameElement;
    expect(Object.fromEntries(atributos(f))).toEqual({
      class: "instagram-media instagram-media-rendered",
      id: "instagram-embed-0",
      src: "https://www.instagram.com/reel/DIb1JCngpAL/embed/captioned/?cr=1&v=14&wp=540&rd=https%3A%2F%2Fhatecycle.com&rp=%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F",
      allowtransparency: "true",
      allowfullscreen: "true",
      frameborder: "0",
      height: "540",
      "data-instgrm-payload-id": "instagram-media-payload-0",
      scrolling: "no",
      sandbox: SANDBOX_DA_MOLDURA,
      title: "Post do Instagram",
      style: "background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;",
    });
  });

  test("X: a caixa do widgets.js entra ANTES do blockquote, escondida e fora do fluxo; o blockquote continua à vista", () => {
    montar(X);
    const bq = document.querySelector("blockquote") as HTMLElement;
    expect(bq).not.toBeNull();
    const caixa = bq.previousElementSibling as HTMLElement;
    expect(caixa.className).toBe("twitter-tweet twitter-tweet-rendered");
    expect(caixa.style.visibility).toBe("hidden");
    expect(caixa.style.position).toBe("absolute");
    const f = caixa.firstElementChild as HTMLIFrameElement;
    expect(f.tagName).toBe("IFRAME");
    expect(f.style.visibility).toBe("hidden");
    expect(f.style.height).toBe("0px");
    const semEstilo = atributos(f).filter(([n]) => n !== "style");
    expect(semEstilo).toEqual([
      ["id", "twitter-widget-0"],
      ["scrolling", "no"],
      ["frameborder", "0"],
      ["allowtransparency", "true"],
      ["allowfullscreen", "true"],
      ["class", ""],
      ["title", "Post do X"],
      ["src", "https://platform.twitter.com/embed/Tweet.html?dnt=true&embedId=twitter-widget-0&frame=false&hideCard=false&hideThread=false&id=1785040192421663088&lang=pt&origin=https%3A%2F%2Fhatecycle.com%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F&theme=light&width=550px"],
      ["data-tweet-id", "1785040192421663088"],
      ["sandbox", SANDBOX_DA_MOLDURA],
    ]);
  });

  test("X: na primeira altura, a caixa e o iframe ficam com os estilos EXATOS do widgets.js e o blockquote sai", () => {
    montar(X);
    const f = quadro("x") as HTMLIFrameElement;
    mensagem(resizeDoX(612), ORIGEM.x, janelaDaMoldura(f));
    expect(document.querySelector("blockquote")).toBeNull();
    expect(f.parentElement?.getAttribute("style")).toBe("display: flex; max-width: 550px; width: 100%; margin-top: 10px; margin-bottom: 10px;");
    expect(f.getAttribute("style")).toBe("position: static; visibility: visible; width: 550px; height: 612px; display: block; flex-grow: 1;");
    expect(f.parentElement?.parentElement?.className).toBe("embed");
    // as próximas mudam só a altura
    mensagem(resizeDoX(700), ORIGEM.x, janelaDaMoldura(f));
    expect(f.style.height).toBe("700px");
  });

  test("X: mensagens que não são de altura (initialized, results) não mostram a moldura; a de outro embedId também não", () => {
    montar(X);
    const f = quadro("x") as HTMLIFrameElement;
    mensagem(JSON.stringify({ "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.initialized", id: "twitter-widget-0", params: [{ iframe_version: "x", data: { tweet_id: "1" } }] } }), ORIGEM.x, janelaDaMoldura(f));
    mensagem(JSON.stringify({ "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.results", id: "twitter-widget-0", params: [{}] } }), ORIGEM.x, janelaDaMoldura(f));
    mensagem(resizeDoX(600, "twitter-widget-9"), ORIGEM.x, janelaDaMoldura(f));
    expect(document.querySelector("blockquote")).not.toBeNull();
    expect(f.style.visibility).toBe("hidden");
  });

  test("dois posts do X: twitter-widget-0 e twitter-widget-1, cada um com a sua mensagem", () => {
    montar(X + X2);
    const [a, b] = iframes() as [HTMLIFrameElement, HTMLIFrameElement];
    expect([a.id, b.id]).toEqual(["twitter-widget-0", "twitter-widget-1"]);
    mensagem(resizeDoX(400, "twitter-widget-1"), ORIGEM.x, janelaDaMoldura(b));
    expect(b.style.height).toBe("400px");
    expect(a.style.height).toBe("0px");
  });

  test("idioma inglês: título e lang em inglês", () => {
    document.documentElement.lang = "en";
    montar(X + REDDIT);
    expect(quadro("x")?.getAttribute("title")).toBe("X Post");
    expect(new URL(quadro("x")?.getAttribute("src") ?? "").searchParams.get("lang")).toBe("en");
    expect(quadro("reddit")?.getAttribute("title")).toBe("Reddit post");
  });

  test("nunca srcdoc, sempre de outra origem, https, e nenhum <script> criado", () => {
    montar(REDDIT + X + INSTA);
    expect(iframes().length).toBe(3);
    for (const f of iframes()) {
      expect(f.hasAttribute("srcdoc")).toBe(false);
      const u = new URL(f.getAttribute("src") ?? "");
      expect(u.protocol).toBe("https:");
      expect(u.origin).not.toBe(window.location.origin);
      expect(Object.values(ORIGEM)).toContain(u.origin);
    }
    expect(document.querySelectorAll("script").length).toBe(0);
  });

  test("o endereço da página que vai ao serviço nunca leva a busca nem a âncora (#access_token do login)", () => {
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`${PAGINA}?p=2#access_token=SEGREDO&type=magiclink`);
    montar(REDDIT + X + INSTA);
    for (const f of iframes()) {
      const src = f.getAttribute("src") ?? "";
      expect(src).not.toContain("SEGREDO");
      expect(src).not.toContain("access_token");
      expect(src).not.toContain("p%3D2");
    }
  });

  test("link adulterado no blockquote (outro domínio, javascript:): nenhuma moldura, o blockquote fica", () => {
    for (const ruim of ["javascript:alert(1)", "https://hatecycle.com/pt/", "https://evil.test/a/status/1", "data:text/html,<script>1</script>"]) {
      montar(X.replace(/href="[^"]*"/, `href="${ruim}"`));
      expect(iframes().length, ruim).toBe(0);
      expect(document.querySelector("blockquote"), ruim).not.toBeNull();
      desligar();
    }
  });

  test("depois de tudo, a página só tem os elementos que o build e o script criam (nenhum <script>)", () => {
    montar(REDDIT + X + INSTA);
    mensagem(resizeDoX(500), ORIGEM.x, janelaDaMoldura(quadro("x") as HTMLIFrameElement));
    const tags = new Set([...document.body.querySelectorAll("*")].map((e) => e.tagName.toLowerCase()));
    expect([...tags].sort()).toEqual(["div", "iframe", "main"]);
  });
});

describe("mensagens de altura: só da moldura, da origem do serviço, no formato do serviço", () => {
  const altura = () => quadro("reddit")?.getAttribute("height");

  test("Reddit: a mensagem real (texto JSON) muda o atributo height, limitada; 0 é ignorado", () => {
    montar(REDDIT);
    const f = quadro("reddit") as HTMLIFrameElement;
    mensagem('{"type":"resize.embed","data":638}', ORIGEM.reddit, janelaDaMoldura(f));
    expect(altura()).toBe("638");
    mensagem('{"type":"resize.embed","data":0}', ORIGEM.reddit, janelaDaMoldura(f));
    expect(altura()).toBe("638");
    mensagem({ type: "resize.embed", data: 99_999_999 }, ORIGEM.reddit, janelaDaMoldura(f));
    expect(altura()).toBe("5000");
    mensagem({ type: "resize.embed", data: 1 }, ORIGEM.reddit, janelaDaMoldura(f));
    expect(altura()).toBe("60");
    expect(f.getAttribute("scrolling")).toBe("no");
  });

  test("Instagram: MEASURE muda a altura; LOADING e MOUNTED não (os estilos do MOUNTED já estão fixos, não vêm da mensagem)", () => {
    montar(INSTA);
    const f = quadro("instagram") as HTMLIFrameElement;
    const estilo = f.getAttribute("style");
    mensagem('{"details":{},"type":"LOADING"}', ORIGEM.instagram, janelaDaMoldura(f));
    expect(f.getAttribute("height")).toBe("540");
    mensagem('{"details":{"height":623},"type":"MEASURE"}', ORIGEM.instagram, janelaDaMoldura(f));
    expect(f.getAttribute("height")).toBe("623");
    mensagem('{"details":{"styles":[["boxShadow","10px 10px red"],["border","9px solid red"],["margin","0px 0px 12px"]]},"type":"MOUNTED"}', ORIGEM.instagram, janelaDaMoldura(f));
    expect(f.getAttribute("style")).toBe(estilo);
  });

  test("outra janela (outro iframe, a própria página, null) é ignorada, mesmo com a origem e o formato certos", () => {
    montar(REDDIT);
    const antes = altura();
    for (const fonte of [{ nome: "outra janela" }, window, null, undefined]) mensagem({ type: "resize.embed", data: 1234 }, ORIGEM.reddit, fonte);
    expect(altura()).toBe(antes);
  });

  test("origem diferente (outro site, a própria página, 'null' de sandbox, outro serviço) é ignorada, mesmo vinda da janela da moldura", () => {
    montar(REDDIT);
    const f = quadro("reddit") as HTMLIFrameElement;
    const antes = altura();
    for (const origem of ["https://evil.test", "https://hatecycle.com", "null", "https://embed.reddit.com.evil.test", "https://platform.twitter.com", ""]) {
      mensagem({ type: "resize.embed", data: 1234 }, origem, janelaDaMoldura(f));
    }
    expect(altura()).toBe(antes);
  });

  test("formato errado ou altura inválida é ignorado", () => {
    montar(REDDIT);
    const f = quadro("reddit") as HTMLIFrameElement;
    const antes = altura();
    for (const dado of [null, undefined, "oi", 500, [500], {}, { type: "resize.embed" }, { type: "resize.embed", data: -5 }, { type: "resize.embed", data: NaN }, { type: "resize.embed", data: "abc" }, { type: "MEASURE", details: { height: 700 } }, { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 700 }] } }]) {
      mensagem(dado, ORIGEM.reddit, janelaDaMoldura(f));
    }
    expect(altura()).toBe(antes);
  });

  test("com três molduras na página, a mensagem de uma não mexe nas outras", () => {
    montar(REDDIT + X + INSTA);
    const r = quadro("reddit") as HTMLIFrameElement;
    const i = quadro("instagram") as HTMLIFrameElement;
    mensagem('{"type":"resize.embed","data":777}', ORIGEM.reddit, janelaDaMoldura(r));
    expect(r.getAttribute("height")).toBe("777");
    expect(i.getAttribute("height")).toBe("540");
    // e a moldura do Instagram não aceita a mensagem do Reddit, mesmo com a janela dela
    mensagem('{"type":"resize.embed","data":900}', ORIGEM.reddit, janelaDaMoldura(i));
    expect(i.getAttribute("height")).toBe("540");
  });

  test("depois de desligar o script, nada muda", () => {
    montar(REDDIT);
    const f = quadro("reddit") as HTMLIFrameElement;
    desligar();
    mensagem('{"type":"resize.embed","data":1500}', ORIGEM.reddit, janelaDaMoldura(f));
    expect(altura()).toBe("658");
  });
});

describe("serviço que não responde: o blockquote do autor fica (como quando o script do serviço não carregava)", () => {
  test("Reddit e Instagram: sem nenhuma mensagem em TEMPO_SEM_RESPOSTA_MS, o iframe sai e o blockquote volta ao mesmo lugar", () => {
    vi.useFakeTimers();
    montar(REDDIT + INSTA);
    expect(document.querySelectorAll("blockquote").length).toBe(0);
    vi.advanceTimersByTime(TEMPO_SEM_RESPOSTA_MS - 1);
    expect(iframes().length).toBe(2);
    vi.advanceTimersByTime(2);
    expect(iframes().length).toBe(0);
    const bqs = [...document.querySelectorAll("blockquote")];
    expect(bqs.map((b) => b.className)).toEqual(["reddit-embed-bq", "instagram-media"]);
    expect(bqs.every((b) => b.parentElement?.className === "embed")).toBe(true);
  });
  test("X: sem resposta, a caixa escondida sai; o blockquote nunca saiu", () => {
    vi.useFakeTimers();
    montar(X);
    vi.advanceTimersByTime(TEMPO_SEM_RESPOSTA_MS + 1);
    expect(iframes().length).toBe(0);
    expect(document.querySelector(".twitter-tweet-rendered")).toBeNull();
    expect(document.querySelector("blockquote.twitter-tweet")).not.toBeNull();
  });
  test("qualquer mensagem da moldura antes do tempo (até a LOADING, ou o 0 do Reddit) basta: ela fica", () => {
    vi.useFakeTimers();
    montar(REDDIT + INSTA);
    mensagem('{"type":"resize.embed","data":0}', ORIGEM.reddit, janelaDaMoldura(quadro("reddit") as HTMLIFrameElement));
    mensagem('{"details":{},"type":"LOADING"}', ORIGEM.instagram, janelaDaMoldura(quadro("instagram") as HTMLIFrameElement));
    vi.advanceTimersByTime(TEMPO_SEM_RESPOSTA_MS * 3);
    expect(iframes().length).toBe(2);
  });
  test("mensagem de outra janela não conta como resposta", () => {
    vi.useFakeTimers();
    montar(REDDIT);
    mensagem('{"type":"resize.embed","data":500}', ORIGEM.reddit, { nome: "outra" });
    vi.advanceTimersByTime(TEMPO_SEM_RESPOSTA_MS + 1);
    expect(iframes().length).toBe(0);
    expect(document.querySelector("blockquote")).not.toBeNull();
  });
});

describe("painéis alternados (.embed-alt): a moldura nasce quando o painel aparece, já do tamanho certo", () => {
  test("só o painel ligado ganha moldura; os outros esperam e ganham ao aparecer (uma vez só)", () => {
    montar(ALT);
    expect(iframes().length).toBe(1);
    expect(quadro("x")).not.toBeNull();
    expect(document.querySelectorAll("blockquote").length).toBe(3); // o do X (até a altura) e os dois dos painéis escondidos
    mostrarPainel(1);
    expect(quadro("reddit")).not.toBeNull();
    expect(quadro("instagram")).toBeNull();
    mostrarPainel(2);
    expect(quadro("instagram")).not.toBeNull();
    mostrarPainel(0);
    mostrarPainel(1);
    expect(iframes().length).toBe(3);
  });
  test("desligar antes de o painel aparecer: nada nasce depois", () => {
    montar(ALT);
    desligar();
    mostrarPainel(1);
    expect(quadro("reddit")).toBeNull();
  });
});
