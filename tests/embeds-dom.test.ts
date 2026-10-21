// @vitest-environment happy-dom
//
// O script dos posts incorporados com clique (src/scripts/embeds/bloco.ts → iniciarEmbeds(), a mesma função que o site chama) num DOM
// simulado (happy-dom, no padrão de tests/comentarios-dom.test.ts). O HTML dos quadros é o que o build produz de verdade
// (embedsComClique sobre o código de incorporação do Reddit, do X e do Instagram). Confere:
//   - antes do clique: nenhum <iframe>, nenhum <script> novo, botão ligado (sem `hidden`), nada pedido a ninguém;
//   - o clique cria UM <iframe> com sandbox exato, SEM srcdoc, com endereço da origem do SERVIÇO (nunca a da página), título e altura;
//   - mensagens: só a da janela do quadro, da origem do serviço, no formato do serviço, com altura limitada — qualquer outra é ignorada;
//   - estados: carregando → carregado (load), tempo esgotado → erro com o botão de volta (tentar de novo), link adulterado → erro sem iframe;
//   - alternância (.embed-alt): cada post só carrega quando o visitante clica nele;
//   - texto nunca vira HTML (textos do quadro com <img onerror> aparecem como letras).
// Como o happy-dom não tem a janela de dentro do <iframe>, o teste entrega uma janela de mentira (`janelaDoQuadro`); mensagens são
// entregues com `dispatchEvent(new MessageEvent(...))` com origin e source escolhidos pelo teste.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { embedsComClique } from "../src/lib/embedsComClique";
import { iniciarEmbeds, TEMPO_PARA_CARREGAR_MS } from "../src/scripts/embeds/bloco";
import { SANDBOX_DO_QUADRO } from "../src/scripts/embeds/regras";

const REDDIT = `<div class="embed"><blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="740"><a href="https://www.reddit.com/r/conlangs/comments/1p7hwpd/protoarticulate/">Proto</a></blockquote><script async src="https://embed.reddit.com/widgets.js"></script></div>`;
const X = `<div class="embed"><blockquote class="twitter-tweet"><a href="https://x.com/KingOfAllOceans/status/1786071228421148897"></a></blockquote><script async src="https://platform.x.com/widgets.js"></script></div>`;
const INSTA = `<div class="embed"><blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed"><a href="https://www.instagram.com/reel/DIb1JCngpAL/">v</a></blockquote><script async src="//www.instagram.com/embed.js"></script></div>`;
const ALT = `<div class="embed-alt"><div class="embed-panels"><div class="embed-panel is-on">${X}</div><div class="embed-panel">${REDDIT}</div></div></div>`;

const PAGINA = "https://hatecycle.com/pt/news/teste/";
const sorteio = (() => {
  let n = 1;
  return (k: number) => Uint8Array.from({ length: k }, (_v, i) => (n++ * 31 + i * 17) % 256);
})();

/** A "janela de dentro" de cada iframe: um objeto qualquer, para o teste dizer de quem veio a mensagem. */
const janelas = new Map<Element, object>();
const janelaDoQuadro = (f: HTMLIFrameElement): object => {
  let j = janelas.get(f);
  if (!j) janelas.set(f, (j = { nome: "janela do quadro" }));
  return j;
};

// O happy-dom escreve, a cada <iframe> criado, "Iframe page loading is disabled" (é de propósito: nenhum pedido de rede nos testes).
// Só essa mensagem é calada neste arquivo; qualquer outra continua aparecendo.
const escreverNoStderr = process.stderr.write.bind(process.stderr);
beforeAll(() => {
  process.stderr.write = ((texto: string | Uint8Array, ...resto: unknown[]) =>
    String(texto).includes("Iframe page loading is disabled") ? true : (escreverNoStderr as (...a: unknown[]) => boolean)(texto, ...resto)) as typeof process.stderr.write;
});
afterAll(() => {
  process.stderr.write = escreverNoStderr;
});

let desligar: () => void = () => {};
function montar(html: string, opcoes: { tempoParaCarregar?: number; aoHtmlPronto?: (h: string) => string } = {}) {
  const depois = (opcoes.aoHtmlPronto ?? ((h: string) => h))(embedsComClique(html, "pt").html);
  document.body.innerHTML = `<main>${depois}</main>`; // (só o teste monta HTML; o código do site não)
  desligar = iniciarEmbeds(document, { janela: window, sorteio, janelaDoQuadro, ...(opcoes.tempoParaCarregar === undefined ? {} : { tempoParaCarregar: opcoes.tempoParaCarregar }) });
  return depois;
}
const embeds = () => [...document.querySelectorAll<HTMLElement>(".embed[data-embed-servico]")];
const botao = (i = 0) => embeds()[i]?.querySelector<HTMLButtonElement>("button.embed-load") as HTMLButtonElement;
const quadro = (i = 0) => embeds()[i]?.querySelector<HTMLIFrameElement>("iframe") ?? null;
const status = (i = 0) => embeds()[i]?.querySelector(".embed-status")?.textContent ?? "";
const mensagem = (dados: unknown, origin: string, source: unknown) => window.dispatchEvent(new MessageEvent("message", { data: dados, origin, source: source as MessageEventSource }));

beforeEach(() => {
  const w = window as unknown as { happyDOM: { setURL(u: string): void; settings: { disableIframePageLoading: boolean } } };
  w.happyDOM.setURL(PAGINA);
  w.happyDOM.settings.disableIframePageLoading = true; // nenhum pedido de rede, nunca
  document.documentElement.lang = "pt-BR";
  document.body.replaceChildren();
});
afterEach(() => {
  desligar();
  desligar = () => {};
  janelas.clear();
  vi.useRealTimers();
  document.body.replaceChildren();
  delete (globalThis as { __xss?: unknown }).__xss;
});

describe("antes do clique: nada de terceiros", () => {
  test.each([["Reddit", REDDIT], ["X", X], ["Instagram", INSTA]])("%s: sem iframe, sem <script>, botão e aviso ligados", (_n, html) => {
    montar(html);
    expect(document.querySelectorAll("iframe").length).toBe(0);
    expect(document.querySelectorAll("script").length).toBe(0);
    expect(botao().hidden).toBe(false);
    expect(embeds()[0]?.querySelector<HTMLElement>(".embed-gate-aviso")?.hidden).toBe(false);
    expect(embeds()[0]?.dataset["estado"]).toBe("inicial");
    expect(embeds()[0]?.querySelector("blockquote")).not.toBeNull(); // o texto do autor continua lá
    expect(embeds()[0]?.querySelector<HTMLAnchorElement>("a.embed-origin")?.href).toMatch(/^https:\/\//);
  });
  test("sem iniciar o script, o botão e o aviso continuam escondidos (é o que o visitante sem JavaScript vê)", () => {
    const depois = embedsComClique(X, "pt").html;
    document.body.innerHTML = depois;
    expect(document.querySelector<HTMLElement>("button.embed-load")?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>(".embed-gate-aviso")?.hidden).toBe(true);
    expect(document.querySelector("a.embed-origin")).not.toBeNull(); // o link para o original aparece
  });
});

describe("o clique cria o quadro isolado", () => {
  test.each([
    ["Reddit", REDDIT, "https://embed.reddit.com", "740px"],
    ["X", X, "https://platform.twitter.com", "560px"],
    ["Instagram", INSTA, "https://www.instagram.com", "720px"],
  ])("%s: um iframe com sandbox exato, sem srcdoc, de outra origem, com título e altura inicial", (_n, html, origem, altura) => {
    montar(html);
    botao().click();
    const todos = document.querySelectorAll("iframe");
    expect(todos.length).toBe(1);
    const f = todos[0] as HTMLIFrameElement;
    expect(f.getAttribute("sandbox")).toBe(SANDBOX_DO_QUADRO);
    expect(f.hasAttribute("srcdoc")).toBe(false);
    expect((f as unknown as { srcdoc?: string }).srcdoc ?? "").toBe("");
    const src = new URL(f.getAttribute("src") ?? "");
    expect(src.origin).toBe(origem);
    expect(src.origin).not.toBe(window.location.origin);
    expect(src.protocol).toBe("https:");
    expect(f.getAttribute("title")).toMatch(/^Post do /);
    expect(f.style.height).toBe(altura);
    expect(f.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(embeds()[0]?.dataset["estado"]).toBe("carregando");
    expect(botao().hidden).toBe(true);
    expect(status()).toBe("Carregando o post…");
    expect(document.querySelectorAll("script").length).toBe(0);
  });

  test("Instagram com legenda pede /embed/captioned/; X leva o id do post, o idioma da página e o id do quadro", () => {
    montar(INSTA);
    botao().click();
    expect(quadro()?.getAttribute("src")).toBe("https://www.instagram.com/reel/DIb1JCngpAL/embed/captioned/");
    desligar();
    document.body.replaceChildren();
    montar(X);
    botao().click();
    const u = new URL(quadro()?.getAttribute("src") ?? "");
    expect(u.searchParams.get("id")).toBe("1786071228421148897");
    expect(u.searchParams.get("lang")).toBe("pt");
    expect(u.searchParams.get("origin")).toBe("https://hatecycle.com");
    expect(u.searchParams.get("embedId")).toMatch(/^[a-z0-9]{12}$/);
  });

  test("o endereço do quadro NUNCA é o da própria página, nem com o link do quadro adulterado", () => {
    montar(X);
    const a = document.querySelector<HTMLAnchorElement>("a.embed-origin") as HTMLAnchorElement;
    for (const ruim of ["javascript:alert(1)", "https://hatecycle.com/pt/", "https://evil.test/a/status/1", "data:text/html,<script>1</script>", "https://x.com/a/status/1?x=1&y=2#z"]) {
      a.setAttribute("href", ruim);
      botao().click();
      if (ruim.startsWith("https://x.com")) {
        // um link de post de verdade com parâmetros vira o canônico
        expect(new URL(quadro()?.getAttribute("src") ?? "").searchParams.get("id")).toBe("1");
        break;
      }
      expect(quadro(), ruim).toBeNull();
      expect(embeds()[0]?.dataset["estado"], ruim).toBe("erro");
      expect(status(), ruim).toMatch(/não carregou/);
      expect(botao().hidden, ruim).toBe(false);
    }
  });

  test("clicar de novo enquanto carrega não cria um segundo quadro", () => {
    montar(REDDIT);
    botao().click();
    botao().click();
    botao().click();
    expect(document.querySelectorAll("iframe").length).toBe(1);
  });

  test("o foco vai para o quadro", () => {
    montar(REDDIT);
    botao().click();
    expect(document.activeElement).toBe(quadro());
  });
});

describe("mensagens de altura: só do quadro, da origem do serviço, no formato do serviço", () => {
  const REDDIT_ORIGEM = "https://embed.reddit.com";
  const altura = () => quadro()?.style.height;

  test("a mensagem certa muda a altura (objeto e JSON), limitada", () => {
    montar(REDDIT);
    botao().click();
    const f = quadro() as HTMLIFrameElement;
    mensagem({ type: "resize.embed", data: 812 }, REDDIT_ORIGEM, janelaDoQuadro(f));
    expect(altura()).toBe("812px");
    mensagem(JSON.stringify({ type: "resize.embed", data: 903.4 }), REDDIT_ORIGEM, janelaDoQuadro(f));
    expect(altura()).toBe("904px");
    mensagem({ type: "resize.embed", data: 99_999_999 }, REDDIT_ORIGEM, janelaDoQuadro(f));
    expect(altura()).toBe("3000px");
    mensagem({ type: "resize.embed", data: 1 }, REDDIT_ORIGEM, janelaDoQuadro(f));
    expect(altura()).toBe("60px");
  });

  test("outra janela (outro iframe, a própria página, null) é ignorada, mesmo com a origem e o formato certos", () => {
    montar(REDDIT);
    botao().click();
    const antes = altura();
    for (const fonte of [{ nome: "outra janela" }, window, null, undefined]) mensagem({ type: "resize.embed", data: 1234 }, REDDIT_ORIGEM, fonte);
    expect(altura()).toBe(antes);
  });

  test("origem diferente (outro site, a própria página, 'null' de sandbox) é ignorada, mesmo vinda da janela do quadro", () => {
    montar(REDDIT);
    botao().click();
    const f = quadro() as HTMLIFrameElement;
    const antes = altura();
    for (const origem of ["https://evil.test", "https://hatecycle.com", "null", "https://embed.reddit.com.evil.test", "https://platform.twitter.com", ""]) {
      mensagem({ type: "resize.embed", data: 1234 }, origem, janelaDoQuadro(f));
    }
    expect(altura()).toBe(antes);
  });

  test("formato errado ou altura inválida é ignorado", () => {
    montar(REDDIT);
    botao().click();
    const f = quadro() as HTMLIFrameElement;
    const antes = altura();
    for (const dado of [null, undefined, "oi", 500, [500], {}, { type: "resize.embed" }, { type: "resize.embed", data: -5 }, { type: "resize.embed", data: NaN }, { type: "resize.embed", data: "abc" }, { type: "MEASURE", details: { height: 700 } }, { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 700 }] } }]) {
      mensagem(dado, REDDIT_ORIGEM, janelaDoQuadro(f));
    }
    expect(altura()).toBe(antes);
  });

  test("X e Instagram: cada um no seu formato e na sua origem", () => {
    montar(X);
    botao().click();
    const fx = quadro() as HTMLIFrameElement;
    mensagem({ "twttr.embed": { method: "twttr.private.resize", params: [{ width: 550, height: 400 }] } }, "https://platform.twitter.com", janelaDoQuadro(fx));
    expect(altura()).toBe("400px");
    mensagem({ "twttr.embed": { method: "twttr.private.resize", params: [{ height: 999 }] } }, "https://embed.reddit.com", janelaDoQuadro(fx)); // origem de outro serviço
    expect(altura()).toBe("400px");
    desligar();
    document.body.replaceChildren();
    montar(INSTA);
    botao().click();
    const fi = quadro() as HTMLIFrameElement;
    mensagem(JSON.stringify({ type: "MEASURE", details: { height: 855 } }), "https://www.instagram.com", janelaDoQuadro(fi));
    expect(altura()).toBe("855px");
  });

  test("mensagem antes do clique, ou depois de desligar o script, não faz nada", () => {
    montar(REDDIT);
    const j = janelaDoQuadro(document.createElement("iframe"));
    expect(() => mensagem({ type: "resize.embed", data: 700 }, REDDIT_ORIGEM, j)).not.toThrow();
    botao().click();
    const f = quadro() as HTMLIFrameElement;
    desligar();
    const antes = altura();
    mensagem({ type: "resize.embed", data: 1500 }, REDDIT_ORIGEM, janelaDoQuadro(f));
    expect(altura()).toBe(antes);
  });

  test("com dois quadros na página, a mensagem de um não mexe no outro", () => {
    montar(REDDIT + X);
    botao(0).click();
    botao(1).click();
    const f0 = quadro(0) as HTMLIFrameElement;
    const f1 = quadro(1) as HTMLIFrameElement;
    const h1 = f1.style.height;
    mensagem({ type: "resize.embed", data: 777 }, REDDIT_ORIGEM, janelaDoQuadro(f0));
    expect(f0.style.height).toBe("777px");
    expect(f1.style.height).toBe(h1);
    // e o quadro do X não aceita mensagem do Reddit, mesmo com a janela dele
    mensagem({ type: "resize.embed", data: 1 }, REDDIT_ORIGEM, janelaDoQuadro(f1));
    expect(f1.style.height).toBe(h1);
  });
});

describe("estados: carregado, tempo esgotado, tentar de novo", () => {
  test("load do quadro → carregado, aviso de pronto, botão escondido", () => {
    montar(REDDIT);
    botao().click();
    quadro()?.dispatchEvent(new Event("load"));
    expect(embeds()[0]?.dataset["estado"]).toBe("carregado");
    expect(status()).toBe("Post carregado.");
    expect(botao().hidden).toBe(true);
  });

  test("passou o tempo sem carregar → erro com o botão de volta; o link para o original continua lá; tentar de novo troca o quadro", () => {
    vi.useFakeTimers();
    montar(X);
    botao().click();
    const primeiro = quadro() as HTMLIFrameElement;
    const idPrimeiro = new URL(primeiro.getAttribute("src") ?? "").searchParams.get("embedId");
    vi.advanceTimersByTime(TEMPO_PARA_CARREGAR_MS - 1);
    expect(embeds()[0]?.dataset["estado"]).toBe("carregando");
    vi.advanceTimersByTime(2);
    expect(embeds()[0]?.dataset["estado"]).toBe("erro");
    expect(status()).toBe("O post não carregou aqui. Use o link para abrir o original.");
    expect(botao().hidden).toBe(false);
    expect(embeds()[0]?.querySelector("a.embed-origin")).not.toBeNull();
    botao().click();
    expect(document.querySelectorAll("iframe").length).toBe(1);
    const segundo = quadro() as HTMLIFrameElement;
    expect(segundo).not.toBe(primeiro);
    expect(new URL(segundo.getAttribute("src") ?? "").searchParams.get("embedId")).not.toBe(idPrimeiro);
    expect(embeds()[0]?.dataset["estado"]).toBe("carregando");
  });

  test("se o load chega antes do tempo, o aviso de erro nunca aparece", () => {
    vi.useFakeTimers();
    montar(REDDIT);
    botao().click();
    quadro()?.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(TEMPO_PARA_CARREGAR_MS * 3);
    expect(embeds()[0]?.dataset["estado"]).toBe("carregado");
    expect(status()).toBe("Post carregado.");
  });
});

describe("alternância (.embed-alt): cada post só carrega quando o visitante clica nele", () => {
  test("com dois posts no mesmo bloco, nada carrega; clicar num carrega só ele", () => {
    montar(ALT);
    expect(document.querySelectorAll("iframe").length).toBe(0);
    expect(embeds().length).toBe(2);
    botao(0).click();
    expect(document.querySelectorAll("iframe").length).toBe(1);
    expect(quadro(0)).not.toBeNull();
    expect(quadro(1)).toBeNull();
    expect(embeds()[1]?.dataset["estado"]).toBe("inicial");
    botao(1).click();
    expect(document.querySelectorAll("iframe").length).toBe(2);
  });
});

describe("texto nunca vira HTML", () => {
  test("os textos do quadro (atributos data-t-*) com <img onerror> aparecem como letras", () => {
    const ruim = '<img src=x onerror="globalThis.__xss=1"><b>x</b>';
    const atributo = ruim.replaceAll("&", "&amp;").replaceAll('"', "&quot;"); // (o html do teste põe o texto de ataque nos atributos)
    montar(REDDIT, {
      aoHtmlPronto: (h) => h.replace(/data-t-(carregando|erro|pronto|titulo)="[^"]*"/g, (_m, nome: string) => `data-t-${nome}="${atributo}"`),
    });
    botao().click();
    expect(status()).toBe(ruim);
    expect(quadro()?.getAttribute("title")).toBe(ruim);
    quadro()?.dispatchEvent(new Event("load"));
    expect(status()).toBe(ruim);
    expect(document.querySelectorAll("img, b").length).toBe(0);
    expect(document.querySelector(".embed-status")?.childNodes.length).toBe(1);
    expect(document.querySelector(".embed-status")?.firstChild?.nodeType).toBe(3);
    expect((globalThis as { __xss?: unknown }).__xss).toBeUndefined();
  });

  test("depois de tudo, a página só tem os elementos que o build e o script criam (nenhum <script>)", () => {
    montar(REDDIT + X + INSTA);
    for (let i = 0; i < 3; i++) botao(i).click();
    const tags = new Set([...document.body.querySelectorAll("*")].map((e) => e.tagName.toLowerCase()));
    expect([...tags].sort()).toEqual(["a", "blockquote", "button", "div", "iframe", "main", "p"]);
  });
});

describe("quadros que o script não entende são deixados em paz", () => {
  test("serviço desconhecido no atributo, ou quadro sem botão: nada liga, nada quebra", () => {
    document.body.innerHTML = '<div class="embed" data-embed-servico="tiktok"><div class="embed-gate"><button class="embed-load" hidden>x</button></div></div><div class="embed" data-embed-servico="x"><blockquote class="twitter-tweet"></blockquote></div>';
    expect(() => (desligar = iniciarEmbeds(document, { janela: window, sorteio, janelaDoQuadro }))).not.toThrow();
    expect(document.querySelector<HTMLElement>("button.embed-load")?.hidden).toBe(true);
    expect(document.querySelectorAll("iframe").length).toBe(0);
  });
});
