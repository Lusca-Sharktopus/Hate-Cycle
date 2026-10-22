// Posts incorporados do X, do Reddit e do Instagram em moldura isolada (T17g → T17j, B27): o passo de build que tira os scripts de
// terceiros do <main>.
//
// Entrada: o HTML final do <main> (depois de finalizarMain). Saída: o mesmo HTML com:
//   1. TODOS os <script> de dentro de cada `<div class="embed">` removidos (o widgets.js do X, o widgets.js do Reddit, o embed.js do
//      Instagram — e qualquer outro, com src ou inline: o relatório lista cada um). Fora do .embed, também sai qualquer <script src>
//      dos domínios desses três serviços (defesa extra: ninguém deve colar o script solto).
//   2. NADA acrescentado: o <blockquote> do autor fica exatamente como está (é o que aparece sem JavaScript, como antes). Quem o
//      troca pela moldura isolada, ao carregar a página, é o script de src/scripts/embeds/ (que o BaseLayout só põe na página quando
//      o relatório traz pelo menos um post).
//
// Se o blockquote não for reconhecido (por exemplo, o código de incorporação do TikTok em blockquote) ou o link do post não for
// válido, os scripts SAEM do mesmo jeito e fica só o blockquote: o relatório traz um aviso. Nunca fica script de terceiro por falta de
// reconhecimento.
//
// Edita o texto no lugar (parse5 só para ACHAR as posições, como em imagensDoHtml.ts): nada do resto do HTML é reescrito.
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { DADOS, SERVICOS, postDoBlockquote, servicoPelaClasse, type Servico } from "../scripts/embeds/regras";

type No = DefaultTreeAdapterMap["node"];
type Elemento = DefaultTreeAdapterMap["element"];

const ehElemento = (n: No): n is Elemento => "tagName" in n;
const filhosDe = (n: No): No[] => {
  const alvo = "content" in n ? n.content : n; // <template> guarda os filhos em `content`
  return "childNodes" in alvo ? alvo.childNodes : [];
};
const atributo = (e: Elemento, nome: string): string | undefined => e.attrs.find((a) => a.name === nome)?.value;
const classesDe = (e: Elemento): string[] => (atributo(e, "class") ?? "").split(/\s+/).filter(Boolean);

export interface ScriptRemovido {
  /** O `src` do script, ou null se era inline. */
  src: string | null;
  /** O domínio do `src` (sem a porta), "" se o endereço não se lê ou é relativo, null se era inline. */
  dominio: string | null;
  /** O serviço a que o script pertencia (pelo blockquote do mesmo .embed), se reconhecido. */
  servico: Servico | null;
  /** Estava dentro de um .embed? (false = script solto de um dos domínios dos serviços). */
  dentroDoEmbed: boolean;
}
export interface PostAchado {
  servico: Servico;
  /** O endereço canônico do post (o mesmo que o navegador vai usar para montar a moldura). */
  post: string;
}
export interface RelatorioDosPosts {
  posts: PostAchado[];
  scriptsRemovidos: ScriptRemovido[];
  /** Problemas que o autor pode querer ver (embed não reconhecido, link inválido). */
  avisos: string[];
}

function dominioDe(src: string): string {
  try {
    return new URL(src.startsWith("//") ? `https:${src}` : src).hostname;
  } catch {
    return "";
  }
}

/** Os `href` dos links de dentro de um elemento, na ordem do HTML. */
function linksDe(e: Elemento): string[] {
  const links: string[] = [];
  const anda = (n: No) => {
    for (const f of filhosDe(n)) {
      if (!ehElemento(f)) continue;
      if (f.tagName === "a") {
        const h = atributo(f, "href");
        if (h) links.push(h);
      }
      anda(f);
    }
  };
  anda(e);
  return links;
}

export function tirarScriptsDosPosts(html: string): { html: string; relatorio: RelatorioDosPosts } {
  const relatorio: RelatorioDosPosts = { posts: [], scriptsRemovidos: [], avisos: [] };
  if (!/<script|class="[^"]*\bembed\b/i.test(html)) return { html, relatorio };
  const doc = parseFragment(html, { sourceCodeLocationInfo: true });
  const cortes: { de: number; ate: number }[] = [];
  const jaRemovidos = new Set<Elemento>();

  const removerScript = (s: Elemento, servico: Servico | null, dentroDoEmbed: boolean) => {
    const loc = s.sourceCodeLocation;
    if (!loc || jaRemovidos.has(s)) return;
    jaRemovidos.add(s);
    cortes.push({ de: loc.startOffset, ate: loc.endOffset });
    const src = atributo(s, "src") ?? null;
    relatorio.scriptsRemovidos.push({ src, dominio: src === null ? null : dominioDe(src), servico, dentroDoEmbed });
  };

  const dominiosDosServicos = new Set(SERVICOS.flatMap((s) => DADOS[s].dominiosDoScript));
  const scriptsSoltos: Elemento[] = [];
  const andar = (n: No) => {
    for (const f of filhosDe(n)) {
      if (!ehElemento(f)) continue;
      if (f.tagName === "div" && classesDe(f).includes("embed")) {
        tratarEmbed(f);
        continue;
      }
      if (f.tagName === "script") scriptsSoltos.push(f);
      andar(f);
    }
  };

  const tratarEmbed = (embed: Elemento) => {
    const scripts: Elemento[] = [];
    const blockquotes: Elemento[] = [];
    const coletar = (n: No) => {
      for (const f of filhosDe(n)) {
        if (!ehElemento(f)) continue;
        if (f.tagName === "script") scripts.push(f);
        else {
          if (f.tagName === "blockquote") blockquotes.push(f);
          coletar(f);
        }
      }
    };
    coletar(embed);
    if (scripts.length === 0 && blockquotes.length === 0) return;
    // o blockquote do serviço (o primeiro que se reconhece; o navegador faz a mesma escolha)
    let servico: Servico | null = null;
    let bq: Elemento | null = null;
    for (const b of blockquotes) {
      const s = servicoPelaClasse(classesDe(b));
      if (s) {
        servico = s;
        bq = b;
        break;
      }
    }
    for (const s of scripts) removerScript(s, servico, true);
    if (!servico || !bq) {
      if (scripts.length > 0) relatorio.avisos.push(`embed com script de terceiros que não é do X, do Reddit nem do Instagram: ${scripts.map((s) => atributo(s, "src") ?? "(inline)").join(", ")}; os scripts saíram e fica só o texto do código`);
      return;
    }
    const post = postDoBlockquote(servico, linksDe(bq), atributo(bq, "data-instgrm-permalink"));
    if (!post) {
      relatorio.avisos.push(`post do ${DADOS[servico].rotulo} sem link válido: fica só o texto do código (o post não vai aparecer)`);
      return;
    }
    relatorio.posts.push({ servico, post });
  };

  andar(doc);
  for (const s of scriptsSoltos) {
    const src = atributo(s, "src");
    if (src && dominiosDosServicos.has(dominioDe(src))) removerScript(s, null, false);
  }
  if (cortes.length === 0) return { html, relatorio };

  // aplica de trás para a frente: as posições de cima não mudam
  let saida = html;
  for (const c of [...cortes].sort((a, b) => b.de - a.de)) saida = saida.slice(0, c.de) + saida.slice(c.ate);
  return { html: saida, relatorio };
}
