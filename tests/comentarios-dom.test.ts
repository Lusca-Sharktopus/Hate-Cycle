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
import { mensagemDaConta, nomeLimpo, problemaNoNome, TEXTOS_DA_CONTA } from "../src/scripts/comentarios/conta";

const NOME_ATAQUE = '<img src=x onerror="globalThis.__xss=1"><b>nome</b>';
const CORPO_ATAQUE = '<img src=x onerror="globalThis.__xss=2"><script>globalThis.__xss=3</script><b>negrito?</b>';
const RESPOSTA_ATAQUE = '"><img src=y onerror=globalThis.__xss=4><b>resposta</b>';
const MEU_ATAQUE = "<b>meu</b><script>globalThis.__xss=5</script>";

interface Linha {
  id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  user_id: string | null;
  parent_id: number | null;
  deleted_at?: string | null;
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
/** As funções do banco chamadas pela janela da conta (rpc), na ordem; e as respostas que o teste quer. */
const RPCS: { nome: string; args: unknown }[] = [];
let RESPOSTA_DO_RPC: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const SAIDAS: unknown[] = [];

function clienteFalso(sessao: { user: { id: string; email: string } } | null, linhas: readonly Linha[] = LINHAS): SupabaseClient {
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
        if (tabela === "comments") data = linhas.map((l) => ({ ...l, profiles: (l.user_id && PERFIS[l.user_id]) || null }));
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
    signOut: (o?: unknown) => (SAIDAS.push(o ?? null), Promise.resolve({ error: null })),
  };
  const rpc = (nome: string, args?: unknown) => {
    RPCS.push({ nome, args: args ?? null });
    return Promise.resolve(RESPOSTA_DO_RPC);
  };
  return { from: consulta, auth, rpc } as unknown as SupabaseClient;
}

const CFG_BRUTA = { url: "https://supabase-falso.test", key: "__CHAVE_FALSA__", lang: "pt", ui: { c_reply: "Responder", c_edit: "Editar", c_delete: "Apagar", c_write: "Escreva", c_hello: "Conectado como" } };
const CFG = lerConfiguracao(CFG_BRUTA) as ConfiguracaoDosComentarios;

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
const TAGS_DA_CAIXA = new Set(["section", "h2", "div", "form", "textarea", "button", "p", "span", "strong", "time", "h3", "input", "label"]);
/** 05/11: os botões de login (src/scripts/login/janela.ts) têm ícones em SVG e o <canvas> do círculo, de valores fixos do código. */
const TAGS_DOS_BOTOES_DE_LOGIN = new Set(["span", "svg", "path", "defs", "lineargradient", "stop", "canvas"]);
function conferirSoElementosDoCodigo(): void {
  const todos = [...document.body.querySelectorAll("*")];
  const nosBotoes = todos.filter((e) => e.closest(".c-modal .c-provedores .c-prov") && !e.classList.contains("c-prov"));
  const tags = todos.filter((e) => !nosBotoes.includes(e)).map((e) => e.tagName.toLowerCase());
  expect(tags.filter((t) => !TAGS_DA_CAIXA.has(t)), "elementos que o código não cria (vieram de texto do visitante)").toEqual([]);
  expect(nosBotoes.map((e) => e.tagName.toLowerCase()).filter((t) => !TAGS_DOS_BOTOES_DE_LOGIN.has(t))).toEqual([]);
  expect(document.body.querySelectorAll("img, script, b, iframe").length).toBe(0);
  expect(document.body.querySelectorAll("svg").length).toBe(document.querySelectorAll(".c-modal .c-prov > svg").length);
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
  RPCS.length = 0;
  SAIDAS.length = 0;
  RESPOSTA_DO_RPC = { data: null, error: null };
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
    // 05/11 (design do autor): Google, Twitter e Discord, cada um com o círculo; a divisória "ou"; o título do config.json
    expect([...document.querySelectorAll(".c-modal .c-prov")].map((b) => b.className)).toEqual(["c-prov c-google", "c-prov c-twitter", "c-prov c-discord"]);
    expect(document.querySelectorAll(".c-modal .c-prov canvas.c-circulo")).toHaveLength(3);
    expect(document.querySelectorAll(".c-modal .c-prov svg.c-ic")).toHaveLength(6);
    expect(document.querySelector(".c-modal .c-ou")?.textContent).toBe("or");
  });

  test("conectado (nome com HTML): 'Conectado como …' literal, Responder e Editar abertos, só elementos do código", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: "u-eu", email: "eu@exemplo.test" } }));
    await esperar();
    const quem = document.querySelector(".c-who span");
    expect(quem?.textContent).toBe(`Conectado como ${NOME_ATAQUE}`);
    // 03/11: o nome é um <button class="c-me"> (abre a janela da conta) com o nome só como texto
    expect([...(quem?.childNodes ?? [])].map((n) => n.nodeType)).toEqual([3, 1]);
    const botaoDoNome = quem?.querySelector("button.c-me");
    expect(botaoDoNome?.textContent).toBe(NOME_ATAQUE);
    expect([...(botaoDoNome?.childNodes ?? [])].map((n) => n.nodeType)).toEqual([3]);
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

// Migração de 03/11/2026 (opção b do autor): comentário apagado que tem respostas fica como "[comentário apagado]", sem nome e sem
// botões; as respostas continuam com nome, texto e botões. O banco guarda "[apagado]" no texto: a caixa nunca o mostra.
describe("comentário apagado que tem respostas", () => {
  const APAGADO: Linha[] = [
    { id: 10, body: "[apagado]", created_at: "2026-10-01T12:00:00+00:00", edited_at: null, user_id: null, parent_id: null, deleted_at: "2026-10-05T10:00:00+00:00" },
    { id: 11, body: CORPO_ATAQUE, created_at: "2026-10-01T13:00:00+00:00", edited_at: null, user_id: "u-eu", parent_id: 10, deleted_at: null },
  ];
  test("mostra c_deleted, a data e a resposta; nenhum botão no apagado", async () => {
    const raiz = montarPagina();
    const cfg = lerConfiguracao({ ...CFG_BRUTA, ui: { ...CFG_BRUTA.ui, c_deleted: "[comentário apagado]" } }) as ConfiguracaoDosComentarios;
    iniciarComentarios(raiz, cfg, clienteFalso({ user: { id: "u-eu", email: "eu@exemplo.test" } }, APAGADO));
    await esperar();
    const [apagado, resposta] = [...document.querySelectorAll<HTMLElement>(".c-item")];
    expect(apagado?.querySelector(":scope > .c-body")?.textContent).toBe("[comentário apagado]");
    expect(apagado?.querySelector(":scope > .c-body")?.classList.contains("c-deleted")).toBe(true);
    expect(apagado?.querySelector(":scope > .c-head strong")).toBeNull();
    expect(apagado?.querySelector(":scope > .c-head time")?.textContent).not.toBe("");
    expect(apagado?.querySelector(":scope > .c-actions")).toBeNull();
    expect(document.body.textContent).not.toContain("[apagado]");
    expect(resposta?.closest(".c-replies")).not.toBeNull();
    expect(resposta?.querySelector(".c-body")?.textContent).toBe(CORPO_ATAQUE);
    expect([...(resposta?.querySelectorAll(".c-actions button") ?? [])].map((b) => b.textContent)).toEqual(["Editar", "Apagar"]);
    conferirSoElementosDoCodigo();
  });
});

describe("a janela da conta (03/11): abre pelo nome, troca o nome, apaga a conta", () => {
  const EU = { user: { id: "u-eu", email: "<b>eu</b>@exemplo.test" } };
  async function abrir(): Promise<HTMLElement> {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(EU));
    await esperar();
    const nome = document.querySelector<HTMLButtonElement>(".c-who button.c-me");
    nome?.focus(); // num navegador, o clique dá o foco ao botão
    nome?.click();
    await esperar();
    const j = document.querySelector<HTMLElement>(".c-modal.c-conta");
    expect(j, "a janela abriu").not.toBeNull();
    return j as HTMLElement;
  }

  test("clicar no próprio nome abre a janela: escurece (trava a página), nome e e-mail só como texto, foco no campo", async () => {
    const j = await abrir();
    expect(j.getAttribute("role")).toBe("dialog");
    expect(j.getAttribute("aria-modal")).toBe("true");
    expect(document.documentElement.classList.contains("c-modal-open")).toBe(true);
    const campo = j.querySelector<HTMLInputElement>("input[name=display_name]");
    expect(campo?.value).toBe(NOME_ATAQUE);
    expect(document.activeElement).toBe(campo);
    expect(j.querySelector(".c-conta-email strong")?.textContent).toBe("<b>eu</b>@exemplo.test");
    conferirSoElementosDoCodigo();
  });

  test("Esc fecha, devolve o foco ao nome e destrava a página", async () => {
    const j = await abrir();
    j.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".c-modal.c-conta")).toBeNull();
    expect(document.documentElement.classList.contains("c-modal-open")).toBe(false);
    expect(document.activeElement?.classList.contains("c-me")).toBe(true);
  });

  test("salvar o nome: confere antes (2 a 30), manda o nome limpo ao banco e mostra o aviso", async () => {
    const j = await abrir();
    const campo = j.querySelector<HTMLInputElement>("input[name=display_name]") as HTMLInputElement;
    const form = j.querySelector<HTMLFormElement>("form.c-conta-nome") as HTMLFormElement;
    campo.value = " x ";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    expect(RPCS).toEqual([]);
    expect(j.querySelector(".c-msg")?.textContent).toBe("O nome precisa ter de 2 a 30 caracteres.");
    RESPOSTA_DO_RPC = { data: "Novo Nome", error: null };
    campo.value = "  Novo    Nome ";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    expect(RPCS).toEqual([{ nome: "change_my_name", args: { novo: "Novo Nome" } }]);
    expect(j.querySelector(".c-msg.ok")?.textContent).toBe("Nome salvo.");
    expect(campo.value).toBe("Novo Nome");
  });

  test("erro do banco no nome vira mensagem da janela", async () => {
    const j = await abrir();
    RESPOSTA_DO_RPC = { data: null, error: { message: "name length" } };
    (j.querySelector("input[name=display_name]") as HTMLInputElement).value = "Válido";
    j.querySelector<HTMLFormElement>("form.c-conta-nome")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    expect(j.querySelector(".c-msg")?.textContent).toBe("O nome precisa ter de 2 a 30 caracteres.");
  });

  test("apagar a conta pede uma segunda confirmação; Cancelar não apaga; confirmar chama delete_my_account, sai e avisa", async () => {
    const j = await abrir();
    j.querySelector<HTMLButtonElement>(".c-conta-apagar")?.click();
    expect(j.querySelector(".c-conta-aviso")?.textContent).toContain("Não dá para desfazer");
    expect(RPCS).toEqual([]);
    [...j.querySelectorAll<HTMLButtonElement>(".c-conta-perigo button")].find((b) => b.textContent === "Cancelar")?.click();
    expect(j.querySelector(".c-conta-aviso")).toBeNull();
    j.querySelector<HTMLButtonElement>(".c-conta-apagar")?.click();
    j.querySelector<HTMLButtonElement>(".c-conta-confirmar")?.click();
    await esperar();
    expect(RPCS).toEqual([{ nome: "delete_my_account", args: null }]);
    expect(SAIDAS).toEqual([{ scope: "local" }]);
    expect(document.querySelector(".c-modal.c-conta")).toBeNull();
    expect(document.querySelector(".c-who")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector(".hc-comments .c-msg.ok")?.textContent).toBe("Sua conta foi apagada.");
  });
});

describe("a regra do nome no navegador (a mesma de public.limpar_nome; o banco confere de novo)", () => {
  const T = TEXTOS_DA_CONTA.pt;
  test.each([
    ["  Bia   Nova ", "Bia Nova"],
    ["\u00A0Bia\u00A0\u00A0Nova\u3000", "Bia Nova"],
  ])("nomeLimpo(%j) = %j", (bruto, limpo) => expect(nomeLimpo(bruto)).toBe(limpo));
  test.each([
    ["Bi\u200Ba", T.invalido],
    ["\u202Eaib", T.invalido],
    ["B\uFEFFia", T.invalido],
    ["\u3164\u3164", T.invalido],
    ["\u00A0\u00A0", T.tamanho],
    ["x", T.tamanho],
    ["a".repeat(31), T.tamanho],
    ["Lúsca Sharktopus", T.reservado],
    ["LUSCA_fan", T.reservado],
    ["shark-topus", T.reservado],
  ])("%j é recusado", (nome, msg) => expect(problemaNoNome(nome, T)).toBe(msg));
  test.each(["José 山田", "👨‍👩‍👧 ❤️", "Eu Mesma", "Lucas"])("%j vale", (nome) => expect(problemaNoNome(nome, T)).toBeNull());
  test("o admin pode usar o nome do autor", () => expect(problemaNoNome("Lusca Sharktopus", T, true)).toBeNull());
  test("mensagens do banco viram textos da janela", () => {
    expect(mensagemDaConta({ message: "name taken" }, T)).toBe(T.reservado);
    expect(mensagemDaConta({ message: "rate limit: wait before renaming" }, T)).toBe(T.espera);
    expect(mensagemDaConta({ message: "name length" }, T)).toBe(T.tamanho);
    expect(mensagemDaConta({ message: "invalid name" }, T)).toBe(T.invalido);
    expect(mensagemDaConta({ message: "qualquer outra" }, T)).toBe(T.erro);
    expect(Object.keys(TEXTOS_DA_CONTA.en).sort()).toEqual(Object.keys(TEXTOS_DA_CONTA.pt).sort());
  });
});
