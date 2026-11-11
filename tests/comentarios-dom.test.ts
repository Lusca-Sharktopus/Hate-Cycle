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
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { iniciarComentarios, lerConfiguracao, type ConfiguracaoDosComentarios } from "../src/scripts/comentarios/caixa";
import { mensagemDaConta, nomeLimpo, problemaNoNome, TEXTOS_DA_CONTA } from "../src/scripts/comentarios/conta";

const NOME_ATAQUE = '<img src=x onerror="globalThis.hcXss=1"><b>nome</b>';
const CORPO_ATAQUE = '<img src=x onerror="globalThis.hcXss=2"><script>globalThis.hcXss=3</script><b>negrito?</b>';
const RESPOSTA_ATAQUE = '"><img src=y onerror=globalThis.hcXss=4><b>resposta</b>';
const MEU_ATAQUE = "<b>meu</b><script>globalThis.hcXss=5</script>";

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
/** 09/11: os favoritos da pessoa (tabela favorites), o que a janela pediu ao balde de fotos e o que já está lá. */
let FAVORITOS: string[] = [];
const BALDE: Record<string, unknown>[] = [];
let ARQUIVOS_NO_BALDE: string[] = [];
/** 10/11: o que a caixa gravou (insert/update), na ordem. */
const GRAVACOES: { tabela: string; acao: string; v: unknown }[] = [];

function clienteFalso(sessao: { user: { id: string; email: string } } | null, linhas: readonly Linha[] = LINHAS): SupabaseClient {
  const consulta = (tabela: string) => {
    let unico = false;
    const filtros: Record<string, unknown> = {};
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => ((filtros[k] = v), b),
      order: () => b,
      single: () => ((unico = true), b),
      insert: (v: unknown) => (GRAVACOES.push({ tabela, acao: "insert", v }), b),
      update: (v: unknown) => (GRAVACOES.push({ tabela, acao: "update", v }), b),
      delete: () => b,
      then: (ok: (r: { data: unknown; error: null }) => unknown, falha?: (e: unknown) => unknown) => {
        let data: unknown = null;
        if (tabela === "comments") data = linhas.map((l) => ({ ...l, profiles: (l.user_id && PERFIS[l.user_id]) || null }));
        if (tabela === "profiles" && unico) data = PERFIS[String(filtros["id"])] ?? null;
        if (tabela === "favorites") data = FAVORITOS.map((work_id) => ({ work_id, created_at: "2026-11-01T00:00:00+00:00" }));
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
  const storage = {
    from: (balde: string) => ({
      upload: (caminho: string, _blob: unknown, opcoes: unknown) => (BALDE.push({ acao: "upload", balde, caminho, opcoes }), Promise.resolve({ data: { path: caminho }, error: null })),
      remove: (caminhos: string[]) => (BALDE.push({ acao: "remove", balde, caminhos }), Promise.resolve({ data: [], error: null })),
      list: (pasta: string) => (BALDE.push({ acao: "list", balde, pasta }), Promise.resolve({ data: ARQUIVOS_NO_BALDE.map((name) => ({ name })), error: null })),
    }),
  };
  return { from: consulta, auth, rpc, storage } as unknown as SupabaseClient;
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
const TAGS_DA_CAIXA = new Set(["section", "h2", "div", "form", "textarea", "button", "p", "span", "strong", "time", "h3", "h4", "input", "label", "a", "img", "canvas", "em", "u", "s", "blockquote"]); // 10/11: em/u/s/blockquote = a formatação dos comentários
/** 05/11: os botões de login (src/scripts/login/janela.ts) têm ícones em SVG e o <canvas> do círculo, de valores fixos do código. */
const TAGS_DOS_BOTOES_DE_LOGIN = new Set(["span", "svg", "path", "defs", "lineargradient", "stop", "canvas"]);
function conferirSoElementosDoCodigo(): void {
  const todos = [...document.body.querySelectorAll("*")];
  const nosBotoes = todos.filter((e) => e.closest(".c-modal .c-provedores .c-prov") && !e.classList.contains("c-prov"));
  const tags = todos.filter((e) => !nosBotoes.includes(e)).map((e) => e.tagName.toLowerCase());
  expect(tags.filter((t) => !TAGS_DA_CAIXA.has(t)), "elementos que o código não cria (vieram de texto do visitante)").toEqual([]);
  expect(nosBotoes.map((e) => e.tagName.toLowerCase()).filter((t) => !TAGS_DOS_BOTOES_DE_LOGIN.has(t))).toEqual([]);
  // 09/11: a única <img> possível é a capa de um favorito na janela da conta (endereço do próprio site, conferido por capaSegura)
  // e a foto de perfil (endereço montado por enderecoDaFoto: o Supabase do config + o balde avatars + um caminho conferido)
  for (const img of document.body.querySelectorAll("img")) {
    if (img.closest(".c-foto")) {
      expect(img.getAttribute("src") ?? "").toMatch(/^https:\/\/supabase-falso\.test\/storage\/v1\/object\/public\/avatars\/u-[a-z]+\/[a-z0-9]{12,40}\.(webp|jpg)$|^https:\/\/supabase-falso\.test\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[a-z0-9]{12,40}\.(webp|jpg)$/);
      continue;
    }
    // 10/11: GIF do KLIPY (https em klipy.com ou subdomínio) e imagem enviada (o balde comment-images do Supabase do config)
    if (img.closest(".c-midia, .c-anexo, .c-gif-opcao")) {
      expect(img.getAttribute("src") ?? "").toMatch(/^https:\/\/([a-z0-9-]+\.)*klipy\.com\/[A-Za-z0-9/_.%-]+(\?[A-Za-z0-9=&_.%-]+)?$|^https:\/\/supabase-falso\.test\/storage\/v1\/object\/public\/comment-images\/[0-9a-f-]{36}\/[a-z0-9]{12,40}\.(webp|jpg|gif)$|^blob:/);
      continue;
    }
    expect(img.closest(".c-perfil-fav"), "img fora das capas dos favoritos").not.toBeNull();
    expect(img.getAttribute("src") ?? "").toMatch(/^\/(?!\/)/);
  }
  expect(document.body.querySelectorAll("script, b, iframe").length).toBe(0);
  expect(document.body.querySelectorAll("svg").length).toBe(document.querySelectorAll(".c-modal .c-prov > svg").length);
  expect((globalThis as { hcXss?: unknown }).hcXss).toBeUndefined();
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
  FAVORITOS = [];
  BALDE.length = 0;
  ARQUIVOS_NO_BALDE = [];
  GRAVACOES.length = 0;
  document.body.replaceChildren();
  delete (globalThis as { hcXss?: unknown }).hcXss;
});

describe("a caixa de comentários num DOM simulado, com HTML no comentário, na resposta e no nome", () => {
  test("deslogado: lista desenhada, texto literal, só elementos do código", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(null));
    await esperar();
    expect(document.querySelectorAll(".c-item")).toHaveLength(3);
    expect(document.querySelectorAll(".c-replies .c-item")).toHaveLength(1);
    // 05/11 (pedido do autor): o selo da conta de ADM é 🜄, só no comentário do admin
    expect([...document.querySelectorAll(".c-badge")].map((b) => b.textContent)).toEqual(["🜄"]);
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
describe("a foto de perfil ao lado do nome (09/11)", () => {
  const DONO = "0f8fad5b-d9cb-469f-a165-70867728950e";
  test("com foto válida: <img> do balde; caminho estranho no banco: a runa", async () => {
    PERFIS[DONO] = { display_name: "Com foto", is_admin: false, avatar_path: `${DONO}/abcdefghijkl0123.webp` } as never;
    PERFIS["u-mau"] = { display_name: "Mau", is_admin: false, avatar_path: "javascript:alert(1)" } as never;
    const linhas: Linha[] = [
      { id: 21, body: "a", created_at: "2026-10-01T12:00:00+00:00", edited_at: null, user_id: DONO, parent_id: null },
      { id: 22, body: "b", created_at: "2026-10-01T13:00:00+00:00", edited_at: null, user_id: "u-mau", parent_id: null },
    ];
    try {
      iniciarComentarios(montarPagina(), CFG, clienteFalso(null, linhas));
      await esperar();
      const [a, b] = [...document.querySelectorAll(".c-item .c-foto")];
      expect(a?.querySelector("img")?.getAttribute("src")).toBe(`https://supabase-falso.test/storage/v1/object/public/avatars/${DONO}/abcdefghijkl0123.webp`);
      expect(b?.querySelector("img")).toBeNull();
      expect(b?.classList.contains("c-foto-runa")).toBe(true);
      conferirSoElementosDoCodigo();
    } finally {
      delete PERFIS[DONO];
      delete PERFIS["u-mau"];
    }
  });
});

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

describe("a janela da conta (03/11; redesenhada em 09/11): foto, nome, favoritos, apagar a conta", () => {
  const EU = { user: { id: "u-eu", email: "<b>eu</b>@exemplo.test" } };
  const INDICE = {
    obras: [
      { id: "ossos", titulo: "<b>Ossos</b>", capa: "/_astro/ossos.webp", link: "/pt/works/all-in-a-nights-work/" },
      { id: "mau", titulo: "Mau", capa: "javascript:alert(1)//.png", link: "javascript:alert(1)" },
      { id: "fora", titulo: "Fora", capa: "/_astro/fora.webp", link: "https://www.youtube.com/watch?v=x" },
    ],
  };
  const PEDIDOS: string[] = [];
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    PEDIDOS.length = 0;
    globalThis.fetch = ((url: string) => {
      PEDIDOS.push(String(url));
      return Promise.resolve(new Response(JSON.stringify(INDICE), { headers: { "Content-Type": "application/json" } }));
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = fetchOriginal;
  });
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

  test("clicar no próprio nome abre a janela: escurece (trava a página), nome só como texto, runa no lugar da foto, sem e-mail", async () => {
    const j = await abrir();
    expect(j.getAttribute("role")).toBe("dialog");
    expect(j.getAttribute("aria-modal")).toBe("true");
    expect(document.documentElement.classList.contains("c-modal-open")).toBe(true);
    const titulo = j.querySelector("#c-conta-titulo");
    expect(titulo?.textContent).toBe(NOME_ATAQUE);
    expect([...(titulo?.childNodes ?? [])].map((n) => n.nodeType)).toEqual([3]);
    expect(document.activeElement?.classList.contains("c-perfil-lapis-nome")).toBe(true);
    const foto = j.querySelector(".c-perfil-foto .c-foto");
    expect(foto?.classList.contains("c-foto-runa")).toBe(true);
    expect(foto?.textContent).toHaveLength([...(foto?.textContent ?? "")].length === 1 ? (foto?.textContent ?? "").length : -1);
    expect(j.textContent).not.toContain("exemplo.test");
    conferirSoElementosDoCodigo();
  });

  test("Esc fecha, devolve o foco ao nome e destrava a página", async () => {
    const j = await abrir();
    j.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".c-modal.c-conta")).toBeNull();
    expect(document.documentElement.classList.contains("c-modal-open")).toBe(false);
    expect(document.activeElement?.classList.contains("c-me")).toBe(true);
  });

  test("Meus Favoritos: capas na ordem da lista, link só para o site ou https, título com HTML só como texto", async () => {
    FAVORITOS = ["fora", "nao-existe", "ossos", "mau"];
    const j = await abrir();
    expect(PEDIDOS).toEqual(["/pt/obras.json"]);
    const itens = [...j.querySelectorAll<HTMLElement>(".c-perfil-fav")];
    expect(itens.map((i) => i.querySelector(".c-perfil-fav-nome")?.textContent)).toEqual(["Fora", "<b>Ossos</b>", "Mau"]);
    expect(itens.map((i) => i.getAttribute("href"))).toEqual(["https://www.youtube.com/watch?v=x", "/pt/works/all-in-a-nights-work/", null]);
    expect(itens.map((i) => i.querySelector("img")?.getAttribute("src") ?? null)).toEqual(["/_astro/fora.webp", "/_astro/ossos.webp", null]);
    expect(itens[2]?.tagName).toBe("SPAN");
    conferirSoElementosDoCodigo();
  });

  test("sem favoritos: o aviso", async () => {
    const j = await abrir();
    expect(j.querySelector(".c-perfil-vazio")?.textContent).toBe(TEXTOS_DA_CONTA.pt.semFavoritos);
  });

  test("trocar o nome: lápis vira campo; confere antes (2 a 30), manda o nome limpo ao banco e mostra o aviso; Esc desiste", async () => {
    const j = await abrir();
    j.querySelector<HTMLButtonElement>(".c-perfil-lapis-nome")?.click();
    let campo = j.querySelector<HTMLInputElement>("input[name=display_name]") as HTMLInputElement;
    expect(campo.value).toBe(NOME_ATAQUE);
    expect(document.activeElement).toBe(campo);
    campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(j.querySelector("input[name=display_name]")).toBeNull();
    expect(document.querySelector(".c-modal.c-conta"), "Esc no campo não fecha a janela").not.toBeNull();
    j.querySelector<HTMLButtonElement>(".c-perfil-lapis-nome")?.click();
    campo = j.querySelector<HTMLInputElement>("input[name=display_name]") as HTMLInputElement;
    const form = j.querySelector<HTMLFormElement>("form.c-perfil-nome-form") as HTMLFormElement;
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
    expect(j.querySelector("#c-conta-titulo")?.textContent).toBe("Novo Nome");
  });

  test("erro do banco no nome vira mensagem da janela", async () => {
    const j = await abrir();
    RESPOSTA_DO_RPC = { data: null, error: { message: "name length" } };
    j.querySelector<HTMLButtonElement>(".c-perfil-lapis-nome")?.click();
    (j.querySelector("input[name=display_name]") as HTMLInputElement).value = "Válido";
    j.querySelector<HTMLFormElement>("form.c-perfil-nome-form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    expect(j.querySelector(".c-msg")?.textContent).toBe("O nome precisa ter de 2 a 30 caracteres.");
  });

  test("a foto abre a tela de envio (campo de arquivo só de imagem); Esc volta à janela", async () => {
    const j = await abrir();
    j.querySelector<HTMLButtonElement>(".c-perfil-foto")?.click();
    expect(j.querySelector(".c-dialog.c-envio")).not.toBeNull();
    expect(j.querySelector<HTMLInputElement>("input[type=file]")?.getAttribute("accept")).toBe("image/*");
    conferirSoElementosDoCodigo();
    j.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(j.querySelector(".c-dialog.c-envio")).toBeNull();
    expect(j.querySelector(".c-perfil-topo")).not.toBeNull();
  });

  test("a lixeira abre \"Opa! Calma aí!\"; Sair volta; Deletar Conta apaga as fotos, chama delete_my_account, sai e avisa", async () => {
    ARQUIVOS_NO_BALDE = ["abcdefghijkl0123.webp"];
    const j = await abrir();
    j.querySelector<HTMLButtonElement>(".c-perfil-lixo")?.click();
    expect(j.querySelector(".c-apagar-titulo")?.textContent).toBe("Opa! Calma aí!");
    expect(j.querySelector(".c-apagar-texto")?.textContent).toContain("decisão permanente!");
    expect([...j.querySelectorAll(".c-apagar-texto .c-verde")].map((s) => s.textContent)).toEqual(["lista de favoritos", "marca-páginas", "todos", " os seus comentários"]);
    expect(j.querySelectorAll(".c-lixeira-runa")).toHaveLength(3);
    expect(RPCS).toEqual([]);
    conferirSoElementosDoCodigo();
    j.querySelector<HTMLButtonElement>(".c-apagar-sair")?.click();
    expect(j.querySelector(".c-apagar-titulo")).toBeNull();
    expect(j.querySelector(".c-perfil-topo")).not.toBeNull();
    j.querySelector<HTMLButtonElement>(".c-perfil-lixo")?.click();
    j.querySelector<HTMLButtonElement>(".c-apagar-confirmar")?.click();
    await esperar();
    expect(BALDE).toEqual([
      { acao: "list", balde: "avatars", pasta: "u-eu" },
      { acao: "remove", balde: "avatars", caminhos: ["u-eu/abcdefghijkl0123.webp"] },
      // 10/11: as imagens dos comentários da pessoa também saem (o balde falso devolve a mesma lista para os dois)
      { acao: "list", balde: "comment-images", pasta: "u-eu" },
      { acao: "remove", balde: "comment-images", caminhos: ["u-eu/abcdefghijkl0123.webp"] },
    ]);
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

// ───────────── 10/11/2026: formatação, emojis, GIFs e imagens ─────────────

describe("comentários formatados (10/11): marcas viram elementos do código; HTML e endereços estranhos continuam texto", () => {
  const EU = "0f0e0d0c-0b0a-4908-8706-050403020100";
  const OUTRO = "11111111-2222-4333-8444-555555555555";
  const GIF = "https://static.klipy.com/ii/abc/12/34/xyz.gif";
  const FORMATADO = [
    "**negrito <img src=x onerror=globalThis.hcXss=10>** e *itálico* e __sub__ e ~~risco~~ e ||segredo <script>globalThis.hcXss=11</script>||",
    "> citação com **força**",
    `{gif:${GIF}}`,
    `{img:${OUTRO}/abcdefghijkl1234.webp}`,
    "{gif:javascript:alert(1)}",
    "{gif:https://klipy.com.evil.test/a.gif}",
    "{gif:https://evilklipy.com/a.gif}",
    "{img:../../avatars/x.webp}",
  ].join("\n");
  const LINHAS_F: Linha[] = [{ id: 7, body: FORMATADO, created_at: "2026-11-10T12:00:00+00:00", edited_at: null, user_id: OUTRO, parent_id: null }];
  PERFIS[OUTRO] = { display_name: "Outra pessoa", is_admin: false };
  PERFIS[EU] = { display_name: "Eu", is_admin: false };

  test("deslogado: strong/em/u/s/spoiler/citação, um GIF do KLIPY, uma imagem do balde; o resto como texto", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(null, LINHAS_F));
    await esperar();
    const corpo = document.querySelector(".c-body") as HTMLElement;
    expect(corpo.classList.contains("c-formatado")).toBe(true);
    expect(corpo.querySelector("strong")?.textContent).toBe("negrito <img src=x onerror=globalThis.hcXss=10>");
    expect(corpo.querySelector("em")?.textContent).toBe("itálico");
    expect(corpo.querySelector("u")?.textContent).toBe("sub");
    expect(corpo.querySelector("s")?.textContent).toBe("risco");
    expect(corpo.querySelector(".c-spoiler")?.textContent).toBe("segredo <script>globalThis.hcXss=11</script>");
    expect(corpo.querySelector("blockquote.c-citacao")?.textContent).toBe("citação com força");
    const imgs = [...corpo.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs).toEqual([GIF, `https://supabase-falso.test/storage/v1/object/public/comment-images/${OUTRO}/abcdefghijkl1234.webp`]);
    expect(corpo.textContent).toContain("{gif:javascript:alert(1)}");
    expect(corpo.textContent).toContain("{gif:https://klipy.com.evil.test/a.gif}");
    expect(corpo.textContent).toContain("{img:../../avatars/x.webp}");
    conferirSoElementosDoCodigo();
    // o spoiler abre no clique (e no teclado)
    const sp = corpo.querySelector<HTMLElement>(".c-spoiler") as HTMLElement;
    expect(sp.getAttribute("aria-expanded")).toBe("false");
    sp.click();
    expect(sp.classList.contains("aberto")).toBe(true);
    // o GIF amplia e reduz
    const midia = corpo.querySelector<HTMLButtonElement>(".c-midia") as HTMLButtonElement;
    midia.click();
    expect(midia.getAttribute("aria-pressed")).toBe("true");
  });

  test("a barra de ferramentas: deslogado, clicar num botão abre o login; sem chave do KLIPY, sem botão de GIF", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso(null, []));
    await esperar();
    const botoes = [...document.querySelectorAll(".c-bar .c-ferramentas button")].map((b) => b.className.replace("c-ferramenta ", ""));
    expect(botoes).toEqual(["c-f-negrito", "c-f-italico", "c-f-sublinhado", "c-f-riscado", "c-f-spoiler", "c-f-citacao", "c-f-emoji", "c-f-imagem"]);
    document.querySelector<HTMLButtonElement>(".c-f-negrito")?.click();
    await esperar();
    expect(document.querySelectorAll(".c-modal")).toHaveLength(1);
  });

  test("conectado: negrito na seleção, emoji/runa no cursor, e o texto vai assim para o banco", async () => {
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, []));
    await esperar();
    const campo = document.querySelector<HTMLTextAreaElement>(".c-bar textarea") as HTMLTextAreaElement;
    campo.value = "olá mundo";
    campo.setSelectionRange(4, 9);
    document.querySelector<HTMLButtonElement>(".c-f-negrito")?.click();
    expect(campo.value).toBe("olá **mundo**");
    document.querySelector<HTMLButtonElement>(".c-f-negrito")?.click(); // de novo: tira
    expect(campo.value).toBe("olá mundo");
    campo.setSelectionRange(9, 9);
    document.querySelector<HTMLButtonElement>(".c-f-emoji")?.click();
    expect(document.querySelectorAll(".c-painel-emojis")).toHaveLength(1);
    document.querySelector<HTMLButtonElement>(".c-painel-emojis .c-emoji")?.click();
    expect(campo.value).toBe("olá mundo😀");
    // a aba das runas
    [...document.querySelectorAll<HTMLButtonElement>(".c-painel-emojis .c-aba")].find((b) => b.dataset["grupo"] === "runas")?.click();
    expect(document.querySelector(".c-grade-emojis")?.classList.contains("c-runas")).toBe(true);
    document.querySelector<HTMLButtonElement>(".c-grade-emojis .c-emoji")?.click();
    expect(campo.value).toBe("olá mundo😀✝");
    conferirSoElementosDoCodigo();
    document.querySelector<HTMLFormElement>(".c-bar")?.requestSubmit();
    await esperar();
    expect(GRAVACOES).toEqual([{ tabela: "comments", acao: "insert", v: { page_id: "news/teste", body: "olá mundo😀✝" } }]);
  });

  test("com a chave do KLIPY: botão GIF; a busca só aceita GIFs do KLIPY; o escolhido vai para a bandeja e para o fim do comentário", async () => {
    const cfg = lerConfiguracao({ ...CFG_BRUTA, klipy: "chave-de-teste-123" }) as ConfiguracaoDosComentarios;
    expect(cfg.klipy).toBe("chave-de-teste-123");
    expect((lerConfiguracao({ ...CFG_BRUTA, klipy: "chave com espaço" }) as ConfiguracaoDosComentarios).klipy).toBeNull();
    const pedidos: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = ((u: string) => {
      pedidos.push(String(u));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { content_description: "<b>gato</b>", media_formats: { tinygif: { url: "https://static.klipy.com/t/gato.gif", dims: [100, 80] }, mediumgif: { url: GIF } } },
              { media_formats: { tinygif: { url: "https://evil.test/x.gif" }, mediumgif: { url: "https://evil.test/x.gif" } } },
              { media_formats: { tinygif: { url: "javascript:alert(1)" } } },
            ],
            next: "abc",
          }),
      });
    }) as unknown as typeof fetch;
    try {
      const raiz = montarPagina();
      iniciarComentarios(raiz, cfg, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, []));
      await esperar();
      document.querySelector<HTMLButtonElement>(".c-bar .c-f-gif")?.click();
      await esperar();
      expect(pedidos[0]).toMatch(/^https:\/\/api\.klipy\.com\/v2\/featured\?key=chave-de-teste-123&/);
      const opcoes = [...document.querySelectorAll<HTMLButtonElement>(".c-gif-opcao")];
      expect(opcoes).toHaveLength(1);
      expect(opcoes[0]?.getAttribute("title")).toBe("<b>gato</b>");
      expect(document.querySelector(".c-klipy")?.textContent).toBe("Powered by KLIPY");
      conferirSoElementosDoCodigo();
      opcoes[0]?.click();
      expect(document.querySelectorAll(".c-painel")).toHaveLength(0);
      expect(document.querySelectorAll(".c-bar .c-bandeja .c-anexo")).toHaveLength(1);
      const campo = document.querySelector<HTMLTextAreaElement>(".c-bar textarea") as HTMLTextAreaElement;
      campo.value = "olha isso";
      document.querySelector<HTMLFormElement>(".c-bar")?.requestSubmit();
      await esperar();
      expect(GRAVACOES[0]?.v).toEqual({ page_id: "news/teste", body: `olha isso\n{gif:${GIF}}` });
      expect(document.querySelectorAll(".c-bar .c-bandeja .c-anexo")).toHaveLength(0);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  test("editar: GIFs e imagens vão para a bandeja (o campo só com o texto); tirar a imagem apaga o arquivo depois de salvar", async () => {
    const corpo = `meu texto\n{gif:${GIF}}\n{img:${EU}/abcdefghijkl1234.webp}`;
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, [{ id: 9, body: corpo, created_at: "2026-11-10T12:00:00+00:00", edited_at: null, user_id: EU, parent_id: null }]));
    await esperar();
    [...document.querySelectorAll<HTMLButtonElement>(".c-actions button")].find((b) => b.textContent === "Editar")?.click();
    await esperar();
    const campo = document.querySelector<HTMLTextAreaElement>(".c-edit-form textarea") as HTMLTextAreaElement;
    expect(campo.value).toBe("meu texto");
    const anexos = document.querySelectorAll(".c-edit-form .c-anexo");
    expect(anexos).toHaveLength(2);
    anexos[1]?.querySelector<HTMLButtonElement>(".c-anexo-x")?.click();
    document.querySelector<HTMLFormElement>(".c-edit-form")?.requestSubmit();
    await esperar();
    expect(GRAVACOES).toEqual([{ tabela: "comments", acao: "update", v: { body: `meu texto\n{gif:${GIF}}` } }]);
    expect(BALDE).toEqual([{ acao: "remove", balde: "comment-images", caminhos: [`${EU}/abcdefghijkl1234.webp`] }]);
  });

  test("só GIF/imagem, sem texto (pedido do autor, 10/11): a barra publica, a edição salva, e o comentário aparece sem parágrafo vazio", async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [{ media_formats: { tinygif: { url: GIF }, mediumgif: { url: GIF } } }], next: "" }) })) as unknown as typeof fetch;
    try {
      const cfg = lerConfiguracao({ ...CFG_BRUTA, klipy: "chave-de-teste-123" }) as ConfiguracaoDosComentarios;
      const raiz = montarPagina();
      iniciarComentarios(raiz, cfg, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, []));
      await esperar();
      // campo vazio e nada anexado: nada vai para o banco
      document.querySelector<HTMLFormElement>(".c-bar")?.requestSubmit();
      await esperar();
      expect(GRAVACOES).toEqual([]);
      // só o GIF: vai
      document.querySelector<HTMLButtonElement>(".c-bar .c-f-gif")?.click();
      await esperar();
      document.querySelector<HTMLButtonElement>(".c-gif-opcao")?.click();
      document.querySelector<HTMLFormElement>(".c-bar")?.requestSubmit();
      await esperar();
      expect(GRAVACOES[0]?.v).toEqual({ page_id: "news/teste", body: `{gif:${GIF}}` });
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  test("só GIF/imagem, sem texto: resposta e edição não exigem texto; editar apagando o texto salva só as mídias", async () => {
    const corpo = `meu texto\n{gif:${GIF}}`;
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, [{ id: 9, body: `{img:${EU}/abcdefghijkl1234.webp}`, created_at: "2026-11-10T11:00:00+00:00", edited_at: null, user_id: EU, parent_id: null }, { id: 10, body: corpo, created_at: "2026-11-10T12:00:00+00:00", edited_at: null, user_id: EU, parent_id: null }]));
    await esperar();
    // o comentário só com imagem: a imagem, sem parágrafo de texto vazio
    const soImagem = [...document.querySelectorAll(".c-body")].find((b) => b.querySelector("img") && !(b.textContent ?? "").trim());
    expect(soImagem).toBeTruthy();
    expect(soImagem?.querySelectorAll("p:empty")).toHaveLength(0);
    [...document.querySelectorAll<HTMLButtonElement>(".c-actions button")].find((b) => b.textContent === "Responder")?.click();
    await esperar();
    expect(document.querySelector(".c-reply-form textarea")?.hasAttribute("required")).toBe(false);
    [...document.querySelectorAll<HTMLButtonElement>(".c-actions button")].filter((b) => b.textContent === "Editar").at(-1)?.click();
    await esperar();
    const campo = document.querySelector<HTMLTextAreaElement>(".c-edit-form textarea") as HTMLTextAreaElement;
    expect(campo.hasAttribute("required")).toBe(false);
    campo.value = "";
    document.querySelector<HTMLFormElement>(".c-edit-form")?.requestSubmit();
    await esperar();
    expect(GRAVACOES).toEqual([{ tabela: "comments", acao: "update", v: { body: `{gif:${GIF}}` } }]);
  });

  test("apagar um comentário com imagem: o arquivo sai do balde junto", async () => {
    const corpo = `{img:${EU}/abcdefghijkl1234.webp}`;
    const raiz = montarPagina();
    iniciarComentarios(raiz, CFG, clienteFalso({ user: { id: EU, email: "eu@exemplo.test" } }, [{ id: 9, body: corpo, created_at: "2026-11-10T12:00:00+00:00", edited_at: null, user_id: EU, parent_id: null }]));
    await esperar();
    const confirmar = window.confirm;
    window.confirm = () => true;
    try {
      [...document.querySelectorAll<HTMLButtonElement>(".c-actions button")].find((b) => b.textContent === "Apagar")?.click();
      await esperar();
    } finally {
      window.confirm = confirmar;
    }
    expect(BALDE).toEqual([{ acao: "remove", balde: "comment-images", caminhos: [`${EU}/abcdefghijkl1234.webp`] }]);
  });
});
