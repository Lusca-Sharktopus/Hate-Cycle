// As PÁGINAS de um capítulo de quadrinho (obra com "kind": "comic"): a lista `pages:` do front matter e os arquivos de
// static/ que casam com `pages_glob:` (ex.: comics/beira/01/*.png), em ordem NUMÉRICA natural (2.png antes de 10.png).
//
// De onde vem no build.py (build(), linhas ~805–808):
//   pics = list(fm.get("pages", []) or [])
//   if fm.get("pages_glob"):
//       pics += [str(p.relative_to(STATIC)) for p in sorted(STATIC.glob(fm["pages_glob"]), key=lambda p: natural(p.name))]
//
// O STATIC.glob() do Python (pathlib, Python 3.12+) foi imitado em globNaPasta(), com o que foi conferido no Python 3.13:
//   - "*" casa qualquer nome dentro de UMA pasta, inclusive arquivos que começam com "." (diferente do glob do terminal);
//   - "?" casa um caractere; "[0-9]" e "[!0-9]" casam um caractere de um conjunto (ou fora dele);
//   - "**" sozinho num pedaço casa zero ou mais pastas (comics/x/**/*.png pega as subpastas também);
//   - maiúsculas e minúsculas são diferentes (*.png não pega A.PNG), como no Linux e no GitHub Pages;
//   - pastas também casam (comics/x/* traz as subpastas); padrão terminado em "/" traz só pastas.
// A ordem final é a do Python: natural pelo NOME do arquivo (não pelo caminho). Empate — dois nomes que a ordem natural
// considera iguais, como "01.png" e "1.png", ou o mesmo nome em pastas diferentes —: no Python fica a ordem em que o
// sistema de arquivos listou (não definida, pode mudar de um computador para outro); aqui, a ordem alfabética do caminho.
// (Bug do site atual, não corrigido: não misture "01.png" com "1.png" no mesmo capítulo.)
// Prova: tests/leitor.test.ts (vários padrões, comparados com o Python num site inventado).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compararComoPython, compararNatural } from "./ordem";

/** fnmatch.translate() de um pedaço do padrão (sem "/"), como expressão regular inteira. */
function pedacoParaRegex(pedaco: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pedaco.length) {
    const c = pedaco[i++] as string;
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      let j = i;
      if (pedaco[j] === "!") j++;
      if (pedaco[j] === "]") j++;
      while (j < pedaco.length && pedaco[j] !== "]") j++;
      if (j >= pedaco.length) re += "\\[";
      else {
        // o conjunto entre [ e ]: "!" no começo nega; "]" logo no começo é um "]" de verdade; "a-z" é intervalo
        let conjunto = pedaco.slice(i, j);
        i = j + 1;
        const nega = conjunto.startsWith("!");
        if (nega) conjunto = conjunto.slice(1);
        const dentro = Array.from(conjunto, (x) => (x === "-" ? "-" : /[\\\]\[^]/.test(x) ? `\\${x}` : x)).join("");
        re += conjunto === "" ? (nega ? "." : "(?!)") : `[${nega ? "^" : ""}${dentro}]`;
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "su");
}

function ehPasta(caminho: string): boolean {
  try {
    return statSync(caminho).isDirectory();
  } catch {
    return false;
  }
}

function filhos(pasta: string): string[] {
  try {
    return readdirSync(pasta);
  } catch {
    return [];
  }
}

/** Todas as subpastas de `rel` (inclusive ela mesma), recursivamente: o que "**" casa. */
function pastasAbaixo(raiz: string, rel: string): string[] {
  const saida = [rel];
  for (const nome of filhos(join(raiz, rel)).sort(compararComoPython)) {
    const filho = rel ? `${rel}/${nome}` : nome;
    if (ehPasta(join(raiz, filho))) saida.push(...pastasAbaixo(raiz, filho));
  }
  return saida;
}

/** Path(raiz).glob(padrao) do Python: caminhos relativos a `raiz`, com "/" (sem ordem garantida; quem ordena é quem chama). */
export function globNaPasta(raiz: string, padrao: string): string[] {
  if (padrao === "") throw new Error(`pages_glob vazio`);
  if (padrao.startsWith("/")) throw new Error(`pages_glob "${padrao}": o caminho tem de ser relativo à pasta static/ (sem "/" no começo).`);
  const soPastas = padrao.endsWith("/");
  const pedacos = padrao.split("/").filter((p) => p !== "" && p !== ".");
  let atuais = [""];
  pedacos.forEach((pedaco, n) => {
    const ultimo = n === pedacos.length - 1;
    const proximos: string[] = [];
    for (const rel of atuais) {
      if (pedaco === "**") {
        // no fim, "**" traz tudo o que está abaixo (pastas e arquivos); no meio, só as pastas
        for (const pasta of pastasAbaixo(raiz, rel)) {
          proximos.push(pasta);
          if (ultimo) for (const nome of filhos(join(raiz, pasta))) if (!ehPasta(join(raiz, pasta, nome))) proximos.push(pasta ? `${pasta}/${nome}` : nome);
        }
        continue;
      }
      const casa = pedacoParaRegex(pedaco);
      for (const nome of filhos(join(raiz, rel))) {
        if (!casa.test(nome)) continue;
        const filho = rel ? `${rel}/${nome}` : nome;
        if (!ultimo && !ehPasta(join(raiz, filho))) continue;
        proximos.push(filho);
      }
    }
    atuais = [...new Set(proximos)];
  });
  return atuais.filter((rel) => rel !== "" && (!soPastas || ehPasta(join(raiz, rel))));
}

/** O nome do arquivo (o último pedaço do caminho): é por ele que o Python ordena. */
const nomeDoArquivo = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

/** sorted(STATIC.glob(padrao), key=lambda p: natural(p.name)), como caminhos relativos a static/. */
export function arquivosDoGlob(pastaStatic: string, padrao: string): string[] {
  return globNaPasta(pastaStatic, padrao)
    .sort(compararComoPython)
    .sort((a, b) => compararNatural(nomeDoArquivo(a), nomeDoArquivo(b)));
}

/** As imagens de um capítulo de quadrinho, na ordem: primeiro a lista `pages:`, depois as do `pages_glob:`. */
export function paginasDoQuadrinho(paginas: readonly string[] | undefined, padrao: string | undefined, glob: (padrao: string) => string[]): string[] {
  return [...(paginas ?? []), ...(padrao ? glob(padrao) : [])];
}
