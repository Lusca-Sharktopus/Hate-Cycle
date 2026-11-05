// Prova de que o Markdown do Astro (src/lib/markdown.ts + src/lib/corpos.ts) dá EXATAMENTE o HTML do make_md() do build.py.
//
// A referência (tests/fixtures/markdown-python.json) foi gerada pelo próprio Python:
//   python3 tools/markdown_ref.py
// Ela é uma FOTO de content/: mudou um .md, um embed ou um work.json? Rode o script de novo (e o frontmatter_ref.py).
//
// Critério: texto a texto, SEM normalização (toBe). Um espaço a mais já reprova.
//
// Partes:
//  1. a referência está em dia (mesmos .md, mesmos corpos, mesmos embeds) e os marcadores de atalho são os mesmos;
//  2. as classes \w, \s e \d das expressões regulares do Python × as do porte, caractere por caractere;
//  3. o índice dos [[links]] (o INDEX do build.py), no build e na prévia;
//  4. TODOS os corpos de content/, no contexto em que o build.py os renderiza (idioma, divisor), sem e com o
//     versalete do shell(), no build e na prévia;
//  5. as chamadas ao make_md() de um build() de verdade = o que o carregador guarda em rendered.html
//     (inclui a página Sobre, renderizada com o texto do Projeto na frente);
//  6. casos inventados: escritos à mão (cada ramo e cada expressão regular), sorteados, links de embed,
//     {{embed:…}} e o versalete direto.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { langs, showExtras, type Lang } from "../src/lib/config";
import {
  aplicarAtalhos,
  contextoDoCorpo,
  htmlDosCorpos,
  indicesDeLinks,
  lerEmbedDoDisco,
  MARCADORES_DE_ATALHO,
  textoParaRenderizar,
  type ColecaoComCorpo,
} from "../src/lib/corpos";
import { lerTudo, type EntradaBruta } from "../src/lib/leitor";
import { CLASSES_DO_PYTHON, embedHtml, markdownParaHtml, urlEmbed, versalete, versaleteEntreTags, type IndiceDoIdioma } from "../src/lib/markdown";

// ───────────── a referência do Python ─────────────

type Modo = "build" | "previa";
interface Saida {
  html: string;
  versalete: string;
}
interface NosDoisModos {
  build: Saida;
  /** null = igual ao build */
  previa: Saida | null;
}
interface Corpo extends NosDoisModos {
  lang: Lang;
  divisor: string | null;
  sha1: string;
}
interface Chamada {
  lang: Lang;
  divisor: string | null;
  partes: string[];
  composicao: boolean;
  html?: string;
  versalete?: string;
}
interface Caso extends NosDoisModos {
  nome: string;
  texto: string;
  lang: Lang;
  divisor: string | null;
}
type Faixas = [number, number][];
interface Referencia {
  python: string;
  classes: { unicode: string; w: Faixas; s: Faixas; d: Faixas; sem_categoria: Faixas };
  atalhos: Record<string, string>;
  show_extras: boolean;
  indice: Record<Modo, Record<Lang, Record<string, [string, string]>>>;
  embeds_de_content: Record<string, string>;
  corpos: Record<string, Corpo>;
  chamadas: Record<Modo, Chamada[]>;
  inventado: { indice: Record<Modo, Partial<Record<Lang, Record<string, [string, string]>>>>; arquivos: Record<string, string> };
  casos: Caso[];
  aleatorios: Caso[];
  url_embed: { url: string; html: string }[];
  embed_html: { spec: string; html: string }[];
  versalete: { texto: string; versalete: string; entre_tags: string }[];
}

const ref: Referencia = JSON.parse(readFileSync(new URL("./fixtures/markdown-python.json", import.meta.url), "utf8"));

const RAIZ = fileURLToPath(new URL("../content/", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/markdown_ref.py` e depois `pnpm test` de novo.";
const MODOS: Modo[] = ["build", "previa"];

const tudo = lerTudo(RAIZ);
const lerEmbed = lerEmbedDoDisco(RAIZ);
const indices: Record<Modo, Map<Lang, IndiceDoIdioma>> = {
  build: indicesDeLinks(tudo, false, showExtras),
  previa: indicesDeLinks(tudo, true, showExtras),
};

const sha1 = (texto: string) => createHash("sha1").update(texto, "utf8").digest("hex");

/** O HTML do make_md como fica dentro da página (entre um ">" e um "<"), com o versalete que o shell() aplica. */
const versaleteNaPagina = (html: string) => versaleteEntreTags(">" + html + "<").slice(1, -1);

/** A saída esperada num modo (a prévia só está gravada quando difere do build). */
const saida = (x: NosDoisModos, modo: Modo): Saida => (modo === "previa" ? (x.previa ?? x.build) : x.build);

/** "news/2023-08-18-orcs/en.md" → a coleção e a entrada lida pelo carregador. */
function entradaDoArquivo(rel: string): { colecao: ColecaoComCorpo; entrada: EntradaBruta } {
  const p = rel.replace(/\.md$/, "").split("/");
  const colecao = (p[0] === "works" ? "chapters" : p[0]) as ColecaoComCorpo;
  const id = p.slice(1).join("/");
  const entrada = tudo[colecao].find((e) => e.id === id);
  if (!entrada) throw new Error(`${rel}: o carregador não leu este arquivo. ${REFAZER}`);
  return { colecao, entrada };
}

/** Todos os arquivos de content/ com a extensão dada, como "news/2023-08-18-orcs/en.md". */
function arquivosDoDisco(ext: string, dir = RAIZ): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return arquivosDoDisco(ext, p);
    return d.name.endsWith(ext) ? [relative(RAIZ, p).split(sep).join("/")] : [];
  });
}

// ───────────── 1. a referência está em dia ─────────────

describe(`referência do Python ${ref.python} em dia com content/`, () => {
  test("mesmos .md, com os mesmos corpos", () => {
    expect(arquivosDoDisco(".md").sort(), REFAZER).toEqual(Object.keys(ref.corpos).sort());
    const velhos = Object.entries(ref.corpos)
      .filter(([rel, c]) => sha1(entradaDoArquivo(rel).entrada.body ?? "") !== c.sha1)
      .map(([rel]) => rel);
    expect(velhos, REFAZER).toEqual([]);
  });

  test("mesmos códigos de incorporação em content/embeds/", () => {
    const nomes = readdirSync(join(RAIZ, "embeds")).filter((n) => n.endsWith(".html")).sort();
    const lidos = Object.fromEntries(nomes.map((n) => [n, sha1(lerEmbed(n.replace(/\.html$/, "")) ?? "")]));
    expect(lidos, REFAZER).toEqual(ref.embeds_de_content);
  });

  test("mesmo show_extras do config.json", () => {
    expect(showExtras, REFAZER).toBe(ref.show_extras);
  });

  test("os marcadores de atalho do Astro são os mesmos que o Python usou no lugar do SHORT", () => {
    expect({ ...MARCADORES_DE_ATALHO }).toEqual(ref.atalhos);
  });
});

// ───────────── 2. \w, \s e \d do Python × do porte ─────────────

describe(`classes de caracteres: Python (Unicode ${ref.classes.unicode}) × porte`, () => {
  /** O ponto de código está em alguma das faixas? (busca binária) */
  const dentro = (faixas: Faixas, cp: number) => {
    let a = 0;
    let b = faixas.length - 1;
    while (a <= b) {
      const m = (a + b) >> 1;
      const [ini, fim] = faixas[m] ?? [0, -1];
      if (cp < ini) b = m - 1;
      else if (cp > fim) a = m + 1;
      else return true;
    }
    return false;
  };
  const classes = {
    w: new RegExp(`^[${CLASSES_DO_PYTHON.w}]$`, "u"),
    s: new RegExp(`^[${CLASSES_DO_PYTHON.s}]$`, "u"),
    d: new RegExp(`^[${CLASSES_DO_PYTHON.d}]$`, "u"),
  };

  test.each(["w", "s", "d"] as const)("\\%s: igual em todo caractere que o Unicode do Python conhece (0 a 0x10FFFF)", (k) => {
    const diferentes: string[] = [];
    let soNoUnicodeNovo = 0;
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // metades de surrogates: não existem sozinhas num texto
      const js = classes[k].test(String.fromCodePoint(cp));
      if (js === dentro(ref.classes[k], cp)) continue;
      if (dentro(ref.classes.sem_categoria, cp)) soNoUnicodeNovo++; // caractere que o Python ainda não conhece
      else diferentes.push(cp.toString(16));
    }
    expect(diferentes).toEqual([]);
    // \s é idêntico; \w e \d só diferem em letras e algarismos que o Unicode do Node já tem e o do Python não.
    if (k === "s") expect(soNoUnicodeNovo).toBe(0);
  });
});

// ───────────── 3. o índice dos [[links]] ─────────────

describe("índice dos [[links]] (INDEX do build.py): título e endereço de cada item", () => {
  test.each(MODOS.flatMap((m) => langs.map((l) => [m, l] as const)))("%s, %s", (modo, lang) => {
    const ts = Object.fromEntries([...(indices[modo].get(lang) ?? new Map<string, readonly [string, string]>())].map(([k, v]) => [k, [...v]]));
    expect(ts).toEqual(ref.indice[modo][lang]);
  });
});

// ───────────── 4. todos os corpos de content/ ─────────────

describe("todos os corpos de content/ = make_md() do Python (sem e com versalete; build e prévia)", () => {
  const nomes = Object.keys(ref.corpos).sort();

  test.each(nomes)("%s", (rel) => {
    const esperado = ref.corpos[rel];
    if (!esperado) throw new Error(rel);
    const { colecao, entrada } = entradaDoArquivo(rel);
    const ctx = contextoDoCorpo(tudo, colecao, entrada);
    expect({ lang: ctx.lang, divisor: ctx.divisor ?? null }, "contexto (idioma, divisor)").toEqual({ lang: esperado.lang, divisor: esperado.divisor });
    for (const modo of MODOS) {
      const html = markdownParaHtml(entrada.body ?? "", {
        indice: indices[modo].get(ctx.lang) ?? new Map(),
        atalhos: MARCADORES_DE_ATALHO,
        divisor: ctx.divisor,
        lerEmbed,
      });
      expect(html, `HTML (${modo})`).toBe(saida(esperado, modo).html);
      expect(versaleteNaPagina(html), `com versalete (${modo})`).toBe(saida(esperado, modo).versalete);
    }
  });
});

// ───────────── 5. as chamadas de um build() de verdade = rendered.html do carregador ─────────────

describe("o que o carregador guarda em rendered.html = o que o build() do Python passa ao make_md()", () => {
  const colecoes: ColecaoComCorpo[] = ["news", "pages", "emissaries", "characters", "universe", "chapters"];
  const doCarregador = Object.fromEntries(
    MODOS.map((modo) => [
      modo,
      Object.fromEntries(colecoes.map((c) => [c, htmlDosCorpos(tudo, c, { comRascunhos: modo === "previa", mostrarExtras: showExtras, lerEmbed })])),
    ]),
  ) as Record<Modo, Record<ColecaoComCorpo, Map<string, string>>>;

  for (const modo of MODOS) {
    test.each(ref.chamadas[modo].map((c) => [c.partes.join(" + "), c] as const))(`${modo}: %s`, (_nome, c) => {
      const ultimo = c.partes.at(-1) ?? "";
      const { colecao, entrada } = entradaDoArquivo(ultimo);
      const ctx = contextoDoCorpo(tudo, colecao, entrada);
      expect({ lang: ctx.lang, divisor: ctx.divisor ?? null }).toEqual({ lang: c.lang, divisor: c.divisor });
      // o texto que o carregador manda converter é o mesmo que o build() mandou
      const texto = c.partes.map((p) => entradaDoArquivo(p).entrada.body ?? "").join("\n\n");
      expect(textoParaRenderizar(tudo, colecao, entrada, modo === "previa")).toBe(texto);
      const html = doCarregador[modo][colecao].get(entrada.id);
      if (c.composicao) {
        expect(html).toBe(c.html);
        expect(versaleteNaPagina(html ?? "")).toBe(c.versalete);
      } else {
        expect(html).toBe(saida(ref.corpos[ultimo] ?? { build: { html: "?", versalete: "?" }, previa: null }, modo).html);
      }
    });
  }

  test.each(MODOS)("%s: toda entrada com corpo tem o HTML certo (as que o build() não renderiza também)", (modo) => {
    const composicoes = new Map(ref.chamadas[modo].filter((c) => c.composicao).map((c) => [c.partes.at(-1) ?? "", c.html ?? ""]));
    const errados: string[] = [];
    let total = 0;
    for (const rel of Object.keys(ref.corpos)) {
      const { colecao, entrada } = entradaDoArquivo(rel);
      const esperado = composicoes.get(rel) ?? (/^pages\/about\//.test(rel) ? "(a página Sobre não foi renderizada pelo build() neste modo)" : saida(ref.corpos[rel]!, modo).html);
      total++;
      if (doCarregador[modo][colecao].get(entrada.id) !== esperado) errados.push(rel);
    }
    expect(errados).toEqual([]);
    expect(total).toBe(Object.keys(ref.corpos).length);
  });
});

// ───────────── 6. casos inventados ─────────────

// A pasta content/ inventada (os {{embed:nome}} dos casos), recriada num diretório temporário.
const raizInventada = mkdtempSync(join(tmpdir(), "hc-markdown-"));
for (const [caminho, texto] of Object.entries(ref.inventado.arquivos)) {
  mkdirSync(dirname(join(raizInventada, caminho)), { recursive: true });
  writeFileSync(join(raizInventada, caminho), texto, "utf8");
}
afterAll(() => rmSync(raizInventada, { recursive: true, force: true }));
const lerInventado = lerEmbedDoDisco(join(raizInventada));

function renderizarInventado(c: Caso, modo: Modo): string {
  const indice: IndiceDoIdioma = new Map(Object.entries(ref.inventado.indice[modo][c.lang] ?? {}));
  return markdownParaHtml(c.texto, { indice, atalhos: MARCADORES_DE_ATALHO, divisor: c.divisor ?? undefined, lerEmbed: lerInventado });
}

function conferirCaso(c: Caso) {
  for (const modo of MODOS) {
    const html = renderizarInventado(c, modo);
    expect(html, `HTML (${modo})`).toBe(saida(c, modo).html);
    expect(versaleteNaPagina(html), `com versalete (${modo})`).toBe(saida(c, modo).versalete);
  }
}

describe(`casos escritos à mão (${ref.casos.length})`, () => {
  test.each(ref.casos.map((c) => [c.nome, c] as const))("%s", (_nome, c) => conferirCaso(c));
});

describe(`casos sorteados (${ref.aleatorios.length}, semente fixa)`, () => {
  test.each(ref.aleatorios.map((c) => [c.nome, c] as const))("%s", (_nome, c) => conferirCaso(c));
});

describe("embeds", () => {
  test.each(ref.url_embed.map((c) => [JSON.stringify(c.url), c] as const))("url_embed(%s)", (_u, c) => {
    expect(urlEmbed(c.url)).toBe(c.html);
  });
  test.each(ref.embed_html.map((c) => [JSON.stringify(c.spec), c] as const))("embed_html(%s)", (_s, c) => {
    expect(embedHtml(c.spec, lerInventado)).toBe(c.html);
  });
});

describe(`versalete direto: smallcaps() e o "entre tags" do shell() (${ref.versalete.length})`, () => {
  test.each(ref.versalete.map((c, i) => [i + 1, JSON.stringify(c.texto), c] as const))("nº %i: %s", (_i, _t, c) => {
    expect(versalete(c.texto)).toBe(c.versalete);
    expect(versaleteEntreTags(c.texto)).toBe(c.entre_tags);
  });
});

// ───────────── resumo e peças ─────────────

describe("resumo", () => {
  test(`${Object.keys(ref.corpos).length} corpos + ${ref.chamadas.build.length + ref.chamadas.previa.length} chamadas do build() + ${ref.casos.length + ref.aleatorios.length} casos inventados: todos iguais, sem normalização`, () => {
    const diferentes: string[] = [];
    for (const [rel, c] of Object.entries(ref.corpos)) {
      const { colecao, entrada } = entradaDoArquivo(rel);
      const ctx = contextoDoCorpo(tudo, colecao, entrada);
      for (const modo of MODOS) {
        const html = markdownParaHtml(entrada.body ?? "", { indice: indices[modo].get(ctx.lang) ?? new Map(), atalhos: MARCADORES_DE_ATALHO, divisor: ctx.divisor, lerEmbed });
        if (html !== saida(c, modo).html || versaleteNaPagina(html) !== saida(c, modo).versalete) diferentes.push(`${rel} (${modo})`);
      }
    }
    for (const c of [...ref.casos, ...ref.aleatorios]) {
      for (const modo of MODOS) {
        const html = renderizarInventado(c, modo);
        if (html !== saida(c, modo).html || versaleteNaPagina(html) !== saida(c, modo).versalete) diferentes.push(`${c.nome} (${modo})`);
      }
    }
    expect(diferentes).toEqual([]);
  });
});

describe("peças para as páginas (T11+)", () => {
  test("aplicarAtalhos troca os marcadores pelo HTML dado; sem HTML, some (como o SHORT vazio do Python)", () => {
    const html = `<p>a</p>\n${MARCADORES_DE_ATALHO.emissaries}\n${MARCADORES_DE_ATALHO["other-stories"]}\n<h2>b</h2>`;
    expect(aplicarAtalhos(html, { emissaries: '<section class="emissaries">…</section>' })).toBe('<p>a</p>\n<section class="emissaries">…</section>\n\n<h2>b</h2>');
  });

  test("versaleteEntreTags NÃO pode ser aplicado duas vezes (a transcrição ganharia outro <span class=\"ipa\">)", () => {
    const uma = versaleteEntreTags("<p>Hᴀᴛᴇ Cʏᴄʟᴇ /ɦaʊ̯.ˈʔu/</p>");
    expect(uma).toBe('<p><span class="hc">Hate Cycle</span> <span class="ipa">/ɦaʊ̯.ˈʔu/</span></p>');
    expect(versaleteEntreTags(uma)).not.toBe(uma);
  });

  test("armadilhas Python × JavaScript que o porte resolve (cada uma tem caso na referência)", () => {
    const nomes = new Set(ref.casos.map((c) => c.nome));
    for (const n of ["enfase-com-acento-e-astral", "html-cru-arroba-colado-em-letra", "html-cru-tag-colada-em-letra", "espacos-unicode", "cr-solto", "atalho-de-prototipo", "atalho-unicode", "titulo-com-quebra"]) {
      expect(nomes.has(n), n).toBe(true);
    }
    // \w Unicode: "é*a*é" não é itálico (no JavaScript puro, \w não conhece o "é" e viraria <em>)
    expect(markdownParaHtml("é*a*é", { indice: new Map(), atalhos: {}, lerEmbed: () => undefined })).toBe("<p>é*a*é</p>");
    // "." do Python pega \u2028; o do JavaScript, não
    expect(markdownParaHtml("**a\u2028b**", { indice: new Map(), atalhos: {}, lerEmbed: () => undefined })).toBe("<p><strong>a\u2028b</strong></p>");
  });
});
