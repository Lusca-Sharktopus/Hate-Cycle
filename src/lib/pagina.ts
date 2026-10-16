// O acabamento do <main> de TODA página: o que o shell() do build.py faz com o texto do miolo antes de escrevê-lo.
//
// Função pura (texto entra, texto sai). Quem a chama é o BaseLayout, que captura o miolo da página como texto
// (Astro.slots.render) e passa por aqui UMA vez. Ordem, igual à do build.py:
//   1. aplicarAtalhos  — os marcadores {{stories}} / {{emissaries}} / {{other-stories}} viram o HTML dos componentes
//                        (o SHORT do build.py; atalho sem HTML dado vira "", como lá);
//   2. versaleteEntreTags — "Hᴀᴛᴇ Cʏᴄʟᴇ" vira <span class="hc">Hate Cycle</span> em TODO texto do <main>
//                        (títulos, cards, paginação, o HTML dos atalhos… tudo). UMA vez só: duas dão resultado diferente
//                        (as transcrições /…/ ganhariam um segundo <span class="ipa">) — ver 05-markdown.md;
//   0. (antes de tudo) os <script type="module"> que o Astro deixa DENTRO do miolo — um por componente que tem <script>, no
//                        lugar do primeiro uso — são tirados do texto e devolvidos à parte; o layout os põe no fim da
//                        página, fora do <main>, que é onde o site atual tem o site.js. Sem isso o <main> não ficaria igual
//                        ao do build.py (e o versalete olharia o código dos scripts);
//   3. data-prev / data-next — o rótulo das setas ("Anterior"/"Próximo") é acrescentado a class="works" (o carrossel da
//                        home lê esses atributos). É um replace de texto, como no shell(): `main.replace('class="works"', …)`.
// De onde vem: shell() do build.py, linhas ~357–358.
//
// O TEXTO DO AUTOR (revisão da T12). O HTML que vem de content/ (o `rendered.html`) entra nas páginas marcado por
// textoDoAutor(): <!--hc:autor-->…<!--/hc:autor-->. Dentro dessa marca nada é mexido além do que o Python mexe:
//   - um <script type="module"> escrito pelo autor fica no lugar (o passo 0 só tira os scripts dos componentes);
//   - os atributos ficam como o autor escreveu, mesmo com "<" ou ">" (o versalete do Python entra neles; aqui também).
// Fora da marca, nos atributos que os COMPONENTES escrevem (alt, title, aria-label…), "<" e ">" ficam protegidos durante
// o versalete: o Astro escreve esses caracteres crus nos atributos (o build.py escreve &lt; e &gt;, então a expressão
// regular dele nunca entra num atributo). Sem a proteção, um título "A -> Hᴀᴛᴇ <- B" num alt viraria HTML quebrado.
// As marcas somem antes do versalete: o <main> final não as tem.
import { t, type Lang } from "./config";
import { aplicarAtalhos, type NomeDeAtalho } from "./corpos";
import { esc, versaleteEntreTags } from "./markdown";

/** Os scripts de componente do Astro: sempre `type="module"` (inline ou com src). Só são procurados FORA do texto do autor. */
const RE_SCRIPT_DE_COMPONENTE = /<script type="module"[^>]*>[\s\S]*?<\/script>/g;

const INICIO_DO_AUTOR = "<!--hc:autor-->";
const FIM_DO_AUTOR = "<!--/hc:autor-->";
const RE_TEXTO_DO_AUTOR = /<!--hc:autor-->([\s\S]*?)<!--\/hc:autor-->/g;

/** Marca um HTML como texto do autor (o `rendered.html` de content/): use em todo set:html de conteúdo. */
export function textoDoAutor(html: string): string {
  return INICIO_DO_AUTOR + html + FIM_DO_AUTOR;
}

/** O HTML em pedaços: os do autor (sem as marcas) e os dos componentes, na ordem. */
function emPedacos(html: string): { doAutor: boolean; html: string }[] {
  const pedacos: { doAutor: boolean; html: string }[] = [];
  let pos = 0;
  for (const m of html.matchAll(RE_TEXTO_DO_AUTOR)) {
    pedacos.push({ doAutor: false, html: html.slice(pos, m.index) }, { doAutor: true, html: m[1] ?? "" });
    pos = m.index + m[0].length;
  }
  pedacos.push({ doAutor: false, html: html.slice(pos) });
  return pedacos;
}

/** Elementos cujo conteúdo é texto cru (não há tags nem atributos dentro): copiados como estão. */
const TEXTO_CRU = new Set(["script", "style", "textarea"]);
const RE_INICIO_DE_TAG = /<([A-Za-z][^\t\n\f\r />]*)/y;

/**
 * Troca "<" e ">" DENTRO de valores de atributo entre aspas pelos caracteres `menor`/`maior` (para o versalete não entrar
 * neles). Fora das tags, nos comentários e no conteúdo de <script>/<style>/<textarea>, nada muda.
 */
export function protegerAtributos(html: string, menor: string, maior: string): string {
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html.startsWith("<!--", i)) {
      const fim = html.indexOf("-->", i + 4);
      const ate = fim < 0 ? n : fim + 3;
      out += html.slice(i, ate);
      i = ate;
      continue;
    }
    RE_INICIO_DE_TAG.lastIndex = i;
    const tag = RE_INICIO_DE_TAG.exec(html);
    if (!tag) {
      out += html[i];
      i++;
      continue;
    }
    // dentro da tag, até o ">" que a fecha (um ">" dentro de aspas não fecha)
    out += tag[0];
    let j = i + tag[0].length;
    while (j < n && html[j] !== ">") {
      const c = html[j] as string;
      out += c;
      j++;
      if (c !== "=") continue;
      while (j < n && /[\t\n\f\r ]/.test(html[j] as string)) out += html[j++];
      const aspa = html[j];
      if (aspa !== '"' && aspa !== "'") continue;
      const fecha = html.indexOf(aspa, j + 1);
      const fim = fecha < 0 ? n : fecha;
      out += aspa + html.slice(j + 1, fim).replaceAll("<", menor).replaceAll(">", maior) + (fecha < 0 ? "" : aspa);
      j = fecha < 0 ? n : fecha + 1;
    }
    if (j < n) out += html[j++];
    i = j;
    const nome = (tag[1] ?? "").toLowerCase();
    if (TEXTO_CRU.has(nome)) {
      const fecha = html.toLowerCase().indexOf(`</${nome}`, i);
      const ate = fecha < 0 ? n : fecha;
      out += html.slice(i, ate);
      i = ate;
    }
  }
  return out;
}

/** Dois caracteres de uso privado do Unicode que não aparecem no texto (servem de "<" e ">" provisórios). */
function marcasLivres(html: string): [string, string] {
  const livres: string[] = [];
  for (let cp = 0xe000; livres.length < 2; cp++) {
    const c = String.fromCodePoint(cp);
    if (!html.includes(c)) livres.push(c);
  }
  return [livres[0] as string, livres[1] as string];
}

/**
 * O versalete do <main> (versaleteEntreTags, a regex do shell()), com o texto do autor exatamente como no Python e os
 * atributos dos componentes protegidos. As marcas do texto do autor saem aqui.
 */
export function versaleteNoMain(html: string): string {
  const [menor, maior] = marcasLivres(html);
  const protegido = emPedacos(html)
    .map((p) => (p.doAutor ? p.html : protegerAtributos(p.html, menor, maior)))
    .join("");
  return versaleteEntreTags(protegido).replaceAll(menor, "<").replaceAll(maior, ">");
}

export interface MainPronto {
  /** O miolo da página, pronto para ir dentro do <main>. */
  html: string;
  /** Os <script type="module"> dos componentes, para o fim da página (fora do <main>). */
  scripts: string;
}

/**
 * Tira do texto os <script type="module"> de componente e devolve o texto limpo e os scripts (na ordem em que apareciam).
 * O texto do autor (marcado por textoDoAutor) fica intacto, com as marcas: quem as tira é finalizarMain().
 */
export function separarScripts(html: string): { html: string; scripts: string[] } {
  const scripts: string[] = [];
  const limpo = emPedacos(html)
    .map((p) => (p.doAutor ? textoDoAutor(p.html) : p.html.replace(RE_SCRIPT_DE_COMPONENTE, (script) => (scripts.push(script), ""))))
    .join("");
  return { html: limpo, scripts };
}

export function finalizarMain(html: string, lang: Lang, atalhos: Readonly<Partial<Record<NomeDeAtalho, string>>> = {}): MainPronto {
  const scripts: string[] = [];
  const semScripts = (texto: string) => {
    const r = separarScripts(texto);
    scripts.push(...r.scripts);
    return r.html;
  };
  // o HTML de um atalho também pode trazer scripts de componente (SecaoHistorias traz o do seletor): saem antes de entrar no texto
  const atalhosLimpos: Partial<Record<NomeDeAtalho, string>> = {};
  for (const [nome, conteudo] of Object.entries(atalhos) as [NomeDeAtalho, string][]) atalhosLimpos[nome] = semScripts(conteudo);
  const comVersalete = versaleteNoMain(aplicarAtalhos(semScripts(html), atalhosLimpos));
  return {
    html: comVersalete.replaceAll('class="works"', `class="works" data-prev="${esc(t(lang, "prev"))}" data-next="${esc(t(lang, "next"))}"`),
    scripts: scripts.join("\n"),
  };
}
