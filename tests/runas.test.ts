// Prova de que src/lib/runas.ts dá EXATAMENTE as mesmas runas que o rune_imprint() do build.py.
//
// A referência (tests/fixtures/runas-python.json) foi gerada pelo próprio Python:
//   python3 tools/runas_ref.py
// São 692 sementes: as 192 páginas da baseline (a semente real de cada uma) + 500 sorteadas.
// Cada caso compara o HTML inteiro, texto contra texto: um único número diferente já reprova.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { GLIFOS, PyRandom, pyFixed, pyHypot, runasFontesHtml, runasHtml, sortearRunas } from "../src/lib/runas";

interface Caso {
  origem: "pagina" | "sorteada";
  url?: string;
  semente: string;
  html: string;
}
interface Referencia {
  python: string;
  fontes: string;
  casos: Caso[];
}

const ref: Referencia = JSON.parse(readFileSync(new URL("./fixtures/runas-python.json", import.meta.url), "utf8"));
const paginas = ref.casos.filter((c) => c.origem === "pagina");
const sorteadas = ref.casos.filter((c) => c.origem === "sorteada");

describe(`runas iguais às do Python ${ref.python} (${ref.casos.length} sementes)`, () => {
  test("a referência tem as 192 páginas e pelo menos 500 sementes sorteadas", () => {
    expect(paginas.length).toBe(192);
    expect(sorteadas.length).toBeGreaterThanOrEqual(500);
  });

  test.each(paginas.map((c) => [c.url!, c] as const))("página %s", (_url, c) => {
    expect(runasHtml(c.semente)).toBe(c.html);
  });

  test.each(sorteadas.map((c, i) => [i + 1, JSON.stringify(c.semente), c] as const))(
    "semente sorteada nº %i: %s",
    (_i, _s, c) => {
      expect(runasHtml(c.semente)).toBe(c.html);
    },
  );

  test(`resumo: ${ref.casos.length} casos comparados, todos têm de ser iguais`, () => {
    const diferentes = ref.casos.filter((c) => runasHtml(c.semente) !== c.html).map((c) => c.semente);
    expect(diferentes, `sementes com runas diferentes do Python`).toEqual([]);
  });

  test("os 20 <link> de fontes das runas são os mesmos do rune_fonts_links()", () => {
    expect(runasFontesHtml()).toBe(ref.fontes);
    expect(runasFontesHtml().match(/<link /g)).toHaveLength(20);
  });
});

describe("peças do porte", () => {
  test("o sorteador é o do Python: random.Random(42).random() e getrandbits", () => {
    // valores conferidos no Python: random.Random(42).random() == 0.6394267984578837
    expect(new PyRandom(42n).random()).toBe(0.6394267984578837);
    // random.Random(2**64 + 5): semente com 3 palavras de 32 bits; [r.getrandbits(32) for _ in range(2)]
    const r = new PyRandom(2n ** 64n + 5n);
    expect([r.getrandbits(32), r.getrandbits(32)]).toEqual([2192917427, 3085273184]);
  });

  test("números formatados como o Python (empate vai para o par; zero negativo)", () => {
    expect(pyFixed(0.125, 2)).toBe("0.12"); // toFixed daria "0.13"
    expect(pyFixed(0.375, 2)).toBe("0.38");
    expect(pyFixed(2.5, 0)).toBe("2"); // toFixed daria "3"
    expect(pyFixed(3.5, 0)).toBe("4");
    expect(pyFixed(0.25, 1)).toBe("0.2");
    expect(pyFixed(-0.0, 1)).toBe("-0.0"); // toFixed daria "0.0"
    expect(pyFixed(-0.04, 1)).toBe("-0.0");
    expect(pyFixed(1.005, 2)).toBe("1.00"); // 1.005 é guardado como 1.00499999…
    expect(pyFixed(99.95, 1)).toBe("100.0");
  });

  test("math.hypot do CPython", () => {
    expect(pyHypot(3, 4)).toBe(5);
    expect(pyHypot(0, 0)).toBe(0);
    expect(pyHypot(-0.3, 0.1)).toBe(0.31622776601683794);
  });

  test("símbolos contados por code point (𐤉 e 🜁 são um símbolo cada)", () => {
    expect(GLIFOS).toContain("𐤉");
    expect(GLIFOS).toContain("🜁");
    expect(GLIFOS.every((g) => Array.from(g).length === 1)).toBe(true);
  });

  test("mesma semente, mesmas runas; semente diferente, arranjo diferente", () => {
    expect(sortearRunas("/pt/")).toEqual(sortearRunas("/pt/"));
    expect(runasHtml("/pt/")).not.toBe(runasHtml("/en/"));
  });
});
