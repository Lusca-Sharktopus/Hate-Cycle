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
  test("os onze arquivos existem (conta.ts = a janela da conta, 03/11; foto.ts e recorte.ts = a foto de perfil, 09/11; editor.ts, emojis.ts, formato.ts e midia.ts = a formatação, os emojis, os GIFs e as imagens, 10/11)", () => {
    expect(arquivos.sort()).toEqual(["caixa.ts", "conta.ts", "dom.ts", "editor.ts", "emojis.ts", "formato.ts", "foto.ts", "index.ts", "midia.ts", "recorte.ts", "regras.ts"]);
  });
  test.each(["caixa.ts", "conta.ts", "dom.ts", "editor.ts", "emojis.ts", "formato.ts", "foto.ts", "index.ts", "midia.ts", "recorte.ts", "regras.ts"])("%s não usa innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, createContextualFragment, eval nem new Function (só no texto do código; a prova pelo resultado é tests/comentarios-dom.test.ts)", (a) => {
    // (srcdoc não entra aqui: ele aparece de propósito na lista ATRIBUTOS_RECUSADOS de dom.ts, e a trava é testada acima)
    expect(codigo(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
  });
  test("ninguém daqui importa src/lib/ nem o config.json (as chaves só chegam pelo window.HC da página)", () => {
    for (const a of arquivos) {
      const imports = [...codigo(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) expect(i, a).toMatch(/^(\.\/(dom|regras|caixa|conta|foto|recorte|editor|emojis|formato|midia)|\.\.\/supabase\/cliente|\.\.\/login\/janela|@supabase\/supabase-js)$/);
    }
  });
  // 05/11: a janela de login saiu da caixa para src/scripts/login/ (a mesma janela abre pelos favoritos): as mesmas travas valem lá
  const LOGIN = join(PASTA, "..", "login");
  const codigoDoLogin = (a: string) =>
    readFileSync(join(LOGIN, a), "utf8")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
  test("login/: só janela.ts e circulo.ts; sem innerHTML & cia.; imports só do código dos comentários, do círculo, dos dois PNG e do TIPO do supabase-js", () => {
    expect(readdirSync(LOGIN).sort()).toEqual(["circulo.ts", "janela.ts"]);
    for (const a of ["circulo.ts", "janela.ts"]) {
      expect(codigoDoLogin(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
      const imports = [...codigoDoLogin(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) expect(i, a).toMatch(/^(\.\.\/comentarios\/(dom|regras)|\.\/circulo|\.\.\/\.\.\/assets\/login\/(circulo|tempo)\.png\?url|@supabase\/supabase-js)$/);
    }
    expect(codigoDoLogin("janela.ts")).toMatch(/import type \{ Provider, SupabaseClient \} from "@supabase\/supabase-js"/);
    expect(codigoDoLogin("janela.ts")).not.toMatch(/import \{[^}]*\} from "@supabase/);
    // a janela só escreve textContent para LIMPAR; texto entra por el(…, { texto })
    expect([...codigoDoLogin("janela.ts").matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]?.trim())).toEqual(['""']);
    // os atributos dos ícones (setAttribute fora do el()) só recebem valores fixos do próprio arquivo
    expect(codigoDoLogin("janela.ts")).toMatch(/function no<K extends keyof SVGElementTagNameMap>/);
  });
  test("regras.ts e dom.ts não importam nada; caixa.ts só usa o TIPO do supabase-js; só index.ts carrega o pacote", () => {
    expect(codigo("regras.ts")).not.toMatch(/\bimport\b/);
    expect(codigo("dom.ts")).not.toMatch(/\bimport\b/);
    // 10/11: a formatação também é pura (vai para o navegador e para o teste sem nada junto)
    expect(codigo("formato.ts")).not.toMatch(/\bimport\b/);
    expect(codigo("editor.ts")).toMatch(/import type \{ SupabaseClient \} from "@supabase\/supabase-js"/);
    expect(codigo("editor.ts")).not.toMatch(/import \{[^}]*\} from "@supabase/);
    expect(codigo("caixa.ts")).toMatch(/import type \{ SupabaseClient \} from "@supabase\/supabase-js"/);
    expect(codigo("caixa.ts")).not.toMatch(/import \{[^}]*\} from "@supabase/);
    // 03/11: a conexão é uma só para a página toda (comentários e marca-página), em src/scripts/supabase/cliente.ts
    expect(codigo("index.ts")).toMatch(/import \{ clienteDoSupabase \} from "\.\.\/supabase\/cliente"/);
    const cliente = readFileSync(join(PASTA, "..", "supabase", "cliente.ts"), "utf8");
    expect(cliente).toMatch(/import \{ createClient[^}]*\} from "@supabase\/supabase-js"/);
    expect([...cliente.matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1])).toEqual(["@supabase/supabase-js"]);
  });
  test("todo texto que vem do banco passa por el(..., { texto }) — nenhum textContent/appendChild com dado cru fora do el()", () => {
    // as únicas atribuições de textContent fora de dom.ts são para LIMPAR ("") ou o texto de "Carregando…" da interface
    const caixa = codigo("caixa.ts");
    const atribuicoes = [...caixa.matchAll(/\.textContent\s*=\s*([^;]+);/g)].map((m) => m[1]?.trim());
    // (05/11: o "" da janela de login foi junto com ela para src/scripts/login/janela.ts, conferido acima)
    expect(atribuicoes.sort()).toEqual(['""', '""', 't("c_loading")'].sort());
  });
});

// 05/11/2026 (depois da virada): o erro que o Supabase devolve no endereço quando o login com Google/Twitter/Discord falha
import { erroDoRetornoDoLogin } from "../src/scripts/login/janela";
describe("erroDoRetornoDoLogin (o erro do login no endereço)", () => {
  test("sem erro no endereço: nada", () => {
    expect(erroDoRetornoDoLogin("", "", "pt")).toBeNull();
    expect(erroDoRetornoDoLogin("#p3", "?p=2", "pt")).toBeNull();
    expect(erroDoRetornoDoLogin("#access_token=x&refresh_token=y&token_type=bearer", "", "pt")).toBeNull();
  });
  test("erro no hash ou na busca: a frase fixa + a descrição do Supabase", () => {
    expect(erroDoRetornoDoLogin("#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user", "", "pt")).toBe(
      "O login não deu certo. O servidor respondeu: Database error saving new user. Tente entrar de novo.",
    );
    expect(erroDoRetornoDoLogin("", "?error=access_denied&error_description=Email+link+is+invalid", "en")).toBe("The login didn't work. The server said: Email link is invalid. Please try logging in again.");
    expect(erroDoRetornoDoLogin("#error=invalid_request", "", "pt")).toBe("O login não deu certo. O servidor respondeu: invalid_request. Tente entrar de novo.");
    // codificada duas vezes (o que o Supabase mandou ao autor em 05/11)
    expect(erroDoRetornoDoLogin("#error=server_error&error_description=Unable+to+exchange+external+code%253A+4%252F0A", "", "pt")).toBe(
      "O login não deu certo. O servidor respondeu: Unable to exchange external code: 40A. Tente entrar de novo.",
    );
  });
  test("texto do endereço montado por outra pessoa: sem caracteres de HTML nem de endereço, até 160", () => {
    const r = erroDoRetornoDoLogin("#error=x&error_description=" + encodeURIComponent('<img src=x onerror="alert(1)"> visite http://golpe.test ' + "a".repeat(300)), "", "pt") ?? "";
    expect(r).not.toMatch(/[<>"/]/);
    expect(r.length).toBeLessThanOrEqual("O login não deu certo. O servidor respondeu: ".length + 160 + ". Tente entrar de novo.".length);
  });
});

// 09/11/2026: a foto de perfil e a janela da conta nova (src/scripts/comentarios/{foto,recorte,conta}.ts)
import { RUNES } from "../src/lib/runas";
import { CAMINHO_DA_FOTO, enderecoDaFoto, RUNAS_DA_FOTO, runaDaPessoa } from "../src/scripts/comentarios/foto";
import { barraDaEscala, deslocamentoPreso, escalaDaBarra, escalaMinima, nomeAleatorio, quadradoDoRecorte, ZOOM_MAXIMO } from "../src/scripts/comentarios/recorte";
import { capaSegura, linkSeguro, obrasFavoritas, TEXTOS_DA_CONTA } from "../src/scripts/comentarios/conta";
describe("foto de perfil (09/11)", () => {
  const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  test("as runas da foto são runas do fundo do site, sem repetir", () => {
    const doFundo = new Set(Array.from(String(RUNES)));
    for (const r of RUNAS_DA_FOTO) expect(doFundo.has(r), r).toBe(true);
    expect(new Set(RUNAS_DA_FOTO).size).toBe(RUNAS_DA_FOTO.length);
    expect(RUNAS_DA_FOTO.length).toBeGreaterThan(40);
  });
  test("a runa de uma pessoa é sempre a mesma e muda de pessoa para pessoa", () => {
    expect(runaDaPessoa(ID)).toBe(runaDaPessoa(ID));
    const varias = new Set(Array.from({ length: 50 }, (_, i) => runaDaPessoa(`${ID.slice(0, -2)}${String(i).padStart(2, "0")}`)));
    expect(varias.size).toBeGreaterThan(20);
  });
  test("o endereço da foto só sai de caminho válido e de base https (ou localhost)", () => {
    expect(enderecoDaFoto("https://abc.supabase.co", `${ID}/abcdefghijkl0123.webp`)).toBe(`https://abc.supabase.co/storage/v1/object/public/avatars/${ID}/abcdefghijkl0123.webp`);
    expect(enderecoDaFoto("https://abc.supabase.co", `${ID}/abcdefghijkl0123.jpg`)).not.toBeNull();
    for (const ruim of [null, 3, "", `${ID}/../x.webp`, `${ID}/abc.webp`, `${ID}/abcdefghijkl0123.svg`, `javascript:alert(1)`, `x/${ID}/abcdefghijkl0123.webp`, `${ID}/ABCDEFGHIJKL0123.webp`])
      expect(enderecoDaFoto("https://abc.supabase.co", ruim), String(ruim)).toBeNull();
    expect(enderecoDaFoto("javascript:alert(1)//", `${ID}/abcdefghijkl0123.webp`)).toBeNull();
    expect(enderecoDaFoto("http://evil.com", `${ID}/abcdefghijkl0123.webp`)).toBeNull();
    expect(enderecoDaFoto("http://localhost:54321", `${ID}/abcdefghijkl0123.webp`)).not.toBeNull();
  });
  test("o nome aleatório passa na regra do banco", () => {
    for (let i = 0; i < 20; i++) expect(CAMINHO_DA_FOTO.test(`${ID}/${nomeAleatorio()}.webp`)).toBe(true);
  });
  test("a migração usa a mesma regra do caminho", () => {
    const sql = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "supabase/migrations/20261110000000_fotos_de_perfil.sql"), "utf8");
    expect(sql.match(/\/\[a-z0-9\]\{12,40\}\\\.\(webp\|jpg\)\$/g)?.length).toBe(3);
    expect(sql).toMatch(/revoke execute on function public\.set_my_avatar\(text\) from public, anon/);
    expect(sql).toMatch(/security definer set search_path = ''/);
  });
});
describe("o recorte da foto (contas)", () => {
  test("a menor escala cobre o círculo pelo lado menor", () => {
    expect(escalaMinima(1000, 500, 300)).toBeCloseTo(0.6);
  });
  test("barra ↔ escala vai e volta, de 1× a ZOOM_MAXIMO×", () => {
    expect(escalaDaBarra(0, 2)).toBe(2);
    expect(escalaDaBarra(1, 2)).toBeCloseTo(2 * ZOOM_MAXIMO);
    expect(escalaDaBarra(7, 2)).toBeCloseTo(2 * ZOOM_MAXIMO);
    expect(barraDaEscala(escalaDaBarra(0.37, 2), 2)).toBeCloseTo(0.37);
  });
  test("o círculo nunca sai da imagem", () => {
    // imagem 1000 × 500 na escala 0,6 = 600 × 300 na tela; círculo de 300: sobra 150 de cada lado na horizontal, 0 na vertical
    expect(deslocamentoPreso(999, 999, 1000, 500, 0.6, 300)).toEqual([150, 0]);
    expect(deslocamentoPreso(-20, 0, 1000, 500, 0.6, 300)).toEqual([-20, 0]);
  });
  test("o quadrado recortado é o que está dentro do círculo", () => {
    expect(quadradoDoRecorte(1000, 500, 0.6, 0, 0, 300)).toEqual([250, 0, 500]);
    // imagem arrastada 150 px para a direita: o círculo mostra a ponta esquerda
    const [x, y, lado] = quadradoDoRecorte(1000, 500, 0.6, 150, 0, 300);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(lado).toBeCloseTo(500);
  });
});
describe("a janela da conta (endereços e favoritos)", () => {
  test("capa: só arquivo de imagem do próprio site", () => {
    expect(capaSegura("/_astro/capa.Ab12.webp")).toBe("/_astro/capa.Ab12.webp");
    expect(capaSegura("/covers/ossos.png")).toBe("/covers/ossos.png");
    for (const ruim of ["//evil.com/x.png", "https://evil.com/x.png", "javascript:alert(1)//.png", "/\\evil.com/x.png", "/x.svg", "x.png", null, "/a.png?x"])
      expect(capaSegura(ruim), String(ruim)).toBeNull();
  });
  test("link: página /en/ ou /pt/ do site, ou https", () => {
    expect(linkSeguro("/pt/works/light-and-blood/")).toBe("/pt/works/light-and-blood/");
    expect(linkSeguro("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/watch?v=abc");
    for (const ruim of ["javascript:alert(1)", "//evil.com", "/pt//evil.com", "/es/x", "/pt/../x", "http://x.com", "data:text/html,x", 5])
      expect(linkSeguro(ruim), String(ruim)).toBeNull();
  });
  test("favoritos: na ordem da lista, sem repetir, só obras que existem no índice", () => {
    const indice = [
      { id: "a", titulo: "A", capa: "/a.png", link: "/pt/works/a/" },
      { id: "b", titulo: "B", capa: "/b.png", link: null },
    ];
    expect(obrasFavoritas(["b", "x", "a", "b"], indice).map((o) => o.id)).toEqual(["b", "a"]);
  });
  test("os textos existem nos dois idiomas, com as mesmas chaves", () => {
    expect(Object.keys(TEXTOS_DA_CONTA.en).sort()).toEqual(Object.keys(TEXTOS_DA_CONTA.pt).sort());
    expect(TEXTOS_DA_CONTA.pt.calma).toBe("Opa! Calma aí!");
    expect(TEXTOS_DA_CONTA.pt.aviso.map(([t]) => t).join("")).toBe(
      "Deletar sua conta é uma decisão permanente! Ao fazer isso, você deletará sua lista de favoritos, seus marca-páginas e todos os seus comentários no site. Tem certeza de que quer prosseguir?",
    );
  });
});

// 10/11/2026: o botão da conta no cabeçalho (src/components/Header.astro + src/scripts/conta/)
import { configuracaoDaConta } from "../src/lib/comentarios";
import { semBotaoDaConta } from "./ajudantes/html";
describe("o botão da conta no cabeçalho (10/11)", () => {
  const CONTA = join(PASTA, "..", "conta");
  const codigoDaConta = (a: string) =>
    readFileSync(join(CONTA, a), "utf8")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
  test("a configuração: só com as duas chaves; nada no texto fecha o <script>", () => {
    expect(configuracaoDaConta("pt", undefined)).toBeNull();
    expect(configuracaoDaConta("pt", { supabase_url: "", supabase_anon_key: "k" })).toBeNull();
    const js = configuracaoDaConta("pt", { supabase_url: " https://falso.supabase.co/rest/v1/ ", supabase_anon_key: "__CHAVE_FALSA__" }, { pt: { c_hello: "</script><!--" } }) ?? "";
    expect(js).toMatch(/^window\.HC_CONTA=\{"url": "https:\/\/falso\.supabase\.co", "key": "__CHAVE_FALSA__", "lang": "pt", "ui": \{/);
    expect(js).not.toMatch(/[<>]/);
  });
  test("src/scripts/conta/: index.ts é leve (sem supabase-js, sem a caixa) e só carrega o painel por import(); sem innerHTML & cia.", () => {
    expect(readdirSync(CONTA).sort()).toEqual(["index.ts", "painel.ts"]);
    const index = codigoDaConta("index.ts");
    expect([...index.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1])).toEqual(["../comentarios/regras"]);
    expect(index).toMatch(/import\("\.\/painel"\)/);
    for (const a of ["index.ts", "painel.ts"]) {
      const c = codigoDaConta(a);
      expect(c, a).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
      for (const m of c.matchAll(/^import\b[^"']*["']([^"']+)["']/gm))
        expect(m[1], a).toMatch(/^(\.\.\/comentarios\/(regras|caixa|conta|foto)|\.\.\/login\/janela|\.\.\/supabase\/cliente|@supabase\/supabase-js)$/);
    }
    expect(codigoDaConta("painel.ts")).toMatch(/import type \{ SupabaseClient \} from "@supabase\/supabase-js"/);
  });
  test("semBotaoDaConta: tira o botão e a configuração; forma inesperada é erro", () => {
    const botao =
      '<button type="button" class="hc-conta" hidden aria-label="Entrar" title="Entrar" data-astro-cid-x1><span class="hc-conta-silhueta" data-astro-cid-x1><svg viewBox="0 0 24 24" data-astro-cid-x1><circle cx="12" data-astro-cid-x1></circle><path d="M3" data-astro-cid-x1></path></svg></span></button>';
    const html = `<header><nav>a${botao}</nav></header><script>window.HC_CONTA={"key": "__CHAVE_FALSA__"};</script><main></main>`;
    expect(semBotaoDaConta(html)).toEqual({ html: "<header><nav>a</nav></header><main></main>", botoes: 1 });
    expect(semBotaoDaConta("<header></header>")).toEqual({ html: "<header></header>", botoes: 0 });
    expect(() => semBotaoDaConta(`${botao}${botao}`)).toThrow();
    expect(() => semBotaoDaConta('<button type="button" class="hc-conta">x</button>')).toThrow();
  });
});
