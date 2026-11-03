// @vitest-environment happy-dom
//
// Os favoritos INTEIROS (src/scripts/favoritos/index.ts → iniciarFavoritos(), a mesma função que o site chama) numa seção de Histórias
// montada em DOM simulado, com um cliente do Supabase FALSO (nada de rede). Título de cartão com HTML entra só como texto.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { iniciarFavoritos } from "../src/scripts/favoritos/index";
import { TEXTOS_DOS_FAVORITOS, type ConfiguracaoDosFavoritos } from "../src/scripts/favoritos/regras";

const T = TEXTOS_DOS_FAVORITOS.pt;
const TITULO_ATAQUE = '<img src=x onerror="globalThis.__xss=1">';
const CFG: ConfiguracaoDosFavoritos = {
  url: "https://supabase-falso.test",
  key: "__CHAVE_FALSA__",
  lang: "pt",
  obras: { Pederneira: "firestriker", "Luz & Sangue": "light-and-blood", [TITULO_ATAQUE]: "hdvr" },
  runas: { firestriker: { lista: ["ᚠ", "ᚢ", "ᚦ"], final: "ᛟ" } },
};

const PEDIDOS: { op: string; filtros: Record<string, unknown>; corpo?: unknown }[] = [];
let NO_BANCO = new Set<string>(["light-and-blood"]);
let FALHAR = false;
function clienteFalso(logado: boolean): SupabaseClient {
  const from = () => {
    const filtros: Record<string, unknown> = {};
    let op = "select";
    let corpo: unknown;
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => ((filtros[k] = v), b),
      delete: () => ((op = "delete"), b),
      upsert: (c: unknown) => ((op = "upsert"), (corpo = c), b),
      then: (ok: (r: { data: unknown; error: unknown }) => unknown) => {
        PEDIDOS.push({ op, filtros, ...(corpo ? { corpo } : {}) });
        if (FALHAR && op !== "select") return Promise.resolve({ data: null, error: { message: "falha" } }).then(ok);
        if (op === "upsert") NO_BANCO.add((corpo as { work_id: string }).work_id);
        if (op === "delete") NO_BANCO.delete(String(filtros["work_id"]));
        const data = op === "select" ? [...NO_BANCO].map((w) => ({ work_id: w })) : null;
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return b;
  };
  const sessao = logado ? { user: { id: "u-eu" } } : null;
  const auth = {
    onAuthStateChange: (cb: (e: string, s: typeof sessao) => void) => {
      setTimeout(() => cb("INITIAL_SESSION", sessao), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
  return { from, auth } as unknown as SupabaseClient;
}

function montar(): HTMLElement {
  document.body.replaceChildren();
  const secao = document.createElement("section");
  secao.className = "stories-block";
  const head = document.createElement("div");
  head.className = "stories-head";
  const sorter = document.createElement("div");
  sorter.className = "sorter";
  const busca = document.createElement("input");
  busca.className = "story-search";
  sorter.append(busca);
  head.append(sorter);
  const grade = document.createElement("div");
  grade.className = "works grid";
  for (const titulo of ["Pederneira", "Luz & Sangue", TITULO_ATAQUE]) {
    const a = document.createElement("article");
    a.className = "work-card";
    a.dataset["title"] = titulo;
    const img = document.createElement("img");
    img.alt = titulo;
    const h3 = document.createElement("h3");
    h3.textContent = titulo;
    a.append(img, h3);
    grade.append(a);
  }
  const nada = document.createElement("p");
  nada.className = "no-results";
  nada.hidden = true;
  secao.append(head, grade, nada);
  document.body.append(secao);
  return secao;
}
async function esperar(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}
const estrelas = () => [...document.querySelectorAll<HTMLButtonElement>(".fav-estrela")];
const visiveis = () => [...document.querySelectorAll<HTMLElement>(".work-card")].filter((c) => !c.classList.contains("fav-fora")).map((c) => c.dataset["title"]);

afterEach(() => {
  PEDIDOS.length = 0;
  NO_BANCO = new Set(["light-and-blood"]);
  FALHAR = false;
  document.body.replaceChildren();
  document.documentElement.className = "";
  vi.useRealTimers();
  delete (globalThis as { __xss?: unknown }).__xss;
});

describe("favoritos num DOM simulado", () => {
  test("monta uma estrela por capa (logo depois dela, dentro da janelinha) e o filtro no começo do seletor; só elementos do código", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(false));
    await esperar();
    expect(estrelas()).toHaveLength(3);
    for (const c of document.querySelectorAll(".work-card")) {
      expect(c.children[1]?.className).toBe("fav-janela");
      expect(c.querySelector(".fav-janela > .fav-estrela > svg")).not.toBeNull();
    }
    expect(document.querySelector(".sorter")?.firstElementChild?.className).toBe("fav-filtro");
    expect(estrelas()[2]?.getAttribute("aria-label")).toBe(`Favoritar ${TITULO_ATAQUE}`);
    expect(document.querySelectorAll(".work-card img")).toHaveLength(3); // só as capas: o título com HTML não virou <img>
    expect((globalThis as { __xss?: unknown }).__xss).toBeUndefined();
  });

  test("sem conta: a estrela e o filtro abrem a janela que exige login (escurece, Esc fecha e devolve o foco); nada vai ao banco", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(false));
    await esperar();
    const estrela = estrelas()[0] as HTMLButtonElement;
    estrela.focus();
    estrela.click();
    const janela = document.querySelector<HTMLElement>(".fav-modal");
    expect(janela?.getAttribute("role")).toBe("dialog");
    expect(janela?.querySelector("p")?.textContent).toBe(T.janelaTexto);
    expect(document.documentElement.classList.contains("fav-modal-aberta")).toBe(true);
    janela?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".fav-modal")).toBeNull();
    expect(document.activeElement).toBe(estrela);
    document.querySelector<HTMLButtonElement>(".fav-filtro")?.click();
    expect(document.querySelectorAll(".fav-modal")).toHaveLength(1);
    expect(PEDIDOS).toEqual([]);
    expect(visiveis()).toHaveLength(3);
  });

  test("com conta: lê os favoritos da própria conta, marca a estrela; clicar favorita/desfavorita (filtrando pelo próprio user_id)", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(true));
    await esperar();
    expect(PEDIDOS).toEqual([{ op: "select", filtros: { user_id: "u-eu" } }]);
    expect(estrelas().map((e) => e.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    estrelas()[0]?.click();
    await esperar();
    expect(PEDIDOS.at(-1)).toEqual({ op: "upsert", filtros: {}, corpo: { user_id: "u-eu", work_id: "firestriker" } });
    expect(estrelas()[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(estrelas()[0]?.getAttribute("aria-label")).toBe("Tirar Pederneira dos favoritos");
    estrelas()[1]?.click();
    await esperar();
    expect(PEDIDOS.at(-1)).toEqual({ op: "delete", filtros: { user_id: "u-eu", work_id: "light-and-blood" } });
    expect([...NO_BANCO]).toEqual(["firestriker"]);
  });

  test("o filtro mostra só as favoritas; sem nenhuma, a mensagem de lista vazia", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(true));
    await esperar();
    const filtro = document.querySelector<HTMLButtonElement>(".fav-filtro") as HTMLButtonElement;
    filtro.click();
    expect(filtro.getAttribute("aria-pressed")).toBe("true");
    expect(visiveis()).toEqual(["Luz & Sangue"]);
    estrelas()[1]?.click(); // tira a única favorita
    await esperar();
    expect(visiveis()).toEqual([]);
    expect(document.querySelector<HTMLElement>(".fav-aviso")?.hidden).toBe(false);
    expect(document.querySelector(".fav-aviso")?.textContent).toBe(T.vazio);
    filtro.click();
    expect(visiveis()).toHaveLength(3);
    expect(document.querySelector<HTMLElement>(".fav-aviso")?.hidden).toBe(true);
  });

  test("erro ao salvar: a estrela volta como estava e aparece o aviso", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(true));
    await esperar();
    FALHAR = true;
    estrelas()[0]?.click();
    await esperar();
    expect(estrelas()[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".fav-aviso")?.textContent).toBe(T.erro);
  });

  test("o mouse entra na capa: a caixinha desce (fav-ver) passando pelas runas da obra e para na estrela; sair esconde", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(false));
    await esperar();
    vi.useFakeTimers();
    const cartao = document.querySelector<HTMLElement>(".work-card") as HTMLElement;
    const capa = cartao.querySelector("img") as HTMLImageElement;
    const botao = estrelas()[0] as HTMLButtonElement;
    capa.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(cartao.classList.contains("fav-ver")).toBe(true);
    expect(botao.classList.contains("fav-girando")).toBe(true);
    const vistas: string[] = [];
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(i === 0 ? 0 : 55);
      vistas.push(botao.querySelector(".fav-runa")?.textContent ?? "");
    }
    for (const r of vistas.slice(0, 5)) expect(["ᚠ", "ᚢ", "ᚦ"]).toContain(r);
    expect(vistas[5]).toBe("ᛟ");
    vi.advanceTimersByTime(200);
    expect(botao.classList.contains("fav-girando")).toBe(false);
    capa.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    expect(cartao.classList.contains("fav-ver")).toBe(false);
  });

  test("obra sem runas na configuração: aparece direto a estrela", async () => {
    iniciarFavoritos(montar(), CFG, clienteFalso(false));
    await esperar();
    const cartao = document.querySelectorAll<HTMLElement>(".work-card")[1] as HTMLElement;
    cartao.querySelector("img")?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(cartao.classList.contains("fav-ver")).toBe(true);
    expect(cartao.querySelector(".fav-estrela")?.classList.contains("fav-girando")).toBe(false);
  });
});
