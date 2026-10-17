// Prova de que as coleções do Astro leem e publicam EXATAMENTE o que o build.py lê e publica.
//
// A referência (tests/fixtures/conteudo-python.json) foi gerada pelo próprio Python:
//   python3 tools/frontmatter_ref.py
// Ela é uma FOTO de content/: se você criou, apagou ou mudou um .md/work.json, rode o script de novo.
//
// Partes:
//  1. parser: cada .md de content/ lido por src/lib/frontmatter.ts = parse() do Python (campo a campo, e o corpo);
//     cada work.json = json.loads(); e 43 arquivos inventados com os cantos do parser.
//  2. schemas: todo o conteúdo atual passa na validação.
//  3. publicação: por coleção e por idioma, os itens publicados no build (sem rascunhos) e na prévia (com
//     rascunhos) são os mesmos do Python; o menu (`has`), o índice de links e a lista de endereços também.
//  4. erros: um campo errado de propósito gera uma mensagem clara, com o campo e o valor.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { redirects } from "../config.json";
import { emissariosEscondidos, langs, showExtras, siteUrl, type Lang } from "../src/lib/config";
import { decodificar, parse, parseArquivo, type FrontMatter } from "../src/lib/frontmatter";
import { compararNatural, imagensQueFaltam, indiceDoDisco, lerCapitulos, lerItens, lerObras, SECOES_DE_ITENS, type SecaoDeItens } from "../src/lib/leitor";
import { calcularMenu } from "../src/lib/nav";
import { criarSchemas, type Indice } from "../src/lib/schemas";
import { capitulosDaObra, emissariosDoIdioma, extrasDoIdioma, itensDoIdioma, obraListada, obraNoIndice, obraTemPagina } from "../src/lib/visibilidade";

// ───────────── a referência do Python ─────────────

interface Publicado {
  itens: Record<SecaoDeItens, Record<Lang, string[]>>;
  emissarios_visiveis: Record<Lang, string[]>;
  obras: string[];
  obras_listadas: Record<Lang, string[]>;
  capitulos: Record<Lang, string[]>;
  capitulos_ocultos: Record<Lang, string[]>;
  numeros: Record<Lang, Record<string, string>>;
  has: Record<Lang, { news: boolean; universe: boolean; characters: boolean; extras: [string, string][]; about: boolean; support: boolean }>;
  urls: string[];
  index: string[];
}
interface Referencia {
  python: string;
  langs: Lang[];
  config: { show_extras: boolean; emissaries_hide: string[] };
  arquivos: Record<string, { fm: FrontMatter; body: string }>;
  obras: Record<string, Record<string, unknown>>;
  sinteticos: { nome: string; texto?: string; bytes_b64?: string; fm?: FrontMatter; body?: string; erro?: string | null }[];
  publicado: { build: Publicado; previa: Publicado };
}

const ref: Referencia = JSON.parse(readFileSync(new URL("./fixtures/conteudo-python.json", import.meta.url), "utf8"));

const RAIZ = fileURLToPath(new URL("../content/", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/frontmatter_ref.py` e depois `pnpm test` de novo.";

/** Todos os arquivos de content/ com a extensão dada, como "news/2023-08-18-orcs/en.md". */
function arquivosDoDisco(ext: string, dir = RAIZ): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return arquivosDoDisco(ext, p);
    return d.name.endsWith(ext) ? [relative(RAIZ, p).split(sep).join("/")] : [];
  });
}

// ───────────── 1. parser ─────────────

describe(`front matter igual ao parse() do Python ${ref.python}`, () => {
  const nomes = Object.keys(ref.arquivos).sort();

  test(`a referência tem os mesmos ${nomes.length} .md que existem em content/`, () => {
    expect(arquivosDoDisco(".md").sort(), REFAZER).toEqual(nomes);
  });

  test.each(nomes)("%s", (nome) => {
    const lido = parseArquivo(join(RAIZ, nome));
    const esperado = ref.arquivos[nome];
    expect({ ...lido.fm }, `front matter de ${nome}`).toEqual(esperado?.fm);
    expect(lido.body, `corpo de ${nome}`).toBe(esperado?.body);
  });

  test(`resumo: os ${nomes.length} arquivos, todos iguais`, () => {
    const diferentes = nomes.filter((n) => JSON.stringify(sortear(parseArquivo(join(RAIZ, n)))) !== JSON.stringify(sortear(ref.arquivos[n])));
    expect(diferentes).toEqual([]);
  });

  test("work.json igual ao json.loads() do Python, obra por obra", () => {
    expect(arquivosDoDisco("work.json").length, REFAZER).toBe(Object.keys(ref.obras).length);
    const lidas = Object.fromEntries(lerObras(RAIZ).map((o) => [o.id, semOrigem(o.data)]));
    expect(lidas).toEqual(ref.obras);
  });

  test.each(ref.sinteticos.map((c) => [c.nome, c] as const))("caso inventado: %s", (_nome, c) => {
    if (c.bytes_b64 !== undefined) {
      // o Python pára com erro (UnicodeDecodeError); o TypeScript também tem de parar
      expect(c.erro).toBe("UnicodeDecodeError");
      expect(() => decodificar(new Uint8Array(Buffer.from(c.bytes_b64 ?? "", "base64")))).toThrow();
      return;
    }
    const lido = parse(decodificar(new TextEncoder().encode(c.texto ?? "")));
    expect({ ...lido.fm }).toEqual(c.fm);
    expect(lido.body).toBe(c.body);
  });
});

function semOrigem(d: Record<string, unknown>): Record<string, unknown> {
  const { _origem: _, ...resto } = d;
  return resto;
}
function sortear(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortear);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortear((x as Record<string, unknown>)[k])]));
  return x;
}

// ───────────── 2. schemas: o conteúdo atual é todo válido ─────────────

const schemas = criarSchemas(indiceDoDisco(RAIZ));
const brutos = {
  news: lerItens(RAIZ, "news"),
  pages: lerItens(RAIZ, "pages"),
  emissaries: lerItens(RAIZ, "emissaries"),
  characters: lerItens(RAIZ, "characters"),
  universe: lerItens(RAIZ, "universe"),
  works: lerObras(RAIZ),
  chapters: lerCapitulos(RAIZ),
};

describe("todo o conteúdo atual passa nos schemas", () => {
  test.each(Object.keys(brutos) as (keyof typeof brutos)[])("%s", (colecao) => {
    const erros = brutos[colecao].flatMap((e) => {
      const r = schemas[colecao].safeParse(e.data);
      return r.success ? [] : r.error.issues.map((i) => `${relative(RAIZ, e.arquivo)} → ${i.path.join(".")}: ${i.message}`);
    });
    expect(erros).toEqual([]);
    expect(brutos[colecao].length).toBeGreaterThan(0);
  });
});

// Conteúdo validado (o que o Astro guarda nas coleções), já com os tipos dos schemas.
const v = {
  news: brutos.news.map((e) => ({ id: e.id, data: schemas.news.parse(e.data) })),
  pages: brutos.pages.map((e) => ({ id: e.id, data: schemas.pages.parse(e.data) })),
  emissaries: brutos.emissaries.map((e) => ({ id: e.id, data: schemas.emissaries.parse(e.data) })),
  characters: brutos.characters.map((e) => ({ id: e.id, data: schemas.characters.parse(e.data) })),
  universe: brutos.universe.map((e) => ({ id: e.id, data: schemas.universe.parse(e.data) })),
  works: brutos.works.map((e) => ({ id: e.id, data: schemas.works.parse(e.data) })),
  chapters: brutos.chapters.map((e) => ({ id: e.id, data: schemas.chapters.parse(e.data) })),
};

// ───────────── 3. publicação: Astro × Python, com e sem rascunhos ─────────────

/** O que as regras do Astro publicam, no mesmo formato da referência do Python. */
function publicacaoAstro(comRascunhos: boolean): Publicado {
  const porIdioma = <T>(f: (l: Lang) => T) => Object.fromEntries(langs.map((l) => [l, f(l)])) as Record<Lang, T>;
  const slugs = (xs: { data: { _origem: { slug: string } } }[]) => xs.map((x) => x.data._origem.slug);
  const obras = [...v.works].sort((a, b) => (a.id < b.id ? -1 : 1));
  const caps = (l: Lang) => obras.map((o) => ({ o, ...capitulosDaObra(v.chapters, o.id, l, comRascunhos) }));
  const nomeCap = (c: { data: { _origem: { obra: string; capitulo: string } } }) => `${c.data._origem.obra}/${c.data._origem.capitulo}`;

  const itens = Object.fromEntries(SECOES_DE_ITENS.map((s) => [s, porIdioma((l) => slugs(itensDoIdioma(v[s], l, comRascunhos)))])) as Publicado["itens"];
  const has = porIdioma((l) => {
    const pages = itensDoIdioma(v.pages, l, comRascunhos);
    const universe = extrasDoIdioma(v.universe, l, comRascunhos, showExtras);
    const characters = extrasDoIdioma(v.characters, l, comRascunhos, showExtras);
    const news = itensDoIdioma(v.news, l, comRascunhos);
    const menu = calcularMenu(
      l,
      {
        news: news.length,
        universe: universe.length,
        characters: characters.length,
        pages: pages.map((p) => ({ slug: p.data._origem.slug, title: p.data.title || p.data._origem.slug, menu: p.data.menu ?? "" })),
      },
      showExtras,
    );
    return {
      news: menu.news,
      universe: universe.length > 0,
      characters: characters.length > 0,
      extras: menu.extras.map((x) => [x.href, x.label] as [string, string]),
      about: menu.about,
      support: menu.support,
    };
  });

  // índice dos [[links]] e do related: "idioma:seção/pasta"
  const index: string[] = [];
  for (const l of langs) {
    for (const s of SECOES_DE_ITENS) {
      if (!showExtras && (s === "universe" || s === "characters")) continue;
      for (const slug of itens[s][l]) index.push(`${l}:${s}/${slug}`);
    }
    for (const { o, listados } of caps(l)) if (obraNoIndice(o, listados.length, l)) index.push(`${l}:works/${o.id}`);
  }

  // endereços que o build() escreve
  const urls = new Set<string>(["/", "/404.html"]);
  for (const [antigo, novo] of Object.entries(redirects)) if (!(novo === "/" || antigo === "index.html")) urls.add("/" + antigo);
  for (const l of langs) {
    urls.add(`/${l}/`);
    urls.add(`/${l}/works/`);
    if (siteUrl) urls.add(`/${l}/feed.xml`);
    for (const [secao, lista] of [
      ["news", itensDoIdioma(v.news, l, comRascunhos)],
      ["universe", extrasDoIdioma(v.universe, l, comRascunhos, showExtras)],
      ["characters", extrasDoIdioma(v.characters, l, comRascunhos, showExtras)],
    ] as const) {
      if (lista.length > 0) urls.add(`/${l}/${secao}/`);
      for (const i of lista) urls.add(`/${l}/${secao}/${i.data._origem.slug}/`);
    }
    for (const p of itensDoIdioma(v.pages, l, comRascunhos)) if (p.data.route !== false) urls.add(`/${l}/${p.data._origem.slug}/`);
    for (const { o, listados, ocultos } of caps(l)) {
      if (obraTemPagina(o, listados.length, l)) urls.add(`/${l}/works/${o.id}/`);
      for (const c of [...listados, ...ocultos]) urls.add(`/${l}/works/${nomeCap(c)}/`);
    }
  }

  return {
    itens,
    emissarios_visiveis: porIdioma((l) => slugs(emissariosDoIdioma(v.emissaries, l, comRascunhos, emissariosEscondidos))),
    obras: obras.map((o) => o.id),
    obras_listadas: porIdioma((l) => obras.filter((o) => obraListada(o, l, langs)).map((o) => o.id)),
    capitulos: porIdioma((l) => caps(l).flatMap((x) => x.listados.map(nomeCap))),
    capitulos_ocultos: porIdioma((l) => caps(l).flatMap((x) => x.ocultos.map(nomeCap))),
    numeros: porIdioma((l) =>
      Object.fromEntries(caps(l).flatMap((x) => [...x.listados, ...x.ocultos].map((c) => [nomeCap(c), c.data.chapter || String(c.data._origem.posicao)]))),
    ),
    has,
    urls: [...urls].sort(),
    index: index.sort(),
  };
}

const astro = { build: publicacaoAstro(false), previa: publicacaoAstro(true) };
const py = ref.publicado;

describe("o que é publicado: Astro = Python (build sem rascunhos · prévia com rascunhos)", () => {
  test("a referência usa o mesmo config.json (show_extras, emissaries.hide)", () => {
    expect({ show_extras: showExtras, emissaries_hide: [...emissariosEscondidos] }, REFAZER).toEqual(ref.config);
  });

  // Uma linha por coleção e idioma; o nome do teste já mostra as contagens.
  const linhas: [string, number, number, number, number, keyof Publicado, Lang | null, string | null][] = [];
  for (const l of langs) {
    for (const s of SECOES_DE_ITENS) {
      linhas.push([`${s} (${l})`, astro.build.itens[s][l].length, py.build.itens[s][l].length, astro.previa.itens[s][l].length, py.previa.itens[s][l].length, "itens", l, s]);
    }
    linhas.push([`emissários visíveis (${l})`, astro.build.emissarios_visiveis[l].length, py.build.emissarios_visiveis[l].length, astro.previa.emissarios_visiveis[l].length, py.previa.emissarios_visiveis[l].length, "emissarios_visiveis", l, null]);
    linhas.push([`obras listadas (${l})`, astro.build.obras_listadas[l].length, py.build.obras_listadas[l].length, astro.previa.obras_listadas[l].length, py.previa.obras_listadas[l].length, "obras_listadas", l, null]);
    linhas.push([`capítulos listados (${l})`, astro.build.capitulos[l].length, py.build.capitulos[l].length, astro.previa.capitulos[l].length, py.previa.capitulos[l].length, "capitulos", l, null]);
    linhas.push([`capítulos ocultos/unlisted (${l})`, astro.build.capitulos_ocultos[l].length, py.build.capitulos_ocultos[l].length, astro.previa.capitulos_ocultos[l].length, py.previa.capitulos_ocultos[l].length, "capitulos_ocultos", l, null]);
  }
  linhas.push(["obras (work.json)", astro.build.obras.length, py.build.obras.length, astro.previa.obras.length, py.previa.obras.length, "obras", null, null]);
  linhas.push(["endereços gerados pelo build()", astro.build.urls.length, py.build.urls.length, astro.previa.urls.length, py.previa.urls.length, "urls", null, null]);

  test.each(linhas)("%s — build: Astro %i × Python %i · prévia: Astro %i × Python %i", (_n, _ab, _pb, _ap, _pp, chave, l, s) => {
    for (const modo of ["build", "previa"] as const) {
      const a = astro[modo][chave] as unknown;
      const p = py[modo][chave] as unknown;
      const pegar = (x: unknown) => {
        let y = x as Record<string, unknown>;
        if (s) y = y[s] as Record<string, unknown>;
        if (l) return y[l];
        return y;
      };
      // a lista inteira (quais itens, não só quantos), e na mesma ordem das pastas
      expect(pegar(a), `${modo}`).toEqual(pegar(p));
    }
  });

  test.each(["build", "previa"] as const)("%s: menu (`has`) igual ao do Python", (modo) => {
    expect(astro[modo].has).toEqual(py[modo].has);
  });
  test.each(["build", "previa"] as const)("%s: índice dos [[links]]/related igual ao INDEX do Python", (modo) => {
    expect(astro[modo].index).toEqual(py[modo].index);
  });
  test.each(["build", "previa"] as const)("%s: número de cada capítulo (chapter: ou a posição da pasta)", (modo) => {
    expect(astro[modo].numeros).toEqual(py[modo].numeros);
  });
  test.each(["build", "previa"] as const)("%s: todos os endereços que o build() escreve", (modo) => {
    expect(astro[modo].urls).toEqual(py[modo].urls);
  });
});

// ───────────── 4. erros claros ─────────────

describe("um campo errado gera uma mensagem clara (campo + valor)", () => {
  const existentes = new Set(["works/firestriker", "characters/harry", "universe/hidden-magic", "news/2023-08-18-orcs"]);
  const indice: Indice = { existe: (r) => existentes.has(r) };
  const s = criarSchemas(indice);
  const item = { slug: "x", lang: "pt" as const };
  const cap = { obra: "firestriker", capitulo: "01", lang: "pt" as const, posicao: 1 };

  /** Valida e devolve "caminho: mensagem" de cada problema (vazio = válido). */
  function problemas(schema: { safeParse(d: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, data: unknown): string[] {
    const r = schema.safeParse(data);
    return r.success ? [] : (r.error?.issues ?? []).map((i) => `${i.path.map(String).join(".")}: ${i.message}`);
  }

  test("um item correto passa (e `tags:` vazio vira lista vazia, como o build.py entende)", () => {
    expect(problemas(s.news, { title: "Olá", date: "2024-02-29", tags: "", _origem: item })).toEqual([]);
    expect(s.news.parse({ title: "Olá", tags: "", _origem: item }).tags).toEqual([]);
  });

  test("date: 2024-13-45 (mês 13)", () => {
    expect(problemas(s.news, { date: "2024-13-45", _origem: item })).toEqual([
      'date: "2024-13-45" não é uma data válida: use AAAA-MM-DD, com mês e dia que existam (ex.: 2024-08-18).',
    ]);
    expect(problemas(s.news, { date: "2023-02-29", _origem: item })[0]).toMatch(/^date: "2023-02-29" não é uma data válida/);
    expect(problemas(s.news, { date: "18/08/2024", _origem: item })[0]).toMatch(/^date: "18\/08\/2024"/);
  });

  test('kind: "novel" no work.json', () => {
    expect(problemas(s.works, { kind: "novel", _origem: { slug: "x" } })).toEqual([
      'kind: "novel" não é um tipo de obra (kind) conhecido. Use um destes: prose, comic, video, film.',
    ]);
  });

  test("related apontando para algo que não existe", () => {
    expect(problemas(s.characters, { related: ["characters/harry", "universe/nao-existe"], _origem: item })).toEqual([
      'related.1: "universe/nao-existe" não existe (não há content/universe/nao-existe/ com en.md ou pt.md). Erro de digitação ou item apagado/renomeado?',
    ]);
    expect(problemas(s.news, { related: ["harry"], _origem: item })[0]).toMatch(/^related\.0: "harry" não está no formato seção\/pasta/);
    expect(problemas(s.news, { related: ["works/firestrikr"], _origem: item })[0]).toMatch(/^related\.0: "works\/firestrikr" não existe \(não há content\/works\/firestrikr\/work\.json\)/);
  });

  test("appears_in com obra inexistente", () => {
    expect(problemas(s.characters, { appears_in: ["firestriker", "firestrikr"], _origem: item })).toEqual([
      'appears_in.1: "firestrikr" não é uma obra: não existe content/works/firestrikr/work.json.',
    ]);
  });

  test("campo desconhecido (erro de digitação) é erro, com a lista dos campos aceitos", () => {
    const [p] = problemas(s.news, { dat: "2024-01-01", _origem: item });
    expect(p).toMatch(/^dat: campo desconhecido \(erro de digitação\?\)\. Campos aceitos em notícias: title, date, summary, /);
    expect(p).not.toContain("_origem");
    expect(problemas(s.chapters, { unlsited: true, _origem: cap })[0]).toMatch(/^unlsited: campo desconhecido/);
    expect(problemas(s.works, { titel: { en: "x" }, _origem: { slug: "x" } })[0]).toMatch(/^titel: campo desconhecido/);
  });

  test("vários erros no mesmo arquivo aparecem juntos", () => {
    expect(problemas(s.news, { dat: "x", date: "2024-13-45", draft: "yes", _origem: item }).map((p) => p.split(":")[0])).toEqual(["date", "draft", "dat"]);
  });

  test("draft/unlisted/comments têm de ser true ou false (\"yes\" seria lido como \"não\" pelo Python)", () => {
    expect(problemas(s.chapters, { draft: "yes", _origem: cap })).toEqual(['draft: tem de ser true ou false, sem aspas, mas veio "yes".']);
    expect(problemas(s.chapters, { unlisted: "true", _origem: cap })[0]).toMatch(/^unlisted: tem de ser true ou false/);
  });

  test("listas: tags como texto solto, item que não é texto", () => {
    expect(problemas(s.news, { tags: "Post", _origem: item })).toEqual([
      'tags: tem de ser uma lista (ex.: [a, b], ou uma linha "  - item" para cada item), mas veio "Post".',
    ]);
    expect(problemas(s.news, { tags: ["a", true], _origem: item })).toEqual(["tags: tem de ser uma lista de textos, mas o item 2 é true."]);
  });

  test("work.json: media, order, traduzíveis, langs", () => {
    expect(problemas(s.works, { media: "novela", _origem: { slug: "x" } })[0]).toMatch(/^media: "novela" não é um tipo de mídia \(media\) conhecido\. Use um destes: short-story, webcomic, /);
    expect(problemas(s.works, { order: { release: "4" }, _origem: { slug: "x" } })).toEqual(['order.release: tem de ser um número, sem aspas, mas veio "4".']);
    expect(problemas(s.works, { order: { chorno: 4 }, _origem: { slug: "x" } })[0]).toMatch(/^order: só aceita "release" e "chrono"/);
    expect(problemas(s.works, { title: { en: "A", es: "B" }, _origem: { slug: "x" } })[0]).toMatch(/^title: tem de ser um texto ou \{"en": "…", "pt": "…"\}/);
    expect(problemas(s.works, { langs: ["pt", "es"], _origem: { slug: "x" } })[0]).toMatch(/^langs\.1: /);
    expect(problemas(s.works, { listed: "false", _origem: { slug: "x" } })[0]).toMatch(/^listed: tem de ser true ou false/);
  });

  test("figurinhas (stickers) e ID do YouTube", () => {
    expect(problemas(s.news, { stickers: ["a.png | l3 t2 w26a-4"], _origem: item })).toEqual([
      'stickers.0: a figurinha 1 tem "w26a-4", que não é uma posição: use l, r, t, b, w ou a seguido de um número (ex.: l3 t2 w26 a-4).',
    ]);
    expect(problemas(s.chapters, { youtube: "https://youtu.be/J2j6xoIz0LE", _origem: cap })[0]).toMatch(/^youtube: "https:\/\/youtu\.be\/J2j6xoIz0LE" não parece um ID/);
    expect(problemas(s.chapters, { youtube: "J2j6xoIz0LE", _origem: cap })).toEqual([]);
  });

  test("do arquivo ao erro: front matter com dois erros lido pelo parser e validado", () => {
    const { fm } = parse("---\ntitle: Official Artwork: Orcs\ndate: 2024-13-45\nkind: novel\n---\nCorpo.");
    expect(fm["title"]).toBe("Official Artwork: Orcs"); // dois-pontos sem aspas: vale, como no Python
    expect(problemas(s.news, { ...fm, _origem: item })).toEqual([
      'date: "2024-13-45" não é uma data válida: use AAAA-MM-DD, com mês e dia que existam (ex.: 2024-08-18).',
      expect.stringMatching(/^kind: campo desconhecido/),
    ]);
  });

  test("imagem citada que não existe em static/ vira aviso (campo + caminho); links e vazios são ignorados", () => {
    const pastaStatic = fileURLToPath(new URL("../static/", import.meta.url));
    const data = {
      thumb: "news/nao-existe.png",
      image: "",
      overlay: "https://exemplo.com/a.png",
      cover: { en: "covers/EN/Cover Firestriker.png", pt: "covers/PT/nao-existe.png" },
      stickers: ["news/stickers/formula.png | l3", "news/stickers/nao-existe.png | r4"],
    };
    expect(imagensQueFaltam(data, pastaStatic)).toEqual([
      ["thumb", "news/nao-existe.png"],
      ["cover.pt", "covers/PT/nao-existe.png"],
      ["stickers.1", "news/stickers/nao-existe.png"],
    ]);
  });

  test("ordem natural das pastas de capítulo (2 antes de 10), como natural() do build.py", () => {
    expect(["10", "2", "01", "1b", "Extra"].sort(compararNatural)).toEqual(["01", "1b", "2", "10", "Extra"]);
  });
});
