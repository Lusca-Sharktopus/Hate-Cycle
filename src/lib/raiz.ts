// A página RAIZ do site (`/`) e as páginas de REDIRECIONAMENTO do site antigo (`/PT.html`, `/firestriker.html`…): HTML escrito
// por funções puras, IDÊNTICO byte a byte ao do build.py (tests/raiz.test.ts compara com o que o Python gerou).
//
// Por que não o `redirects` do Astro? Porque ele escreve outro HTML (`<title>Redirecting to: …</title>`, `<meta name="robots"
// content="noindex">`, mais um link canônico) e, o que importa mais, a ideia aqui é "o mesmo site de ontem": as páginas antigas
// continuam byte a byte como eram. Também não mexe em nada se o autor trocar um destino no config.json: o endpoint lê de lá.
// De onde vem no build.py: o final do build() (linhas ~936–949): "raiz: escolhe o idioma; 404; redirecionamentos das URLs antigas".
import { esc } from "./markdown";

export interface IdiomaDaRaiz {
  /** Chave do idioma: "en", "pt". */
  chave: string;
  /** Nome como o visitante lê: "English", "Português". */
  nome: string;
}

/** json.dumps(lista de textos) do Python: aspas duplas e ", " entre os itens. */
const listaComoPython = (itens: readonly string[]) => `[${itens.map((i) => JSON.stringify(i)).join(", ")}]`;

/**
 * A raiz: abre num idioma sozinha. Três camadas, da mais rápida para a mais simples:
 *  1. `<script>`: lê o idioma que o visitante guardou (`localStorage.lang`) ou o do navegador, e vai para /<idioma>/;
 *  2. `<meta refresh>`: sem JavaScript, vai para o primeiro idioma (o inglês);
 *  3. os links dos idiomas no corpo, para quem não foi levado a lugar nenhum.
 */
export function paginaDaRaiz(nomeDoSite: string, idiomas: readonly IdiomaDaRaiz[]): string {
  const primeiro = idiomas[0]?.chave ?? "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(nomeDoSite)}</title>
<meta http-equiv="refresh" content="0; url=/${primeiro}/">
<script>var l=(localStorage.getItem('lang')||navigator.language||'').slice(0,2);var ok=${listaComoPython(idiomas.map((i) => i.chave))};
location.replace('/'+(ok.indexOf(l)>-1?l:'${primeiro}')+'/');</script></head>
<body><p>${idiomas.map((i) => `<a href="/${i.chave}/">${esc(i.nome)}</a>`).join(" · ")}</p></body></html>`;
}

/** Uma página antiga que só manda o visitante (e o buscador) para o endereço novo. */
export function paginaDeRedirecionamento(destino: string): string {
  return `<!DOCTYPE html><meta charset="UTF-8"><link rel="canonical" href="${destino}"><meta http-equiv="refresh" content="0; url=${destino}"><a href="${destino}">${destino}</a>`;
}

/**
 * Os redirecionamentos que viram página: config.json → redirects, menos `index.html` (o site antigo tinha `index.html → /`, e a raiz
 * já existe) e qualquer um cujo destino seja `/`. Devolve [nome do arquivo, destino], na ordem do config.json.
 */
export function redirecionamentosQueViramPagina(redirects: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(redirects).filter(([antigo, novo]) => novo !== "/" && antigo !== "index.html");
}
