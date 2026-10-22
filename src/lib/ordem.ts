// Comparações de texto como o Python faz (usadas para pôr pastas e capítulos na mesma ordem do build.py).
//
// Moram aqui desde a T09 (antes ficavam em src/lib/leitor.ts, que continua exportando as duas):
// assim src/lib/visibilidade.ts não depende do leitor, e o carregador (que agora também transforma o
// Markdown em HTML, via src/lib/corpos.ts → visibilidade.ts) não forma um círculo de imports.

/** Compara como o Python compara textos: ponto de código por ponto de código (o sort() do JavaScript usa UTF-16). */
export function compararComoPython(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) ?? 0);
  const y = Array.from(b, (c) => c.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return x.length - y.length;
}

/**
 * natural() do build.py: "2" vem antes de "10" (números comparados como números).
 *   def natural(s): return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(s))]
 * Como no Python (revisão da T12):
 *   - "algarismo" é o \d do Python, que vale para qualquer escrita (categoria Unicode Nd): "p１.png" (algarismo de
 *     largura cheia) e "p٣.png" (arábico) contam como 1 e 3. Os trechos de algarismos sempre passam no isdigit().
 *   - o número não tem limite de tamanho (int do Python): aqui é BigInt, não Number (que perde a precisão depois de
 *     15–16 algarismos e trataria 9007199254740992 e 9007199254740993 como iguais).
 * Limite conhecido: a tabela Unicode do Node (16.0) é um pouco mais nova que a do Python 3.13 (15.1): algarismos das
 * escritas acrescentadas no Unicode 16 contam aqui e não lá (o mesmo caso do \w em src/lib/markdown.ts).
 * Usada para as pastas de capítulos e os nomes de arquivo das páginas de quadrinho (src/lib/quadrinhos.ts).
 */
export function compararNatural(a: string, b: string): number {
  const x = partesNaturais(a);
  const y = partesNaturais(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] ?? "";
    const q = y[i] ?? "";
    if (p === q) continue;
    if (typeof p === "bigint" && typeof q === "bigint") return p < q ? -1 : 1;
    return compararComoPython(String(p), String(q));
  }
  return x.length - y.length;
}

const RE_ALGARISMOS = /(\p{Nd}+)/u;
const RE_ALGARISMO = /^\p{Nd}$/u;

/** re.split(r"(\d+)", s): textos (minúsculos) nas posições pares, números (BigInt) nas ímpares. */
function partesNaturais(s: string): (string | bigint)[] {
  return s.split(RE_ALGARISMOS).map((t, i) => (i % 2 === 1 ? numeroDosAlgarismos(t) : t.toLowerCase()));
}

/**
 * int() de uma seqüência de algarismos de qualquer escrita. O Unicode garante que os algarismos (Nd) vêm em blocos de
 * dez seguidos, de 0 a 9: o valor de um algarismo é a distância até o começo do seu bloco (contando os blocos colados).
 */
function numeroDosAlgarismos(t: string): bigint {
  let n = 0n;
  for (const c of t) {
    const cp = c.codePointAt(0) ?? 48;
    let inicio = cp;
    while (inicio > 0 && RE_ALGARISMO.test(String.fromCodePoint(inicio - 1))) inicio--;
    n = n * 10n + BigInt((cp - inicio) % 10);
  }
  return n;
}
