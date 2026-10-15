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
 * (O \d do Python também aceita algarismos de outras escritas; nomes de pasta aqui são sempre ASCII.)
 */
export function compararNatural(a: string, b: string): number {
  const partes = (s: string) => s.split(/(\d+)/).map((t, i) => (i % 2 === 1 ? Number(t) : t.toLowerCase()));
  const x = partes(a);
  const y = partes(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] ?? "";
    const q = y[i] ?? "";
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    return compararComoPython(String(p), String(q));
  }
  return x.length - y.length;
}
