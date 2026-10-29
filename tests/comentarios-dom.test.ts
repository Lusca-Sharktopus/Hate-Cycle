// @vitest-environment happy-dom
//
// A caixa de comentários INTEIRA (src/scripts/comentarios/caixa.ts → iniciarComentarios(), a mesma função que o site chama)
// num DOM simulado (happy-dom), com um cliente do Supabase FALSO injetado (nada de rede). O banco falso devolve comentário,
// resposta e nome de usuário com <img src=x onerror=…>, <script> e <b>. O teste confere, depois de desenhar a caixa
// deslogado, conectado, com a janela de login aberta, com o formulário de resposta e o de edição abertos:
//   - só existem os elementos que o próprio código cria (lista fechada de tags; nenhum <img>, <script>, <b>, <svg>, <iframe>);
//   - o texto do visitante aparece LITERAL (cada .c-body tem um só nó de texto, igual ao do banco; o nome também).
// Diferente da varredura do código em tests/comentarios.test.ts, este teste pega qualquer jeito de enfiar HTML na página
// (inclusive disfarçado, como d["inner" + "HTML"] = …), porque olha o resultado e não o texto do código.
// Por que happy-dom e não jsdom: 4 dependências diretas contra 20, e a linha 20 não executa o JavaScript da página por
// padrão. Fica só nos testes (devDependency, versão exata).
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test } from "vitest";
import { iniciarComentarios, lerConfiguracao, type ConfiguracaoDosComentarios } from "../src/scripts/comentarios/caixa";

const NOME_ATAQUE = '<img src=x onerror="globalThis.__xss=1"><b>nome</b>';
const CORPO_ATAQUE = '<img src=x onerror="globalThis.__xss=2"><script>globalThis.__xss=3</script><b>negrito?</b>';
const RESPOSTA_ATAQUE = '"><img src=y onerror=globalThis.__xss=4><b>resposta</b>';
const MEU_ATAQUE = "<b>meu</b><script>globalThis.__xss=5</script>";

interface Linha {
  id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  user_id: string;
  parent_id: number | null;
}
const PERFIS: Record<string, { display_name: string; is_admin: boolean }> = {
  "u-ataque": { display_name: NOME_ATAQUE, is_admin: false },
  "u-admin": { display_name: "Admin", is_admin: true },
  "u-eu": { display_name: NOME_ATAQUE, is_admin: false },
};
const LINHAS: Linha[] = [
  { id: 1, body: CORPO_ATAQUE, created_at: "2026-10-01T12:00:00+00:00", edited_at: null, user_id: "u-ataque", parent_id: null },
  { id: 2, body: RESPOSTA_ATAQUE, created_at: "2026-10-01T13:00:00+00:00", edited_at: "2026-10-02T09:00:00+00:00", user_id: "u-admin", parent_id: 1 },
  { id: 3, body: MEU_ATAQUE, created_at: "2026-10-03T08:00:00+00:00", edited_at: null, user_id: "u-eu", parent_id: null },
];

/** Um cliente do Supabase de mentira: só o que a caixa usa, respondendo do jeito do supabase-js ({ data, error }). */
function clienteFalso(sessao: { user: { id: string; email: string } } | null): SupabaseClient {
  const consulta = (tabela: string) => {
    let unico = false;
    const filtros: Record<string, unknown> = {};
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => ((filtros[k] = v), b),
      order: () => b,
      single: () => ((unico = true), b),
      insert: () => b,
      update: () => b,
      delete: () => b,
      then: (ok: (r: { data: unknown; error: null }) => unknown, falha?: (e: unknown) => unknown) => {
        let data: unknown = null;
        if (tabela === "comments") data = LINHAS.map((l) => ({ ...l, profiles: PERFIS[l.user_id] ?? null }));
        if (tabela === "profiles" && unico) data = PERFIS[String(filtros["id"])] ?? null;
        return Promise.resolve({ data, error: null }).then(ok, falha);
      },
    };
    return b;
  };
  const auth = {
    onAuthStateChange: (cb: (evento: string, s: typeof sessao) => void) => {
      setTimeout(() => cb("INITIAL_SESSION", sessao), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: () => Promise.resolve({ data: { session: sessao }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  };
  return { from: consulta, auth } as unknown as SupabaseClient;
}

const CFG = lerConfiguracao({ url: "https://supabase-falso.test", key: "__CHAVE_FALSA__", lang: "pt", ui: { c_reply: "Responder", c_edit: "Editar", c_delete: "Apagar", c_write: "Escreva", c_hello: "Conectado como" } }) as ConfiguracaoDosComentarios;

/** A <section> como a página Astro a traz (montada com DOM, não com HTML). */
function montarPagina(): HTMLElement {
  document.body.replaceChildren();
  document.documentElement.className = "";
  const secao = document.createElement("section");
  secao.className = "hc-comments";
  secao.dataset["page"] = "news/teste";
  const h2 = document.createElement("h2");
  h2.textContent = "Comentários";
  const app = document.createElement("div");
  app.className = "c-app";
  secao.append(h2, app);
  document.body.append(secao);
  return secao;
}
/** Deixa as promessas e os setTimeout da caixa terminarem. */
async function esperar(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

/** As únicas tags que a caixa cria (mais as da própria <section>). */
const TAGS_DA_CAIXA = new Set(["section", "h2", "div", "form", "textarea", "button", "p", "span", "strong", "time", "h3", "input"]);
function conferirSoElementosDoCodigo(): void {
  const tags = [...document.body.querySelectorAll("*")].map((e) => e.tagName.toLowerCase());
  expect(tags.filter((t) => !TAGS_DA_CAIXA.has(t)), "elementos que o código não cria (vieram de texto do visitante)").toEqual([]);
  expect(document.body.querySelectorAll("img, script, b, svg, iframe").length).toBe(0);
  expect((globalThis as { __xss?: unknown }).__xss).toBeUndefined();
}
function conferirTextoLiteral(): void {
  const corpos = [...document.querySelectorAll(".c-body")];
  expect(corpos.map((c) => c.textContent)).toEqual([CORPO_ATAQUE, RESPOSTA_ATAQUE, MEU_ATAQUE]);
  for (const c of corpos) expect([...c.childNodes].map((n) => n.nodeType), "o texto é um nó de texto só").toEqual([3]);
  const nomes = [...document.querySelectorAll(".c-head strong")];
  expect(nomes.map((n) => n.textContent)).toEqual([NOME_ATAQUE, "Admin", NOME_ATAQUE]);
  for (const n of nomes) expect([...n.childNodes].map((x) => x.nodeType)).toEqual([3]);
}

afterEach(() => {
  document.body.replaceChildren();
  delete (globalThis as { __xss?: unknown }).__xss;
});

describe("a caixa de comentários num DOM simulado, com HTML no comentário, na resposta e no nome", () => {
  test("deslogado: lista desenhada, texto literal, só elementos do código", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(null));
    await esperar();
    expect(document.querySelectorAll(".c-item")).toHaveLength(3);
    expect(document.querySelectorAll(".c-replies .c-item")).toHaveLength(1);
    conferirTextoLiteral();
    conferirSoElementosDoCodigo();
  });

  test("deslogado, janela de login aberta: só elementos do código", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(null));
    await esperar();
    document.querySelector<HTMLTextAreaElement>(".c-bar textarea")?.focus();
    await esperar();
    expect(document.querySelectorAll(".c-modal")).toHaveLength(1);
    conferirSoElementosDoCodigo();
  });

  test("conectado (nome com HTML): 'Conectado como …' literal, Responder e Editar abertos, só elementos do código", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: "u-eu", email: "eu@exemplo.test" } }));
    await esperar();
    const quem = document.querySelector(".c-who span");
    expect(quem?.textContent).toBe(`Conectado como ${NOME_ATAQUE}`);
    expect([...(quem?.childNodes ?? [])].map((n) => n.nodeType)).toEqual([3]);
    conferirTextoLiteral();
    // abre o formulário de resposta no comentário do ataque e o de edição no próprio
    const botao = (texto: string) => [...document.querySelectorAll<HTMLButtonElement>(".c-actions button")].find((b) => b.textContent === texto);
    botao("Responder")?.click();
    botao("Editar")?.click();
    await esperar();
    expect(document.querySelectorAll(".c-reply-form:not(.c-edit-form)")).toHaveLength(1);
    const edicao = document.querySelector<HTMLTextAreaElement>(".c-edit-form textarea");
    expect(edicao?.value, "o texto a editar é o do banco, literal").toBe(MEU_ATAQUE);
    conferirSoElementosDoCodigo();
  });
});
