// Comentários (T15): as REGRAS da caixa de comentários, como funções puras (texto e números entram, texto e números saem).
// É o que o static/comments.js decidia no meio do código de tela; aqui fica separado para o vitest provar cada regra
// (tests/comentarios.test.ts). Quem desenha a caixa é ./caixa.ts.
//
// ⚠ Este arquivo vai para o NAVEGADOR (faz parte do script dos comentários) e por isso NÃO importa nada:
//   um import de src/lib/ traria junto o config.json do site para o JavaScript público.
//
// De onde vem cada regra (static/comments.js, número da linha):
//   textosComPadrao     → T2 (l. 45): os textos de window.HC.ui com os padrões em inglês por baixo
//   mensagemDeErro      → friendly() (l. 23–28)
//   enterEnvia          → enterSends() (l. 33–40)
//   textoParaEnviar     → o `.trim()` + "vazio não envia" de cada formulário (l. 76, 189–191, 230)
//   alturaDoCampo       → o "cresce até 220 px" da barra (l. 72)
//   enderecoDeVolta     → location.href.split('#')[0] (l. 131, 153, 173)
//   nomeDeQuemEntrou    → (profile && profile.display_name) || user.email (l. 51)
//   montarArvore        → o `kids` de loadComments() (l. 212–214)
//   dataDoComentario    → o <time> de item() (l. 248)
//   dataDaEdicao        → o title do "(editado)" (l. 247)
//   podeResponder/podeEditar/podeApagar → os três `if` de item() (l. 252, 259, 262)
//   COLUNAS*            → as colunas de loadComments() (l. 202–205)

/** Os textos `c_*` que a caixa usa (window.HC.ui). Todos são do config.json → ui do autor (nunca do visitante). */
export type TextosDaCaixa = Readonly<Record<string, string>>;

/** Os padrões do T2 do comments.js: valem se o window.HC.ui não trouxer o texto (o build já põe os do idioma). */
export const PADROES_DA_CAIXA: TextosDaCaixa = {
  c_google: "Continue with Google",
  c_or: "or",
  c_close: "Close",
  c_login_title: "Log in to comment",
  c_edit: "Edit",
  c_save: "Save",
  c_edited: "edited",
  c_deleted: "[comment deleted]",
};

/** T2 = Object.assign({padrões}, T): os textos do window.HC.ui por cima dos padrões. Valor que não é texto vira texto (como o DOM faria). */
export function textosComPadrao(ui: unknown): TextosDaCaixa {
  const saida: Record<string, string> = { ...PADROES_DA_CAIXA };
  if (ui !== null && typeof ui === "object") {
    for (const [k, v] of Object.entries(ui)) if (v !== undefined && v !== null) saida[k] = String(v);
  }
  return saida;
}

/** Um texto da interface: o do window.HC.ui (com os padrões); se faltar, vazio (o comments.js mostraria "undefined"). */
export function texto(T: TextosDaCaixa, chave: string): string {
  return T[chave] ?? "";
}

/** friendly(err): a mensagem que o visitante lê quando o Supabase recusa algo. */
export function mensagemDeErro(erro: { message?: unknown } | null | undefined, T: TextosDaCaixa): string {
  const original = erro && typeof erro.message === "string" ? erro.message : "";
  const m = original.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many")) return texto(T, "c_err_rate");
  if (m.includes("invalid login") || m.includes("not confirmed")) return texto(T, "c_err_login");
  return texto(T, "c_err_generic") + (original ? ` (${original})` : "");
}

/** A tecla que envia: Enter sem Shift, sem Ctrl, sem Alt e fora da composição de acentos/IME. Shift+Enter = nova linha. */
export function enterEnvia(e: { key: string; shiftKey: boolean; isComposing: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && !e.ctrlKey && !e.altKey;
}

/** O texto que vai para o banco: sem espaços nas pontas. Vazio = não envia (nenhum pedido ao Supabase). */
export function textoParaEnviar(valor: string): string | null {
  const t = valor.trim();
  return t === "" ? null : t;
}

/** A barra de comentário cresce com o texto até 220 px (depois rola). */
export const ALTURA_MAXIMA_DA_BARRA = 220;
export function alturaDoCampo(scrollHeight: number): string {
  return `${Math.min(scrollHeight, ALTURA_MAXIMA_DA_BARRA)}px`;
}

/** Para onde o Supabase manda o visitante de volta (Google, confirmação de e-mail, nova senha): esta página, sem o #. */
export function enderecoDeVolta(href: string): string {
  return href.split("#")[0] ?? href;
}

/** As colunas pedidas ao banco. Sem edited_at = projeto que ainda não rodou o bloco 5 do SQL (a caixa segue sem "(editado)"). */
export const COLUNAS = "id, body, created_at, user_id, parent_id, profiles(display_name, is_admin)";
export const COLUNAS_COM_EDICAO = COLUNAS.replace("created_at,", "created_at, edited_at,");
/** Com deleted_at (migração 20261103000000, "[comentário apagado]"). Sem a coluna, recua para COLUNAS_COM_EDICAO e depois COLUNAS. */
export const COLUNAS_COMPLETAS = COLUNAS_COM_EDICAO.replace("parent_id,", "parent_id, deleted_at,");
/** Com a foto de perfil de quem comentou (migração 20261110000000, só no site novo). Sem a coluna, recua para COLUNAS_COMPLETAS. */
export const COLUNAS_COM_FOTO = COLUNAS_COMPLETAS.replace("is_admin)", "is_admin, avatar_path)");

/** Uma linha de public.comments como o select acima a devolve (o perfil vem embutido). */
export interface Comentario {
  id: number | string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  /** Apagado tendo respostas: o banco guarda "[apagado]" no texto e tira o dono; a caixa mostra c_deleted e as respostas. */
  deleted_at?: string | null;
  user_id: string | null;
  parent_id: number | string | null;
  profiles: { display_name?: string | null; is_admin?: boolean | null; avatar_path?: string | null } | null;
}

/** Quem está conectado (o que importa dele). */
export interface QuemEntrou {
  id: string;
  email?: string | undefined;
}
/** public.profiles da pessoa conectada. */
export interface Perfil {
  display_name?: string | null;
  is_admin?: boolean | null;
  /** 09/11/2026: a foto de perfil (migração 20261110000000_fotos_de_perfil.sql); sem a migração, a coluna não vem. */
  avatar_path?: string | null;
}

/** O nome da linha "Conectado como …": o do perfil; sem perfil, o e-mail da própria pessoa (só ela vê). */
export function nomeDeQuemEntrou(quem: QuemEntrou, perfil: Perfil | null): string {
  return (perfil && perfil.display_name) || quem.email || "";
}

/** A coluna pedida não existe no banco (erro 42703 do Postgres, que o PostgREST repassa): só nesse caso a caixa recua para menos colunas. */
export function faltaColuna(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return Boolean(erro) && (erro?.code === "42703" || /column .* does not exist/i.test(erro?.message ?? ""));
}

/** Comentário apagado que ficou por causa das respostas. */
export function comentarioApagado(c: Comentario): boolean {
  return Boolean(c.deleted_at);
}

/** O nome que aparece em cada comentário ("?" se o perfil não veio). */
export function nomeDoAutor(c: Comentario): string {
  return (c.profiles && c.profiles.display_name) || "?";
}

/**
 * A árvore da conversa, como o comments.js monta: os comentários "raiz" (sem parent_id) na ordem do banco, e as respostas
 * de cada um, também na ordem. Resposta cujo comentário-pai não veio não aparece (como hoje). Um nível só.
 */
export function montarArvore(linhas: readonly Comentario[]): { comentario: Comentario; respostas: Comentario[] }[] {
  const filhos = new Map<string, Comentario[]>();
  for (const c of linhas) {
    if (!c.parent_id) continue;
    const chave = String(c.parent_id);
    const lista = filhos.get(chave);
    if (lista) lista.push(c);
    else filhos.set(chave, [c]);
  }
  return linhas.filter((c) => !c.parent_id).map((c) => ({ comentario: c, respostas: filhos.get(String(c.id)) ?? [] }));
}

/** O texto do <time>: data média e hora curta no formato do idioma da página; data inválida = vazio. */
export function dataDoComentario(iso: string | null | undefined, lang: string): string {
  // new Date(null) é 1º/1/1970 (válida), como no comments.js; new Date(undefined) é inválida
  const d = new Date(iso as string);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
}

/** O title do "(editado)": data e hora completas no formato do idioma (o padrão do navegador). */
export function dataDaEdicao(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang);
}

/** Responder: só quem entrou, e só a um comentário raiz (respostas têm um nível só). */
export function podeResponder(quem: QuemEntrou | null, raiz: boolean): boolean {
  return quem !== null && raiz;
}
/** Editar: só o próprio comentário. */
export function podeEditar(quem: QuemEntrou | null, c: Comentario): boolean {
  return quem !== null && quem.id === c.user_id;
}
/** Apagar: o próprio comentário, ou qualquer um se a pessoa é admin. (Quem decide de verdade é o RLS do banco.) */
export function podeApagar(quem: QuemEntrou | null, perfil: Perfil | null, c: Comentario): boolean {
  return quem !== null && (quem.id === c.user_id || Boolean(perfil && perfil.is_admin));
}
