// A seção de COMENTÁRIOS de uma página: o HTML que comments() do build.py (linhas ~583–598) monta — a
// <section class="hc-comments" data-page="…"> e o <script> com window.HC —, MENOS os dois <script src> do site Python
// (o supabase-js do jsDelivr e o /comments.js?v=…). Desde a T15 quem faz a caixa funcionar é o script empacotado de
// src/components/CaixaDeComentarios.astro (src/scripts/comentarios/), com o @supabase/supabase-js de versão fixa.
//
// ⚠ ESTE É O ÚNICO ARQUIVO DO ASTRO QUE LÊ config.json → "comments" (a URL do projeto Supabase e a chave "anon").
//   - A chave anon é pública por desenho (vai para o navegador no window.HC, como no site atual); quem protege os dados
//     é o RLS do banco (supabase/migrations/). Mesmo assim: os valores NÃO são exportados daqui para outros módulos,
//     não vão para documentos, testes nem fixtures, e só aparecem no HTML das páginas que têm comentários.
//   - Nunca importe este arquivo num <script> de componente (iria para o JavaScript do navegador junto com o config.json).
//     O script dos comentários (src/scripts/comentarios/) não importa nada de src/lib/: lê o window.HC da página.
//
// O que a página recebe (SecaoDeComentarios), conforme o caso — a mesma regra do Python:
//   - `comments: false` no front matter  → null (nada; o build.py devolve "");
//   - sem as duas chaves no config.json  → null no site publicado; na prévia (pnpm dev), o aviso `c_not_configured`;
//   - com as duas chaves                 → a <section class="hc-comments" data-page="…"> + window.HC (+ o script empacotado).
// Prova: tests/leitor.test.ts e tests/noticias.test.ts (sites inventados: chaves com sujeira, sem chaves, só uma chave,
// textos faltando) e tests/paginas.test.ts (as páginas reais, com as chaves trocadas por marcadores antes de comparar).
import configDoSite from "../../config.json";
import type { Lang } from "./config";
import { pyStrip } from "./frontmatter";

/** COMMENT_UI_DEFAULTS do build.py: textos dos comentários que o config.json do autor pode ainda não ter. */
export const TEXTOS_PADRAO_DOS_COMENTARIOS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: { c_google: "Continue with Google", c_or: "or", c_close: "Close", c_login_title: "Log in to comment", c_edit: "Edit", c_save: "Save", c_edited: "edited" },
  pt: { c_google: "Continuar com o Google", c_or: "ou", c_close: "Fechar", c_login_title: "Entre para comentar", c_edit: "Editar", c_save: "Salvar", c_edited: "editado" },
};

/** config.json → comments (pode faltar, ou ter só uma das chaves). */
export interface ChavesDoSupabase {
  supabase_url?: unknown;
  supabase_anon_key?: unknown;
}

/** config.json → ui (todos os idiomas): daqui saem os textos `c_*` que o comments.js usa. */
export type TextosDaInterface = Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>;

export interface OpcoesDosComentarios {
  /** config.json → comments. */
  chaves: ChavesDoSupabase | undefined;
  /** config.json → ui. */
  ui: TextosDaInterface;
  /** true na prévia (pnpm dev): sem chaves, aparece o aviso em vez de nada. */
  comRascunhos: boolean;
}

export type SecaoDeComentarios =
  /** Prévia sem chaves: <section class="hc-comments"><p class="c-note">…</p></section>. */
  | { tipo: "aviso"; texto: string }
  /** A caixa de comentários de verdade. */
  | {
      tipo: "caixa";
      /** O ID da conversa (data-page): works/<obra>/<capítulo> ou news/<slug>, IGUAL nos dois idiomas. */
      idDaPagina: string;
      /** O título "Comentários" / "Comments". */
      titulo: string;
      /** O texto do <script> que cria window.HC, exatamente como o Python escreve. */
      configuracao: string;
    };

/** T(lang, chave) do build.py sobre um `ui` dado: o texto do idioma; vazio ou ausente → o do inglês → a própria chave. */
function textoDaInterface(ui: TextosDaInterface, lang: Lang, chave: string): string {
  const doIdioma = ui[lang]?.[chave];
  if (doIdioma) return String(doIdioma);
  const doIngles = ui["en"]?.[chave];
  return doIngles === undefined ? chave : String(doIngles);
}

/** A URL do Supabase como o build.py a limpa: sem espaços nas pontas, sem "/" no fim e sem o "/rest/v1…" que sobra ao copiar. */
export function limparUrlDoSupabase(url: string): string {
  return pyStrip(url).replace(/\/(rest|auth|storage|functions)\/v1.*$|\/+$/g, "");
}

/** json.dumps(x, ensure_ascii=False) do Python: ", " e ": " como separadores, chaves na ordem em que foram inseridas. */
export function jsonComoPython(valor: unknown): string {
  if (valor instanceof Map) return `{${[...valor].map(([k, v]) => `${JSON.stringify(String(k))}: ${jsonComoPython(v)}`).join(", ")}}`;
  if (Array.isArray(valor)) return `[${valor.map(jsonComoPython).join(", ")}]`;
  if (valor !== null && typeof valor === "object") return jsonComoPython(new Map(Object.entries(valor)));
  return JSON.stringify(valor);
}

/** Os textos `c_*` que vão para window.HC.ui: os do inglês, por cima os do idioma, e os padrões que faltarem (ordem do Python). */
export function textosDosComentarios(ui: TextosDaInterface, lang: Lang): Map<string, unknown> {
  const saida = new Map<string, unknown>();
  for (const [k, v] of Object.entries(ui["en"] ?? {})) if (k.startsWith("c_")) saida.set(k, v);
  for (const [k, v] of Object.entries(ui[lang] ?? {})) if (k.startsWith("c_")) saida.set(k, v);
  for (const [k, v] of Object.entries(TEXTOS_PADRAO_DOS_COMENTARIOS[lang] ?? TEXTOS_PADRAO_DOS_COMENTARIOS["en"] ?? {})) if (!saida.has(k)) saida.set(k, v);
  return saida;
}

/**
 * comments(lang, ident, title, fm) do build.py. `idDaPagina` null = a página tem `comments: false` (nada aparece).
 * Função pura: tudo entra por parâmetro (o teste a usa com chaves de mentira; o site, com `comentariosDaPagina()`).
 */
export function secaoDeComentarios(lang: Lang, idDaPagina: string | null, o: OpcoesDosComentarios): SecaoDeComentarios | null {
  if (idDaPagina === null) return null;
  const url = o.chaves?.supabase_url;
  const chave = o.chaves?.supabase_anon_key;
  // `cc.get("supabase_url") and cc.get("supabase_anon_key")`: as duas precisam existir e não estar vazias
  if (!(typeof url === "string" && url !== "" && typeof chave === "string" && chave !== "")) {
    return o.comRascunhos ? { tipo: "aviso", texto: textoDaInterface(o.ui, lang, "c_not_configured") } : null;
  }
  const hc = new Map<string, unknown>([
    ["url", limparUrlDoSupabase(url)],
    ["key", pyStrip(chave)],
    ["lang", lang],
    ["ui", textosDosComentarios(o.ui, lang)],
  ]);
  return {
    tipo: "caixa",
    idDaPagina,
    titulo: textoDaInterface(o.ui, lang, "c_title"),
    // conf.replace("</", "<\/"): um "</script>" dentro de um texto não fecha o <script> antes da hora
    configuracao: `window.HC=${jsonComoPython(hc).replaceAll("</", "<\\/")};`,
  };
}

// ───────────── o config.json do autor (só aqui) ─────────────

const doAutor = configDoSite as { comments?: ChavesDoSupabase; ui: TextosDaInterface };

/** A seção de comentários de uma página do site, com o config.json do autor. `comRascunhos`: COM_RASCUNHOS (src/lib/conteudo.ts). */
export function comentariosDaPagina(lang: Lang, idDaPagina: string | null, comRascunhos: boolean): SecaoDeComentarios | null {
  return secaoDeComentarios(lang, idDaPagina, { chaves: doAutor.comments, ui: doAutor.ui, comRascunhos });
}
