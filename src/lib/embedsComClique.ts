// Posts incorporados só com clique (T17g, B27): o passo de build que tira os scripts de terceiros do <main> e põe no lugar o
// quadro "Mostrar post do X".
//
// Entrada: o HTML final do <main> (depois de finalizarMain). Saída: o mesmo HTML com, em cada `<div class="embed">` que tem um post
// do X, do Reddit ou do Instagram:
//   1. TODOS os <script> de dentro do .embed removidos (o widgets.js do X, o widgets.js do Reddit, o embed.js do Instagram — e
//      qualquer outro, com src ou inline: o relatório lista cada um). Fora do .embed, também sai qualquer <script src> dos
//      domínios desses três serviços (defesa extra: ninguém deve colar o script solto).
//   2. o <blockquote> original INTOCADO (é o texto e o link do post, o que aparece sem JavaScript);
//   3. o atributo `data-embed-servico="x|reddit|instagram"` no <div class="embed">;
//   4. no fim do .embed, o quadro `<div class="embed-gate">`: aviso + botão (os dois `hidden` até o JavaScript ligar) + o link para o
//      post original (sempre visível) + a linha de status (role="status").
// Quem liga o botão é o script de src/scripts/embeds/ (carrega só depois do clique). Os textos ficam em textosDosEmbeds.ts.
//
// Se o blockquote não for reconhecido (por exemplo, o código de incorporação do TikTok em blockquote) ou o link do post não for
// válido, os scripts SAEM do mesmo jeito e fica só o blockquote (com o link dele): o relatório traz um aviso. Nunca fica script de
// terceiro por falta de reconhecimento.
//
// Edita o texto no lugar (parse5 só para ACHAR as posições, como em imagensDoHtml.ts): nada do resto do HTML é reescrito.
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { DADOS, SERVICOS, servicoPelaClasse, urlDoPost, type Servico } from "../scripts/embeds/regras";
import type { Lang } from "./config";
import { esc } from "./markdown";
import { textosDoEmbed } from "./textosDosEmbeds";

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
export interface QuadroCriado {
  servico: Servico;
  /** O endereço canônico do post. */
  post: string;
}
export interface RelatorioDosEmbeds {
  quadros: QuadroCriado[];
  scriptsRemovidos: ScriptRemovido[];
  /** Problemas que o autor pode querer ver (embed não reconhecido, link inválido). */
  avisos: string[];
}

interface Edicao {
  de: number;
  ate: number;
  texto: string;
}

function dominioDe(src: string): string {
  try {
    return new URL(src.startsWith("//") ? `https:${src}` : src).hostname;
  } catch {
    return "";
  }
}

/** O endereço do post dentro de um <blockquote>: o link certo de cada serviço. */
function postDoBlockquote(servico: Servico, bq: Elemento): string | null {
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
  anda(bq);
  const permalink = atributo(bq, "data-instgrm-permalink");
  if (servico === "instagram" && permalink) links.unshift(permalink);
  const validos = links.map((h) => urlDoPost(servico, h)).filter((u): u is string => u !== null);
  // o X põe o link do post por ÚLTIMO (depois do texto e do nome do autor); o Reddit e o Instagram, por primeiro
  return (servico === "x" ? validos.at(-1) : validos[0]) ?? null;
}

function htmlDoQuadro(lang: Lang, servico: Servico, post: string, bq: Elemento): string {
  const rotulo = DADOS[servico].rotulo;
  const t = textosDoEmbed(lang, rotulo);
  const extras: string[] = [];
  const altura = atributo(bq, "data-embed-height");
  if (servico === "reddit" && altura && /^\d{2,4}$/.test(altura)) extras.push(` data-altura="${altura}"`);
  if (servico === "instagram" && atributo(bq, "data-instgrm-captioned") !== undefined) extras.push(" data-legendado");
  const link = `<a class="embed-origin" href="${esc(post)}" target="_blank" rel="noopener noreferrer">${esc(t.original)}</a>`;
  // serviço desligado (DADOS[servico].comBotao = false): só o link para o original; o post nunca carrega
  if (!DADOS[servico].comBotao) return `<div class="embed-gate">${link}</div>`;
  return (
    `<div class="embed-gate"${extras.join("")} data-t-carregando="${esc(t.carregando)}" data-t-pronto="${esc(t.pronto)}" data-t-erro="${esc(t.erro)}" data-t-titulo="${esc(t.titulo)}">` +
    `<p class="embed-gate-aviso" hidden>${esc(t.aviso)}</p>` +
    `<button type="button" class="embed-load" hidden>${esc(t.botao)}</button>` +
    `${link}<p class="embed-status" role="status"></p></div>`
  );
}

/** O trecho da tag de abertura de `e` onde entram atributos novos (logo antes do ">"), ou -1. */
function fimDaTagDeAbertura(e: Elemento, html: string): number {
  const inicio = e.sourceCodeLocation?.startTag;
  if (!inicio || html[inicio.endOffset - 1] !== ">" || html[inicio.endOffset - 2] === "/") return -1;
  return inicio.endOffset - 1;
}

export function embedsComClique(html: string, lang: Lang): { html: string; relatorio: RelatorioDosEmbeds } {
  const relatorio: RelatorioDosEmbeds = { quadros: [], scriptsRemovidos: [], avisos: [] };
  if (!/<script|class="[^"]*\bembed\b/i.test(html)) return { html, relatorio };
  const doc = parseFragment(html, { sourceCodeLocationInfo: true });
  const edicoes: Edicao[] = [];
  const jaRemovidos = new Set<Elemento>();

  const removerScript = (s: Elemento, servico: Servico | null, dentroDoEmbed: boolean) => {
    const loc = s.sourceCodeLocation;
    if (!loc || jaRemovidos.has(s)) return;
    jaRemovidos.add(s);
    edicoes.push({ de: loc.startOffset, ate: loc.endOffset, texto: "" });
    const src = atributo(s, "src") ?? null;
    relatorio.scriptsRemovidos.push({ src, dominio: src === null ? null : dominioDe(src), servico, dentroDoEmbed });
  };

  const dominiosDosServicos = new Set(SERVICOS.flatMap((s) => DADOS[s].dominiosDoScript));
  const scriptsSoltos: Elemento[] = [];
  const andar = (n: No, dentroDoEmbed: boolean) => {
    for (const f of filhosDe(n)) {
      if (!ehElemento(f)) continue;
      if (f.tagName === "div" && classesDe(f).includes("embed")) {
        tratarEmbed(f);
        continue;
      }
      if (f.tagName === "script" && !dentroDoEmbed) scriptsSoltos.push(f);
      andar(f, dentroDoEmbed);
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
    // o blockquote do serviço (o primeiro que se reconhece)
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
      if (scripts.length > 0) relatorio.avisos.push(`embed com script de terceiros que não é do X, do Reddit nem do Instagram: ${scripts.map((s) => atributo(s, "src") ?? "(inline)").join(", ")}; os scripts saíram e o post não ganhou botão`);
      return;
    }
    const post = postDoBlockquote(servico, bq);
    const fim = embed.sourceCodeLocation?.endTag?.startOffset;
    const abre = fimDaTagDeAbertura(embed, html);
    if (!post || fim === undefined || abre < 0) {
      relatorio.avisos.push(`post do ${DADOS[servico].rotulo} sem link válido: o blockquote ficou sem botão`);
      return;
    }
    edicoes.push({ de: abre, ate: abre, texto: ` data-embed-servico="${servico}"` });
    edicoes.push({ de: fim, ate: fim, texto: htmlDoQuadro(lang, servico, post, bq) });
    relatorio.quadros.push({ servico, post });
  };

  andar(doc, false);
  for (const s of scriptsSoltos) {
    const src = atributo(s, "src");
    if (src && dominiosDosServicos.has(dominioDe(src))) removerScript(s, null, false);
  }
  if (edicoes.length === 0) return { html, relatorio };

  // aplica de trás para a frente: as posições de cima não mudam
  let saida = html;
  for (const e of [...edicoes].sort((a, b) => b.de - a.de || b.ate - a.ate)) saida = saida.slice(0, e.de) + e.texto + saida.slice(e.ate);
  return { html: saida, relatorio };
}
