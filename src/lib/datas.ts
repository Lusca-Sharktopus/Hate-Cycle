// Datas do site: como aparecem para o visitante, e as contas de dias que o build.py faz.
//
// Funções puras (mesma entrada, mesma saída; não leem relógio nem arquivo). A prova de que são iguais ao Python
// está em tests/regras.test.ts (referência: tools/regras_ref.py).
//
// De onde vem cada regra no build.py:
//   formatarData()   → fmt_date()                        linha ~87   (a data escrita "à moda" de cada idioma)
//   datasProximas()  → _near() dentro de build()         linha ~719  (a janela de 3 dias que funde notícia e capítulo)
//   dataParaRss()    → o try/except do RSS em build()    linha ~929  (pubDate no formato de e-mail, RFC 2822)
import { t, tList, type Lang } from "./config";

// ───────────── a data que o visitante lê ─────────────

/** int() do Python para um pedaço de data: aceita espaços, sinal e algarismos; senão erro (o Python lança ValueError). */
function inteiro(s: string): number {
  if (!/^[\t\n\v\f\r\x1c-\x20\x85\xa0]*[+-]?\d+[\t\n\v\f\r\x1c-\x20\x85\xa0]*$/.test(s)) throw new Error(`não é inteiro: ${s}`);
  return Number.parseInt(s.trim(), 10);
}

/**
 * fmt_date(lang, d) do build.py: "2025-12-25" → "25 de dez. de 2025" (pt) ou "Dec 25, 2025" (en).
 * O modelo da frase e os nomes dos meses vêm de config.json → ui (`date_fmt`, `months`).
 * Qualquer coisa que não seja AAAA-MM-DD (vazio, mês 13, texto) volta como veio — vazio vira "". Nunca dá erro.
 *
 * Detalhe herdado do Python, mantido de propósito: mês "00" cai em dezembro (índice -1 da lista). O schema
 * (src/lib/schemas.ts → dataValida) já recusa datas assim; aqui só importa para a prova ser caractere por caractere.
 */
export function formatarData(lang: Lang, data: string | undefined): string {
  try {
    const [a, m, d] = (data ?? "").split("-");
    if (a === undefined || m === undefined || d === undefined) throw new Error("faltam pedaços");
    const meses = tList(lang, "months");
    const i = inteiro(m) - 1;
    const mes = meses[i < 0 ? i + meses.length : i]; // índice negativo vale como no Python
    if (mes === undefined) throw new Error("mês fora da lista");
    const dia = inteiro(d);
    const valores: Record<string, string> = { y: a, m: mes, d: String(dia) };
    // str.format(): {y} {m} {d}; "{{" e "}}" são chaves de verdade; qualquer outra coisa é erro (cai no `catch`)
    return t(lang, "date_fmt").replace(/\{\{|\}\}|\{(\w*)\}|[{}]/g, (achado, nome: string | undefined) => {
      if (achado === "{{") return "{";
      if (achado === "}}") return "}";
      const v = nome === undefined ? undefined : valores[nome];
      if (v === undefined) throw new Error(`campo desconhecido no modelo da data: ${achado}`);
      return v;
    });
  } catch {
    return data ?? "";
  }
}

// ───────────── contas de dias ─────────────

/** AAAA-MM-DD (com os dois dígitos exatos, como o schema exige) → dias desde 1970; undefined se não existe no calendário. */
function diasDesde1970(texto: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return undefined;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(0);
  dt.setUTCFullYear(a, me - 1, d); // setUTCFullYear não "corrige" anos < 100, ao contrário de Date.UTC
  if (a < 1 || dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return undefined;
  return Math.round(dt.getTime() / 86_400_000);
}

/** Quantos dias de diferença (para mais ou para menos) ainda contam como "o mesmo acontecimento" na home. */
export const JANELA_DE_FUSAO_EM_DIAS = 3;

/**
 * _near(a, b) do build(): as duas datas (só os 10 primeiros caracteres de cada uma) distam NO MÁXIMO 3 dias?
 * Data que não é AAAA-MM-DD de verdade (vazia, 30 de fevereiro…) → false, sem erro.
 * (O Python usa date.fromisoformat, que também aceita "20240105" e "2024-W01-1"; o schema do site só deixa passar
 * AAAA-MM-DD, então essas formas nunca chegam aqui.)
 */
export function datasProximas(a: string, b: string, dias = JANELA_DE_FUSAO_EM_DIAS): boolean {
  const x = diasDesde1970(a.slice(0, 10));
  const y = diasDesde1970(b.slice(0, 10));
  return x !== undefined && y !== undefined && Math.abs(x - y) <= dias;
}

// ───────────── RSS ─────────────

const DIAS_DA_SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MESES_EM_INGLES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** strptime("%Y-%m-%d") do Python: ano com 4 dígitos, mês 1–12 e dia 1–31 com ou sem zero (ou espaço) à frente. */
const RE_STRPTIME = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])/;

/**
 * A data de um item do RSS no formato de e-mail, à meia-noite UTC: "2025-12-25" → "Thu, 25 Dec 2025 00:00:00 +0000".
 * É `format_datetime(datetime.strptime(d[:10], "%Y-%m-%d").replace(tzinfo=utc))` do build(). Data que não existe
 * (vazia, 30 de fevereiro, ano 0000) → undefined: o RSS simplesmente pula o item.
 */
export function dataParaRss(data: string): string | undefined {
  const texto = data.slice(0, 10);
  const m = RE_STRPTIME.exec(texto);
  if (!m || m[0].length !== texto.length) return undefined; // "unconverted data remains" também é erro no Python
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(0);
  dt.setUTCFullYear(a, me - 1, d);
  if (a < 1 || dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return undefined;
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${DIAS_DA_SEMANA[dt.getUTCDay()]}, ${dois(d)} ${MESES_EM_INGLES[me - 1]} ${String(a).padStart(4, "0")} 00:00:00 +0000`;
}
