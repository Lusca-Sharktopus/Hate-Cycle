// O "Markdown mínimo" do site: o texto de cada .md (abaixo do segundo ---) → HTML, EXATAMENTE como o build.py faz.
//
// Porte linha a linha de (build.py):
//   make_md() ............ linhas ~127–185 (blocos, títulos, listas, citações, [[links]], ênfase, divisor, atalhos)
//   smallcaps()/ipa_ok() . linhas ~40–59  (versalete Unicode → <span class="hc">, transcrições /…/ → <span class="ipa">)
//   shell() .............. linha  ~358     (o versalete é aplicado a todo texto entre tags do <main>)
//   url_embed()/embed_html() linhas ~522–575 ({{embed:…}}: arquivo de content/embeds/, link de rede social, alternância A | B)
//
// NÃO é CommonMark nem o Markdown padrão do Astro: é o conversor feito à mão do gerador, com as regras dele
// (blocos separados por linha em branco, HTML cru passando sem escape, quebra simples virando espaço…).
// Por que portar em vez de usar remark/rehype: docs/ARQUITETURA.md (D4, atualização da T09) e a lição
// docs/aprendendo-astro/05-markdown.md. A prova de que é igual ao Python, caractere por caractere, para todo o
// content/ e centenas de casos inventados: tests/markdown.test.ts (referência: tools/markdown_ref.py).
//
// Diferenças entre as expressões regulares do Python e do JavaScript, e como foram resolvidas aqui:
//  - \s do Python ≠ \s do JavaScript → classe ESPACOS_PY (a mesma do parser do front matter, conferida de 0 a 0x10FFFF).
//  - \w e \d do Python são Unicode (letras e algarismos de qualquer escrita); os do JavaScript são só ASCII →
//    [\p{L}\p{N}_] e \p{Nd}, com a flag "u". Conferido de 0 a 0x10FFFF contra o Python 3.13: iguais em tudo o que o
//    Unicode 15.1 do Python conhece (só divergem letras/algarismos criados no Unicode 16, que o Python 3.13 nem conhece).
//  - \b do Python também é Unicode → trocado por (?<!…)/(?!…) com a mesma classe de letras.
//  - "." do Python só não pega \n; o do JavaScript também recusa \r, \u2028 e \u2029 → [^\n].
//  - re.fullmatch → ^(?:…)$ (sem a flag "m", o $ do JavaScript é só o fim do texto).
//  - str.strip() → pyStrip() (o Python e o JavaScript discordam sobre o que é espaço).
//  - Com a flag "u", letras fora do BMP (𝓶, 😀) contam como UM caractere, como no Python.
import { assetUrl } from "./assets";
import { ESPACOS_PY, pyStrip } from "./frontmatter";

// ───────────── classes de caracteres do Python ─────────────

/** Corpo de classe equivalente ao \w do Python (Unicode): letras, números e "_". */
const W = "\\p{L}\\p{N}_";
/** Corpo de classe equivalente ao \s do Python. */
const S = ESPACOS_PY;
/** Corpo de classe equivalente ao \d do Python (algarismos decimais de qualquer escrita). */
const D = "\\p{Nd}";

/** As três classes acima, para o teste conferir caractere por caractere contra o Python (tests/markdown.test.ts). */
export const CLASSES_DO_PYTHON = { w: W, s: S, d: D } as const;

// ───────────── tipos ─────────────

/** O INDEX do build.py para UM idioma: "seção/pasta" → [título, endereço]. Usado pelos [[links]]. */
export type IndiceDoIdioma = ReadonlyMap<string, readonly [titulo: string, url: string]>;

/** Tudo o que o make_md(lang, divider) do Python consulta, passado por parâmetro (o Python usava variáveis globais). */
export interface ContextoMarkdown {
  /** INDEX do idioma da página (os [[links]] só apontam para itens publicados naquele idioma). */
  indice: IndiceDoIdioma;
  /**
   * SHORT do idioma: nome do atalho ({{stories}}, {{emissaries}}, {{other-stories}}) → HTML.
   * Nome que não está aqui vira "" (como `SHORT.get(lang, {}).get(nome, "")`).
   */
  atalhos: Readonly<Record<string, string>>;
  /** `divider` do work.json (só capítulos). Sem divisor, `---` vira <hr class="scene-divider">. */
  divisor?: string | undefined;
  /**
   * Conteúdo de content/embeds/<nome>.html, como o Python o lê (`read_text("utf-8-sig")`), ou undefined se o
   * arquivo não existe. (O `.strip()` é feito aqui dentro, em embedHtml.) Ver lerEmbedDoDisco() em src/lib/corpos.ts.
   */
  lerEmbed: (nome: string) => string | undefined;
}

// ───────────── utilidades ─────────────

/** esc() do build.py = html.escape(s, quote=True). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/** asset() do build.py, sem BASE (o site fica na raiz do domínio): ver src/lib/assets.ts. */
const asset = assetUrl;

/** str.strip("\n"): tira só quebras de linha das pontas. */
function semQuebrasNasPontas(s: string): string {
  return s.replace(/^\n+|\n+$/g, "");
}

// ───────────── make_md(): blocos ─────────────

/** re.split(r"\n\s*\n", …): os blocos são separados por uma linha em branco (que pode ter espaços). */
const RE_SEPARA_BLOCOS = new RegExp(`\\n[${S}]*\\n`, "u");
/** re.fullmatch(r"\{\{embed:(.+?)\}\}", st, re.S): {{embed:…}} com qualquer coisa dentro (links, "A | B"). */
const RE_EMBED_QUALQUER = /^\{\{embed:([\s\S]+?)\}\}$/u;
/** re.fullmatch(r"[\w-]+", …): só letras, números, "_" e "-" (um nome de arquivo de content/embeds/ ou de atalho). */
const RE_NOME = new RegExp(`^[${W}-]+$`, "u");
/** re.fullmatch(r"\{\{(embed:)?([\w-]+)\}\}", st): {{atalho}} ou {{embed:nome}}. */
const RE_ATALHO = new RegExp(`^\\{\\{(embed:)?([${W}-]+)\\}\\}$`, "u");
/** re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", st): o divisor de cena. */
const RE_DIVISOR = /^(?:-{3,}|\*{3,}|_{3,})$/u;
/** re.fullmatch(r"(#{1,4})\s+(.*)", st): título (# vira <h2>, como ##). */
const RE_TITULO = new RegExp(`^(#{1,4})[${S}]+([^\\n]*)$`, "u");
/** re.fullmatch(r"!\[[^\]]*\]\([^)]+\)", st): bloco que é só uma imagem → <figure>. */
const RE_FIGURA = /^!\[[^\]]*\]\([^)]+\)$/u;
/** re.match(r"<(div|…|script)\b", st): bloco de HTML cru (passa sem mexer, só o @/). */
const RE_HTML_CRU = new RegExp(
  `^<(?:div|figure|iframe|section|table|details|ul|ol|blockquote|hr|img|video|audio|script)(?![${W}])`,
  "u",
);
/** re.sub(r'\b(src|href)="@/([^"]*)"', …): "@/pasta/x.png" = arquivo de static/ com o endereço certo. */
const RE_ARROBA = new RegExp(`(?<![${W}])(src|href)="@/([^"]*)"`, "gu");
/** re.match(r"\s*[-*]\s+", l) e re.sub(r'^\s*[-*]\s+', '', l): item de lista. */
const RE_ITEM = new RegExp(`^[${S}]*[-*][${S}]+`, "u");

/**
 * make_md(lang, divider)(texto) do build.py: o Markdown do site → HTML.
 *
 * O resultado NÃO tem o versalete aplicado: no site, o versalete é aplicado depois, de uma vez, a todo o <main>
 * da página (versaleteEntreTags), como o shell() do build.py faz.
 */
export function markdownParaHtml(texto: string, ctx: ContextoMarkdown): string {
  const out: string[] = [];
  for (const blk of pyStrip(texto).split(RE_SEPARA_BLOCOS)) {
    const s = semQuebrasNasPontas(blk);
    if (!pyStrip(s)) continue;
    const st = pyStrip(s);
    const linhas = st.split("\n");
    let m: RegExpExecArray | null;
    if ((m = RE_EMBED_QUALQUER.exec(st)) && !RE_NOME.test(pyStrip(m[1] ?? ""))) {
      // {{embed:link}}, {{embed:A | B}}…
      out.push(embedHtml(m[1] ?? "", ctx.lerEmbed));
    } else if ((m = RE_ATALHO.exec(st))) {
      const nome = m[2] ?? "";
      if (m[1]) {
        // {{embed:nome}} → content/embeds/nome.html
        out.push(embedHtml(nome, ctx.lerEmbed));
      } else {
        // {{stories}}, {{emissaries}}, {{other-stories}}; desconhecido → ""
        out.push(Object.hasOwn(ctx.atalhos, nome) ? (ctx.atalhos[nome] ?? "") : "");
      }
    } else if (RE_DIVISOR.test(st)) {
      out.push(ctx.divisor ? `<img class="scene-divider" src="${asset(ctx.divisor)}" alt="">` : '<hr class="scene-divider">');
    } else if ((m = RE_TITULO.exec(st))) {
      const n = Math.max(2, (m[1] ?? "").length);
      out.push(`<h${n}>${inline(m[2] ?? "", ctx.indice)}</h${n}>`);
    } else if (RE_FIGURA.test(st)) {
      out.push(`<figure>${inline(st, ctx.indice)}</figure>`);
    } else if (RE_HTML_CRU.test(st)) {
      out.push(st.replace(RE_ARROBA, (_t, atributo: string, caminho: string) => `${atributo}="${asset(caminho)}"`));
    } else if (linhas.every((l) => RE_ITEM.test(l))) {
      out.push("<ul>" + linhas.map((l) => `<li>${inline(l.replace(RE_ITEM, ""), ctx.indice)}</li>`).join("") + "</ul>");
    } else if (linhas.every((l) => l.startsWith(">"))) {
      // l.lstrip("> "): tira todos os ">" e espaços do começo
      out.push("<blockquote>" + inline(soft(linhas.map((l) => l.replace(/^[> ]+/, "")).join("\n")), ctx.indice) + "</blockquote>");
    } else {
      out.push(`<p>${inline(soft(st), ctx.indice)}</p>`);
    }
  }
  return out.join("\n");
}

/** soft(): quebra de linha simples vira espaço; "  " (dois espaços) ou "\" no fim da linha vira <br>. */
function soft(s: string): string {
  const linhas = s.split("\n");
  let out = "";
  linhas.forEach((l, i) => {
    const br = l.endsWith("  ") || l.endsWith("\\");
    // l.rstrip(" \\"): tira espaços e barras invertidas do fim
    out += l.replace(/[ \\]+$/, "") + (br && i < linhas.length - 1 ? "<br>\n" : " ");
  });
  return pyStrip(out);
}

// ───────────── make_md(): dentro do parágrafo (inline) ─────────────

const RE_WIKI = /\[\[([^\]]+)\]\]/gu;
const RE_IMAGEM = /!\[([^\]]*)\]\(([^)]+)\)/gu;
const RE_LINK = /\[([^\]]+)\]\(([^)]+)\)/gu;
const RE_NEGRITO = /\*\*([^\n]+?)\*\*/gu;
/** r"(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])": *itálico* que não está colado em letra nem em outro *. */
const RE_ITALICO = new RegExp(`(?<![${W}*])\\*(?![${S}*])([^\\n]+?)(?<![${S}*])\\*(?![${W}*])`, "gu");

/** inline(): [[links]], imagens, links, **negrito** e *itálico*, nesta ordem (a ordem importa). */
function inline(t: string, indice: IndiceDoIdioma): string {
  t = t.replace(RE_WIKI, (_t, dentro: string) => wiki(dentro, indice));
  t = t.replace(RE_IMAGEM, (_t, alt: string, src: string) => `<img src="${asset(src)}" alt="${esc(alt)}" loading="lazy">`);
  // link que começa com "/" é um endereço do site (u(): sem codificar); o resto passa por asset()
  t = t.replace(RE_LINK, (_t, texto: string, href: string) => `<a href="${href.startsWith("/") ? href : asset(href)}">${texto}</a>`);
  t = t.replace(RE_NEGRITO, (_t, x: string) => `<strong>${x}</strong>`);
  t = t.replace(RE_ITALICO, (_t, x: string) => `<em>${x}</em>`);
  return t;
}

/**
 * wiki(): [[seção/pasta]] ou [[seção/pasta|rótulo]] → link para o item, se ele está publicado no idioma
 * (está no INDEX); senão, só o rótulo (ou o nome da pasta). O título vem do INDEX sem escape, como no Python.
 */
function wiki(dentro: string, indice: IndiceDoIdioma): string {
  const barra = dentro.indexOf("|");
  const chave = barra < 0 ? dentro : dentro.slice(0, barra);
  const rotulo = barra < 0 ? "" : dentro.slice(barra + 1);
  const achado = indice.get(pyStrip(chave));
  if (!achado) return rotulo || (chave.split("/").at(-1) ?? "");
  return `<a href="${achado[1]}">${rotulo || achado[0]}</a>`;
}

// ───────────── versalete e IPA (smallcaps() e shell()) ─────────────

/** As letras de versalete Unicode e a minúscula de cada uma (não existe "x" em versalete Unicode: ʏ = y, ᴢ = z). */
const LETRAS_VERSALETE = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ";
const MINUSCULA = new Map(Array.from(LETRAS_VERSALETE, (c, i) => [c, "abcdefghijklmnopqrstuvwyz"[i] ?? c] as const));
/** SC_RUN: uma ou mais palavras em versalete, cada uma podendo começar com uma maiúscula comum (Hᴀᴛᴇ Cʏᴄʟᴇ, Sᴇɴʜᴏʀ). */
const RE_VERSALETE = new RegExp(`[A-Za-zÀ-ÿ]?[${LETRAS_VERSALETE}]+(?:[${S}][A-Za-zÀ-ÿ]?[${LETRAS_VERSALETE}]+)*`, "gu");
/** IPA_CH: símbolos fonéticos (IPA, cliques ǃ ǁ, sobrescritos ⁿ ᵏ, diacríticos combinantes). */
const RE_LETRA_IPA = /[\u01c0-\u01c3\u0250-\u02ff\u0300-\u036f\u1d00-\u1dbf\u2070-\u209f]/u;
/** IPA_RUN: trecho entre barras, de 2 a 40 caracteres, sem espaço, sem barra e sem < >. */
const RE_TRECHO_IPA = new RegExp(`/[^/${S}<>]{2,40}/`, "gu");

/** ipa_ok(): só é transcrição se tiver algum símbolo fonético que não seja letra de versalete (ʏ, ʀ, ɪ…). */
function ipaOk(trecho: string): boolean {
  return Array.from(trecho).some((c) => RE_LETRA_IPA.test(c) && !MINUSCULA.has(c));
}

/** _smallcaps(): Hᴀᴛᴇ Cʏᴄʟᴇ → <span class="hc">Hate Cycle</span> (versalete de verdade no CSS). */
function versaleteSemIpa(texto: string): string {
  return texto.replace(RE_VERSALETE, (m) => '<span class="hc">' + Array.from(m, (c) => MINUSCULA.get(c) ?? c).join("") + "</span>");
}

/**
 * smallcaps() do build.py, para um pedaço de TEXTO (sem tags): versalete Unicode → <span class="hc">…</span>,
 * fora das transcrições fonéticas; cada transcrição /…/ → <span class="ipa">/…/</span> (letras intactas).
 */
export function versalete(texto: string): string {
  let out = "";
  let pos = 0;
  for (const m of texto.matchAll(RE_TRECHO_IPA)) {
    if (ipaOk(m[0])) {
      out += versaleteSemIpa(texto.slice(pos, m.index)) + '<span class="ipa">' + m[0] + "</span>";
      pos = m.index + m[0].length;
    }
  }
  return out + versaleteSemIpa(texto.slice(pos));
}

/**
 * O que o shell() do build.py faz com o <main> INTEIRO de cada página: aplica versalete() a todo texto que está
 * entre um ">" e um "<" (re.sub(r">([^<>]+)<", …)). Atributos e o que está dentro das tags não mudam.
 *
 * Use UMA vez, no HTML completo do <main> (com os atalhos já trocados): aplicar duas vezes NÃO dá o mesmo
 * resultado (as transcrições /…/ ganhariam um segundo <span class="ipa">).
 */
export function versaleteEntreTags(html: string): string {
  return html.replace(/>([^<>]+)</gu, (_t, texto: string) => ">" + versalete(texto) + "<");
}

// ───────────── embeds: {{embed:nome}} | {{embed:link}} | {{embed:A | B | C}} ─────────────

/** EMBED_KINDS: pedaço do HTML → tipo e rótulo do botão. A ordem importa (vale o primeiro que aparece). */
const TIPOS_DE_EMBED = [
  ["twitter-tweet", "x", "X"],
  ["instagram-media", "instagram", "Instagram"],
  ["tiktok.com/player", "tiktok", "TikTok"],
  ["tiktok-embed", "tiktok", "TikTok"],
  ["youtube.com/embed", "youtube", "YouTube"],
  ["reddit-embed", "reddit", "Reddit"],
] as const;
/** EMBED_ICONS: ícone (em static/) do botão de cada tipo. */
const ICONES_DE_EMBED: Readonly<Record<string, string>> = {
  x: "social/twitter.png",
  instagram: "social/instagram.png",
  tiktok: "social/tiktok.png",
  youtube: "social/youtube.png",
};

const RE_URL = /^https?:\/\//u;
const RE_X = new RegExp(`^https?://(?:www\\.)?(?:x|twitter)\\.com/([${W}]+)/status/([${D}]+)`, "u");
const RE_INSTAGRAM = new RegExp(`^https?://(?:www\\.)?instagram\\.com/(?:[${W}.]+/)?(p|reel|tv)/([${W}-]+)`, "u");
const RE_TIKTOK = new RegExp(`^https?://(?:www\\.)?tiktok\\.com/(@[${W}.]+)/video/([${D}]+)`, "u");
const RE_YOUTUBE = new RegExp(
  `^https?://(?:www\\.)?(?:youtube\\.com/(?:watch\\?(?:[^#]*&)?v=|shorts/|embed/)|youtu\\.be/)([${W}-]{11})`,
  "u",
);
const RE_REDDIT = new RegExp(`^https?://(?:www\\.)?reddit\\.com/(r/[${W}]+/comments/[${W}]+/[${W}]+)`, "u");
/** re.split(r"\s*\|\s*", spec): as opções de {{embed:A | B}}. */
const RE_BARRA = new RegExp(`[${S}]*\\|[${S}]*`, "u");

/** url_embed(): o código de incorporação a partir de um link (X/Twitter, Instagram, TikTok, YouTube, Reddit); "" se não reconhece. */
export function urlEmbed(url: string): string {
  url = pyStrip(url).replaceAll("&amp;", "&");
  let m: RegExpExecArray | null;
  if ((m = RE_X.exec(url))) {
    return (
      `<blockquote class="twitter-tweet"><a href="https://x.com/${m[1]}/status/${m[2]}"></a></blockquote>` +
      '<script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>'
    );
  }
  if ((m = RE_INSTAGRAM.exec(url))) {
    const link = `https://www.instagram.com/${m[1]}/${m[2]}/`;
    return (
      `<blockquote class="instagram-media" data-instgrm-permalink="${link}" data-instgrm-version="14" style="background:#FFF; border:0; border-radius:3px; ` +
      'box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin:1px; max-width:540px; min-width:326px; padding:0; width:calc(100% - 2px);"></blockquote>' +
      '<script async src="//www.instagram.com/embed.js"></script>'
    );
  }
  if ((m = RE_TIKTOK.exec(url))) {
    // player oficial em iframe (o embed.js do TikTok costuma devolver "overload-protect triggered")
    return (
      `<div class="short-embed tiktok-embed-frame"><iframe src="https://www.tiktok.com/player/v1/${m[2]}?music_info=1&description=1" title="TikTok" ` +
      'allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
    );
  }
  if ((m = RE_YOUTUBE.exec(url))) {
    const ifr =
      `<iframe src="https://www.youtube.com/embed/${m[1]}" title="YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; ` +
      'gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    return url.includes("/shorts/") ? `<div class="short-embed">${ifr}</div>` : `<div class="video-wrapper">${ifr}</div>`;
  }
  if ((m = RE_REDDIT.exec(url))) {
    const caminho = m[1] ?? "";
    return (
      `<blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="566"><a href="https://www.reddit.com/${caminho}/">${(caminho.split("/").at(-1) ?? "").replaceAll("_", " ")}</a></blockquote>` +
      '<script async src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>'
    );
  }
  return "";
}

/**
 * embed_html(): {{embed:…}} → HTML. `spec` é o que vem depois de "embed:": um nome de content/embeds/, um link,
 * ou vários separados por "|" (vira um bloco com botões para alternar). Opções que não dão em nada são puladas.
 */
export function embedHtml(spec: string, lerEmbed: (nome: string) => string | undefined): string {
  const partes: string[] = [];
  const links: string[] = [];
  for (const p of spec.split(RE_BARRA).map(pyStrip)) {
    const ehLink = RE_URL.test(p);
    const h = ehLink ? urlEmbed(p) : pyStrip(lerEmbed(p) ?? "");
    if (h) {
      partes.push(h);
      links.push(ehLink ? p.replaceAll("&", "&amp;") : "");
    }
  }
  /** opn(): o link "↗ X" embaixo do post (só para quem veio de um link). */
  const abrir = (h: string, link: string): string => {
    if (!link) return "";
    const rotulo = TIPOS_DE_EMBED.find(([trecho]) => h.includes(trecho))?.[2] ?? "";
    return `<p class="embed-open"><a href="${link}" target="_blank" rel="noopener">&#8599; ${rotulo || "Link"}</a></p>`;
  };
  const partesHtml = partes.map((h, i) => `<div class="embed">${h}</div>${abrir(h, links[i] ?? "")}`);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partesHtml[0] ?? "";
  let paineis = "";
  let botoes = "";
  partes.forEach((h, i) => {
    const tipo = TIPOS_DE_EMBED.find(([trecho]) => h.includes(trecho));
    const [nome, rotulo] = tipo ? [tipo[1], tipo[2]] : ["web", "Post"];
    const icone = Object.hasOwn(ICONES_DE_EMBED, nome) ? `<img src="${asset(ICONES_DE_EMBED[nome] ?? "")}" alt="">` : "";
    paineis += `<div class="embed-panel${i === 0 ? " is-on" : ""}">${partesHtml[i] ?? ""}</div>`;
    botoes +=
      `<button type="button" class="embed-btn${i === 0 ? " is-on" : ""}" aria-pressed="${i === 0 ? "true" : "false"}" title="${rotulo}" aria-label="${rotulo}">` +
      `${icone}<span>${rotulo}</span></button>`;
  });
  return `<div class="embed-alt"><div class="embed-panels">${paineis}</div><div class="embed-switch">${botoes}</div></div>`;
}
