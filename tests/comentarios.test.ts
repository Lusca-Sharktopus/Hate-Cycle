// Prova das REGRAS da caixa de comentários (T15, src/scripts/comentarios/): o que o static/comments.js decidia, agora em
// funções puras, e as travas de segurança do código que vai para o navegador.
// O comportamento na tela (Python × Astro, com um Supabase falso) é provado no navegador: tools/comentarios_playwright.py.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { lerConfiguracao } from "../src/scripts/comentarios/caixa";
import { ATRIBUTOS_RECUSADOS, atributoPermitido, el } from "../src/scripts/comentarios/dom";
import {
  COLUNAS,
  COLUNAS_COM_EDICAO,
  PADROES_DA_CAIXA,
  alturaDoCampo,
  dataDaEdicao,
  dataDoComentario,
  enderecoDeVolta,
  enterEnvia,
  mensagemDeErro,
  montarArvore,
  nomeDeQuemEntrou,
  nomeDoAutor,
  podeApagar,
  podeEditar,
  podeResponder,
  textoParaEnviar,
  textosComPadrao,
  type Comentario,
} from "../src/scripts/comentarios/regras";

const PASTA = fileURLToPath(new URL("../src/scripts/comentarios/", import.meta.url));
const T = textosComPadrao({ c_err_rate: "Calma!", c_err_login: "Senha errada.", c_err_generic: "Algo deu errado.", c_edit: "Editar" });

/** Um comentário inventado. */
function c(id: number, extra: Partial<Comentario> = {}): Comentario {
  return { id, body: `texto ${id}`, created_at: "2026-10-01T12:00:00Z", user_id: "u1", parent_id: null, profiles: { display_name: "leitora", is_admin: false }, ...extra };
}

describe("textos da interface (T2 do comments.js)", () => {
  test("os padrões em inglês valem só se o window.HC.ui não trouxer o texto", () => {
    expect(textosComPadrao(undefined)).toEqual(PADROES_DA_CAIXA);
    expect(textosComPadrao({ c_edit: "Editar", c_post: "Publicar" })).toEqual({ ...PADROES_DA_CAIXA, c_edit: "Editar", c_post: "Publicar" });
    expect(T["c_edit"]).toBe("Editar");
    expect(T["c_save"]).toBe("Save");
  });
});

describe("mensagens de erro (friendly do comments.js)", () => {
  test("limite de envio, login inválido e o resto", () => {
    expect(mensagemDeErro({ message: "rate limit: wait a few seconds" }, T)).toBe("Calma!");
    expect(mensagemDeErro({ message: "Too Many Requests" }, T)).toBe("Calma!");
    expect(mensagemDeErro({ message: "Invalid login credentials" }, T)).toBe("Senha errada.");
    expect(mensagemDeErro({ message: "Email not confirmed" }, T)).toBe("Senha errada.");
    expect(mensagemDeErro({ message: "invalid parent comment" }, T)).toBe("Algo deu errado. (invalid parent comment)");
    expect(mensagemDeErro({ message: "" }, T)).toBe("Algo deu errado.");
    expect(mensagemDeErro(null, T)).toBe("Algo deu errado.");
    expect(mensagemDeErro({ message: 42 }, T)).toBe("Algo deu errado.");
  });
});

describe("Enter envia, Shift+Enter quebra linha", () => {
  const tecla = (key: string, o: Partial<{ shiftKey: boolean; isComposing: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({ key, shiftKey: false, isComposing: false, ctrlKey: false, altKey: false, ...o });
  test.each([
    ["Enter", {}, true],
    ["Enter", { shiftKey: true }, false],
    ["Enter", { isComposing: true }, false],
    ["Enter", { ctrlKey: true }, false],
    ["Enter", { altKey: true }, false],
    ["a", {}, false],
    ["NumpadEnter", {}, false],
  ] as const)("%s %o → %s", (key, o, envia) => {
    expect(enterEnvia(tecla(key, o))).toBe(envia);
  });
});

describe("o que vai para o banco", () => {
  test("sem espaços nas pontas; só espaços/quebras = não envia", () => {
    expect(textoParaEnviar("  oi\n")).toBe("oi");
    expect(textoParaEnviar("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
    expect(textoParaEnviar(" \n\t ")).toBeNull();
    expect(textoParaEnviar("")).toBeNull();
  });
  test("as colunas pedidas (com e sem edited_at)", () => {
    expect(COLUNAS).toBe("id, body, created_at, user_id, parent_id, profiles(display_name, is_admin)");
    expect(COLUNAS_COM_EDICAO).toBe("id, body, created_at, edited_at, user_id, parent_id, profiles(display_name, is_admin)");
  });
  test("a barra cresce até 220 px", () => {
    expect(alturaDoCampo(44)).toBe("44px");
    expect(alturaDoCampo(500)).toBe("220px");
  });
  test("o endereço de volta (Google, e-mail) é a página sem o #", () => {
    expect(enderecoDeVolta("https://hatecycle.com/pt/news/x/#comentarios")).toBe("https://hatecycle.com/pt/news/x/");
    expect(enderecoDeVolta("https://hatecycle.com/pt/news/x/?a=1")).toBe("https://hatecycle.com/pt/news/x/?a=1");
  });
});

describe("a conversa", () => {
  test("raízes na ordem do banco, respostas embaixo de cada uma (na ordem); resposta sem pai não aparece", () => {
    const linhas = [c(1), c(2, { parent_id: 1 }), c(3), c(4, { parent_id: 1 }), c(5, { parent_id: 99 }), c(6, { parent_id: 3 })];
    const arvore = montarArvore(linhas);
    expect(arvore.map((r) => [r.comentario.id, r.respostas.map((x) => x.id)])).toEqual([
      [1, [2, 4]],
      [3, [6]],
    ]);
  });
  test("id em número ou em texto dá no mesmo (como as chaves de objeto do comments.js)", () => {
    expect(montarArvore([c(1), c(2, { parent_id: "1" })])[0]?.respostas.map((x) => x.id)).toEqual([2]);
  });
  test("nomes: o do perfil, '?' sem perfil; a linha de quem entrou usa o e-mail se não houver perfil", () => {
    expect(nomeDoAutor(c(1))).toBe("leitora");
    expect(nomeDoAutor(c(1, { profiles: null }))).toBe("?");
    expect(nomeDoAutor(c(1, { profiles: { display_name: "" } }))).toBe("?");
    expect(nomeDeQuemEntrou({ id: "u1", email: "a@exemplo.test" }, { display_name: "Leitora" })).toBe("Leitora");
    expect(nomeDeQuemEntrou({ id: "u1", email: "a@exemplo.test" }, null)).toBe("a@exemplo.test");
  });
  test("quem pode responder, editar e apagar", () => {
    const meu = c(1, { user_id: "eu" });
    const deOutro = c(2, { user_id: "outro" });
    expect(podeResponder(null, true)).toBe(false);
    expect(podeResponder({ id: "eu" }, true)).toBe(true);
    expect(podeResponder({ id: "eu" }, false)).toBe(false);
    expect(podeEditar(null, meu)).toBe(false);
    expect(podeEditar({ id: "eu" }, meu)).toBe(true);
    expect(podeEditar({ id: "eu" }, deOutro)).toBe(false);
    expect(podeApagar({ id: "eu" }, null, meu)).toBe(true);
    expect(podeApagar({ id: "eu" }, null, deOutro)).toBe(false);
    expect(podeApagar({ id: "eu" }, { is_admin: true }, deOutro)).toBe(true);
    expect(podeApagar(null, { is_admin: true }, deOutro)).toBe(false);
  });
});

describe("datas no formato do idioma (o mesmo toLocaleString do comments.js)", () => {
  const iso = "2026-10-01T15:04:00Z";
  test.each(["pt", "en"])("%s", (lang) => {
    expect(dataDoComentario(iso, lang)).toBe(new Date(iso).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }));
    expect(dataDaEdicao(iso, lang)).toBe(new Date(iso).toLocaleString(lang));
  });
  test("data inválida = vazio; nula = 1º/1/1970 (como no comments.js)", () => {
    expect(dataDoComentario("não é data", "pt")).toBe("");
    expect(dataDoComentario(undefined, "pt")).toBe("");
    expect(dataDoComentario(null, "en")).toBe(new Date(0).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }));
  });
});

describe("window.HC", () => {
  test("lido só com URL e chave; idioma padrão inglês; textos com os padrões", () => {
    expect(lerConfiguracao(undefined)).toBeNull();
    expect(lerConfiguracao({ url: "", key: "k" })).toBeNull();
    expect(lerConfiguracao({ url: "https://projeto-falso.test", key: "" })).toBeNull();
    const cfg = lerConfiguracao({ url: "https://projeto-falso.test", key: "__CHAVE__", ui: { c_post: "Publicar" } });
    expect(cfg?.lang).toBe("en");
    expect(cfg?.ui["c_post"]).toBe("Publicar");
    expect(cfg?.ui["c_google"]).toBe("Continue with Google");
  });
});

// ───────────── segurança: texto do visitante nunca vira HTML ─────────────

/** Um document mínimo: registra o que el() faz com cada elemento; innerHTML/outerHTML/insertAdjacentHTML disparam erro. */
class ElementoFalso {
  attrs: [string, string][] = [];
  filhos: ElementoFalso[] = [];
  eventos: string[] = [];
  textContent = "";
  constructor(readonly tagName: string) {}
  setAttribute(nome: string, valor: string) {
    this.attrs.push([nome, valor]);
  }
  addEventListener(evento: string) {
    this.eventos.push(evento);
  }
  appendChild(f: ElementoFalso) {
    this.filhos.push(f);
    return f;
  }
  set innerHTML(_v: string) {
    throw new Error("innerHTML usado");
  }
  set outerHTML(_v: string) {
    throw new Error("outerHTML usado");
  }
  insertAdjacentHTML() {
    throw new Error("insertAdjacentHTML usado");
  }
}
const documentoOriginal = (globalThis as { document?: unknown }).document;
afterEach(() => {
  (globalThis as { document?: unknown }).document = documentoOriginal;
});
function comDocumentoFalso<R>(f: () => R): R {
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => new ElementoFalso(tag) };
  return f();
}

describe("segurança: el() (o único jeito de a caixa criar elementos)", () => {
  const ATAQUES = ['<img src=x onerror="window.__xss=1">', "<script>window.__xss=2</script>", '"><svg onload=alert(1)>', "&lt;b&gt;"];
  test.each(ATAQUES)("texto %s entra como TEXTO (textContent), nunca como HTML", (ataque) => {
    const n = comDocumentoFalso(() => el("div", { attrs: { class: "c-body" }, texto: ataque })) as unknown as ElementoFalso;
    expect(n.textContent).toBe(ataque);
    expect(n.filhos).toEqual([]);
    expect(n.attrs).toEqual([["class", "c-body"]]);
  });
  test.each(ATAQUES)("valor de atributo %s fica só no atributo (setAttribute)", (ataque) => {
    const n = comDocumentoFalso(() => el("span", { attrs: { title: ataque } })) as unknown as ElementoFalso;
    expect(n.attrs).toEqual([["title", ataque]]);
  });
  test.each(["onerror", "onclick", "ONload", "onmouseover", "x y", "a>b", "", '"x"'])("nome de atributo %j é recusado (nem evento, nem nome inválido)", (nome) => {
    expect(atributoPermitido(nome)).toBe(false);
    expect(() => comDocumentoFalso(() => el("div", { attrs: { [nome]: "1" } }))).toThrow(/recusado/);
  });
  test.each(["href", "src", "srcdoc", "formaction", "action", "xlink:href", "style", "HREF", "Style", "SrcDoc"])("atributo %s (endereço, HTML ou CSS) é recusado, qualquer que seja o valor", (nome) => {
    expect(atributoPermitido(nome)).toBe(false);
    for (const valor of ["javascript:alert(1)", "https://exemplo.test/", "<script>alert(1)</script>", "position:fixed;inset:0"]) {
      expect(() => comDocumentoFalso(() => el("a", { attrs: { [nome]: valor } }))).toThrow(/recusado/);
    }
  });
  test("a lista de recusados é a documentada em dom.ts", () => {
    expect([...ATRIBUTOS_RECUSADOS].sort()).toEqual(["action", "formaction", "href", "src", "srcdoc", "style", "xlink:href"]);
  });
  test.each(["class", "aria-label", "data-page", "datetime", "maxlength", "aria-pressed", "title", "type", "name", "placeholder", "rows", "minlength", "autocomplete", "required", "role", "aria-modal"])("atributo %s é aceito", (nome) => {
    expect(atributoPermitido(nome)).toBe(true);
  });
  test("eventos só por addEventListener (lista `ao`)", () => {
    const n = comDocumentoFalso(() => el("button", { attrs: { type: "button" }, ao: { click: () => {} } })) as unknown as ElementoFalso;
    expect(n.eventos).toEqual(["click"]);
    expect(n.attrs).toEqual([["type", "button"]]);
  });
});

describe("segurança: o código que vai para o navegador", () => {
  const arquivos = readdirSync(PASTA).filter((a) => a.endsWith(".ts"));
  const codigo = (a: string) =>
    readFileSync(join(PASTA, a), "utf8")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l)) // comentários podem citar as palavras proibidas
      .join("\n");
  test("os quatro arquivos existem", () => {
    expect(arquivos.sort()).toEqual(["caixa.ts", "dom.ts", "index.ts", "regras.ts"]);
  });
  test.each(["caixa.ts", "dom.ts", "index.ts", "regras.ts"])("%s não usa innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, createContextualFragment, eval nem new Function (só no texto do código; a prova pelo resultado é tests/comentarios-dom.test.ts)", (a) => {
    // (srcdoc não entra aqui: ele aparece de propósito na lista ATRIBUTOS_RECUSADOS de dom.ts, e a trava é testada acima)
    expect(codigo(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
  });
  test("ninguém daqui importa src/lib/ nem o config.json (as chaves só chegam pelo window.HC da página)", () => {
    for (const a of arquivos) {
      const imports = [...codigo(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) expect(i, a).toMatch(/^(\.\/(dom|regras|caixa)|@supabase\/supabase-js)$/);
    }
  });
  test("regras.ts e dom.ts não importam nada; caixa.ts só usa o TIPO do supabase-js; só index.ts carrega o pacote", () => {
    expect(codigo("regras.ts")).not.toMatch(/\bimport\b/);
    expect(codigo("dom.ts")).not.toMatch(/\bimport\b/);
    expect(codigo("caixa.ts")).toMatch(/import type \{ SupabaseClient \} from "@supabase\/supabase-js"/);
    expect(codigo("caixa.ts")).not.toMatch(/import \{[^}]*\} from "@supabase/);
    expect(codigo("index.ts")).toMatch(/import \{ createClient \} from "@supabase\/supabase-js"/);
  });
  test("todo texto que vem do banco passa por el(..., { texto }) — nenhum textContent/appendChild com dado cru fora do el()", () => {
    // as únicas atribuições de textContent fora de dom.ts são para LIMPAR ("") ou o texto de "Carregando…" da interface
    const caixa = codigo("caixa.ts");
    const atribuicoes = [...caixa.matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(atribuicoes.sort()).toEqual(['""', '""', '""', 't("c_loading")'].sort());
  });
});
