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
import { t, type Lang } from "./config";
import { aplicarAtalhos, type NomeDeAtalho } from "./corpos";
import { esc, versaleteEntreTags } from "./markdown";

/** Os scripts de componente do Astro: sempre `type="module"` (inline ou com src). Os scripts do autor (embeds) não são module. */
const RE_SCRIPT_DE_COMPONENTE = /<script type="module"[^>]*>[\s\S]*?<\/script>/g;

export interface MainPronto {
  /** O miolo da página, pronto para ir dentro do <main>. */
  html: string;
  /** Os <script type="module"> dos componentes, para o fim da página (fora do <main>). */
  scripts: string;
}

/** Tira do texto os <script type="module"> de componente e devolve o texto limpo e os scripts (na ordem em que apareciam). */
export function separarScripts(html: string): { html: string; scripts: string[] } {
  const scripts: string[] = [];
  return { html: html.replace(RE_SCRIPT_DE_COMPONENTE, (script) => (scripts.push(script), "")), scripts };
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
  const comVersalete = versaleteEntreTags(aplicarAtalhos(semScripts(html), atalhosLimpos));
  return {
    html: comVersalete.replaceAll('class="works"', `class="works" data-prev="${esc(t(lang, "prev"))}" data-next="${esc(t(lang, "next"))}"`),
    scripts: scripts.join("\n"),
  };
}
