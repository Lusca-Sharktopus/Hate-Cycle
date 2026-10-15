// Resumos de texto: o que aparece no lugar de um `summary:` que o autor não escreveu.
//
// Funções puras, portadas do build.py (prova: tests/regras.test.ts, referência tools/regras_ref.py):
//   resumoAutomatico() → excerpt()           linha ~441  (primeiras palavras do texto, sem HTML/embeds/markdown)
//   textoPuro()        → plain()             linha ~453  (o texto inteiro, nas mesmas condições)
//   resumoDaNoticia()  → `summary or excerpt(body)`   linhas ~707 e ~837
//   textoDeBusca…()    → `hay` da lista de notícias    linha ~838 (o que a caixa de busca "enxerga")
//
// Cuidados de tradução do Python para o JavaScript (os mesmos de src/lib/markdown.ts):
//  - \s do Python ≠ \s do JavaScript → classe ESPACOS_PY; \b do Python é Unicode → (?![\p{L}\p{N}_]);
//  - len() e fatias do Python contam caracteres Unicode (pontos de código), não pedaços UTF-16 → Array.from().
import { formatarData } from "./datas";
import type { Lang } from "./config";
import { ESPACOS_PY, pyStrip } from "./frontmatter";
import { CLASSES_DO_PYTHON } from "./markdown";

const W = CLASSES_DO_PYTHON.w;
const S = ESPACOS_PY;

const RE_ATALHO_OU_EMBED = /\{\{[^}]*\}\}/gu;
/** <script>…</script>, <blockquote>…</blockquote>, <iframe>, <div>, <figure>, <style>: some o bloco inteiro. */
const RE_BLOCO_DE_HTML = new RegExp(`<(script|blockquote|iframe|div|figure|style)(?![${W}])[\\s\\S]*?</\\1>`, "gu");
const RE_TAG = /<[^>]+>/gu;
const RE_LINK_COM_ROTULO = /\[\[[^\]|]+\|([^\]]+)\]\]/gu;
const RE_LINK_SIMPLES = /\[\[([^\]]+)\]\]/gu;
const RE_IMAGEM_OU_LINK = /!?\[([^\]]*)\]\([^)]*\)/gu;
const RE_SINAIS_DE_MARKDOWN = /[*_#>]+/gu;
const RE_ESPACOS = new RegExp(`[${S}]+`, "gu");

/** Quantos caracteres tem o resumo automático de uma notícia (o `n=130` do excerpt). */
export const TAMANHO_DO_RESUMO = 130;

/**
 * excerpt(body, n) do build.py: primeiras palavras do texto, sem HTML, embeds ({{…}}), [[links]] nem sinais de Markdown.
 * Passou de `limite` caracteres: corta, volta ao último espaço, tira pontuação do fim e acrescenta "…".
 */
export function resumoAutomatico(corpo: string, limite = TAMANHO_DO_RESUMO): string {
  let texto = corpo.replace(RE_ATALHO_OU_EMBED, " ");
  texto = texto.replace(RE_BLOCO_DE_HTML, " ");
  texto = texto.replace(RE_TAG, " ");
  texto = texto.replace(RE_LINK_COM_ROTULO, "$1");
  texto = texto.replace(RE_LINK_SIMPLES, (_t, chave: string) => chave.split("/").pop() ?? "");
  texto = texto.replace(RE_IMAGEM_OU_LINK, "$1");
  texto = texto.replace(RE_SINAIS_DE_MARKDOWN, "");
  texto = pyStrip(texto.replace(RE_ESPACOS, " "));
  const pontos = Array.from(texto);
  if (pontos.length <= limite) return texto;
  const corte = pontos.slice(0, limite).join("");
  const ultimoEspaco = corte.lastIndexOf(" "); // rsplit(" ", 1)[0]: sem espaço nenhum, fica tudo
  const ate = ultimoEspaco < 0 ? corte : corte.slice(0, ultimoEspaco);
  return ate.replace(/[ ,;:.-]+$/u, "") + "…";
}

/** plain(body) do build.py: o mesmo tratamento, sem cortar (o limite é 100000 caracteres). */
export function textoPuro(corpo: string): string {
  return resumoAutomatico(corpo, 100000);
}

/** O texto que a notícia mostra nas listas: o `summary:` do autor, ou — se vazio/ausente — o resumo automático do corpo. */
export function resumoDaNoticia(resumoEscrito: string | undefined, corpo: string): string {
  return resumoEscrito || resumoAutomatico(corpo);
}

/** Quantos caracteres do texto da notícia entram na busca da lista (o `[:1500]` do build.py). */
export const CARACTERES_DA_BUSCA = 1500;

/**
 * O `data-search` de cada notícia da lista: título, etiquetas, data escrita e o início do texto, separados por espaço.
 * É nele que a caixa de busca da página Notícias procura (static/site.js, bloco 6).
 */
export function textoDeBuscaDaNoticia(lang: Lang, n: { titulo: string; tags: readonly string[]; data: string | undefined; corpo: string }): string {
  const inicio = Array.from(textoPuro(n.corpo)).slice(0, CARACTERES_DA_BUSCA).join("");
  return [n.titulo, n.tags.join(" "), formatarData(lang, n.data ?? ""), inicio].join(" ");
}
