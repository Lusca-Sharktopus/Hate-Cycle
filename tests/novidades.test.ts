// Novidades e notificações (28/11/2026, pedido do autor): as regras puras (src/scripts/conta/regrasDasNovidades.ts), a cópia delas na
// função do Supabase, o novidades.json e o /sw.js do site construído (quando há dist/), e a mesma lista de serviços de notificação no
// navegador e no banco. A janela (o sino) é provada em tests/comentarios-dom.test.ts; a bolinha do cabeçalho, em tests/conta-dom.test.ts;
// o banco, em tools/banco_local.py (casos "novidades:" e "notificações:").
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  bytesDaChave,
  CHAVE_PUBLICA_DAS_NOTIFICACOES,
  chavesDaInscricaoValidas,
  enderecoDeNotificacaoPermitido,
  horaDeAntes,
  idsNaoVistos,
  lerNovidades,
  notificacaoPara,
  novaDemaisParaAvisar,
  NOVIDADES_NO_ARQUIVO,
  type Novidade,
} from "../src/scripts/conta/regrasDasNovidades";

const RAIZ = join(import.meta.dirname, "..");
const DIST = join(RAIZ, process.env["HC_DIST"] ?? "dist");

const item = (id: string, extra: Partial<Novidade> = {}): Novidade => ({ id, titulo: id, url: `/pt/${id}/`, data: "2026-11-28", resumo: "", ...extra });

describe("a função do Supabase usa as MESMAS regras", () => {
  test("supabase/functions/avisar-novidades/regras.ts é cópia byte a byte de src/scripts/conta/regrasDasNovidades.ts", () => {
    expect(readFileSync(join(RAIZ, "supabase/functions/avisar-novidades/regras.ts"), "utf8")).toBe(readFileSync(join(RAIZ, "src/scripts/conta/regrasDasNovidades.ts"), "utf8"));
  });
  test("a função só lê o site no ar e manda notificação com as regras (sem ler o que vem no pedido além da versão)", () => {
    const f = readFileSync(join(RAIZ, "supabase/functions/avisar-novidades/index.ts"), "utf8");
    expect(f).toMatch(/const SITE = "https:\/\/hatecycle\.com";/);
    expect(f).toMatch(/import webpush from "npm:web-push@\d+\.\d+\.\d+";/);
    expect(f).toMatch(/import \{ createClient \} from "npm:@supabase\/supabase-js@\d+\.\d+\.\d+";/);
    expect(f).toMatch(/Deno\.env\.get\("VAPID_PRIVATE_KEY"\)/);
    expect(f).toMatch(/enderecoDeNotificacaoPermitido\(s\.endpoint\)/);
    // do corpo do pedido só sai a versão (40 caracteres hexadecimais)
    expect([...f.matchAll(/corpo\.(\w+)/g)].map((m) => m[1])).toEqual(["versao", "versao", "versao"]);
  });
});

describe("lerNovidades: o novidades.json com desconfiança", () => {
  test("só passa item com ID, link do site e título; repetido sai; no máximo 30; versão só hexadecimal", () => {
    const itens = [
      { id: "news/2026-11-28-a", titulo: "  A  com   espaços ", url: "/pt/news/2026-11-28-a/", data: "2026-11-28", resumo: "r" },
      { id: "news/2026-11-28-a", titulo: "repetido", url: "/pt/news/2026-11-28-a/" },
      { id: "../x", titulo: "id torto", url: "/pt/news/x/" },
      { id: "news/b", titulo: "link de fora", url: "https://exemplo.com/" },
      { id: "news/c", titulo: "javascript", url: "javascript:alert(1)" },
      { id: "news/d", titulo: "", url: "/pt/news/d/" },
      { id: "blog/e", titulo: "post do blog", url: "/en/blog/e/", data: "ontem" },
      "lixo",
      null,
    ];
    const r = lerNovidades({ versao: "abc123", itens });
    expect(r.versao).toBe("abc123");
    expect(r.itens).toEqual([
      { id: "news/2026-11-28-a", titulo: "A com espaços", url: "/pt/news/2026-11-28-a/", data: "2026-11-28", resumo: "r" },
      { id: "blog/e", titulo: "post do blog", url: "/en/blog/e/", data: "", resumo: "" },
    ]);
    expect(lerNovidades({ versao: "<script>", itens: [] }).versao).toBe("");
    expect(lerNovidades(null)).toEqual({ versao: "", itens: [] });
    expect(lerNovidades({ itens: Array.from({ length: 50 }, (_, i) => ({ id: `news/n${i}`, titulo: "t", url: `/pt/news/n${i}/` })) }).itens).toHaveLength(NOVIDADES_NO_ARQUIVO);
  });
});

describe("idsNaoVistos: o que a função anotou depois da última visita ao sino", () => {
  const itens = [item("news/a"), item("news/b"), item("news/c")];
  const anotadas = new Map([
    ["news/a", "2026-11-28T10:00:00Z"],
    ["news/b", "2026-11-20T10:00:00Z"],
  ]);
  test("só as anotadas depois; a não anotada não conta", () => {
    expect([...idsNaoVistos(itens, anotadas, "2026-11-25T00:00:00Z")]).toEqual(["news/a"]);
    expect([...idsNaoVistos(itens, anotadas, "2026-11-01T00:00:00Z")]).toEqual(["news/a", "news/b"]);
    expect([...idsNaoVistos(itens, anotadas, "2026-11-29T00:00:00Z")]).toEqual([]);
  });
  test("sem a hora da visita (ou torta): nada como novo", () => {
    expect(idsNaoVistos(itens, anotadas, null).size).toBe(0);
    expect(idsNaoVistos(itens, anotadas, "ontem").size).toBe(0);
  });
});

describe("as notificações do navegador", () => {
  test("a chave pública é um ponto da curva P-256 (65 bytes, começa com 0x04) e não é a de exemplo", () => {
    const b = bytesDaChave(CHAVE_PUBLICA_DAS_NOTIFICACOES);
    expect(b.length).toBe(65);
    expect(b[0]).toBe(4);
  });
  test("só os serviços de notificação dos navegadores", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QOabc",
      "https://wns2-bl2p.notify.windows.com/w/?token=AwYA",
    ])
      expect(enderecoDeNotificacaoPermitido(ok), ok).toBe(true);
    for (const nao of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.exemplo.com/x",
      "https://exemplo.com/fcm.googleapis.com/",
      "https://notify.windows.com.mal/x",
      "https://fcm.googleapis.com/ com espaço",
      "https://fcm.googleapis.com/" + "a".repeat(1000),
      42,
    ])
      expect(enderecoDeNotificacaoPermitido(nao), String(nao).slice(0, 60)).toBe(false);
  });
  test("o banco aceita a mesma lista (a regex da migração é a mesma do navegador)", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20261128000000_notificacoes.sql"), "utf8");
    const doBanco = /and endpoint ~ '([^']+)'/.exec(sql)?.[1];
    const doNavegador = /const SERVICOS_DE_NOTIFICACAO = \/(.+)\/;/.exec(readFileSync(join(RAIZ, "src/scripts/conta/regrasDasNovidades.ts"), "utf8"))?.[1];
    expect(doBanco).toBeDefined();
    expect(doBanco?.replace(/\\\//g, "/")).toBe(doNavegador?.replace(/\\\//g, "/"));
  });
  test("chaves da inscrição no formato do navegador", () => {
    expect(chavesDaInscricaoValidas("B" + "a".repeat(86), "c".repeat(22))).toBe(true);
    expect(chavesDaInscricaoValidas("curta", "c".repeat(22))).toBe(false);
    expect(chavesDaInscricaoValidas("B" + "a".repeat(86), "<script>")).toBe(false);
  });
  test("a notificação sai no idioma de quem ligou; sem a notícia nesse idioma, vai a do outro", () => {
    const pt = item("news/a", { titulo: "Título", url: "/pt/news/a/", resumo: "" });
    const en = item("news/a", { titulo: "Title", url: "/en/news/a/", resumo: "Summary" });
    const sem = { pt: "Novidade", en: "New" };
    expect(notificacaoPara("pt", { pt, en }, sem)).toEqual({ titulo: "Título", corpo: "Novidade", url: "/pt/news/a/", id: "news/a" });
    expect(notificacaoPara("en", { pt, en }, sem)).toEqual({ titulo: "Title", corpo: "Summary", url: "/en/news/a/", id: "news/a" });
    expect(notificacaoPara("pt", { en }, sem)).toEqual({ titulo: "Title", corpo: "Summary", url: "/en/news/a/", id: "news/a" });
    expect(notificacaoPara("pt", {}, sem)).toBeNull();
  });
  test("notícia velha não vira notificação (só as dos últimos 7 dias); a hora das que já estavam no site", () => {
    const agora = Date.parse("2026-11-28T15:00:00-03:00");
    expect(novaDemaisParaAvisar("2026-11-28", agora)).toBe(true);
    expect(novaDemaisParaAvisar("2026-11-22", agora)).toBe(true);
    expect(novaDemaisParaAvisar("2026-11-10", agora)).toBe(false);
    expect(novaDemaisParaAvisar("", agora)).toBe(true);
    expect(horaDeAntes("2026-11-10")).toBe("2026-11-10T12:00:00-03:00");
  });
});

describe.runIf(existsSync(join(DIST, "pt", "novidades.json")))("o site construído", () => {
  test("/pt/ e /en/novidades.json: as notícias publicadas, mais nova primeiro, todas no formato (nada é descartado na leitura)", () => {
    for (const lang of ["pt", "en"]) {
      const bruto = JSON.parse(readFileSync(join(DIST, lang, "novidades.json"), "utf8")) as { itens: Novidade[] };
      const lido = lerNovidades(bruto);
      expect(lido.itens).toEqual(bruto.itens);
      expect(lido.itens.length).toBeGreaterThan(0);
      for (const i of lido.itens) expect(i.url.startsWith(`/${lang}/news/`), i.url).toBe(true);
      const datas = lido.itens.map((i) => i.data);
      expect([...datas].sort().reverse()).toEqual(datas);
      // cada novidade é uma página que existe
      for (const i of lido.itens) expect(existsSync(join(DIST, i.url, "index.html")), i.url).toBe(true);
    }
  });
  test("/sw.js: só mostra a notificação e abre página deste site; nada de cache, de fetch nem de endereço de fora", () => {
    const sw = readFileSync(join(DIST, "sw.js"), "utf8");
    expect(sw).toMatch(/addEventListener\("push"/);
    expect(sw).toMatch(/addEventListener\("notificationclick"/);
    expect(sw).toMatch(/if \(alvo\.origin !== self\.location\.origin\) return;/);
    expect(sw).not.toMatch(/addEventListener\("fetch"|caches\.|importScripts|https?:\/\//);
  });
});
