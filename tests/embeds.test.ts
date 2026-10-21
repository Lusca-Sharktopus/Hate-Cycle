// Prova dos POSTS INCORPORADOS SÓ COM CLIQUE (T17g, B27): nenhum script de terceiros nas páginas publicadas, o quadro "Mostrar post do …"
// no lugar de cada post, e a exceção de paridade com o Python que não esconde mais nada.
//
// Parte 1 — as regras puras do navegador (src/scripts/embeds/regras.ts): endereço do post, endereço do quadro (a origem é a do serviço),
//           mensagens de altura (formato, limites), de quem aceitar a mensagem.
// Parte 2 — o passo de build (src/lib/embedsComClique.ts) em HTML inventado: o que sai, o que fica, o que o quadro leva, os avisos.
// Parte 3 — as exceções de paridade (tests/ajudantes/html.ts → semQuadrosDosPosts, semScriptsDosPosts): tiram SÓ o combinado (casos negativos).
// Parte 4 — o site construído de verdade (`astro build` numa pasta temporária, ou HC_DIST=<pasta>): nenhuma página (nem feed, nem sitemap)
//           carrega script de terceiros; toda página que tinha post tem um quadro por post; os scripts tirados do Python (referência do
//           build.py) são tantos quanto os quadros do Astro, página a página; cada post do conteúdo vira um quadro com endereço válido.
// Parte 5 — o código do navegador não tem as palavras proibidas e importa só o que pode; o botão tem contraste de leitura.
// O comportamento do script (clique, iframe, mensagens) está em tests/embeds-dom.test.ts; no navegador de verdade, tools/embeds_playwright.py.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { embedsComClique } from "../src/lib/embedsComClique";
import { embedHtml } from "../src/lib/markdown";
import { textosDoEmbed } from "../src/lib/textosDosEmbeds";
import {
  ALTURA_MAXIMA,
  ALTURA_MINIMA,
  DADOS,
  SANDBOX_DO_QUADRO,
  SERVICOS,
  alturaDaMensagem,
  alturaInicial,
  enderecoDoQuadro,
  novoIdDoQuadro,
  servicoPelaClasse,
  urlDoPost,
  veioDoQuadro,
} from "../src/scripts/embeds/regras";
import { DOMINIOS_DOS_SCRIPTS_DOS_POSTS, semQuadrosDosPosts, semScriptsDosPosts } from "./ajudantes/html";

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
});

describe("enderecoDoQuadro: a página de incorporação do serviço, sempre da origem do serviço", () => {
  const pedido = (servico: (typeof SERVICOS)[number], post: string, extra = {}) => ({ servico, post, idioma: "pt", origemDaPagina: "https://hatecycle.com", idDoQuadro: "abc123xyz789", ...extra });

  test("X: Tweet.html com o id, sem rastreio (dnt), tema claro e o id do quadro", () => {
    const u = new URL(enderecoDoQuadro(pedido("x", "https://x.com/KingOfAllOceans/status/1786071228421148897")) ?? "");
    expect(u.origin).toBe("https://platform.twitter.com");
    expect(u.pathname).toBe("/embed/Tweet.html");
    expect(Object.fromEntries(u.searchParams)).toEqual({ dnt: "true", embedId: "abc123xyz789", frame: "false", id: "1786071228421148897", lang: "pt", origin: "https://hatecycle.com", theme: "light" });
  });
  test("X: idioma estranho vira en (nada do idioma entra no endereço sem conferir)", () => {
    const u = new URL(enderecoDoQuadro(pedido("x", "https://x.com/a/status/1", { idioma: "../../x" })) ?? "");
    expect(u.searchParams.get("lang")).toBe("en");
  });
  test("Reddit: embed.reddit.com + o caminho do post + ?embed=true", () => {
    expect(enderecoDoQuadro(pedido("reddit", "https://www.reddit.com/r/conlangs/comments/1p7hwpd/protoarticulate_the_language_of_crabs/"))).toBe(
      "https://embed.reddit.com/r/conlangs/comments/1p7hwpd/protoarticulate_the_language_of_crabs/?embed=true&theme=light",
    );
  });
  test("Instagram: /embed/ (ou /embed/captioned/ se o código tinha legenda)", () => {
    expect(enderecoDoQuadro(pedido("instagram", "https://www.instagram.com/reel/DIb1JCngpAL/"))).toBe("https://www.instagram.com/reel/DIb1JCngpAL/embed/");
    expect(enderecoDoQuadro(pedido("instagram", "https://www.instagram.com/reel/DIb1JCngpAL/", { comLegenda: true }))).toBe("https://www.instagram.com/reel/DIb1JCngpAL/embed/captioned/");
  });
  test("só aceita o endereço canônico de urlDoPost (nada de parâmetro de rastreio, outro domínio ou javascript:)", () => {
    expect(enderecoDoQuadro(pedido("x", "https://x.com/a/status/1?utm=1"))).toBeNull();
    expect(enderecoDoQuadro(pedido("x", "https://evil.test/a/status/1"))).toBeNull();
    expect(enderecoDoQuadro(pedido("reddit", "javascript:alert(1)"))).toBeNull();
    expect(enderecoDoQuadro(pedido("instagram", "https://www.instagram.com/p/ABCDEFG123"))).toBeNull(); // sem a barra final: não é o canônico
  });
  test("a origem do endereço montado é SEMPRE a do serviço e nunca a do site", () => {
    const posts = { x: "https://x.com/a/status/1", reddit: "https://www.reddit.com/r/a/comments/abc123/t/", instagram: "https://www.instagram.com/p/ABCDEFG123/" } as const;
    for (const s of SERVICOS) {
      const src = enderecoDoQuadro(pedido(s, posts[s], { origemDaPagina: "https://hatecycle.com" })) ?? "";
      expect(new URL(src).origin, s).toBe(DADOS[s].origem);
      expect(new URL(src).origin, s).not.toBe("https://hatecycle.com");
      expect(new URL(src).protocol, s).toBe("https:");
    }
  });
});

describe("alturaDaMensagem: o formato de cada serviço, com limites", () => {
  const ID = "abc123";
  const x = (h: unknown, extra: Record<string, unknown> = {}) => ({ "twttr.embed": { method: "twttr.private.resize", params: [{ width: 550, height: h }], ...extra } });
  const reddit = (h: unknown) => ({ type: "resize.embed", data: h });
  const insta = (h: unknown) => ({ type: "MEASURE", details: { height: h } });

  test("objeto ou o JSON dele em texto", () => {
    expect(alturaDaMensagem("x", x(321), ID)).toBe(321);
    expect(alturaDaMensagem("x", JSON.stringify(x(321)), ID)).toBe(321);
    expect(alturaDaMensagem("reddit", reddit(640), ID)).toBe(640);
    expect(alturaDaMensagem("reddit", JSON.stringify(reddit("640")), ID)).toBe(640);
    expect(alturaDaMensagem("instagram", insta(834.2), ID)).toBe(835);
    expect(alturaDaMensagem("instagram", JSON.stringify(insta(834)), ID)).toBe(834);
  });
  test("X: se a mensagem traz o id do quadro, tem de ser o deste quadro", () => {
    expect(alturaDaMensagem("x", x(300, { id: ID }), ID)).toBe(300);
    expect(alturaDaMensagem("x", x(300, { id: "outro" }), ID)).toBeNull();
  });
  test("a altura é limitada: nunca menor que ALTURA_MINIMA nem maior que ALTURA_MAXIMA", () => {
    expect(alturaDaMensagem("reddit", reddit(5), ID)).toBe(ALTURA_MINIMA);
    expect(alturaDaMensagem("reddit", reddit(99999999), ID)).toBe(ALTURA_MAXIMA);
    expect(alturaDaMensagem("x", x(1e12), ID)).toBe(ALTURA_MAXIMA);
    expect(alturaDaMensagem("instagram", insta(ALTURA_MAXIMA + 1), ID)).toBe(ALTURA_MAXIMA);
  });
  test.each([
    ["nada", undefined],
    ["null", null],
    ["número solto", 400],
    ["texto que não é JSON", "olá"],
    ["JSON que não é objeto", "[1,2]"],
    ["lista", [1, 2]],
    ["objeto vazio", {}],
    ["JSON gigante", JSON.stringify({ type: "resize.embed", data: 500, lixo: "x".repeat(5000) })],
  ])("recusa %s", (_nome, dado) => {
    for (const s of SERVICOS) expect(alturaDaMensagem(s, dado, ID)).toBeNull();
  });
  test.each([
    ["Reddit: altura NaN", "reddit", reddit(NaN)],
    ["Reddit: negativa", "reddit", reddit(-10)],
    ["Reddit: zero", "reddit", reddit(0)],
    ["Reddit: infinita", "reddit", reddit(Infinity)],
    ["Reddit: texto não numérico", "reddit", reddit("abc")],
    ["Reddit: objeto no lugar do número", "reddit", reddit({ valueOf: () => 500 })],
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
    expect(alturaDaMensagem("reddit", insta(500), ID)).toBeNull();
    expect(alturaDaMensagem("instagram", x(500), ID)).toBeNull();
  });
});

describe("veioDoQuadro: a janela do quadro E a origem do serviço", () => {
  const janela = { id: "a" };
  test("aceita só com os dois", () => {
    expect(veioDoQuadro({ origin: "https://embed.reddit.com", source: janela }, janela, "reddit")).toBe(true);
    expect(veioDoQuadro({ origin: "https://embed.reddit.com", source: { id: "outra" } }, janela, "reddit")).toBe(false);
    expect(veioDoQuadro({ origin: "https://evil.test", source: janela }, janela, "reddit")).toBe(false);
    expect(veioDoQuadro({ origin: "null", source: janela }, janela, "reddit")).toBe(false);
    expect(veioDoQuadro({ origin: "https://platform.twitter.com", source: janela }, janela, "reddit")).toBe(false); // origem de outro serviço
  });
  test("sem janela do quadro (iframe ainda não existe ou foi removido) nada passa; source nulo também não", () => {
    expect(veioDoQuadro({ origin: "https://embed.reddit.com", source: null }, null, "reddit")).toBe(false);
    expect(veioDoQuadro({ origin: "https://embed.reddit.com", source: null }, undefined, "reddit")).toBe(false);
    expect(veioDoQuadro({ origin: "https://embed.reddit.com", source: undefined }, undefined, "reddit")).toBe(false);
  });
});

describe("o resto das regras", () => {
  test("altura inicial: a que o Reddit grava no código, se razoável; senão a do serviço", () => {
    expect(alturaInicial("reddit", "740")).toBe(740);
    expect(alturaInicial("reddit", "5")).toBe(DADOS.reddit.alturaPadrao);
    expect(alturaInicial("reddit", "99999")).toBe(DADOS.reddit.alturaPadrao);
    expect(alturaInicial("reddit", "abc")).toBe(DADOS.reddit.alturaPadrao);
    expect(alturaInicial("x", null)).toBe(DADOS.x.alturaPadrao);
    expect(alturaInicial("instagram", undefined)).toBe(DADOS.instagram.alturaPadrao);
  });
  test("id do quadro: 12 letras/números, diferente a cada sorteio", () => {
    let n = 0;
    const sorteio = (k: number) => Uint8Array.from({ length: k }, (_v, i) => (n++ * 7 + i * 13) % 256);
    const a = novoIdDoQuadro(sorteio);
    const b = novoIdDoQuadro(sorteio);
    expect(a).toMatch(/^[a-z0-9]{12}$/);
    expect(b).toMatch(/^[a-z0-9]{12}$/);
    expect(a).not.toBe(b);
  });
  test("classe do blockquote → serviço", () => {
    expect(servicoPelaClasse(["twitter-tweet"])).toBe("x");
    expect(servicoPelaClasse(["reddit-embed-bq", "outra"])).toBe("reddit");
    expect(servicoPelaClasse(["instagram-media"])).toBe("instagram");
    expect(servicoPelaClasse(["tiktok-embed"])).toBeNull();
  });
  test("o sandbox: sem navegar a página, sem formulário, sem download, sem diálogo, sem pop-up sem clique", () => {
    const flags = SANDBOX_DO_QUADRO.split(" ").sort();
    expect(flags).toEqual(["allow-popups", "allow-popups-to-escape-sandbox", "allow-same-origin", "allow-scripts"]);
    for (const proibido of ["allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-forms", "allow-downloads", "allow-modals", "allow-pointer-lock", "allow-orientation-lock", "allow-presentation", "allow-storage-access-by-user-activation"]) {
      expect(flags, proibido).not.toContain(proibido);
    }
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

describe("embedsComClique: o que sai, o que fica, o que entra", () => {
  test("os três serviços: script fora, blockquote igual, atributo e quadro no fim do .embed", () => {
    for (const [html, servico] of [[REDDIT, "reddit"], [X, "x"], [INSTA, "instagram"]] as const) {
      const r = embedsComClique(`<p>antes</p>${html}<p>depois</p>`, "pt");
      expect(r.html, servico).not.toContain("<script");
      expect(r.html, servico).toContain(`<div class="embed" data-embed-servico="${servico}">`);
      expect(r.relatorio.quadros.map((q) => q.servico)).toEqual([servico]);
      expect(r.relatorio.scriptsRemovidos).toHaveLength(1);
      expect(r.relatorio.avisos).toEqual([]);
      // o blockquote inteiro continua byte a byte como estava
      const bq = /<blockquote[\s\S]*?<\/blockquote>/.exec(html)?.[0] ?? "";
      expect(r.html, servico).toContain(bq);
      // e o texto de fora também
      expect(r.html.startsWith("<p>antes</p>")).toBe(true);
      expect(r.html.endsWith("<p>depois</p>") || servico === "x").toBe(true);
      // o quadro é o último filho do .embed
      expect(r.html, servico).toMatch(/<\/blockquote>\s*<div class="embed-gate"[\s\S]*?<\/div><\/div>/);
    }
  });

  test("o relatório lista cada script: src, domínio, serviço, se estava no .embed", () => {
    const r = embedsComClique(REDDIT + X + INSTA, "en");
    expect(r.relatorio.scriptsRemovidos).toEqual([
      { src: "https://embed.reddit.com/widgets.js", dominio: "embed.reddit.com", servico: "reddit", dentroDoEmbed: true },
      { src: "https://platform.x.com/widgets.js", dominio: "platform.x.com", servico: "x", dentroDoEmbed: true },
      { src: "//www.instagram.com/embed.js", dominio: "www.instagram.com", servico: "instagram", dentroDoEmbed: true },
    ]);
  });

  test("o quadro: aviso e botão com hidden, link canônico seguro, status, textos do idioma e dados do Reddit/Instagram", () => {
    const pt = embedsComClique(REDDIT, "pt").html;
    expect(pt).toContain('<p class="embed-gate-aviso" hidden>Este post é do Reddit e só é carregado quando você clica.</p>');
    expect(pt).toContain('<button type="button" class="embed-load" hidden>Mostrar post do Reddit</button>');
    expect(pt).toContain('<a class="embed-origin" href="https://www.reddit.com/r/SpeculativeEvolution/comments/1b2ed7k/avialunas_aeternogyrinians/" target="_blank" rel="noopener noreferrer">Abrir o post original no Reddit ↗</a>');
    expect(pt).toContain('<p class="embed-status" role="status"></p>');
    expect(pt).toContain('data-altura="740"');
    const en = embedsComClique(X, "en").html;
    expect(en).toContain(">Show X post</button>");
    expect(en).toContain("Open the original post on X ↗");
    expect(en).toContain('data-t-titulo="X post"');
    const ig = embedsComClique(INSTA, "pt").html;
    expect(ig).toContain(" data-legendado");
    expect(ig).toContain('href="https://www.instagram.com/reel/DIb1JCngpAL/"'); // sem os parâmetros de rastreio
    expect(ig).toContain(">Mostrar post do Instagram</button>");
  });

  test("os textos são dos dois idiomas, com o nome do serviço", () => {
    for (const s of SERVICOS) {
      const pt = textosDoEmbed("pt", DADOS[s].rotulo);
      const en = textosDoEmbed("en", DADOS[s].rotulo);
      expect(pt.botao).toBe(`Mostrar post do ${DADOS[s].rotulo}`);
      expect(en.botao).toBe(`Show ${DADOS[s].rotulo} post`);
      for (const campo of Object.keys(pt) as (keyof typeof pt)[]) expect(pt[campo] === en[campo], campo).toBe(false);
    }
  });

  test("a mesma página, duas vezes o mesmo resultado (é puro) e nada a fazer sem embed", () => {
    expect(embedsComClique(X, "pt").html).toBe(embedsComClique(X, "pt").html);
    const sem = '<p>oi</p><div class="video-wrapper"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    expect(embedsComClique(sem, "pt")).toEqual({ html: sem, relatorio: { quadros: [], scriptsRemovidos: [], avisos: [] } });
  });

  test("vídeo do YouTube e TikTok em iframe, e o botão do Ko-fi, ficam exatamente como estão", () => {
    const iframes =
      '<div class="embed"><iframe width="315" height="576" src="https://www.youtube.com/embed/YwU6TahE2A8" title="y"></iframe></div>' +
      '<div class="short-embed tiktok-embed-frame"><iframe src="https://www.tiktok.com/player/v1/7494485379219754245?music_info=1" title="TikTok"></iframe></div>' +
      '<div class="embed"><p><a href="https://ko-fi.com/hatecycle">Apoie</a></p></div>';
    expect(embedsComClique(iframes, "pt").html).toBe(iframes);
  });

  test("embed alternado (A | B | C): cada post ganha o seu quadro, os botões de troca ficam", () => {
    const alt = `<div class="embed-alt"><div class="embed-panels"><div class="embed-panel is-on">${X}</div><div class="embed-panel">${REDDIT}</div></div><div class="embed-switch"><button type="button" class="embed-btn is-on" aria-pressed="true"><span>X</span></button><button type="button" class="embed-btn" aria-pressed="false"><span>Reddit</span></button></div></div>`;
    const r = embedsComClique(alt, "pt");
    expect(r.relatorio.quadros.map((q) => q.servico)).toEqual(["x", "reddit"]);
    expect(r.html).not.toContain("<script");
    expect((r.html.match(/class="embed-btn/g) ?? []).length).toBe(2);
    expect((r.html.match(/<button type="button" class="embed-load"/g) ?? []).length).toBe(2);
  });

  test("plano C: com DADOS[servico].comBotao = false o quadro leva só o link para o original (sem botão, sem aviso) e o script sai do mesmo jeito", () => {
    const dados = DADOS as unknown as Record<string, { comBotao: boolean }>;
    expect(SERVICOS.every((s) => DADOS[s].comBotao), "o padrão é ligado para os três").toBe(true);
    dados["x"]!.comBotao = false;
    try {
      const r = embedsComClique(X + REDDIT, "pt");
      expect(r.html).not.toContain("<script");
      expect((r.html.match(/class="embed-load"/g) ?? []).length, "só o Reddit ficou com botão").toBe(1);
      expect(r.html).toContain('<div class="embed-gate"><a class="embed-origin" href="https://x.com/KingOfAllOceans/status/1786071228421148897"');
      expect(r.relatorio.quadros.map((q) => q.servico)).toEqual(["x", "reddit"]);
      // a exceção de paridade continua tirando o quadro (é sempre o último filho do .embed)
      expect(semQuadrosDosPosts(r.html)).toMatchObject({ quadros: 2, atributos: 2, quadrosFora: 0 });
    } finally {
      dados["x"]!.comBotao = true;
    }
  });

  test("script de terceiros que o build não reconhece: sai do mesmo jeito, sem botão, com aviso", () => {
    const tiktok = '<div class="embed"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@a/video/1" data-video-id="1"><a href="https://www.tiktok.com/@a/video/1">v</a></blockquote><script async src="https://www.tiktok.com/embed.js"></script></div>';
    const r = embedsComClique(tiktok, "pt");
    expect(r.html).not.toContain("<script");
    expect(r.html).not.toContain("embed-load");
    expect(r.html).toContain('<blockquote class="tiktok-embed"');
    expect(r.relatorio.scriptsRemovidos).toEqual([{ src: "https://www.tiktok.com/embed.js", dominio: "www.tiktok.com", servico: null, dentroDoEmbed: true }]);
    expect(r.relatorio.avisos).toHaveLength(1);
    expect(r.relatorio.avisos[0]).toContain("www.tiktok.com/embed.js");
  });

  test("script inline dentro do .embed também sai (e fica no relatório)", () => {
    const r = embedsComClique(`<div class="embed"><blockquote class="twitter-tweet"><a href="https://x.com/a/status/1"></a></blockquote><script>window.x=1</script><script src="/proprio.js"></script></div>`, "pt");
    expect(r.html).not.toContain("<script");
    expect(r.relatorio.scriptsRemovidos.map((s) => s.src)).toEqual([null, "/proprio.js"]);
  });

  test("blockquote sem link de post válido: o script sai, não há botão (e há aviso)", () => {
    const r = embedsComClique('<div class="embed"><blockquote class="twitter-tweet"><a href="https://evil.test/a/status/1">x</a></blockquote><script src="https://platform.x.com/widgets.js"></script></div>', "pt");
    expect(r.html).not.toContain("<script");
    expect(r.html).not.toContain("embed-load");
    expect(r.html).not.toContain("data-embed-servico");
    expect(r.relatorio.avisos[0]).toContain("sem link válido");
  });

  test("X com texto e vários links no blockquote: vale o último link de post (o do código oficial)", () => {
    const oficial = '<div class="embed"><blockquote class="twitter-tweet"><p lang="en">hi <a href="https://t.co/abc">pic</a></p>&mdash; Nome (@a) <a href="https://twitter.com/a/status/42?ref_src=twsrc%5Etfw">date</a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></div>';
    const r = embedsComClique(oficial, "en");
    expect(r.html).toContain('href="https://x.com/a/status/42"');
    expect(r.relatorio.quadros).toEqual([{ servico: "x", post: "https://x.com/a/status/42" }]);
  });

  test("script solto (fora de .embed) de um dos três domínios sai; de outro domínio fica", () => {
    const r = embedsComClique('<p>a</p><script async src="https://platform.x.com/widgets.js"></script><script src="https://exemplo.test/outro.js"></script><script>var ok=1</script>', "pt");
    expect(r.html).not.toContain("platform.x.com");
    expect(r.html).toContain("exemplo.test/outro.js");
    expect(r.html).toContain("var ok=1");
    expect(r.relatorio.scriptsRemovidos).toEqual([{ src: "https://platform.x.com/widgets.js", dominio: "platform.x.com", servico: null, dentroDoEmbed: false }]);
  });

  test("texto do blockquote com HTML estranho não escapa para o quadro (os textos do quadro vêm só do módulo de textos)", () => {
    const r = embedsComClique(`<div class="embed"><blockquote class="reddit-embed-bq" data-embed-height='"><img src=x onerror=alert(1)>'><a href="https://www.reddit.com/r/a/comments/abc123/t/">&lt;img src=x onerror=1&gt;</a></blockquote><script src="https://embed.reddit.com/widgets.js"></script></div>`, "pt");
    expect(r.html).not.toContain("data-altura"); // a altura inválida não passa
    expect(r.html.match(/<img/g)?.length ?? 0).toBe(1); // só o que o autor tinha (dentro do atributo escapado dele); nenhum <img> novo
  });
});

// ───────────────────────── parte 3: as exceções de paridade ─────────────────────────

describe("exceção de paridade do Astro: tira só o atributo e o quadro", () => {
  const astro = embedsComClique(`<main>${X}<p>fim</p></main>`, "pt").html;
  test("sai exatamente 1 quadro e 1 atributo; o resto é o HTML do Python sem o script", () => {
    const r = semQuadrosDosPosts(astro);
    expect(r).toMatchObject({ quadros: 1, atributos: 1, quadrosFora: 0 });
    expect(r.html).not.toContain("embed-gate");
    expect(r.html).not.toContain("data-embed-servico");
    expect(r.html).toBe(semScriptsDosPosts(`<main>${X}<p>fim</p></main>`).html);
  });
  test("um .embed-gate fora de um quadro ligado NÃO sai", () => {
    const solto = '<main><div class="embed-gate">fica</div><div class="embed"><div class="embed-gate">fica</div></div></main>';
    const r = semQuadrosDosPosts(solto);
    expect(r.html).toBe(solto);
    expect(r).toMatchObject({ quadros: 0, atributos: 0 });
  });
  test("o atributo com valor desconhecido não conta; um quadro que não é o último filho aparece em quadrosFora", () => {
    const html = '<div class="embed" data-embed-servico="tiktok"><div class="embed-gate">x</div></div>';
    expect(semQuadrosDosPosts(html).html).toBe(html);
    const fora = '<div class="embed" data-embed-servico="x"><div class="embed-gate">g</div><p>depois</p></div>';
    const r = semQuadrosDosPosts(fora);
    expect(r.quadrosFora).toBe(1);
    expect(r.html).toContain("embed-gate"); // e o quadro continua lá, para aparecer como diferença
  });
  test("outros atributos, classes e filhos do .embed ficam", () => {
    const html = '<div class="embed outra" id="a" data-embed-servico="reddit" data-x="1"><blockquote class="reddit-embed-bq"></blockquote><div class="embed-gate"><button>b</button></div></div>';
    expect(semQuadrosDosPosts(html).html).toBe('<div class="embed outra" id="a" data-x="1"><blockquote class="reddit-embed-bq"></blockquote></div>');
  });
});

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

describe("toda página que tinha post incorporado tem um quadro por post", () => {
  test("blockquote dos três serviços = botões 'Mostrar post' = quadros = scripts que o Python tinha; nenhum quadro fica sem o link", () => {
    let comPosts = 0;
    let total = 0;
    const erros: string[] = [];
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      const url = enderecoDoHtml(arquivo);
      const raiz = parse(readFileSync(join(dist, arquivo), "utf8")) as unknown as No;
      const posts = varrer(raiz, (e) => e.tagName === "blockquote" && SERVICOS.some((s) => classes(e).includes(DADOS[s].classe)));
      const quadros = varrer(raiz, (e) => e.tagName === "div" && classes(e).includes("embed-gate"));
      const botoes = varrer(raiz, (e) => e.tagName === "button" && classes(e).includes("embed-load"));
      const ligados = varrer(raiz, (e) => e.tagName === "div" && classes(e).includes("embed") && attr(e, "data-embed-servico") !== undefined);
      if (posts.length !== quadros.length || quadros.length !== botoes.length || botoes.length !== ligados.length) erros.push(`${url}: blockquotes ${posts.length}, quadros ${quadros.length}, botões ${botoes.length}, .embed ligados ${ligados.length}`);
      const py = doPython[url];
      if (py !== undefined) {
        const tirados = semScriptsDosPosts(py).removidos.length;
        if (tirados !== quadros.length) erros.push(`${url}: o Python tinha ${tirados} script(s) de posts, o Astro tem ${quadros.length} quadro(s)`);
      }
      for (const q of quadros) {
        const link = varrer(q, (e) => e.tagName === "a" && classes(e).includes("embed-origin"))[0];
        const botao = varrer(q, (e) => e.tagName === "button")[0];
        if (!link || !botao || attr(botao, "hidden") === undefined || attr(botao, "type") !== "button") erros.push(`${url}: quadro sem link ou com botão fora do padrão`);
        if (link && !/^https:\/\/(x\.com\/\w+\/status\/\d+|www\.reddit\.com\/r\/\w+\/comments\/\w+\/[\w%.-]*\/?|www\.instagram\.com\/(p|reel|tv)\/[\w-]+\/)$/.test(attr(link, "href") ?? "")) erros.push(`${url}: link do quadro fora do padrão: ${attr(link ?? ({ attrs: [] } as unknown as Elemento), "href")}`);
      }
      if (quadros.length) comPosts++;
      total += quadros.length;
    }
    expect(erros).toEqual([]);
    expect(comPosts, "páginas com posts").toBe(144);
    expect(total, "posts").toBe(184);
  });

  test("a contagem por serviço é a da revisão da T19 (R6): Reddit 76, X 72, Instagram 36", () => {
    const por: Record<string, number> = { x: 0, reddit: 0, instagram: 0 };
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      for (const m of readFileSync(join(dist, arquivo), "utf8").matchAll(/ data-embed-servico="(x|reddit|instagram)"/g)) por[m[1] ?? ""] = (por[m[1] ?? ""] ?? 0) + 1;
    }
    expect(por).toEqual({ x: 72, reddit: 76, instagram: 36 });
  });

  test("o script do quadro vem só nas páginas com quadro, fora do <main>; as outras nem o carregam", () => {
    for (const arquivo of arquivosDe(dist).filter((a) => a.endsWith(".html"))) {
      const html = readFileSync(join(dist, arquivo), "utf8");
      const temQuadro = html.includes('class="embed-gate"');
      const scripts = html.match(/<script type="module" src="[^"]*EmbedsComClique\.astro[^"]*"><\/script>/g) ?? [];
      expect(scripts.length, arquivo).toBe(temQuadro ? 1 : 0);
      if (temQuadro) expect(html.indexOf(scripts[0] ?? ""), arquivo).toBeGreaterThan(html.indexOf("</main>"));
    }
  });
});

describe("o conteúdo do autor: todo post de rede social vira um quadro válido", () => {
  const EMBEDS = join(RAIZ, "content", "embeds");
  const lerEmbed = (nome: string): string | undefined => {
    try {
      return readFileSync(join(EMBEDS, `${nome}.html`), "utf8").replace(/^﻿/, "");
    } catch {
      return undefined;
    }
  };

  test("cada content/embeds/{reddit,x,instagram}-*.html: um quadro, endereço válido, scripts só dos domínios conhecidos", () => {
    const arquivos = readdirSync(EMBEDS).filter((a) => /^(reddit|x|instagram)-.*\.html$/.test(a));
    expect(arquivos.length).toBe(49);
    const dominios = new Set<string>();
    for (const a of arquivos) {
      const r = embedsComClique(`<div class="embed">${readFileSync(join(EMBEDS, a), "utf8")}</div>`, "pt");
      expect(r.relatorio.avisos, a).toEqual([]);
      expect(r.relatorio.quadros, a).toHaveLength(1);
      expect(r.relatorio.quadros[0]?.servico, a).toBe(a.split("-")[0]);
      expect(r.html, a).not.toContain("<script");
      for (const s of r.relatorio.scriptsRemovidos) dominios.add(s.dominio ?? "(inline)");
    }
    // a lista dos domínios que o build tira (se aparecer um novo, este teste avisa: decidir antes de aceitar)
    expect([...dominios].sort()).toEqual(["embed.reddit.com", "platform.x.com", "www.instagram.com"]);
  });

  test("os outros arquivos de content/embeds/ (Ko-fi, ficha de feitiço, YouTube) não têm script nenhum", () => {
    for (const a of readdirSync(EMBEDS).filter((x) => !/^(reddit|x|instagram)-/.test(x))) expect(readFileSync(join(EMBEDS, a), "utf8"), a).not.toMatch(/<script/i);
  });

  test("os links {{embed:https://…}} dos .md: X, Instagram e YouTube/TikTok ficam como estão (iframe) ou viram quadro, e nenhum deixa script", () => {
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
        const r = embedsComClique(html, "pt");
        links++;
        expect(r.html, `${arquivo}: ${m[1]}`).not.toContain("<script");
        expect(r.relatorio.avisos, `${arquivo}: ${m[1]}`).toEqual([]);
        for (const q of r.relatorio.quadros) porTipo[q.servico] = (porTipo[q.servico] ?? 0) + 1;
        // o que o Python tinha de script, o Astro tem de quadro
        expect(r.relatorio.quadros.length, `${arquivo}: ${m[1]}`).toBe(r.relatorio.scriptsRemovidos.length);
      }
    }
    expect(links).toBeGreaterThan(100);
    expect(porTipo["x"]).toBeGreaterThan(40);
    expect(porTipo["instagram"]).toBeGreaterThan(15);
  });
});

// ───────────────────────── parte 5: o código do navegador e o contraste ─────────────────────────

describe("src/scripts/embeds/: sem as palavras proibidas e só os imports permitidos", () => {
  const PASTA = join(RAIZ, "src", "scripts", "embeds");
  const arquivos = readdirSync(PASTA).filter((a) => a.endsWith(".ts"));
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

  test("os arquivos são os esperados", () => {
    expect(arquivos.sort()).toEqual(["bloco.ts", "index.ts", "regras.ts"]);
  });
  test.each(arquivos)("%s não cria <script>, não monta HTML, não usa srcdoc, eval nem Function", (a) => {
    const codigo = semComentarios(readFileSync(join(PASTA, a), "utf8"));
    for (const palavra of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "DOMParser", "createContextualFragment", "srcdoc", "eval(", "new Function", "setTimeout(\"", "importScripts", "createElement(\"script\")", "createElement('script')", "allow-top-navigation", "localStorage", "sessionStorage", "document.cookie", "about:blank", "javascript:"]) {
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
});

describe("o botão 'Mostrar post' tem contraste de leitura (≥ 4,5:1) e foco visível", () => {
  const css = readFileSync(join(RAIZ, "src", "components", "EmbedsComClique.astro"), "utf8");
  const tokens = readFileSync(join(RAIZ, "src", "styles", "tokens.css"), "utf8");
  const cor = (nome: string) => /#[0-9a-fA-F]{6}\b/.exec(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1] ?? "")?.[0] ?? "";
  const luz = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  };
  const razao = (a: string, b: string) => {
    const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
    return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
  };
  test("branco sobre o verde do botão e sobre o petróleo do hover", () => {
    expect(css).toMatch(/\.embed-load \{[^}]*background: var\(--green\)[^}]*color: #fff/);
    expect(razao("#ffffff", cor("green"))).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.embed-load:hover \{ background: var\(--teal\)/);
    expect(razao("#ffffff", cor("teal"))).toBeGreaterThanOrEqual(4.5);
  });
  test("texto do aviso, do status e do link sobre o fundo claro do quadro", () => {
    for (const t of ["ink", "muted", "green"]) expect(razao(cor(t), "#ffffff"), t).toBeGreaterThanOrEqual(4.5);
  });
  test("foco visível no botão e no link; o CSS está dentro de @layer site", () => {
    expect(css).toMatch(/\.embed-load:focus-visible \{ outline: 3px solid/);
    expect(css).toMatch(/\.embed-origin:focus-visible \{ outline: 3px solid/);
    expect(css).toMatch(/<style is:global>\s*@layer site \{/);
  });
});
