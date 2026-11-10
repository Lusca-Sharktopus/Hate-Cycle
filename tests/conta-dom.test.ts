// @vitest-environment happy-dom
//
// O botão da conta do cabeçalho (src/scripts/conta/painel.ts → ligarPainel(), a mesma função que o site chama) num DOM simulado, com
// um cliente do Supabase FALSO posto no lugar da conexão compartilhada (src/scripts/supabase/cliente.ts guarda a conexão em
// globalThis.__hcSupabase; nada de rede). A prova é do pedido do autor de 10/11/2026: no PRIMEIRO login de uma conta, o perfil abre
// sozinho, uma vez; em qualquer outro login, não.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ConfiguracaoDosComentarios } from "../src/scripts/comentarios/caixa";
import { lerConfiguracao } from "../src/scripts/comentarios/caixa";
import {
  CHAVE_DAS_RECEBIDAS,
  ehContaNova,
  FOLGA_DO_PRIMEIRO_LOGIN,
  IDADE_MAXIMA_DA_CONTA_NOVA,
  jaRecebida,
  marcarRecebida,
  type DatasDaConta,
} from "../src/scripts/conta/boasVindas";
import { ligarPainel } from "../src/scripts/conta/painel";

const CFG = lerConfiguracao({ url: "https://supabase-falso.test", key: "__CHAVE_FALSA__", lang: "pt", ui: {} }) as ConfiguracaoDosComentarios;
const AGORA = Date.parse("2026-11-10T17:00:00Z");
const em = (ms: number) => new Date(AGORA + ms).toISOString();
const MIN = 60 * 1000;
const HORA = 60 * MIN;

describe("ehContaNova: o primeiro login da conta, pelas datas do Supabase", () => {
  const conta = (d: Partial<DatasDaConta>): DatasDaConta => ({ id: "u-1", ...d });
  test("Google/Twitter/Discord: criada e conectada no mesmo pedido", () => {
    expect(ehContaNova(conta({ created_at: em(-3000), email_confirmed_at: em(-3000), last_sign_in_at: em(-2900) }), AGORA)).toBe(true);
    // Discord/Twitter sem e-mail confirmado: vale a criação
    expect(ehContaNova(conta({ created_at: em(-3000), last_sign_in_at: em(-2900) }), AGORA)).toBe(true);
  });
  test("e-mail: cadastro, e o clique no link do e-mail horas (ou dias) depois", () => {
    expect(ehContaNova(conta({ created_at: em(-5 * HORA), email_confirmed_at: em(-2000), last_sign_in_at: em(-1900) }), AGORA)).toBe(true);
    expect(ehContaNova(conta({ created_at: em(-72 * HORA), confirmed_at: em(-2000), last_sign_in_at: em(-1900) }), AGORA)).toBe(true);
  });
  test("a mesma sessão do primeiro login, páginas depois (ainda é a conta nova; quem segura a repetição é a marca do navegador)", () => {
    expect(ehContaNova(conta({ created_at: em(-HORA), email_confirmed_at: em(-HORA), last_sign_in_at: em(-HORA + 500) }), AGORA)).toBe(true);
  });
  test("qualquer login de depois NÃO é conta nova", () => {
    // conta antiga entrando agora
    expect(ehContaNova(conta({ created_at: em(-30 * 24 * HORA), email_confirmed_at: em(-30 * 24 * HORA), last_sign_in_at: em(-1000) }), AGORA)).toBe(false);
    // conta de hoje, segundo login (outro navegador, ou saiu e entrou)
    expect(ehContaNova(conta({ created_at: em(-HORA), email_confirmed_at: em(-HORA), last_sign_in_at: em(-1000) }), AGORA)).toBe(false);
    expect(ehContaNova(conta({ created_at: em(-HORA), last_sign_in_at: em(-HORA + FOLGA_DO_PRIMEIRO_LOGIN + 1000) }), AGORA)).toBe(false);
  });
  test("quem se cadastrou faz tempo e nunca saiu (a sessão ainda é a do primeiro login) NÃO é conta nova", () => {
    const d = -IDADE_MAXIMA_DA_CONTA_NOVA - MIN;
    expect(ehContaNova(conta({ created_at: em(d), email_confirmed_at: em(d), last_sign_in_at: em(d + 300) }), AGORA)).toBe(false);
  });
  test("relógio do navegador errado em algumas horas não atrapalha; datas faltando ou tortas = não", () => {
    const datas = { created_at: em(-3000), email_confirmed_at: em(-3000), last_sign_in_at: em(-2900) };
    expect(ehContaNova(conta(datas), AGORA + 5 * HORA)).toBe(true);
    expect(ehContaNova(conta(datas), AGORA - 5 * HORA)).toBe(true);
    expect(ehContaNova(conta({}), AGORA)).toBe(false);
    expect(ehContaNova(conta({ created_at: "ontem", last_sign_in_at: em(0) }), AGORA)).toBe(false);
    // sem a data do último login: só o relógio do navegador, 10 minutos
    expect(ehContaNova(conta({ created_at: em(-5 * MIN) }), AGORA)).toBe(true);
    expect(ehContaNova(conta({ created_at: em(-11 * MIN) }), AGORA)).toBe(false);
  });
});

describe("a marca do navegador (uma vez por conta)", () => {
  function armazemFalso(inicio: Record<string, string> = {}) {
    const dados = { ...inicio };
    return { dados, getItem: (k: string) => dados[k] ?? null, setItem: (k: string, v: string) => void (dados[k] = v) };
  }
  test("marca e reconhece; lista curta; conteúdo estragado = lista vazia", () => {
    const a = armazemFalso();
    expect(jaRecebida("u-1", a)).toBe(false);
    marcarRecebida("u-1", a);
    marcarRecebida("u-1", a);
    expect(a.dados[CHAVE_DAS_RECEBIDAS]).toBe('["u-1"]');
    expect(jaRecebida("u-1", a)).toBe(true);
    expect(jaRecebida("u-2", a)).toBe(false);
    for (let i = 0; i < 30; i++) marcarRecebida(`x-${i}`, a);
    expect(JSON.parse(a.dados[CHAVE_DAS_RECEBIDAS] ?? "[]")).toHaveLength(20);
    expect(jaRecebida("x-29", a)).toBe(true);
    for (const estragado of ["{", '{"a":1}', '"u-1"', "[1,2]"]) expect(jaRecebida("u-1", armazemFalso({ [CHAVE_DAS_RECEBIDAS]: estragado }))).toBe(false);
  });
  test("localStorage que recusa gravar não derruba nada", () => {
    const a = { getItem: () => null, setItem: () => { throw new Error("cheio"); } };
    expect(() => marcarRecebida("u-1", a)).not.toThrow();
  });
});

// ── o painel inteiro ──
type Usuario = DatasDaConta & { email: string };
type Ouvinte = (evento: string, s: { user: Usuario } | null) => void;
function clienteFalso(sessao: { user: Usuario } | null): { sb: SupabaseClient; entrar(u: Usuario): void } {
  const ouvintes: Ouvinte[] = [];
  let atual = sessao;
  const consulta = () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      single: () => b,
      then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: { display_name: "Nome <b>novo</b>", is_admin: false, avatar_path: null }, error: null }).then(ok),
    };
    return b;
  };
  const auth = {
    onAuthStateChange: (cb: Ouvinte) => {
      ouvintes.push(cb);
      setTimeout(() => cb("INITIAL_SESSION", atual), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: () => Promise.resolve({ data: { session: atual }, error: null }),
  };
  const sb = { from: consulta, auth } as unknown as SupabaseClient;
  return {
    sb,
    entrar(u) {
      atual = { user: u };
      for (const cb of ouvintes) cb("SIGNED_IN", atual);
    },
  };
}
const NOVA = (): Usuario => ({ id: "u-nova", email: "a@b.test", created_at: new Date(Date.now() - 3000).toISOString(), email_confirmed_at: new Date(Date.now() - 3000).toISOString(), last_sign_in_at: new Date(Date.now() - 2900).toISOString() });
const ANTIGA = (): Usuario => ({ id: "u-antiga", email: "c@d.test", created_at: "2026-11-05T12:00:00Z", email_confirmed_at: "2026-11-05T12:00:00Z", last_sign_in_at: new Date(Date.now() - 2000).toISOString() });

function montar(cliente: SupabaseClient): { clicar(): void } {
  (globalThis as unknown as Record<string, unknown>)["__hcSupabase"] = cliente;
  document.body.replaceChildren();
  document.documentElement.className = "";
  const botao = document.createElement("button");
  botao.className = "hc-conta";
  botao.setAttribute("aria-label", "Entrar ou criar uma conta");
  const silhueta = document.createElement("span");
  silhueta.className = "hc-conta-silhueta";
  botao.append(silhueta);
  document.body.append(botao);
  return ligarPainel(botao, CFG);
}
async function esperar(voltas = 20): Promise<void> {
  for (let i = 0; i < voltas; i++) await new Promise((r) => setTimeout(r, 0));
}
const perfilAberto = () => document.querySelectorAll(".c-modal.c-conta").length;

describe("conta recém-criada: o perfil abre sozinho, uma vez (10/11)", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    localStorage.clear();
    // a janela da conta pede a lista de obras (/<idioma>/obras.json) para os favoritos
    globalThis.fetch = (() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    document.body.replaceChildren();
    delete (globalThis as unknown as Record<string, unknown>)["__hcSupabase"];
  });

  test("voltou do Google/do link do e-mail com a conta nova: a janela do perfil abre, com o nome como texto, e o navegador anota", async () => {
    montar(clienteFalso({ user: NOVA() }).sb);
    await esperar();
    expect(perfilAberto()).toBe(1);
    expect(document.querySelector(".c-modal.c-conta")?.textContent).toContain("Nome <b>novo</b>");
    expect(document.querySelectorAll(".c-modal b")).toHaveLength(0);
    expect(document.querySelector("button.hc-conta .c-foto")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(CHAVE_DAS_RECEBIDAS) ?? "[]")).toEqual(["u-nova"]);
  });

  test("a página seguinte (mesma sessão, já anotada) NÃO abre de novo; o botão continua abrindo no clique", async () => {
    marcarRecebida("u-nova", localStorage);
    const painel = montar(clienteFalso({ user: NOVA() }).sb);
    await esperar();
    expect(perfilAberto()).toBe(0);
    painel.clicar();
    await esperar();
    expect(perfilAberto()).toBe(1);
  });

  test("conta antiga entrando agora: nada abre", async () => {
    montar(clienteFalso({ user: ANTIGA() }).sb);
    await esperar();
    expect(perfilAberto()).toBe(0);
    expect(localStorage.getItem(CHAVE_DAS_RECEBIDAS)).toBeNull();
    expect(document.querySelector("button.hc-conta .c-foto")).not.toBeNull();
  });

  test("sem ninguém conectado: nada abre; criou a conta nesta página (sem recarregar): abre uma vez só", async () => {
    const c = clienteFalso(null);
    montar(c.sb);
    await esperar();
    expect(perfilAberto()).toBe(0);
    c.entrar(NOVA());
    await esperar();
    expect(perfilAberto()).toBe(1);
    // o supabase-js repete o SIGNED_IN (troca de aba): não abre outra, nem reabre depois de fechada
    document.querySelector<HTMLButtonElement>(".c-modal.c-conta .c-perfil-x")?.click();
    expect(perfilAberto()).toBe(0);
    c.entrar(NOVA());
    await esperar();
    expect(perfilAberto()).toBe(0);
  });

  test("com outra janela ainda na tela (a de login fechando), espera ela sair; se não sair, desiste sem anotar", async () => {
    const outra = document.createElement("div");
    montar(clienteFalso({ user: NOVA() }).sb);
    outra.className = "c-modal";
    document.body.append(outra);
    await esperar();
    expect(perfilAberto()).toBe(0);
    outra.remove();
    await new Promise((r) => setTimeout(r, 250));
    expect(perfilAberto()).toBe(1);

    // a de nova senha não fecha sozinha: nada abre por cima dela, e a marca fica para a próxima página
    localStorage.clear();
    montar(clienteFalso({ user: { ...NOVA(), id: "u-outra" } }).sb);
    const presa = document.createElement("div");
    presa.className = "c-modal";
    document.body.append(presa);
    await new Promise((r) => setTimeout(r, 3600));
    expect(perfilAberto()).toBe(0);
    expect(localStorage.getItem(CHAVE_DAS_RECEBIDAS)).toBeNull();
  });
});
