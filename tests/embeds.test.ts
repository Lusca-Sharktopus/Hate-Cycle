// Prova dos POSTS INCORPORADOS EM MOLDURA ISOLADA (T17g → T17j, B27): nenhum script de terceiros nas páginas publicadas, o blockquote do
// autor exatamente como no site Python (o build só tira o <script>), e a moldura que o navegador cria igual à do script oficial.
//
// Parte 1 — as regras puras do navegador (src/scripts/embeds/regras.ts): endereço do post, endereço da moldura (parâmetros como os do
//           script oficial; a origem é a do serviço), atributos e estilos da moldura, mensagens de altura (formatos reais, limites, 0),
//           de quem aceitar a mensagem.
// Parte 2 — o passo de build (src/lib/postsIncorporados.ts) em HTML inventado: só sai script; nada entra; os avisos.
// Parte 3 — a exceção de paridade (tests/ajudantes/html.ts → semScriptsDosPosts): tira SÓ o combinado (casos negativos).
// Parte 4 — o site construído de verdade (`astro build` numa pasta temporária, ou HC_DIST=<pasta>): nenhuma página (nem feed, nem sitemap)
//           carrega script de terceiros; os scripts tirados do Python (referência do build.py) são tantos quanto os posts do Astro,
//           página a página; o script dos posts só vem onde há post; cada post do conteúdo tem um endereço de moldura válido.
// Parte 5 — o código do navegador não tem as palavras proibidas e importa só o que pode.
// O comportamento do script (moldura, mensagens, painéis) está em tests/embeds-dom.test.ts; no navegador de verdade, tools/embeds_playwright.py.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tirarScriptsDosPosts } from "../src/lib/postsIncorporados";
import { embedHtml } from "../src/lib/markdown";
import {
  ALTURA_MAXIMA,
  ALTURA_MINIMA,
  DADOS,
  ESTILOS,
  SANDBOX_DA_MOLDURA,
  SANDBOX_DO_REDDIT,
  SERVICOS,
  alturaDaMensagem,
  alturaInicialDoInstagram,
  alturaInicialDoReddit,
  atributosDaMoldura,
  enderecoDaMoldura,
  idiomaDaPagina,
  opcoesDoX,
  postDoBlockquote,
  servicoPelaClasse,
  tituloDaMoldura,
  urlDoPost,
  veioDaMoldura,
  type PedidoDaMoldura,
} from "../src/scripts/embeds/regras";
import { DOMINIOS_DOS_SCRIPTS_DOS_POSTS, semScriptsDosPosts } from "./ajudantes/html";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// ───────────────────────── parte 1: regras puras ─────────────────────────

describe("urlDoPost: só post de verdade, sempre no endereço canônico", () => {
  test.each([
    ["x", "https://x.com/KingOfAllOceans/status/1786071228421148897", "https://x.com/KingOfAllOceans/status/1786071228421148897"],
    ["x", "https://twitter.com/Fulano_1/status/123?ref_src=twsrc%5Etfw", "https://x.com/Fulano_1/status/123"],
    ["x", "http://www.x.com/a/status/9/photo/1#frag", "https://x.com/a/status/9"],
    ["x", "https://mobile.twitter.com/a/status/9", "https://x.com/a/status/9"],
    ["reddit", "https://www.reddit.com/r/SpeculativeEvolution/comments/1b2ed7k/avialunas_aeternogyrinians/", "https://www.reddit.com/r/SpeculativeEvolution/comments/1b2ed7k/avialunas_aeternogyrinians/"],
    ["reddit", "https://old.reddit.com/r/conlangs/comments/1p7hwpd/", "https://www.reddit.com/r/conlangs/comments/1p7hwpd/"],
    ["reddit", "https://www.reddit.com/r/a/comments/abc123/titulo?utm_source=share", "https://www.reddit.com/r/a/comments/abc123/titulo/"],
    ["instagram", "https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed&utm_campaign=loading", "https://www.instagram.com/reel/DIb1JCngpAL/"],
    ["instagram", "https://www.instagram.com/lusca_desenhos/p/ABCDEFG123/", "https://www.instagram.com/p/ABCDEFG123/"],
    ["instagram", "https://instagram.com/reels/ABCDEFG123", "https://www.instagram.com/reel/ABCDEFG123/"],
  ] as const)("%s %s", (servico, entrada, saida) => {
    expect(urlDoPost(servico, entrada)).toBe(saida);
  });

  test.each([
    ["x", "https://x.com/a"],
    ["x", "https://x.com/a/status/abc"],
    ["x", "https://evil.test/a/status/1"],
    ["x", "https://x.com.evil.test/a/status/1"],
    ["x", "https://evil.test/https://x.com/a/status/1"],
    ["x", "javascript:alert(1)//x.com/a/status/1"],
    ["x", "data:text/html,<script>alert(1)</script>"],
    ["x", "//x.com/a/status/1"],
    ["x", ""],
    ["x", "https://x.com/" + "a".repeat(700) + "/status/1"],
    ["reddit", "https://www.reddit.com/user/Fulano/"],
    ["reddit", "https://reddit.com.evil.test/r/a/comments/abc/"],
    ["reddit", "https://www.reddit.com/r/a/"],
    ["instagram", "https://www.instagram.com/lusca_desenhos/"],
    ["instagram", "https://www.instagram.com/p/"],
    ["instagram", "https://instagram.com.evil.test/p/ABCDEFG123/"],
    ["instagram", "https://www.instagram.com/stories/a/123/"],
  ] as const)("recusa %s %s", (servico, entrada) => {
    expect(urlDoPost(servico, entrada)).toBeNull();
  });

  test("um serviço não aceita o endereço de outro", () => {
    expect(urlDoPost("reddit", "https://x.com/a/status/1")).toBeNull();
    expect(urlDoPost("x", "https://www.reddit.com/r/a/comments/abc/t/")).toBeNull();
    expect(urlDoPost("instagram", "https://www.reddit.com/r/a/comments/abc/t/")).toBeNull();
  });

  test("postDoBlockquote: X usa o ÚLTIMO link de post (o código oficial põe o link do post no fim); Reddit/Instagram o primeiro; Instagram prefere o permalink", () => {
    expect(postDoBlockquote("x", ["https://t.co/abc", "https://twitter.com/a/status/41", "https://x.com/a/status/42?ref_src=twsrc%5Etfw"])).toBe("https://x.com/a/status/42");
    expect(postDoBlockquote("reddit", ["https://www.reddit.com/r/a/comments/abc123/t/", "https://www.reddit.com/user/x/", "https://www.reddit.com/r/a/"])).toBe("https://www.reddit.com/r/a/comments/abc123/t/");
    expect(postDoBlockquote("instagram", ["https://www.instagram.com/p/OUTRO12345/"], "https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed")).toBe("https://www.instagram.com/reel/DIb1JCngpAL/");
    expect(postDoBlockquote("x", ["https://evil.test/a/status/1"])).toBeNull();
  });
});

const PAGINA = { origin: "https://hatecycle.com", pathname: "/pt/news/2024-04-29-hygranocianos/" };
const pedido = (servico: (typeof SERVICOS)[number], post: string, extra: Partial<PedidoDaMoldura> = {}): PedidoDaMoldura => ({ servico, post, pagina: PAGINA, idioma: "pt-BR", numero: 0, ...extra });
const params = (src: string | null) => Object.fromEntries(new URL(src ?? "").searchParams);

describe("enderecoDaMoldura: os parâmetros do script oficial, sempre da origem do serviço", () => {
  test("X: Tweet.html com os mesmos parâmetros do widgets.js (menos features/sessionId/widgetsVersion), dnt=true, idioma da página", () => {
    const src = enderecoDaMoldura(pedido("x", "https://x.com/KingOfAllOceans/status/1785040192421663088"));
    const u = new URL(src ?? "");
    expect(u.origin + u.pathname).toBe("https://platform.twitter.com/embed/Tweet.html");
    expect(params(src)).toEqual({
      dnt: "true",
      embedId: "twitter-widget-0",
      frame: "false",
      hideCard: "false",
      hideThread: "false",
      id: "1785040192421663088",
      lang: "pt",
      origin: "https://hatecycle.com/pt/news/2024-04-29-hygranocianos/",
      theme: "light",
      width: "550px",
    });
    // a ordem dos parâmetros é a do widgets.js (alfabética)
    expect([...u.searchParams.keys()]).toEqual(["dnt", "embedId", "frame", "hideCard", "hideThread", "id", "lang", "origin", "theme", "width"]);
    expect(src).toContain("origin=https%3A%2F%2Fhatecycle.com%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F");
  });
  test("X: as opções do blockquote (data-theme, data-cards, data-conversation, data-width, data-lang) viram os parâmetros do widgets.js", () => {
    const o = opcoesDoX({ theme: "dark", cards: "hidden", conversation: "none", width: "400", lang: "es" });
    expect(o).toEqual({ tema: "dark", semCartao: true, semConversa: true, largura: 400, idioma: "es" });
    expect(params(enderecoDaMoldura(pedido("x", "https://x.com/a/status/1", { x: o, numero: 3 })))).toMatchObject({ theme: "dark", hideCard: "true", hideThread: "true", width: "400px", lang: "es", embedId: "twitter-widget-3" });
    // valores estranhos ficam no padrão
    expect(opcoesDoX({ theme: "<b>", cards: "x", width: "9999", lang: "../x" })).toEqual({ tema: "light", semCartao: false, semConversa: false, largura: 550, idioma: null });
    expect(opcoesDoX({ width: "100" }).largura).toBe(550);
  });
  test("X: idioma estranho na página vira en", () => {
    expect(params(enderecoDaMoldura(pedido("x", "https://x.com/a/status/1", { idioma: "??" })))["lang"]).toBe("en");
    expect(idiomaDaPagina("en-US")).toBe("en");
    expect(idiomaDaPagina("pt-BR")).toBe("pt");
  });
  test("Reddit: embed.reddit.com + o caminho + os mesmos parâmetros do widgets.js do Reddit, na mesma ordem", () => {
    const src = enderecoDaMoldura(pedido("reddit", "https://www.reddit.com/r/SpeculativeEvolution/comments/1pdn94f/day_3_of_drawing_a_spec_evo_creature_from_my/"));
    expect(src).toBe(
      "https://embed.reddit.com/r/SpeculativeEvolution/comments/1pdn94f/day_3_of_drawing_a_spec_evo_creature_from_my/?embed=true&ref_source=embed&ref=share&utm_medium=widgets&utm_source=embedv2&utm_term=23&utm_name=post_embed&embed_host_url=https%3A%2F%2Fhatecycle.com%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F",
    );
  });
  test("Instagram: /embed/ (ou /embed/captioned/) com cr, v, wp, rd e rp", () => {
    const sem = enderecoDaMoldura(pedido("instagram", "https://www.instagram.com/reel/DIb1JCngpAL/"));
    expect(sem).toBe("https://www.instagram.com/reel/DIb1JCngpAL/embed/?cr=1&v=14&wp=540&rd=https%3A%2F%2Fhatecycle.com&rp=%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F");
    const com = enderecoDaMoldura(pedido("instagram", "https://www.instagram.com/reel/DIb1JCngpAL/", { comLegenda: true, versao: "12", larguraNaTela: 358.4 }));
    expect(com).toBe("https://www.instagram.com/reel/DIb1JCngpAL/embed/captioned/?cr=1&v=12&wp=358&rd=https%3A%2F%2Fhatecycle.com&rp=%2Fpt%2Fnews%2F2024-04-29-hygranocianos%2F");
    expect(params(enderecoDaMoldura(pedido("instagram", "https://www.instagram.com/p/ABCDEFG123/", { versao: "x", larguraNaTela: 100 })))).toMatchObject({ v: "14", wp: "326" });
    expect(params(enderecoDaMoldura(pedido("instagram", "https://www.instagram.com/p/ABCDEFG123/", { larguraNaTela: 900 })))["wp"]).toBe("540");
  });
  test("nunca leva a busca nem a âncora da página (ali pode estar o #access_token do login): só origem + caminho", () => {
    for (const s of SERVICOS) {
      const post = { x: "https://x.com/a/status/1", reddit: "https://www.reddit.com/r/a/comments/abc123/t/", instagram: "https://www.instagram.com/p/ABCDEFG123/" }[s];
      const src = enderecoDaMoldura(pedido(s, post)) ?? "";
      expect(src, s).not.toContain("access_token");
      expect(src, s).not.toContain("%23");
      expect(src, s).not.toContain("#");
      // um caminho com ? ou # não passa
      expect(enderecoDaMoldura(pedido(s, post, { pagina: { origin: "https://hatecycle.com", pathname: "/pt/?x#access_token=1" } })), s).toBeNull();
    }
  });
  test("só aceita o endereço canônico de urlDoPost (nada de parâmetro de rastreio, outro domínio ou javascript:)", () => {
    expect(enderecoDaMoldura(pedido("x", "https://x.com/a/status/1?utm=1"))).toBeNull();
    expect(enderecoDaMoldura(pedido("x", "https://evil.test/a/status/1"))).toBeNull();
    expect(enderecoDaMoldura(pedido("reddit", "javascript:alert(1)"))).toBeNull();
    expect(enderecoDaMoldura(pedido("instagram", "https://www.instagram.com/p/ABCDEFG123"))).toBeNull(); // sem a barra final: não é o canônico
  });
  test("a origem do endereço montado é SEMPRE a do serviço, https, e nunca a do site", () => {
    const posts = { x: "https://x.com/a/status/1", reddit: "https://www.reddit.com/r/a/comments/abc123/t/", instagram: "https://www.instagram.com/p/ABCDEFG123/" } as const;
    for (const s of SERVICOS) {
      const src = enderecoDaMoldura(pedido(s, posts[s])) ?? "";
      expect(new URL(src).origin, s).toBe(DADOS[s].origem);
      expect(new URL(src).origin, s).not.toBe("https://hatecycle.com");
      expect(new URL(src).protocol, s).toBe("https:");
    }
  });
});

describe("atributosDaMoldura: os do script oficial, na mesma ordem, mais o sandbox (e o title)", () => {
  const nomes = (a: readonly (readonly [string, string])[]) => a.map(([n]) => n);
  test("X: id, scrolling, frameborder, allowtransparency, allowfullscreen, class, title, src, data-tweet-id + sandbox", () => {
    const a = atributosDaMoldura("x", { src: "https://platform.twitter.com/embed/Tweet.html?id=1", numero: 2, idioma: "en", idDoPost: "1", alturaInicial: 0 });
    expect(Object.fromEntries(a)).toEqual({ id: "twitter-widget-2", scrolling: "no", frameborder: "0", allowtransparency: "true", allowfullscreen: "true", class: "", title: "X Post", src: "https://platform.twitter.com/embed/Tweet.html?id=1", "data-tweet-id": "1", sandbox: SANDBOX_DA_MOLDURA });
    expect(nomes(a)).toEqual(["id", "scrolling", "frameborder", "allowtransparency", "allowfullscreen", "class", "title", "src", "data-tweet-id", "sandbox"]);
  });
  test("Reddit: height, src, width=640px, scrolling, allowfullscreen, o sandbox DELE, allow (área de transferência), style", () => {
    const a = atributosDaMoldura("reddit", { src: "https://embed.reddit.com/r/a/", numero: 0, idioma: "pt-BR", alturaInicial: 658 });
    expect(Object.fromEntries(a)).toEqual({ height: "658", src: "https://embed.reddit.com/r/a/", width: "640px", scrolling: "no", allowfullscreen: "true", sandbox: SANDBOX_DO_REDDIT, allow: "clipboard-read; clipboard-write", title: "Post do Reddit", style: "border: none; max-width: 100%; border-radius: 8px; display: block; margin: 0px auto;" });
  });
  test("Instagram: class, id, src, allowtransparency, allowfullscreen, frameborder, height, data-instgrm-payload-id, scrolling, style", () => {
    const a = atributosDaMoldura("instagram", { src: "https://www.instagram.com/reel/x/embed/", numero: 1, idioma: "en", alturaInicial: 623 });
    expect(Object.fromEntries(a)).toEqual({
      class: "instagram-media instagram-media-rendered",
      id: "instagram-embed-1",
      src: "https://www.instagram.com/reel/x/embed/",
      allowtransparency: "true",
      allowfullscreen: "true",
      frameborder: "0",
      height: "623",
      "data-instgrm-payload-id": "instagram-media-payload-1",
      scrolling: "no",
      sandbox: SANDBOX_DA_MOLDURA,
      title: "Instagram post",
      style: "background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;",
    });
  });
  test("os estilos finais do X (caixa e iframe) são os do widgets.js", () => {
    expect(ESTILOS.caixaDoX).toBe("display: flex; max-width: 550px; width: 100%; margin-top: 10px; margin-bottom: 10px;");
    expect(ESTILOS.x(550, 612)).toBe("position: static; visibility: visible; width: 550px; height: 612px; display: block; flex-grow: 1;");
  });
  test("o título no idioma da página", () => {
    expect(tituloDaMoldura("x", "pt-BR")).toBe("Post do X");
    expect(tituloDaMoldura("x", "en")).toBe("X Post");
    expect(tituloDaMoldura("instagram", "pt")).toBe("Post do Instagram");
    expect(tituloDaMoldura("reddit", "en")).toBe("Reddit post");
  });
  test("o sandbox: sem navegar a página, sem formulário, sem download, sem diálogo; o do Reddit é o dele (sem escapar do sandbox)", () => {
    expect(SANDBOX_DA_MOLDURA.split(" ").sort()).toEqual(["allow-popups", "allow-popups-to-escape-sandbox", "allow-same-origin", "allow-scripts"]);
    expect(SANDBOX_DO_REDDIT.split(" ").sort()).toEqual(["allow-popups", "allow-same-origin", "allow-scripts"]);
    for (const flags of [SANDBOX_DA_MOLDURA, SANDBOX_DO_REDDIT]) {
      for (const proibido of ["allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-forms", "allow-downloads", "allow-modals", "allow-pointer-lock", "allow-orientation-lock", "allow-presentation", "allow-storage-access-by-user-activation"]) {
        expect(flags.split(" "), proibido).not.toContain(proibido);
      }
    }
  });
});

describe("alturaDaMensagem: os formatos de cada serviço, com limites", () => {
  const ID = "twitter-widget-0";
  const x = (h: unknown, extra: Record<string, unknown> = {}) => ({ "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.resize", params: [{ width: 550, height: h, data: { tweet_id: "1" } }], ...extra } });
  const reddit = (h: unknown) => JSON.stringify({ type: "resize.embed", data: h });
  const insta = (h: unknown) => JSON.stringify({ type: "MEASURE", details: { height: h } });

  test("os formatos reais (texto JSON e objeto)", () => {
    expect(alturaDaMensagem("x", x(612, { id: ID }), ID)).toBe(612);
    expect(alturaDaMensagem("x", JSON.stringify(x(612, { id: ID })), ID)).toBe(612);
    expect(alturaDaMensagem("x", x(612), ID), "X sem id").toBe(612);
    expect(alturaDaMensagem("reddit", reddit(638))).toBe(638);
    expect(alturaDaMensagem("reddit", { type: "resize.embed", data: "640" })).toBe(640);
    expect(alturaDaMensagem("instagram", insta(623))).toBe(623);
    expect(alturaDaMensagem("instagram", { type: "MEASURE", details: { height: 834.2 } })).toBe(835);
  });
  test("X: se a mensagem traz o id da moldura, tem de ser o desta moldura", () => {
    expect(alturaDaMensagem("x", x(300, { id: "twitter-widget-1" }), ID)).toBeNull();
  });
  test("as outras mensagens que os serviços mandam não mudam a altura (initialized, results, LOADING, MOUNTED)", () => {
    expect(alturaDaMensagem("x", JSON.stringify({ "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.initialized", id: ID, params: [{ iframe_version: "1", data: { tweet_id: "1" } }] } }), ID)).toBeNull();
    expect(alturaDaMensagem("x", { "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.results", id: ID, params: [{}] } }, ID)).toBeNull();
    expect(alturaDaMensagem("instagram", '{"details":{},"type":"LOADING"}')).toBeNull();
    expect(alturaDaMensagem("instagram", '{"details":{"styles":[["boxShadow","none"],["border","1px solid #dbdbdb"],["margin","0px 0px 12px"]]},"type":"MOUNTED"}')).toBeNull();
  });
  test("0 (o Reddit manda 0 quando a página não tem layout) é ignorado: a moldura não encolhe a nada", () => {
    expect(alturaDaMensagem("reddit", '{"type":"resize.embed","data":0}')).toBeNull();
    expect(alturaDaMensagem("x", x(0), ID)).toBeNull();
    expect(alturaDaMensagem("instagram", insta(0))).toBeNull();
  });
  test("a altura é limitada: nunca menor que ALTURA_MINIMA nem maior que ALTURA_MAXIMA", () => {
    expect(alturaDaMensagem("reddit", reddit(5))).toBe(ALTURA_MINIMA);
    expect(alturaDaMensagem("reddit", reddit(99999999))).toBe(ALTURA_MAXIMA);
    expect(alturaDaMensagem("x", x(1e12), ID)).toBe(ALTURA_MAXIMA);
    expect(alturaDaMensagem("instagram", insta(ALTURA_MAXIMA + 1))).toBe(ALTURA_MAXIMA);
  });
  test.each([
    ["nada", undefined],
    ["null", null],
    ["número solto", 400],
    ["texto que não é JSON", "olá"],
    ["JSON que não é objeto", "[1,2]"],
    ["lista", [1, 2]],
    ["objeto vazio", {}],
    ["JSON gigante", JSON.stringify({ type: "resize.embed", data: 500, lixo: "x".repeat(30000) })],
  ])("recusa %s", (_nome, dado) => {
    for (const s of SERVICOS) expect(alturaDaMensagem(s, dado, ID)).toBeNull();
  });
  test.each([
    ["Reddit: altura NaN", "reddit", { type: "resize.embed", data: NaN }],
    ["Reddit: negativa", "reddit", { type: "resize.embed", data: -10 }],
    ["Reddit: infinita", "reddit", { type: "resize.embed", data: Infinity }],
    ["Reddit: texto não numérico", "reddit", { type: "resize.embed", data: "abc" }],
    ["Reddit: objeto no lugar do número", "reddit", { type: "resize.embed", data: { valueOf: (): number => 500 } }],
    ["Reddit: tipo errado", "reddit", { type: "outra.coisa", data: 500 }],
    ["Instagram: tipo errado", "instagram", { type: "OUTRA", details: { height: 500 } }],
    ["Instagram: sem details", "instagram", { type: "MEASURE" }],
    ["X: método errado", "x", { "twttr.embed": { method: "twttr.private.outro", params: [{ height: 400 }] } }],
    ["X: params vazio", "x", { "twttr.embed": { method: "twttr.private.resize", params: [] } }],
    ["X: sem twttr.embed", "x", { type: "resize.embed", data: 400 }],
  ] as const)("recusa %s", (_nome, servico, dado) => {
    expect(alturaDaMensagem(servico, dado, ID)).toBeNull();
  });
  test("o formato de um serviço não vale para outro", () => {
    expect(alturaDaMensagem("x", reddit(500), ID)).toBeNull();
    expect(alturaDaMensagem("reddit", insta(500))).toBeNull();
    expect(alturaDaMensagem("instagram", x(500), ID)).toBeNull();
  });
});

describe("veioDaMoldura: a janela da moldura E a origem do serviço", () => {
  const janela = { id: "a" };
  test("aceita só com os dois", () => {
    expect(veioDaMoldura({ origin: "https://embed.reddit.com", source: janela }, janela, "reddit")).toBe(true);
    expect(veioDaMoldura({ origin: "https://embed.reddit.com", source: { id: "outra" } }, janela, "reddit")).toBe(false);
    expect(veioDaMoldura({ origin: "https://evil.test", source: janela }, janela, "reddit")).toBe(false);
    expect(veioDaMoldura({ origin: "null", source: janela }, janela, "reddit")).toBe(false);
    expect(veioDaMoldura({ origin: "https://platform.twitter.com", source: janela }, janela, "reddit")).toBe(false); // origem de outro serviço
  });
  test("sem janela da moldura (iframe ainda não existe ou foi removido) nada passa; source nulo também não", () => {
    expect(veioDaMoldura({ origin: "https://embed.reddit.com", source: null }, null, "reddit")).toBe(false);
    expect(veioDaMoldura({ origin: "https://embed.reddit.com", source: null }, undefined, "reddit")).toBe(false);
    expect(veioDaMoldura({ origin: "https://embed.reddit.com", source: undefined }, undefined, "reddit")).toBe(false);
  });
});

describe("o resto das regras", () => {
  test("altura inicial do Reddit: a que o código grava (data-embed-height), se razoável; senão 566", () => {
    expect(alturaInicialDoReddit("658")).toBe(658);
    expect(alturaInicialDoReddit("5")).toBe(566);
    expect(alturaInicialDoReddit("99999")).toBe(566);
    expect(alturaInicialDoReddit("abc")).toBe(566);
    expect(alturaInicialDoReddit(null)).toBe(566);
  });
  test("altura inicial do Instagram: a do blockquote na tela (sem pulo), ou 540", () => {
    expect(alturaInicialDoInstagram(611.2)).toBe(612);
    expect(alturaInicialDoInstagram(0)).toBe(540);
    expect(alturaInicialDoInstagram(NaN)).toBe(540);
  });
  test("classe do blockquote → serviço", () => {
    expect(servicoPelaClasse(["twitter-tweet"])).toBe("x");
    expect(servicoPelaClasse(["reddit-embed-bq", "outra"])).toBe("reddit");
    expect(servicoPelaClasse(["instagram-media"])).toBe("instagram");
    expect(servicoPelaClasse(["tiktok-embed"])).toBeNull();
  });
});

// ───────────────────────── parte 2: o passo de build ─────────────────────────

const REDDIT = `<div class="embed"><blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="740">
<a href="https://www.reddit.com/r/SpeculativeEvolution/comments/1b2ed7k/avialunas_aeternogyrinians/">Avialuna's</a><br> by
<a href="https://www.reddit.com/user/LuscaSharktopus/">u/LuscaSharktopus</a>
</blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>
</div>`;
const X = `<div class="embed"><blockquote class="twitter-tweet"><a href="https://x.com/KingOfAllOceans/status/1786071228421148897"></a></blockquote>
<script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>
</div><p class="embed-open"><a href="https://x.com/KingOfAllOceans/status/1786071228421148897" target="_blank" rel="noopener">&#8599; X</a></p>`;
const INSTA = `<div class="embed"><blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14"><div><a href="https://www.instagram.com/reel/DIb1JCngpAL/?utm_source=ig_embed" target="_blank">Ver no Instagram</a></div></blockquote><script async src="//www.instagram.com/embed.js"></script></div>`;

describe("tirarScriptsDosPosts: só sai script; nada entra", () => {
  test("os três serviços: o script sai e o resto do HTML fica BYTE A BYTE igual (nenhum atributo, nenhum quadro novo)", () => {
    for (const [html, servico] of [[REDDIT, "reddit"], [X, "x"], [INSTA, "instagram"]] as const) {
      const r = tirarScriptsDosPosts(`<p>antes</p>${html}<p>depois</p>`);
      expect(r.html, servico).not.toContain("<script");
      expect(r.html, servico).toBe(`<p>antes</p>${html.replace(/<script[^>]*><\/script>/, "")}<p>depois</p>`);
      expect(r.relatorio.posts.map((q) => q.servico)).toEqual([servico]);
      expect(r.relatorio.scriptsRemovidos).toHaveLength(1);
      expect(r.relatorio.avisos).toEqual([]);
    }
  });

  test("o relatório lista cada script (src, domínio, serviço, se estava no .embed) e cada post com o endereço canônico", () => {
    const r = tirarScriptsDosPosts(REDDIT + X + INSTA);
    expect(r.relatorio.scriptsRemovidos).toEqual([
      { src: "https://embed.reddit.com/widgets.js", dominio: "embed.reddit.com", servico: "reddit", dentroDoEmbed: true },
      { src: "https://platform.x.com/widgets.js", dominio: "platform.x.com", servico: "x", dentroDoEmbed: true },
      { src: "//www.instagram.com/embed.js", dominio: "www.instagram.com", servico: "instagram", dentroDoEmbed: true },
    ]);
    expect(r.relatorio.posts).toEqual([
      { servico: "reddit", post: "https://www.reddit.com/r/SpeculativeEvolution/comments/1b2ed7k/avialunas_aeternogyrinians/" },
      { servico: "x", post: "https://x.com/KingOfAllOceans/status/1786071228421148897" },
      { servico: "instagram", post: "https://www.instagram.com/reel/DIb1JCngpAL/" },
    ]);
  });

  test("a mesma página, duas vezes o mesmo resultado (é puro) e nada a fazer sem embed", () => {
    expect(tirarScriptsDosPosts(X).html).toBe(tirarScriptsDosPosts(X).html);
    const sem = '<p>oi</p><div class="video-wrapper"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    expect(tirarScriptsDosPosts(sem)).toEqual({ html: sem, relatorio: { posts: [], scriptsRemovidos: [], avisos: [] } });
  });

  test("vídeo do YouTube e TikTok em iframe, e o botão do Ko-fi, ficam exatamente como estão", () => {
    const iframes =
      '<div class="embed"><iframe width="315" height="576" src="https://www.youtube.com/embed/YwU6TahE2A8" title="y"></iframe></div>' +
      '<div class="short-embed tiktok-embed-frame"><iframe src="https://www.tiktok.com/player/v1/7494485379219754245?music_info=1" title="TikTok"></iframe></div>' +
      '<div class="embed"><p><a href="https://ko-fi.com/hatecycle">Apoie</a></p></div>';
    expect(tirarScriptsDosPosts(iframes).html).toBe(iframes);
  });

  test("embed alternado (A | B): cada post entra no relatório, os scripts saem, os botões de troca ficam", () => {
    const alt = `<div class="embed-alt"><div class="embed-panels"><div class="embed-panel is-on">${X}</div><div class="embed-panel">${REDDIT}</div></div><div class="embed-switch"><button type="button" class="embed-btn is-on" aria-pressed="true"><span>X</span></button><button type="button" class="embed-btn" aria-pressed="false"><span>Reddit</span></button></div></div>`;
    const r = tirarScriptsDosPosts(alt);
    expect(r.relatorio.posts.map((q) => q.servico)).toEqual(["x", "reddit"]);
    expect(r.html).not.toContain("<script");
    expect((r.html.match(/class="embed-btn/g) ?? []).length).toBe(2);
  });

  test("script de terceiros que o build não reconhece: sai do mesmo jeito, sem post, com aviso", () => {
    const tiktok = '<div class="embed"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@a/video/1" data-video-id="1"><a href="https://www.tiktok.com/@a/video/1">v</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script></div>';
    const r = tirarScriptsDosPosts(tiktok);
    expect(r.html).toBe(tiktok.replace(/<script.*<\/script>/, ""));
    expect(r.relatorio.posts).toEqual([]);
    expect(r.relatorio.scriptsRemovidos).toEqual([{ src: "https://www.tiktok.com/embed.js", dominio: "www.tiktok.com", servico: null, dentroDoEmbed: true }]);
    expect(r.relatorio.avisos).toHaveLength(1);
    expect(r.relatorio.avisos[0]).toContain("www.tiktok.com/embed.js");
  });

  test("script inline dentro do .embed também sai (e fica no relatório)", () => {
    const r = tirarScriptsDosPosts(`<div class="embed"><blockquote class="twitter-tweet"><a href="https://x.com/a/status/1"></a></blockquote><script>window.x=1</script><script src="/proprio.js"></script></div>`);
    expect(r.html).not.toContain("<script");
    expect(r.relatorio.scriptsRemovidos.map((s) => s.src)).toEqual([null, "/proprio.js"]);
  });

  test("blockquote sem link de post válido: o script sai, não há post (e há aviso)", () => {
    const r = tirarScriptsDosPosts('<div class="embed"><blockquote class="twitter-tweet"><a href="https://evil.test/a/status/1">x</a></blockquote><script src="https://platform.x.com/widgets.js"></script></div>');
    expect(r.html).not.toContain("<script");
    expect(r.relatorio.posts).toEqual([]);
    expect(r.relatorio.avisos[0]).toContain("sem link válido");
  });

  test("script solto (fora de .embed) de um dos três domínios sai; de outro domínio fica", () => {
    const r = tirarScriptsDosPosts('<p>a</p><script async src="https://platform.x.com/widgets.js"></script><script src="https://exemplo.test/outro.js"></script><script>var ok=1</script>');
    expect(r.html).not.toContain("platform.x.com");
    expect(r.html).toContain("exemplo.test/outro.js");
    expect(r.html).toContain("var ok=1");
    expect(r.relatorio.scriptsRemovidos).toEqual([{ src: "https://platform.x.com/widgets.js", dominio: "platform.x.com", servico: null, dentroDoEmbed: false }]);
  });

  test("o HTML do Astro = o do Python sem os scripts dos posts (a mesma regra da exceção de paridade)", () => {
    const pagina = `<main><p>x</p>${REDDIT}${X}${INSTA}<p>fim</p></main>`;
    expect(tirarScriptsDosPosts(pagina).html).toBe(semScriptsDosPosts(pagina).html);
  });
});

// ───────────────────────── parte 3: a exceção de paridade ─────────────────────────

describe("exceção de paridade do Python: tira só o <script src> dos três serviços dentro de .embed", () => {
  test("tira os três; devolve os src", () => {
    const r = semScriptsDosPosts(REDDIT + X + INSTA);
    expect(r.removidos).toEqual(["https://embed.reddit.com/widgets.js", "https://platform.x.com/widgets.js", "//www.instagram.com/embed.js"]);
    expect(r.html).not.toContain("<script");
    expect(r.html).toContain("<blockquote");
  });
  test("não tira: script de outro domínio, inline, fora de .embed, nem iframe", () => {
    const html =
      '<div class="embed"><script src="https://exemplo.test/x.js"></script><script>var a=1</script><iframe src="https://www.youtube.com/embed/abc"></iframe></div>' +
      '<script src="https://platform.x.com/widgets.js"></script><div class="outra"><script src="https://embed.reddit.com/widgets.js"></script></div>';
    const r = semScriptsDosPosts(html);
    expect(r.removidos).toEqual([]);
    expect(r.html).toBe(html);
  });
  test("um domínio parecido não passa (platform.x.com.evil.test, x.com)", () => {
    const html = '<div class="embed"><script src="https://platform.x.com.evil.test/widgets.js"></script><script src="https://x.com/widgets.js"></script></div>';
    expect(semScriptsDosPosts(html).removidos).toEqual([]);
  });
  test("os domínios aceitos são só os que o Python tem (os quatro endereços de script dos serviços) e todos estão na lista do build", () => {
    expect([...DOMINIOS_DOS_SCRIPTS_DOS_POSTS].sort()).toEqual(["embed.reddit.com", "platform.twitter.com", "platform.x.com", "www.instagram.com"]);
    const doBuild = new Set(SERVICOS.flatMap((s) => DADOS[s].dominiosDoScript));
    for (const d of DOMINIOS_DOS_SCRIPTS_DOS_POSTS) expect(doBuild.has(d), d).toBe(true);
  });
});

// ───────────────────────── parte 4: o site construído ─────────────────────────

type No = DefaultTreeAdapterMap["node"];
type Elemento = DefaultTreeAdapterMap["element"];
const ehElemento = (n: No): n is Elemento => "tagName" in n;
const filhosDe = (n: No): No[] => {
  const alvo = "content" in n ? n.content : n;
  return "childNodes" in alvo ? alvo.childNodes : [];
};
function varrer(n: No, quando: (e: Elemento) => boolean, achados: Elemento[] = []): Elemento[] {
  if (ehElemento(n) && quando(n)) achados.push(n);
  for (const f of filhosDe(n)) varrer(f, quando, achados);
  return achados;
}
const attr = (e: Elemento, nome: string) => e.attrs.find((a) => a.name === nome)?.value;
const classes = (e: Elemento) => (attr(e, "class") ?? "").split(/\s+/);

let dist = process.env["HC_DIST"] ? join(RAIZ, process.env["HC_DIST"]) : "";
let pastaTemporaria = "";
beforeAll(() => {
  if (dist) return;
  pastaTemporaria = mkdtempSync(join(tmpdir(), "hc-embeds-dist-"));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", HC_OUT_DIR: pastaTemporaria };
  for (const k of Object.keys(env)) if (k.startsWith("VITEST") || ["MODE", "DEV", "PROD", "SSR", "TEST", "BASE_URL", "SITE", "ASSETS_PREFIX", "FORCE_TTY"].includes(k)) delete env[k];
  delete env["HC_SHOW_EXTRAS"];
  const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "astro", "bin", "astro.mjs"), "build"], { cwd: RAIZ, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`astro build falhou:\n${r.stdout}\n${r.stderr}`);
  dist = pastaTemporaria;
}, 240_000);
afterAll(() => {
  if (pastaTemporaria) rmSync(pastaTemporaria, { recursive: true, force: true });
});

function arquivosDe(pasta: string): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else achados.push(relative(pasta, caminho).split(sep).join("/"));
    }
  };
  andar(pasta);
  return achados.sort();
}
const enderecoDoHtml = (arquivo: string) => "/" + arquivo.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, ".html");

describe("o site publicado não carrega script de terceiros em nenhuma página", () => {
  test("todo <script src> do dist é do próprio site (/_astro/…); nada de reddit, x, twitter, instagram, tiktok, nem CDN", () => {
    const fora: string[] = [];
    let paginas = 0;
    let comSrc = 0;
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      paginas++;
      const raiz = parse(readFileSync(join(dist, arquivo), "utf8")) as unknown as No;
      for (const s of varrer(raiz, (e) => e.tagName === "script")) {
        const src = attr(s, "src");
        if (src === undefined) continue;
        comSrc++;
        if (!/^\/_astro\/[\w.-]+\.js$/.test(src)) fora.push(`${arquivo}: ${src}`);
      }
    }
    expect(paginas).toBeGreaterThan(190);
    expect(comSrc).toBeGreaterThan(300); // (sanidade: os scripts do próprio site continuam lá)
    expect(fora, "script de fora do site").toEqual([]);
  });

  test("nem as palavras: nenhum arquivo do site cita os endereços dos scripts desses serviços", () => {
    const re = /platform\.(x|twitter)\.com\/widgets\.js|embed\.reddit\.com\/widgets\.js|instagram\.com\/embed\.js|tiktok\.com\/embed\.js/;
    const citam = arquivosDe(dist)
      .filter((a) => /\.(html|xml|js|css|json|txt)$/.test(a))
      .filter((a) => re.test(readFileSync(join(dist, a), "utf8")));
    expect(citam).toEqual([]);
  });

  test("os feeds RSS e o sitemap não levam <script> nenhum", () => {
    for (const a of arquivosDe(dist).filter((x) => /(feed|sitemap[\w-]*)\.xml$/.test(x))) expect(readFileSync(join(dist, a), "utf8"), a).not.toMatch(/<script/i);
  });
});

interface Referencia {
  paginas: Record<string, string>;
}
const refs: Referencia[] = ["t11", "t12", "t13", "t14"].map((g) => JSON.parse(readFileSync(new URL(`./fixtures/paginas-${g}-python.json`, import.meta.url), "utf8")));
const doPython: Record<string, string> = Object.assign({}, ...refs.map((r) => r.paginas));

describe("toda página que tinha post incorporado: o blockquote está lá, sem script, e o script dos posts vem junto", () => {
  test("blockquotes dos três serviços (o Astro) = scripts que o Python tinha, página a página; 144 páginas, 184 posts", () => {
    let comPosts = 0;
    let total = 0;
    const erros: string[] = [];
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      const url = enderecoDoHtml(arquivo);
      const raiz = parse(readFileSync(join(dist, arquivo), "utf8")) as unknown as No;
      const posts = varrer(raiz, (e) => e.tagName === "blockquote" && SERVICOS.some((s) => classes(e).includes(DADOS[s].classe)));
      const py = doPython[url];
      if (py !== undefined) {
        const tirados = semScriptsDosPosts(py).removidos.length;
        if (tirados !== posts.length) erros.push(`${url}: o Python tinha ${tirados} script(s) de posts, o Astro tem ${posts.length} post(s)`);
      }
      // nada do quadro com clique da T17g sobrou
      if (varrer(raiz, (e) => classes(e).includes("embed-gate") || classes(e).includes("embed-load") || attr(e, "data-embed-servico") !== undefined).length) erros.push(`${url}: sobrou marcação do quadro com clique`);
      if (posts.length) comPosts++;
      total += posts.length;
    }
    expect(erros).toEqual([]);
    expect(comPosts, "páginas com posts").toBe(144);
    expect(total, "posts").toBe(184);
  });

  test("a contagem por serviço é a da revisão da T19 (R6): Reddit 76, X 72, Instagram 36", () => {
    const por: Record<string, number> = { x: 0, reddit: 0, instagram: 0 };
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      const raiz = parse(readFileSync(join(dist, arquivo), "utf8")) as unknown as No;
      for (const bq of varrer(raiz, (e) => e.tagName === "blockquote")) {
        const s = servicoPelaClasse(classes(bq));
        if (s) por[s] = (por[s] ?? 0) + 1;
      }
    }
    expect(por).toEqual({ x: 72, reddit: 76, instagram: 36 });
  });

  test("o script dos posts vem só nas páginas com post, fora do <main>; as outras nem o carregam", () => {
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      const html = readFileSync(join(dist, arquivo), "utf8");
      const temPost = /<blockquote class="(twitter-tweet|reddit-embed-bq|instagram-media)"/.test(html);
      const scripts = html.match(/<script type="module" src="[^"]*PostsIncorporados\.astro[^"]*"><\/script>/g) ?? [];
      expect(scripts.length, arquivo).toBe(temPost ? 1 : 0);
      if (temPost) expect(html.indexOf(scripts[0] ?? ""), arquivo).toBeGreaterThan(html.indexOf("</main>"));
    }
  });
});

describe("o conteúdo do autor: todo post de rede social tem endereço de moldura válido", () => {
  const EMBEDS = join(RAIZ, "content", "embeds");
  const lerEmbed = (nome: string): string | undefined => {
    try {
      return readFileSync(join(EMBEDS, `${nome}.html`), "utf8").replace(/^﻿/, "");
    } catch {
      return undefined;
    }
  };
  const molduraDe = (p: { servico: (typeof SERVICOS)[number]; post: string }) => enderecoDaMoldura(pedido(p.servico, p.post));

  test("cada content/embeds/{reddit,x,instagram}-*.html: um post, endereço de moldura válido, scripts só dos domínios conhecidos", () => {
    const arquivos = readdirSync(EMBEDS).filter((a) => /^(reddit|x|instagram)-.*\.html$/.test(a));
    expect(arquivos.length).toBe(49);
    const dominios = new Set<string>();
    for (const a of arquivos) {
      const r = tirarScriptsDosPosts(`<div class="embed">${readFileSync(join(EMBEDS, a), "utf8")}</div>`);
      expect(r.relatorio.avisos, a).toEqual([]);
      expect(r.relatorio.posts, a).toHaveLength(1);
      expect(r.relatorio.posts[0]?.servico, a).toBe(a.split("-")[0]);
      expect(molduraDe(r.relatorio.posts[0] ?? { servico: "x", post: "" }), a).not.toBeNull();
      expect(r.html, a).not.toContain("<script");
      for (const s of r.relatorio.scriptsRemovidos) dominios.add(s.dominio ?? "(inline)");
    }
    // a lista dos domínios que o build tira (se aparecer um novo, este teste avisa: decidir antes de aceitar)
    expect([...dominios].sort()).toEqual(["embed.reddit.com", "platform.x.com", "www.instagram.com"]);
  });

  test("nenhum blockquote do X tem data-* (o widgets.js os leria: data-theme, data-cards…); se o autor colar um, opcoesDoX trata", () => {
    for (const a of readdirSync(EMBEDS).filter((x) => /^x-.*\.html$/.test(x))) expect(readFileSync(join(EMBEDS, a), "utf8"), a).toMatch(/^<blockquote class="twitter-tweet">/);
  });

  test("os outros arquivos de content/embeds/ (Ko-fi, ficha de feitiço, YouTube) não têm script nenhum", () => {
    for (const a of readdirSync(EMBEDS).filter((x) => !/^(reddit|x|instagram)-/.test(x))) expect(readFileSync(join(EMBEDS, a), "utf8"), a).not.toMatch(/<script/i);
  });

  test("os links {{embed:https://…}} dos .md: cada post vira um post com moldura válida, e nenhum deixa script", () => {
    const md: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const c = join(dir, nome);
        if (statSync(c).isDirectory()) andar(c);
        else if (nome.endsWith(".md")) md.push(c);
      }
    };
    andar(join(RAIZ, "content"));
    let links = 0;
    const porTipo: Record<string, number> = {};
    for (const arquivo of md) {
      for (const m of readFileSync(arquivo, "utf8").matchAll(/\{\{embed:([^}]+)\}\}/g)) {
        const html = embedHtml(m[1] ?? "", lerEmbed);
        if (!html) continue;
        const r = tirarScriptsDosPosts(html);
        links++;
        expect(r.html, `${arquivo}: ${m[1]}`).not.toContain("<script");
        expect(r.relatorio.avisos, `${arquivo}: ${m[1]}`).toEqual([]);
        for (const q of r.relatorio.posts) {
          porTipo[q.servico] = (porTipo[q.servico] ?? 0) + 1;
          expect(molduraDe(q), `${arquivo}: ${m[1]}`).not.toBeNull();
        }
        // o que o Python tinha de script, o Astro tem de post
        expect(r.relatorio.posts.length, `${arquivo}: ${m[1]}`).toBe(r.relatorio.scriptsRemovidos.length);
      }
    }
    expect(links).toBeGreaterThan(100);
    expect(porTipo["x"]).toBeGreaterThan(40);
    expect(porTipo["instagram"]).toBeGreaterThan(15);
  });
});

// ───────────────────────── parte 5: o código do navegador ─────────────────────────

describe("src/scripts/embeds/: sem as palavras proibidas e só os imports permitidos", () => {
  const PASTA = join(RAIZ, "src", "scripts", "embeds");
  const arquivos = readdirSync(PASTA).filter((a) => a.endsWith(".ts"));
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

  test("os arquivos são os esperados", () => {
    expect(arquivos.sort()).toEqual(["bloco.ts", "index.ts", "regras.ts"]);
  });
  test.each(arquivos)("%s não cria <script>, não monta HTML, não usa srcdoc, eval nem Function", (a) => {
    const codigo = semComentarios(readFileSync(join(PASTA, a), "utf8"));
    for (const palavra of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "DOMParser", "createContextualFragment", "srcdoc", "eval(", "new Function", "setTimeout(\"", "importScripts", "createElement(\"script\")", "createElement('script')", "allow-top-navigation", "allow-forms", "localStorage", "sessionStorage", "document.cookie", "about:blank", "javascript:", "location.href", "location.search", "location.hash"]) {
      expect(codigo, `${a}: ${palavra}`).not.toContain(palavra);
    }
    expect(codigo, `${a}: nunca <script>`).not.toMatch(/<script/i);
  });
  test("imports: bloco.ts só importa ./regras; index.ts só ./bloco; regras.ts nada (nada de src/lib nem config.json)", () => {
    const importa = (a: string) => [...readFileSync(join(PASTA, a), "utf8").matchAll(/^import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(importa("regras.ts")).toEqual([]);
    expect(importa("bloco.ts")).toEqual(["./regras"]);
    expect(importa("index.ts")).toEqual(["./bloco"]);
  });
  test("o componente só carrega o script (sem CSS do quadro de antes)", () => {
    const c = readFileSync(join(RAIZ, "src", "components", "PostsIncorporados.astro"), "utf8");
    expect(c).toContain('import "../scripts/embeds/index";');
    expect(c).not.toMatch(/<style/);
  });
});
