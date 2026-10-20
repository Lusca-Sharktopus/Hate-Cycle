// Runas do fundo ("impressão rúnica") — porte fiel de rune_imprint() e rune_fonts_links() do build.py.
//
// Cada página tem o seu arranjo de runas, sorteado com uma SEMENTE (o endereço da página, ex. "/pt/").
// Mesma semente → mesmo sorteio → mesmas runas, nas mesmas posições, sempre. Para o Astro dar
// EXATAMENTE o mesmo arranjo do site atual, este arquivo reimplementa o sorteador do próprio Python
// (Mersenne Twister, o random.Random do CPython), e não usa o Math.random() do JavaScript.
//
// É lógica pura: não mexe na página, só devolve dados e texto. Roda no build (no seu computador).
// A prova de que é igual ao Python: tests/runas.test.ts (`pnpm test`). Lição: docs/aprendendo-astro/03-runas.md
import { createHash } from "node:crypto";

// ───────────────────────── os dados (fonte única de verdade) ─────────────────────────

/** Os símbolos sorteados (RUNES do build.py). Repetições não contam: vale a 1ª vez que cada um aparece. */
export const RUNES =
  "✝✡ᛁ⚴ᚻᛗᛋᛟᚩ҂ᛃ𐤉Т모ᗐᚣ♐ᚸエꑭⰝ🜁Γᚱᛏ🜂⬡🜄🜃Λᛖ⧮⧰ᛚ𐩹ᛮ𐱃Ⰱ𐊙𑢶⚼ПŁᔨᚫΥ🝂🝘🝃FΣ𐌄Κ𐰤⌗🝧Ѧᛤ⛉𐌇ᛄ𐌙᭻⛩ᚬ⎍ᛇᛒⵅᛞꮤ𐘇𐰭𐤎꓀土◇⧖ᚷ🜲ᛡ⊥‡";

/** Símbolos que ganham o seletor de texto U+FE0E, para o navegador não desenhá-los como emoji colorido. */
export const RUNES_TEXT_PRES: ReadonlySet<string> = new Set(Array.from("✝✡♐⚴⚼⛉⛩⬡◇⌗"));

/** Famílias do Google Fonts que desenham as runas (cada uma vira um <link> próprio). */
export const RUNE_FAMILIES_MAIN = [
  "Noto+Sans", "Noto+Sans+Symbols", "Noto+Sans+Symbols+2", "Noto+Sans+Math", "Noto+Sans+Runic",
  "Noto+Sans+Cherokee", "Noto+Sans+KR", "Noto+Sans+JP",
] as const;
export const RUNE_FAMILIES_EXTRA = [
  "Noto+Sans+Yi", "Noto+Sans+Phoenician", "Noto+Sans+Glagolitic", "Noto+Sans+Tifinagh", "Noto+Sans+Balinese",
  "Noto+Sans+Canadian+Aboriginal", "Noto+Sans+Old+Turkic", "Noto+Sans+Old+Italic", "Noto+Sans+Lycian",
  "Noto+Sans+Linear+A", "Noto+Sans+Old+South+Arabian", "Noto+Sans+Warang+Citi",
] as const;

/** Os símbolos sem repetição, na ordem da 1ª aparição (o dict.fromkeys(RUNES) do Python).
 *  Array.from separa por "code point": 𐤉 e 🜁 ocupam 2 unidades no JavaScript, mas são UM símbolo. */
export const GLIFOS: readonly string[] = [...new Set(Array.from(RUNES))];

// ───────────────────────── o sorteador do Python (Mersenne Twister, MT19937) ─────────────────────────
// Traduzido de Modules/_randommodule.c do CPython (3.12/3.13) e de Lib/random.py.

const N = 624;
const M = 397;

export class PyRandom {
  private mt = new Uint32Array(N);
  private index = N + 1;

  /** Como random.Random(semente) com um inteiro >= 0: o número é picado em palavras de 32 bits,
   *  da menos para a mais significativa (random_seed → init_by_array). */
  constructor(seed: bigint) {
    let n = seed < 0n ? -seed : seed;
    const key: number[] = [];
    do {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    } while (n > 0n);
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]!;
      mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.index = N;
  }

  private initByArray(key: readonly number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1]!;
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1]!;
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1]!;
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1]!;
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** Um número inteiro de 32 bits (genrand_uint32). */
  uint32(): number {
    const mt = this.mt;
    if (this.index >= N) {
      let kk = 0;
      let y: number;
      for (; kk < N - M; kk++) {
        y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff);
        mt[kk] = mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff);
        mt[kk] = mt[kk + (M - N)]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      y = (mt[N - 1]! & 0x80000000) | (mt[0]! & 0x7fffffff);
      mt[N - 1] = mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.index = 0;
    }
    let y = mt[this.index++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** random(): número entre 0 e 1 com 53 bits, montado com dois sorteios de 32 bits (genrand_res53). */
  random(): number {
    const a = this.uint32() >>> 5;
    const b = this.uint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /** uniform(a, b) do Lib/random.py: a + (b - a) * random(). */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  /** getrandbits(k) para 0 <= k <= 32 (o atalho do C: os k bits mais altos de um sorteio). */
  getrandbits(k: number): number {
    if (k === 0) return 0;
    return this.uint32() >>> (32 - k);
  }

  /** _randbelow_with_getrandbits(n): inteiro de 0 a n-1, sorteando k bits e descartando o que passar. */
  randbelow(n: number): number {
    const k = 32 - Math.clz32(n); // n.bit_length()
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** shuffle(x) do Lib/random.py (3.11+): de trás para a frente, troca x[i] com um x[j] sorteado. */
  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i >= 1; i--) {
      const j = this.randbelow(i + 1);
      const tmp = x[i]!;
      x[i] = x[j]!;
      x[j] = tmp;
    }
  }
}

// ───────────────────────── math.hypot do CPython ─────────────────────────
// O resultado é comparado com "<" para saber se duas runas encostam. O Math.hypot do JavaScript pode
// errar no último bit em relação ao do Python e, num caso raro, mudar o arranjo. Por isso este é o
// algoritmo do CPython (vector_norm em Modules/mathmodule.c), com o produto exato de Dekker
// (a variante UNRELIABLE_FMA do próprio CPython), que dá o mesmo resultado do fma().

function dlMul(x: number, y: number): [number, number] {
  const split = (v: number): [number, number] => {
    const t = v * 134217729.0; // 2**27 + 1
    const hi = t - (t - v);
    return [hi, v - hi];
  };
  const [xh, xl] = split(x);
  const [yh, yl] = split(y);
  const p = xh * yh;
  const q = xh * yl + xl * yh;
  const z = p + q;
  const zz = p - z + q + xl * yl;
  return [z, zz];
}

function dlFastSum(a: number, b: number): [number, number] {
  const x = a + b;
  return [x, a - x + b];
}

/** Os bits de um double: expoente (11 bits) e fração (52 bits). */
function bitsDoDouble(v: number): { expBits: number; frac: bigint } {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  const bits = buf.getBigUint64(0);
  return { expBits: Number((bits >> 52n) & 0x7ffn), frac: bits & 0xfffffffffffffn };
}

/** math.hypot(x, y) do CPython 3.12/3.13, para números finitos e não subnormais (as distâncias daqui). */
export function pyHypot(x: number, y: number): number {
  const vec = [Math.abs(x), Math.abs(y)];
  const max = Math.max(vec[0]!, vec[1]!);
  if (!Number.isFinite(max)) throw new Error(`pyHypot: número inválido (${x}, ${y})`);
  if (max === 0) return max;
  // frexp(max): max = m * 2**e, com 0.5 <= m < 1, lido direto dos bits; scale = 2**-e (sem perda)
  const { expBits } = bitsDoDouble(max);
  if (expBits === 0) throw new Error("pyHypot: número subnormal não suportado");
  const scale = 2 ** -(expBits - 1022);
  let csum = 1.0;
  let frac1 = 0.0;
  let frac2 = 0.0;
  for (const v of vec) {
    const xs = v * scale; // sem perda (potência de 2)
    const [prHi, prLo] = dlMul(xs, xs);
    const [smHi, smLo] = dlFastSum(csum, prHi);
    csum = smHi;
    frac1 += prLo;
    frac2 += smLo;
  }
  let h = Math.sqrt(csum - 1.0 + (frac1 + frac2));
  const [prHi, prLo] = dlMul(-h, h);
  const [smHi, smLo] = dlFastSum(csum, prHi);
  csum = smHi;
  frac1 += prLo;
  frac2 += smLo;
  const corr = csum - 1.0 + (frac1 + frac2);
  h += corr / (2.0 * h);
  return h / scale;
}

// ───────────────────────── formatação de números como o Python ─────────────────────────
// f"{x:.1f}" no Python e x.toFixed(1) no JavaScript diferem num empate exato (ex.: 0.125 com 2 casas:
// Python dá "0.12", arredondando para o par; JavaScript dá "0.13") e no zero negativo (Python "-0.0",
// JavaScript "0.0"). Aqui o número é convertido no seu valor decimal EXATO (todo double é uma fração
// m / 2**k) e arredondado como o Python faz.

/** Como f"{x:.{casas}f}" do Python, para números finitos. */
export function pyFixed(x: number, casas: number): string {
  if (!Number.isFinite(x)) throw new Error(`pyFixed: número inválido ${x}`);
  const negativo = x < 0 || Object.is(x, -0);
  // |x| = mant * 2**exp, com mant inteiro: é o valor exato guardado no double
  const { expBits, frac } = bitsDoDouble(Math.abs(x));
  const mant = expBits === 0 ? frac : frac | (1n << 52n);
  const exp = (expBits === 0 ? 1 : expBits) - 1075;
  // valor * 10**casas = mant * 2**exp * 10**casas; arredonda para o inteiro mais próximo, empate → par
  let num = mant * 10n ** BigInt(casas);
  let den = 1n;
  if (exp >= 0) num <<= BigInt(exp);
  else den <<= BigInt(-exp);
  let q = num / den;
  const resto2 = (num % den) * 2n;
  if (resto2 > den || (resto2 === den && q % 2n === 1n)) q += 1n;
  let s = q.toString();
  if (casas > 0) {
    s = s.padStart(casas + 1, "0");
    s = s.slice(0, -casas) + "." + s.slice(-casas);
  }
  return (negativo ? "-" : "") + s;
}

// ───────────────────────── o sorteio das runas (rune_imprint) ─────────────────────────

/** Uma runa sorteada: tudo o que vira custom property no style do <i>. */
export interface Runa {
  /** O símbolo, já com o U+FE0E quando é dos RUNES_TEXT_PRES. */
  glifo: string;
  /** Posição em telas largas (% da tela). */
  lx: number;
  ly: number;
  /** Posição em telas altas, de celular em pé (% da tela). */
  px: number;
  py: number;
  /** Tamanho (o CSS faz font-size: s × 1vmin + 14px). */
  s: number;
  /** Giro em graus (−45 a 45). */
  r: number;
  /** Brilho mínimo e máximo (opacidade). */
  lo: number;
  hi: number;
  /** Duração de um ciclo de brilho, em segundos. */
  d: number;
  /** Atraso da animação, em segundos (positivo; no HTML vai com sinal de menos). */
  atraso: number;
}

const LAND = [1.33, 2.2] as const; // proporções de tela larga conferidas
const PORT = [0.45, 0.75] as const; // proporções de tela alta conferidas
const GAP = 0.025; // folga mínima entre runas (em "vmin")

type Ponto = readonly [x: number, y: number, rad: number];

/** A semente do Python: int(sha256(str(seed)).hexdigest()[:16], 16) — os 8 primeiros bytes do SHA-256. */
export function sementeNumerica(seed: string): bigint {
  return BigInt("0x" + createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 16));
}

/**
 * O sorteio de rune_imprint(seed, n): devolve as runas JÁ na ordem final (embaralhadas no fim, como no Python).
 * Nenhuma runa encosta em outra, nem em telas largas (1,33 a 2,2) nem em telas altas (0,45 a 0,75).
 */
export function sortearRunas(seed: string, n = 26): Runa[] {
  const rnd = new PyRandom(sementeNumerica(seed));
  const glyphs = [...GLIFOS];
  rnd.shuffle(glyphs);

  // % da tela → unidades de vmin (mesma ordem das contas do Python, para dar o mesmo resultado)
  const xy = (x: number, y: number, land: boolean, a: number): [number, number] =>
    land ? [(x / 100) * a, y / 100] : [x / 100, y / 100 / a];

  const ok = (x: number, y: number, rad: number, placed: readonly Ponto[], land: boolean): boolean => {
    for (const a of land ? LAND : PORT) {
      const [px, py] = xy(x, y, land, a);
      for (const [ox, oy, orad] of placed) {
        const [qx, qy] = xy(ox, oy, land, a);
        if (pyHypot(px - qx, py - qy) < rad + orad + GAP) return false;
      }
    }
    return true;
  };

  const pick = (rad: number, placed: readonly Ponto[], land: boolean): [number, number] | null => {
    for (let t = 0; t < 250; t++) {
      let x: number;
      if (land && rnd.random() < 0.4) {
        // parte nas margens, que ficam visíveis ao lado da "folha"
        x = rnd.random() < 0.5 ? rnd.uniform(0, 8) : rnd.uniform(92, 100);
      } else {
        x = rnd.uniform(0, 100);
      }
      const y = rnd.uniform(0, 100);
      if (ok(x, y, rad, placed, land)) return [x, y];
    }
    return null;
  };

  // as grandes entram primeiro (sort do JavaScript é estável, como o sorted(reverse=True) do Python)
  const sizes = Array.from({ length: n }, () => rnd.uniform(3, 15)).sort((p, q) => (p > q ? -1 : p < q ? 1 : 0));

  const pl: Ponto[] = [];
  const pp: Ponto[] = [];
  const out: Runa[] = [];
  sizes.forEach((inicial, i) => {
    let size = inicial;
    let a: [number, number] | null = null;
    let b: [number, number] | null = null;
    let rad = 0;
    let coube = false;
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      rad = 0.55 * (size / 100 + 0.035);
      a = pick(rad, pl, true);
      b = pick(rad, pp, false);
      if (a && b) {
        coube = true;
        break;
      }
      size *= 0.88; // não coube: encolhe um pouco e tenta de novo
    }
    if (!coube || !a || !b) return; // o "for … else: continue" do Python: esta runa fica de fora
    pl.push([a[0], a[1], rad]);
    pp.push([b[0], b[1], rad]);
    let g = glyphs[i % glyphs.length]!;
    if (RUNES_TEXT_PRES.has(g)) g += "︎";
    const lo = rnd.uniform(0.07, 0.15);
    const hi = rnd.uniform(0.28, 0.5);
    // a ordem dos sorteios importa: giro, duração e atraso, nesta ordem (como no f-string do Python)
    const r = rnd.uniform(-45, 45);
    const d = rnd.uniform(7, 19);
    const atraso = rnd.uniform(0, 19);
    out.push({ glifo: g, lx: a[0], ly: a[1], px: b[0], py: b[1], s: size, r, lo, hi, d, atraso });
  });
  rnd.shuffle(out);
  return out;
}

// ───────────────────────── o HTML (igual, caractere por caractere, ao do build.py) ─────────────────────────

/** Como esc() do build.py (html.escape com aspas). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** O texto do atributo style de uma runa (custom properties lidas pelo CSS de .runes i). */
export function estiloDaRuna(r: Runa): string {
  return (
    `--lx:${pyFixed(r.lx, 1)}%;--ly:${pyFixed(r.ly, 1)}%;--px:${pyFixed(r.px, 1)}%;--py:${pyFixed(r.py, 1)}%;` +
    `--s:${pyFixed(r.s, 2)};--r:${pyFixed(r.r, 0)}deg;--lo:${pyFixed(r.lo, 2)};--hi:${pyFixed(r.hi, 2)};` +
    `--d:${pyFixed(r.d, 1)}s;animation-delay:${pyFixed(-r.atraso, 1)}s`
  );
}

/** O bloco inteiro, idêntico ao rune_imprint(seed) do build.py. */
export function runasHtml(seed: string, n = 26): string {
  const is = sortearRunas(seed, n).map((r) => `<i style="${estiloDaRuna(r)}">${esc(r.glifo)}</i>`);
  return '<div class="runes" aria-hidden="true">' + is.join("") + "</div>";
}

// ───────────────────────── fontes das runas (rune_fonts_links) ─────────────────────────

/** Como quote(texto) do Python (safe="/"): só letras, números, _ . - ~ e / passam sem código. */
function pyQuote(s: string): string {
  return encodeURIComponent(s)
    .replace(/%2F/g, "/")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Endereços do Google Fonts das runas: um por família, restrito (text=) aos símbolos usados.
 *  Desde a T17 o layout NÃO usa mais isto (as fontes das runas vêm do próprio site: src/styles/fontes-das-runas.css). Fica só como a
 *  referência do que o site Python pede ao Google, provada igual em tests/runas.test.ts, até o Python sair (T20/T22). */
export function runasFontesHrefs(): string[] {
  const txt = pyQuote(GLIFOS.join(""));
  return [...RUNE_FAMILIES_MAIN, ...RUNE_FAMILIES_EXTRA].map(
    (fam) => `https://fonts.googleapis.com/css2?family=${fam}&text=${txt}&display=swap`,
  );
}

/** As 20 <link> juntas, idênticas ao rune_fonts_links() do build.py. */
export function runasFontesHtml(): string {
  return runasFontesHrefs()
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
}
