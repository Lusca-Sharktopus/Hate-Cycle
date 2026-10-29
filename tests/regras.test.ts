// Prova de que as REGRAS do site em src/lib (ordem das obras, "Últimas atualizações", datas, resumos, notícias, emissários…)
// fazem EXATAMENTE o que o build.py faz.
//
// A referência (tests/fixtures/regras-python.json) foi gerada pelo próprio Python:
//   python3 tools/regras_ref.py
// Ela é uma FOTO de content/ e do config.json: mudou algo lá? Rode o script de novo (junto com frontmatter_ref.py e markdown_ref.py).
//
// Partes:
//  1. tabelas: funções chamadas direto no Python (tr, fmt_date, _near, data do RSS, excerpt, plain) × TypeScript.
//  2. o conteúdo de verdade, com e sem rascunhos, e 3 cenários inventados (gravados no JSON e recriados aqui numa pasta
//     temporária, lidos pelo MESMO leitor/schemas do site): o estado que o build() do Python tem na home (ordem das obras,
//     destaques, atualizações já fundidas, notícias, emissários…) e o que ele escreve em cada página (título, anterior/próximo,
//     datas, links de idioma, ID dos comentários…) × as funções de src/lib.
//  3. o seletor de Histórias e a paginação das notícias: não são Python, são o static/site.js — o teste EXECUTA o código
//     de verdade do site.js (blocos 1 e 6) com elementos de mentira e compara com as funções TypeScript.
// Nenhuma comparação é "normalizada": o que o Python deu tem de sair igual (toStrictEqual).
// No fim, a tabela "quantos casos de cada regra foram comparados" é impressa.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterAll, describe, expect, test } from "vitest";
import { alternativasDaLista, alternativasDaObra, alternativasDeItem, alternativasDoCapitulo, urlDoItem, type Alternativas } from "../src/lib/alternativas";
import { assetUrl } from "../src/lib/assets";
import { ATUALIZACOES_NA_HOME, itensDoRss, rotuloDaAtualizacao, type Atualizacao } from "../src/lib/atualizacoes";
import { paginaDaObra, paginasDosCapitulos } from "../src/lib/capitulos";
import { cortarTitulo, LIMITE_DO_TITULO_NO_PAGER } from "../src/lib/titulos";
import { langs, tDoConfig, tr, type Lang, type Translatable } from "../src/lib/config";
import { TEXTOS_DO_BLOG } from "../src/lib/textosDoBlog";
import { dataParaRss, datasProximas, formatarData } from "../src/lib/datas";
import { inicialDoEmissario, mostraTexto, REDES, redesDoEmissario } from "../src/lib/emissarios";
import { agruparUniverso, obrasEmQueAparece, relacionados } from "../src/lib/extras";
import { parseArquivo } from "../src/lib/frontmatter";
import { lerCapitulos, lerItens, lerObras, indiceDoDisco } from "../src/lib/leitor";
import { dadosDoIdioma } from "../src/lib/idioma";
import {
  cartaoDaObra,
  dadosDoSeletor,
  destaquesDaHome,
  MODOS_DE_ORDEM,
  organizarCartoes,
  ROTULOS_DE_MIDIA,
  TEXTOS_DO_FILTRO_DE_MIDIA,
  type CartaoDaObra,
  type CartaoParaOrdenar,
  type ModoDeOrdem,
} from "../src/lib/obras";
import { normalizarBusca, paginaPedida } from "../src/lib/paginacao";
import { barraDePaginas, itensDaPagina, linhasDaListaDeNoticias, NOTICIAS_POR_PAGINA, paginaValida, paginasDasNoticias, totalDePaginas } from "../src/lib/noticias";
import { resumoAutomatico, textoPuro } from "../src/lib/resumos";
import { criarSchemas, MIDIAS } from "../src/lib/schemas";
import { capitulosDaObra, extrasDoIdioma, itensDoIdioma, obraListada } from "../src/lib/visibilidade";

// ───────────── a referência do Python ─────────────

type Ref = Record<string, unknown>;
interface Captura {
  config: { show_extras: boolean; emissaries_hide: string[]; emissaries_show_texts: boolean; site_url: string };
  estado: Record<Lang, Estado>;
  paginas: Record<string, Pagina>;
  rss: Record<Lang, { titulo: string; link: string; data: string; descricao: string }[]>;
}
interface CartaoRef {
  titulo: string;
  titulo_dado: string | null;
  resumo: string;
  imagem: string | null;
  botao: Ref;
  previa: Ref | null;
  ordem: Record<string, string>;
  midia: string | null;
}
interface Estado {
  listadas: string[];
  universo: string[];
  outras: string[];
  destaques: string[];
  cartoes: Record<string, CartaoRef>;
  seletor: { direcoes: Record<string, string[]>; placeholder: string; rotulo_da_ordem: string; ordens: Ref[]; filtro: { rotulo: string; todos: string; midias: Ref[] } | null };
  atualizacoes: { date: string; url: string; title: string; kind: string; text: string; image: string; work: string | null }[];
  home_cartoes: Ref[];
  sobre: Ref | null;
  noticias: string[];
  universo_extra: string[];
  personagens: string[];
  emissarios: string[];
  emissarios_cartoes: Record<string, Ref>;
  relacionados: Record<string, Ref[]>;
}
interface Pagina {
  lang: Lang;
  titulo: string;
  cls: string;
  desc: string;
  imagem: string;
  noindex: boolean;
  alt: Record<string, string>;
  capitulo?: { h1: string; data: Ref | null; comentarios: string | null; formato: string; anterior: Ref | null; proximo: Ref | null; voltar: Ref | null };
  obra?: Ref;
  noticias?: Ref[];
  noticia?: { data: string; h1: string; tags: string[]; comentarios: string | null; anterior: Ref | null; proximo: Ref | null; voltar: Ref | null };
  universo?: { categoria: string; urls: string[] }[];
  personagem?: { aparece_em: Ref[] };
}
interface Referencia {
  python: string;
  langs: Lang[];
  tabelas: {
    tr: { v: unknown; lang: Lang; padrao: string; saida: string }[];
    fmt_date: { lang: Lang; d: string; saida: string }[];
    near: { a: string; b: string; saida: boolean }[];
    rss_data: { d: string; saida: string | null }[];
    excerpt: { nome: string; texto: string; limite: number; saida: string }[];
    plain: { nome: string; texto: string; saida: string }[];
    corte_do_titulo: {
      limite_padrao: number;
      inventados: { nome: string; texto: string; limite: number; saida: string }[];
      padrao: { nome: string; texto: string; saida: string }[];
      reais: Record<string, string>;
    };
    excerpt_real: Record<string, string>;
    plain_real: Record<string, { sha1: string; tamanho: number }>;
    midias: { rotulos: Record<Lang, Record<string, string>>; ui: Record<Lang, [string, string]> };
    redes: [string, string][];
  };
  real: { build: Captura; previa: Captura };
  cenarios: { nome: string; arquivos: Record<string, string>; config: Ref; build: Captura; previa: Captura }[];
}

const ref: Referencia = JSON.parse(readFileSync(new URL("./fixtures/regras-python.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("../content/", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/regras_ref.py` e depois `pnpm test` de novo.";

// ───────────── contagem: quantos casos de cada regra foram comparados ─────────────

const contagem = new Map<string, number>();
function igual(regra: string, atual: unknown, esperado: unknown, mensagem?: string): void {
  expect(atual, mensagem).toStrictEqual(esperado);
  contagem.set(regra, (contagem.get(regra) ?? 0) + 1);
}
afterAll(() => {
  const linhas = [...contagem].map(([regra, n]) => `  ${regra.padEnd(58)} ${String(n).padStart(6)}`);
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);
  console.log(`\nRegras do site — casos comparados com o Python (ou com o site.js):\n${linhas.join("\n")}\n  ${"TOTAL".padEnd(58)} ${String(total).padStart(6)}\n`);
});

// ═════════════════════════════ 1. tabelas: funções chamadas direto ═════════════════════════════

const tab = ref.tabelas;

describe("tr(): traduzíveis, inclusive os vazios (herdado da T09)", () => {
  test.each(tab.tr.map((c, i) => [i, c] as const))("caso %i", (_i, c) => {
    igual("tr() — texto traduzível", tr(c.v === null ? undefined : (c.v as Translatable), c.lang, c.padrao), c.saida, JSON.stringify([c.v, c.lang, c.padrao]));
  });

  test("passando pelo schema do work.json a ordem dos idiomas é a do arquivo ({\"pt\": …, \"en\": \"\"} começa por pt)", () => {
    const schemas = criarSchemas({ existe: () => true });
    for (const c of tab.tr) {
      const temChaveEstranha = typeof c.v === "object" && c.v !== null && Object.keys(c.v).some((k) => !langs.includes(k as Lang));
      if (temChaveEstranha) continue; // chave "es": o schema recusa de propósito
      const lido = schemas.works.parse({ ...(c.v === null ? {} : { title: c.v }), _origem: { slug: "x" } });
      igual("tr() — depois do schema do work.json", tr(lido.title, c.lang, c.padrao), c.saida, JSON.stringify([c.v, c.lang, c.padrao]));
    }
  });

  test("o schema recusa chave que não é idioma, com a mensagem de antes", () => {
    const schemas = criarSchemas({ existe: () => true });
    const r = schemas.works.safeParse({ title: { en: "A", es: "B" }, _origem: { slug: "x" } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toEqual(['tem de ser um texto ou {"en": "…", "pt": "…"}: só as chaves en e pt (veio "es").']);
    contagem.set("schema — chave de idioma desconhecida", 1);
  });
});

describe("datas", () => {
  test.each(tab.fmt_date.map((c, i) => [i, c] as const))("fmt_date caso %i", (_i, c) => {
    igual("formatarData() — fmt_date", formatarData(c.lang, c.d), c.saida, JSON.stringify([c.lang, c.d]));
  });
  test.each(tab.near.map((c, i) => [i, c] as const))("_near caso %i (janela de 3 dias)", (_i, c) => {
    igual("datasProximas() — _near", datasProximas(c.a, c.b), c.saida, JSON.stringify([c.a, c.b]));
  });
  test.each(tab.rss_data.map((c, i) => [i, c] as const))("data do RSS caso %i", (_i, c) => {
    igual("dataParaRss() — pubDate do RSS", dataParaRss(c.d) ?? null, c.saida, JSON.stringify(c.d));
  });
});

describe("resumos: excerpt() e plain()", () => {
  test.each(tab.excerpt.map((c, i) => [i, c] as const))("excerpt caso %i", (_i, c) => {
    igual("resumoAutomatico() — excerpt (inventados)", resumoAutomatico(c.texto, c.limite), c.saida, `${c.nome} limite ${c.limite}`);
  });
  test.each(tab.plain.map((c) => [c.nome, c] as const))("plain: %s", (_n, c) => {
    igual("textoPuro() — plain (inventados)", textoPuro(c.texto), c.saida, c.nome);
  });
  test(`todos os ${Object.keys(tab.excerpt_real).length} corpos de content/: excerpt e plain iguais`, () => {
    const nomes = Object.keys(tab.excerpt_real).sort();
    expect(Object.keys(tab.plain_real).sort(), REFAZER).toEqual(nomes);
    for (const nome of nomes) {
      const { body } = parseArquivo(join(RAIZ, nome));
      igual("resumoAutomatico() — excerpt (corpos reais)", resumoAutomatico(body), tab.excerpt_real[nome], nome);
      const puro = textoPuro(body);
      igual("textoPuro() — plain (corpos reais, sha1+tamanho)", { sha1: createHash("sha1").update(puro, "utf8").digest("hex"), tamanho: Array.from(puro).length }, tab.plain_real[nome], nome);
    }
  });
});

describe("corte dos títulos do pager: cortarTitulo() = clip_title() do build.py (pedido do autor, 16/10/2026)", () => {
  const c = tab.corte_do_titulo;
  test("o limite é o mesmo do Python (PAGER_TITLE_MAX)", () => {
    igual("cortarTitulo() — limite padrão", LIMITE_DO_TITULO_NO_PAGER, c.limite_padrao, REFAZER);
  });
  test.each(c.inventados.map((x, i) => [i, x] as const))("caso inventado %i", (_i, x) => {
    igual("cortarTitulo() — casos inventados × limites", cortarTitulo(x.texto, x.limite), x.saida, `${x.nome} limite ${x.limite}`);
  });
  test("com o limite do site, cabe em 40 caracteres (como o Python conta) e só termina em … se foi cortado", () => {
    for (const x of c.padrao) {
      const saida = cortarTitulo(x.texto);
      igual("cortarTitulo() — limite do site", saida, x.saida, x.nome);
      expect(Array.from(saida).length, x.nome).toBeLessThanOrEqual(LIMITE_DO_TITULO_NO_PAGER);
      if (Array.from(x.texto).length <= LIMITE_DO_TITULO_NO_PAGER) expect(saida, x.nome).toBe(x.texto);
      else expect(saida.endsWith("…"), x.nome).toBe(true);
    }
  });
  test("regras em palavras: curto fica igual, corta no fim de palavra, sem pontuação solta, versalete e emoji contam 1", () => {
    expect(cortarTitulo("Dia 27")).toBe("Dia 27");
    expect(cortarTitulo("a".repeat(40))).toBe("a".repeat(40));
    expect(cortarTitulo("Dia 28 desenhando uma criatura de Especulação Evolutiva de Hᴀᴛᴇ Cʏᴄʟᴇ todos os dias")).toBe("Dia 28 desenhando uma criatura de…");
    expect(cortarTitulo("Primeiro vídeo da HDVR, um teste, de verdade, mesmo")).toBe("Primeiro vídeo da HDVR, um teste, de…");
    expect(cortarTitulo("Hᴀᴛᴇ Cʏᴄʟᴇ ".repeat(3) + "Hᴀᴛᴇ")).toBe("Hᴀᴛᴇ Cʏᴄʟᴇ ".repeat(3) + "Hᴀᴛᴇ"); // 37 caracteres: cabe, fica igual
    expect(Array.from(cortarTitulo("😀".repeat(41))).length).toBe(40);
    expect(cortarTitulo("😀".repeat(41))).toBe("😀".repeat(39) + "…");
  });
  test(`todos os ${Object.keys(c.reais).length} títulos de content/ (notícias e capítulos, em/pt): mesmo corte do Python`, () => {
    const nomes = Object.keys(c.reais).sort();
    expect(nomes.length, REFAZER).toBeGreaterThan(80);
    for (const nome of nomes) {
      const { fm } = parseArquivo(join(RAIZ, nome));
      igual("cortarTitulo() — títulos reais de content/", cortarTitulo(String(fm["title"] ?? "")), c.reais[nome], nome);
    }
  });
});

describe("dados do seletor e das redes (tabelas do build.py)", () => {
  test("MEDIA_LABELS, MEDIA_UI e as chaves de MIDIAS dos schemas", () => {
    igual("MEDIA_LABELS (rótulos de mídia)", ROTULOS_DE_MIDIA, tab.midias.rotulos);
    igual("MEDIA_UI (textos do filtro de mídia)", Object.fromEntries(langs.map((l) => [l, [TEXTOS_DO_FILTRO_DE_MIDIA[l].rotulo, TEXTOS_DO_FILTRO_DE_MIDIA[l].todos]])), tab.midias.ui);
    for (const l of langs) igual("MEDIA_LABELS tem uma chave por MIDIAS do schema", Object.keys(ROTULOS_DE_MIDIA[l]).sort(), [...MIDIAS].sort());
  });
  test("NETWORKS (redes dos emissários), na mesma ordem", () => {
    igual("NETWORKS (redes dos emissários)", REDES.map((r) => [...r]), tab.redes);
  });
});

// ═════════════════════════════ 2. o estado do build(): conteúdo de verdade e cenários ═════════════════════════════

/** Lê uma pasta content/ com o MESMO leitor e os MESMOS schemas do site e devolve as entradas validadas. */
function carregar(raiz: string) {
  const schemas = criarSchemas(indiceDoDisco(raiz));
  const brutos = {
    news: lerItens(raiz, "news"),
    pages: lerItens(raiz, "pages"),
    emissaries: lerItens(raiz, "emissaries"),
    characters: lerItens(raiz, "characters"),
    universe: lerItens(raiz, "universe"),
    works: lerObras(raiz),
    chapters: lerCapitulos(raiz),
  };
  return {
    news: brutos.news.map((e) => ({ id: e.id, body: e.body, data: schemas.news.parse(e.data) })),
    pages: brutos.pages.map((e) => ({ id: e.id, body: e.body, data: schemas.pages.parse(e.data) })),
    emissaries: brutos.emissaries.map((e) => ({ id: e.id, body: e.body, data: schemas.emissaries.parse(e.data) })),
    characters: brutos.characters.map((e) => ({ id: e.id, body: e.body, data: schemas.characters.parse(e.data) })),
    universe: brutos.universe.map((e) => ({ id: e.id, body: e.body, data: schemas.universe.parse(e.data) })),
    works: brutos.works.map((e) => ({ id: e.id, data: schemas.works.parse(e.data) })),
    chapters: brutos.chapters.map((e) => ({ id: e.id, body: e.body, data: schemas.chapters.parse(e.data) })),
  };
}
type Conteudo = ReturnType<typeof carregar>;

interface Conjunto {
  nome: string;
  v: Conteudo;
  captura: Captura;
  comRascunhos: boolean;
}

const pastasTemporarias: string[] = [];
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-regras-teste-"));
  pastasTemporarias.push(raiz);
  for (const [caminho, texto] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, texto, "utf8"); // texto exato, como o script do Python gravou
  }
  return raiz;
}
afterAll(() => {
  for (const p of pastasTemporarias) rmSync(p, { recursive: true, force: true });
});

const real = carregar(RAIZ);
const conjuntos: Conjunto[] = [
  { nome: "conteúdo real · build", v: real, captura: ref.real.build, comRascunhos: false },
  { nome: "conteúdo real · prévia", v: real, captura: ref.real.previa, comRascunhos: true },
  ...ref.cenarios.flatMap((c) => {
    const v = carregar(pastaTemporaria(c.arquivos));
    return [
      { nome: `cenário ${c.nome} · build`, v, captura: c.build, comRascunhos: false },
      { nome: `cenário ${c.nome} · prévia`, v, captura: c.previa, comRascunhos: true },
    ];
  }),
];

// ───────────── o que as funções do Astro dizem, no formato da referência ─────────────

const slugsDe = (xs: readonly { data: { _origem: { slug: string } } }[]) => xs.map((x) => x.data._origem.slug);

/** O estado de um idioma, pela MESMA função que o site usa (src/lib/idioma.ts → dadosDoIdioma). */
function contextoDoIdioma(j: Conjunto, lang: Lang) {
  const cfg = j.captura.config;
  const d = dadosDoIdioma(j.v, lang, { comRascunhos: j.comRascunhos, mostrarExtras: cfg.show_extras, emissariosEscondidos: cfg.emissaries_hide, todosOsIdiomas: langs });
  return { ...d, v: j.v, cfg, capitulos: d.capitulosDe, lista: d.atualizacoes };
}

function cartaoParaRef(c: CartaoDaObra): CartaoRef {
  return {
    titulo: c.titulo,
    titulo_dado: c.titulo,
    resumo: c.resumo,
    imagem: c.imagem ? assetUrl(c.imagem) : null,
    botao: c.botao.tipo === "link" ? { tipo: "link", href: c.botao.href, externo: c.botao.externo, rotulo: c.botao.rotulo } : { tipo: "em-breve", rotulo: c.botao.rotulo },
    previa: c.previa,
    ordem: Object.fromEntries(Object.entries(c.ordem).map(([k, x]) => [k, x === "hide" ? "hide" : String(x)])),
    midia: c.midia ?? null,
  };
}

function atualizacaoParaRef(a: Atualizacao) {
  return { date: a.data, url: a.url, title: a.titulo, kind: a.tipo, text: a.texto, image: a.imagem, work: a.obra ?? null };
}

for (const j of conjuntos) {
  for (const lang of langs) {
    describe(`${j.nome} · ${lang}`, () => {
      const c = contextoDoIdioma(j, lang);
      const py = j.captura.estado[lang];

      test("obras: listadas, universo × outras (em ordem de lançamento) e destaques da home", () => {
        igual("separarObras() — listadas", c.obras.filter((o) => obraListada(o, lang, langs)).map((o) => o.data._origem.slug), py.listadas);
        igual("separarObras() — universo (ordem de lançamento)", slugsDe(c.universo), py.universo);
        igual("separarObras() — outras histórias", slugsDe(c.outras), py.outras);
        igual("destaquesDaHome() — as 5 obras do carrossel", slugsDe(destaquesDaHome(c.universo, lang, (o) => c.capitulos(o).listados)), py.destaques);
      });

      test("cartão de cada obra: título, resumo, imagem, botão (link, externo, em breve), prévia, valores de ordem, mídia", () => {
        expect(c.obras.map((o) => o.data._origem.slug).sort(), REFAZER).toEqual(Object.keys(py.cartoes).sort());
        for (const o of c.obras) {
          const slug = o.data._origem.slug;
          igual("cartaoDaObra() — card_work", cartaoParaRef(cartaoDaObra(o, lang, c.capitulos(o), j.comRascunhos)), py.cartoes[slug], slug);
        }
      });

      test("seletor de Histórias: ordens, direções, filtro de mídia", () => {
        const s = dadosDoSeletor(lang, c.universo);
        igual(
          "dadosDoSeletor() — sorter_html",
          {
            direcoes: Object.fromEntries(Object.entries(s.direcoes).map(([k, x]) => [k, [...x]])),
            placeholder: s.placeholderDaBusca,
            rotulo_da_ordem: s.rotuloDaOrdem,
            ordens: s.ordens,
            filtro: s.midias.length > 0 ? { rotulo: s.filtroDeMidia.rotulo, todos: s.filtroDeMidia.todos, midias: s.midias } : null,
          },
          py.seletor,
        );
      });

      test("Últimas atualizações: itens, fusão notícia+capítulo (3 dias), textos herdados, ordem", () => {
        igual("atualizacoes() — lista completa da home (fusão em 3 dias)", c.lista.map(atualizacaoParaRef), py.atualizacoes);
      });

      test("cartões da home: os 4 primeiros, com selo e data escritos", () => {
        const esperado = c.lista.slice(0, ATUALIZACOES_NA_HOME).map((a) => ({
          url: a.url,
          imagem: a.imagem ? assetUrl(a.imagem) : null,
          // T17n: o selo da notícia é "Post do blog"/"Blog post" no Astro (src/lib/textosDoBlog.ts); o Python mostra o do config.json
          rotulo: a.tipo === "tag_news" ? tDoConfig(lang, "tag_news") : rotuloDaAtualizacao(lang, a.tipo),
          data: formatarData(lang, a.data),
          titulo: a.titulo,
          texto: a.texto,
        }));
        igual("atualizacoes() — cartões da home (selo e data)", esperado, py.home_cartoes);
        expect(rotuloDaAtualizacao(lang, "tag_news")).toBe(TEXTOS_DO_BLOG[lang].tag_news);
        igual(
          "chamadaSobre() — chamada Sobre da home",
          c.sobre,
          py.sobre,
        );
      });

      test("RSS: itens, ordem, data no formato de e-mail", () => {
        const siteUrl = j.captura.config.site_url;
        const esperado = j.captura.rss[lang] ?? [];
        const atual = itensDoRss(c.lista).map((i) => ({ titulo: i.titulo, link: siteUrl + i.url, data: i.data, descricao: i.descricao }));
        igual("itensDoRss() — itens do RSS (30 primeiros, datas válidas)", atual, esperado);
      });

      test("notícias: ordem (mais nova primeiro), linhas da lista, resumo, texto de busca, páginas de 10", () => {
        igual("ordenarNoticias() — mais nova primeiro", slugsDe(c.noticias), py.noticias);
        const pagina = j.captura.paginas[`/${lang}/news/`];
        const linhas = linhasDaListaDeNoticias(c.noticias, lang).map((l) => ({
          escondida: l.escondidaNoInicio,
          busca: l.busca,
          data: l.data,
          titulo: l.titulo,
          miniatura: l.miniatura ? assetUrl(l.miniatura) : null,
          tags: l.tags,
          resumo: l.resumo,
          url: l.url,
        }));
        igual("linhasDaListaDeNoticias() — lista de notícias", linhas, pagina?.noticias ?? []);
      });

      test("emissários: ordem, escondidos, redes, foto ou inicial, texto", () => {
        igual("ordenarEmissarios() + emissariosDoIdioma() — ordem e escondidos", slugsDe(c.emissarios), py.emissarios);
        for (const e of c.emissarios) {
          const slug = e.data._origem.slug;
          const esperado = {
            titulo: e.data.title || slug,
            papel: e.data.role ?? "",
            foto: e.data.image ? assetUrl(e.data.image) : null,
            inicial: e.data.image ? null : inicialDoEmissario(e),
            redes: redesDoEmissario(e),
            mostra_texto: mostraTexto(e, j.captura.config.emissaries_show_texts),
          };
          igual("redesDoEmissario()/inicial/foto/texto — card_emissary", esperado, py.emissarios_cartoes[slug], slug);
        }
      });

      test("universo e personagens: ordem, grupos por categoria, 'Aparece em'", () => {
        igual("ordenarUniverso() — categoria, order, título", slugsDe(c.universoExtra), py.universo_extra);
        igual("ordenarPersonagens() — order, título", slugsDe(c.personagens), py.personagens);
        const paginaUniverso = j.captura.paginas[`/${lang}/universe/`];
        const grupos = agruparUniverso(c.universoExtra).map((g) => ({ categoria: g.categoria, urls: g.itens.map((i) => urlDoItem("universe", lang, i.data._origem.slug)) }));
        igual("agruparUniverso() — seções da página Universo", grupos, paginaUniverso?.universo ?? []);
        for (const p of c.personagens) {
          const slug = p.data._origem.slug;
          const feito = obrasEmQueAparece(p.data.appears_in, c.obras, lang, (o) => c.capitulos(o).listados);
          igual("obrasEmQueAparece() — 'Aparece em:'", feito.map((x) => ({ titulo: x.titulo, href: x.href })), j.captura.paginas[`/${lang}/characters/${slug}/`]?.personagem?.aparece_em, slug);
        }
      });

      test("relacionados ('Veja também'): só o que existe publicado no idioma", () => {
        const indice = c.indice;
        const atual: Record<string, Ref[]> = {};
        for (const [secao, itens] of [["news", c.noticias], ["universe", c.universoExtra], ["characters", c.personagens]] as const) {
          for (const it of itens) if ((it.data.related ?? []).length > 0) atual[`${secao}/${it.data._origem.slug}`] = relacionados(it.data.related, indice);
        }
        igual("relacionados() — related_html", atual, py.relacionados);
      });
    });
  }
}

// ───────────── as páginas: o que o build() entrega a cada uma ─────────────

for (const j of conjuntos) {
  describe(`${j.nome} · páginas`, () => {
    test("cada página de obra, de capítulo e de notícia: títulos, descrição, datas, anterior/próximo, comentários, formato; links de idioma de todas", () => {
      const esperado: Record<string, Ref> = {}; // url → o que o Astro diria
      const alt: Record<string, Alternativas> = {};
      const porIdioma = <T,>(f: (l: Lang) => T) => Object.fromEntries(langs.map((l) => [l, f(l)])) as Record<Lang, T>;
      const publicados = (s: "news" | "pages") => porIdioma((l) => itensDoIdioma(j.v[s], l, j.comRascunhos));
      const extras = (s: "universe" | "characters") => porIdioma((l) => extrasDoIdioma(j.v[s], l, j.comRascunhos, j.captura.config.show_extras));

      for (const [secao, lista] of [["news", publicados("news")], ["pages", publicados("pages")], ["universe", extras("universe")], ["characters", extras("characters")]] as const) {
        for (const l of langs) {
          for (const i of lista[l]) {
            if (secao === "pages" && "route" in i.data && i.data.route === false) continue; // sem página própria (ex.: content/pages/project)
            alt[urlDoItem(secao, l, i.data._origem.slug)] = alternativasDeItem(secao, i.data._origem.slug, lista);
          }
        }
      }
      for (const s of ["news", "universe", "characters"] as const) {
        const contagens = porIdioma((l) => (s === "news" ? publicados("news")[l].length : extras(s)[l].length));
        for (const l of langs) if (contagens[l] > 0) alt[`/${l}/${s}/`] = alternativasDaLista(s, contagens);
      }

      for (const l of langs) {
        const c = contextoDoIdioma(j, l);
        for (const p of paginasDasNoticias(c.noticias, l)) {
          esperado[p.url] = {
            titulo: p.titulo,
            desc: p.descricao,
            imagem: p.imagem,
            noticia: { data: p.data, h1: p.titulo, tags: p.tags, comentarios: p.idDosComentarios, anterior: p.anterior, proximo: p.proximo },
          };
        }
        for (const o of c.obras) {
          const slug = o.data._origem.slug;
          const caps = c.capitulos(o);
          const pagina = paginaDaObra(o, l, caps);
          const listadosPorIdioma = porIdioma((x) => capitulosDaObra(j.v.chapters, slug, x, j.comRascunhos).listados);
          if (pagina) {
            alt[`/${l}/works/${slug}/`] = alternativasDaObra(slug, listadosPorIdioma);
            esperado[`/${l}/works/${slug}/`] = {
              titulo: pagina.titulo,
              desc: pagina.descricao,
              imagem: pagina.capa,
              obra: {
                capa: pagina.capa ? assetUrl(pagina.capa) : null,
                titulo: pagina.titulo,
                resumo: pagina.descricao,
                primeiro: pagina.primeiro,
                ultimo: pagina.ultimo,
                titulo_da_lista: pagina.tituloDaLista,
                capitulos: pagina.capitulos.map((x) => ({ url: x.url, numero: x.numero, titulo: x.titulo, data: x.data })),
              },
            };
          }
          for (const p of paginasDosCapitulos(o, l, caps)) {
            alt[p.url] = alternativasDoCapitulo(slug, p.pasta, listadosPorIdioma);
            esperado[p.url] = {
              titulo: p.tituloDaPagina,
              desc: p.descricao,
              imagem: p.imagem,
              noindex: p.oculto,
              capitulo: { h1: p.tituloPrincipal, data: p.data, comentarios: p.idDosComentarios, formato: p.formato, anterior: p.anterior, proximo: p.proximo, voltar: p.voltar },
            };
          }
        }
      }

      // as páginas que o Python escreveu e o Astro conhece, e só elas
      const conhecidas = (url: string) => url in esperado || url in alt;
      const doPython = Object.keys(j.captura.paginas).filter((u) => !/^\/(en|pt)\/(works\/)?$/.test(u)); // home e Histórias: links fixos, sem regra
      expect(Object.keys({ ...esperado, ...alt }).sort(), REFAZER).toEqual(doPython.sort());

      for (const url of doPython) {
        const py = j.captura.paginas[url] as Pagina;
        expect(conhecidas(url)).toBe(true);
        igual("alternativas*() — links de idioma (hreflang)", alt[url] ?? {}, py.alt, url);
        const e = esperado[url];
        if (!e) continue;
        if (py.capitulo) {
          igual("paginasDosCapitulos() — título da aba, descrição, imagem, noindex", { titulo: e["titulo"], desc: e["desc"], imagem: e["imagem"], noindex: e["noindex"] }, { titulo: py.titulo, desc: py.desc, imagem: py.imagem, noindex: py.noindex }, url);
          igual("paginasDosCapitulos() — h1, data, anterior/próximo, voltar, comentários, formato", e["capitulo"], py.capitulo, url);
        } else if (py.obra) {
          igual("paginaDaObra() — lista de capítulos, primeiro/último, textos", { titulo: e["titulo"], desc: e["desc"], imagem: e["imagem"], obra: e["obra"] }, { titulo: py.titulo, desc: py.desc, imagem: py.imagem, obra: py.obra }, url);
        } else if (py.noticia) {
          const { voltar: _v, ...pyNoticia } = py.noticia;
          igual("paginasDasNoticias() — título, descrição, imagem, data, etiquetas, anterior/próximo, comentários", e, { titulo: py.titulo, desc: py.desc, imagem: py.imagem, noticia: pyNoticia }, url);
        }
      }
    });
  });
}

// ═════════════════════════════ 3. o static/site.js de verdade ═════════════════════════════
// O seletor de Histórias (bloco 1) e a paginação das notícias (bloco 6) são JavaScript do navegador, não Python: o teste
// executa o código do site.js, tal como está no arquivo, com elementos de mentira, e compara com as funções TypeScript.

const SITE_JS = readFileSync(new URL("../static/site.js", import.meta.url), "utf8");
function blocoDoSiteJs(inicio: string, fim: string | null): string {
  const i = SITE_JS.indexOf(inicio);
  const j = fim === null ? SITE_JS.length : SITE_JS.indexOf(fim);
  expect(i, `não achei "${inicio}" no site.js`).toBeGreaterThanOrEqual(0);
  expect(j).toBeGreaterThan(i);
  return SITE_JS.slice(i, j);
}

interface CartaoDeMentira {
  dataset: Record<string, string>;
  hidden: boolean;
  style: Record<string, string>;
  querySelector: () => Record<string, never>;
}

/** Executa o bloco 1 do site.js (ordenação das histórias) com o que a pessoa escolheu; devolve os títulos visíveis e ocultos, em ordem. */
function ordenarComSiteJs(cartoes: readonly (CartaoParaOrdenar & { slug: string })[], e: { modo: ModoDeOrdem; decrescente: boolean; midia: string; busca: string; lang: Lang }): { visiveis: string[]; ocultos: string[] } {
  const codigo = blocoDoSiteJs("/* 1) Ordenação das histórias", "/* 2) Carrossel");
  const elementos: CartaoDeMentira[] = cartoes.map((c) => {
    const dataset: Record<string, string> = { title: c.titulo, slug: c.slug };
    if (c.ordem.chrono !== undefined) dataset["chrono"] = String(c.ordem.chrono);
    if (c.ordem.release !== undefined) dataset["release"] = String(c.ordem.release);
    if (c.midia) dataset["media"] = c.midia;
    return { dataset, hidden: false, style: {}, querySelector: () => ({}) };
  });
  const anexados: CartaoDeMentira[] = [];
  const grade = { children: elementos, closest: () => null, appendChild: (x: CartaoDeMentira) => void anexados.push(x), scrollLeft: 0 };
  const sem = { addEventListener: () => undefined, setAttribute: () => undefined, dataset: {} as Record<string, string>, title: "", value: "" };
  const caixa = {
    dataset: { grid: "g", lang: e.lang, labels: JSON.stringify({ release: ["a", "b"], chrono: ["a", "b"], alpha: ["a", "b"] }) },
    querySelector: (sel: string) => {
      if (sel === "label:not(.media-filter) select") return { ...sem };
      if (sel === ".media-select") return { ...sem, value: e.midia };
      if (sel === ".sort-dir") return { ...sem };
      if (sel === ".story-search") return { ...sem, value: e.busca };
      return null;
    },
  };
  const sandbox = {
    hcSafe: (f: () => void) => f(),
    document: { querySelectorAll: (sel: string) => (sel === ".sorter" ? [caixa] : []), getElementById: () => grade },
    localStorage: { getItem: () => `${e.modo}:${e.decrescente ? "desc" : "asc"}`, setItem: () => undefined },
  };
  vm.runInNewContext(codigo, sandbox);
  const nome = (x: CartaoDeMentira) => x.dataset["slug"] ?? "";
  return { visiveis: anexados.filter((x) => !x.hidden).map(nome), ocultos: anexados.filter((x) => x.hidden).map(nome) };
}

/** Gerador de números sorteados com semente fixa (a prova é repetível). */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("seletor de Histórias: organizarCartoes() = bloco 1 do static/site.js", () => {
  const escolhas = (lang: Lang) =>
    MODOS_DE_ORDEM.flatMap((modo) => [false, true].flatMap((decrescente) => ["", "misc", "short-story", "live-ttrpg"].flatMap((midia) => ["", "pe", "  luz  ", "OS", "ví"].map((busca) => ({ modo, decrescente, midia, busca, lang })))));

  test("as obras de verdade (cartões na ordem de lançamento), todas as escolhas", () => {
    for (const lang of langs) {
      const c = contextoDoIdioma(conjuntos[0] as Conjunto, lang);
      const cartoes = c.universo.map((o) => cartaoDaObra(o, lang, c.capitulos(o), false));
      for (const e of escolhas(lang)) {
        const feito = organizarCartoes(cartoes, e);
        igual("organizarCartoes() — site.js (obras reais)", { visiveis: feito.visiveis.map((x) => x.slug), ocultos: feito.ocultos.map((x) => x.slug) }, ordenarComSiteJs(cartoes, e), JSON.stringify(e));
      }
    }
  });

  test("cartões sorteados: números repetidos, sem número, 'hide', títulos com acento, maiúsculas e pontuação", () => {
    const rnd = sorteio(2026);
    const titulos = ["Árvore", "arvore", "Zebra", "Éter", "Ossos do Ofício", "ossos de ofício", "O Pêndulo", "(Parênteses)", "Luz & Sangue", "luz e sangue", "A-B", "AB", "Ünder", "x", "10 vezes", "2 vezes", "Ça va", "çedilha", "ß", "ss"];
    const valor = () => {
      const r = rnd();
      return r < 0.15 ? undefined : r < 0.3 ? ("hide" as const) : Math.floor(rnd() * 6) + (rnd() < 0.3 ? 0.5 : 0);
    };
    for (let caso = 0; caso < 300; caso++) {
      const n = 1 + Math.floor(rnd() * 9);
      const cartoes = Array.from({ length: n }, (_, i) => {
        const ordem: { release?: number | "hide"; chrono?: number | "hide" } = {};
        const rel = valor();
        const cro = valor();
        if (rel !== undefined) ordem.release = rel;
        if (cro !== undefined) ordem.chrono = cro;
        const midias = [undefined, "misc", "short-story", "live-ttrpg"] as const;
        return { slug: `c${i}`, titulo: titulos[Math.floor(rnd() * titulos.length)] ?? "x", ordem, midia: midias[Math.floor(rnd() * midias.length)] };
      });
      const e = {
        modo: MODOS_DE_ORDEM[Math.floor(rnd() * 3)] ?? "release",
        decrescente: rnd() < 0.5,
        midia: ["", "", "misc", "short-story"][Math.floor(rnd() * 4)] ?? "",
        busca: ["", "", "a", "ar", "o  s", "LUZ", "éter", "zzz", "(", "10"][Math.floor(rnd() * 10)] ?? "",
        lang: langs[Math.floor(rnd() * langs.length)] ?? "pt",
      } satisfies Parameters<typeof ordenarComSiteJs>[1];
      const feito = organizarCartoes(cartoes, e);
      igual("organizarCartoes() — site.js (cartões sorteados)", { visiveis: feito.visiveis.map((x) => x.slug), ocultos: feito.ocultos.map((x) => x.slug) }, ordenarComSiteJs(cartoes, e), JSON.stringify([e, cartoes]));
    }
  });
});

interface ElementoDeMentira {
  tag: string;
  textContent: string;
  className: string;
  atributos: Record<string, string>;
}

/** Executa o bloco 6 do site.js (notícias: 10 por página + busca) e devolve as páginas escolhidas e a barra de páginas montada. */
function paginarComSiteJs(buscas: readonly string[], busca: string, paginaPedida: number | string): { visiveis: number[]; barra: string[]; nenhuma: boolean } {
  const codigo = blocoDoSiteJs("/* 6) Notícias: 10 por página", "/* Alternar entre posts incorporados");
  const itens = buscas.map((b) => ({ dataset: { search: b }, hidden: false }));
  let barra: ElementoDeMentira[] = [];
  const pag = {
    dataset: { per: String(NOTICIAS_POR_PAGINA), prev: "ANT", next: "PROX" },
    appendChild: (el: ElementoDeMentira) => void barra.push(el),
    set textContent(_v: string) {
      barra = []; // `pag.textContent = ""` esvazia a barra
    },
  };
  const lista = { querySelectorAll: () => itens, scrollIntoView: () => undefined };
  const nenhum = { hidden: false };
  const sandbox = {
    hcSafe: (f: () => void) => f(),
    document: {
      querySelector: (sel: string) => ({ ".news-list": lista, ".news-search": { value: busca, addEventListener: () => undefined }, ".pagination": pag, ".news-none": nenhum })[sel] ?? null,
      createElement: (tag: string): ElementoDeMentira & { addEventListener: () => void; setAttribute: (k: string, v: string) => void; href?: string } => {
        const el = { tag, textContent: "", className: "", atributos: {} as Record<string, string>, addEventListener: () => undefined, setAttribute: (k: string, v: string) => void (el.atributos[k] = v) };
        return el;
      },
    },
    location: { search: `?p=${paginaPedida}`, pathname: "/pt/news/" },
    history: { replaceState: () => undefined },
    window: { history: { replaceState: () => undefined } },
    URLSearchParams,
  };
  vm.runInNewContext(codigo, sandbox);
  const texto = (e: ElementoDeMentira) => (e.className === "pg-gap" ? "…" : e.textContent);
  return { visiveis: itens.flatMap((x, i) => (x.hidden ? [] : [i])), barra: barra.map((e) => `${texto(e)}${e.atributos["aria-current"] ? "*" : ""}`), nenhuma: nenhum.hidden === false };
}

describe("paginação das notícias: barraDePaginas()/itensDaPagina() = bloco 6 do static/site.js", () => {
  /** A barra como o site.js a escreve (o que fica escrito em cada botão). */
  const rotulos = (atual: number, total: number) =>
    barraDePaginas(atual, total).map((i) => (i.tipo === "anterior" ? "‹ ANT" : i.tipo === "proximo" ? "PROX ›" : i.tipo === "reticencias" ? "…" : `${i.pagina}${i.atual ? "*" : ""}`));
  const norm = normalizarBusca; // a mesma regra do site.js (com o versalete Unicode, T17k)

  test("de 0 a 120 notícias, várias páginas pedidas (inclusive fora do limite) e buscas", () => {
    const buscas = Array.from({ length: 120 }, (_, i) => `Notícia número ${i} ${i % 3 === 0 ? "Dragão" : "Outra coisa"} ${i % 7 === 0 ? "Ação" : ""} ${i % 5 === 0 ? "Hᴀᴛᴇ Cʏᴄʟᴇ" : ""}`);
    for (const total of [0, 1, 9, 10, 11, 20, 21, 55, 56, 100, 119, 120]) {
      for (const busca of ["", "dragao", "acao", "número 1", "zzz", "hate", "HATE cycle", "cycle ação"]) {
        for (const pedida of [1, 2, 3, 4, 6, 12, 0, -3, 999]) {
          const feitas = buscas.slice(0, total);
          const filtradas = feitas.map((b, i) => ({ b, i })).filter(({ b }) => norm(busca).split(/\s+/).filter(Boolean).every((p) => norm(b).includes(p)));
          const pagina = paginaValida(pedida, filtradas.length);
          const atual = {
            visiveis: itensDaPagina(filtradas, pagina).map((x) => x.i),
            barra: rotulos(pagina, totalDePaginas(filtradas.length)),
            nenhuma: filtradas.length === 0,
          };
          igual("itensDaPagina()/barraDePaginas() — site.js bloco 6", atual, paginarComSiteJs(feitas, busca, pedida), JSON.stringify({ total, busca, pedida }));
        }
      }
    }
  });

  test("?p= estranho (T17k): o site.js e paginaPedida() concordam, e valor que não é só dígitos = página 1", () => {
    const buscas = Array.from({ length: 35 }, (_, i) => `Notícia ${i}`);
    for (const pedido of ["2x", "x2", "2.5", "1e3", "+2", "abc", "", "-3", "0", "007", "3", "99"]) {
      const pagina = paginaValida(paginaPedida(`?p=${pedido}`), buscas.length);
      const esperado = itensDaPagina(buscas.map((_, i) => i), pagina);
      expect(paginarComSiteJs(buscas, "", pedido).visiveis, pedido).toEqual(esperado);
    }
    expect(paginarComSiteJs(buscas, "", "2x").visiveis).toEqual(paginarComSiteJs(buscas, "", 1).visiveis);
  });
});
