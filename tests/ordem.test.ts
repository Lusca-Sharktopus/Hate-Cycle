// Prova do bloco "estou lendo/assistindo/jogando em ordem…" (T17c) do fim de cada capítulo: quem vem antes e quem vem depois, na ordem
// cronológica e na de lançamento, só entre as histórias que existem no site NAQUELE modo (publicado × prévia com rascunhos).
//
// O bloco só existe no Astro (o build.py não o tem), então não há referência do Python para ele: o que se prova aqui é
//   1. as regras (src/lib/ordemDeLeitura.ts), em SITES INVENTADOS recriados numa pasta temporária e lidos pelo MESMO carregador e pelas
//      MESMAS regras do site — o exemplo do PDF do autor (Pederneira em cronológica → anterior Luz & Sangue, seguinte Beira de Estrada,
//      este só na prévia), uma história nova "entre" duas, as pontas, `chrono: false`, empates, "999", idioma, obra de rascunho,
//      obra externa, obra sem nada para abrir, verbo por tipo, arte própria × capa;
//   2. o mesmo lugar do cartão: o destino de cada lado é o botão do cartão da obra em Histórias (no conteúdo de verdade, nos dois modos);
//   3. o componente (Container API): as duas ordens no HTML, a outra escondida, o seletor desligado sem JavaScript, textos e links;
//   4. a exceção de paridade (tests/ajudantes/html.ts → semBlocoDeOrdem) tira SÓ o bloco: sem ele a página do Leitor é a mesma de antes.
// O script do navegador está em tests/ordem-dom.test.ts; as páginas reais construídas, no fim de tests/paginas.test.ts.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import Leitor from "../src/components/Leitor.astro";
import ProximaHistoria from "../src/components/ProximaHistoria.astro";
import { langs, type Lang } from "../src/lib/config";
import { dadosDoIdioma } from "../src/lib/idioma";
import { leiturasDaObra } from "../src/lib/leitura";
import { cartaoDaObra } from "../src/lib/obras";
import { arteDaObra, blocoDaOrdem, ladoDaObra, ORDEM_PADRAO, ORDENS_DE_LEITURA, sequenciaDaOrdem, TEXTOS_DA_ORDEM, verboDaObra, type BlocoDaOrdem } from "../src/lib/ordemDeLeitura";
import { finalizarMain } from "../src/lib/pagina";
import { arquivosDoGlob } from "../src/lib/quadrinhos";
import { carregarConteudo } from "./ajudantes/conteudo";
import { canonicoDoMiolo, semBlocoDeOrdem } from "./ajudantes/html";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// ───────────── sites inventados ─────────────

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-ordem-teste-"));
  pastas.push(raiz);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return raiz;
}

const wj = (o: Record<string, unknown>) => JSON.stringify(o, null, 2) + "\n";
const cap = (obra: string, pasta = "01", fm = "date: 2026-01-01") => ({
  [`works/${obra}/${pasta}/en.md`]: `---\n${fm}\n---\n\nText.\n`,
  [`works/${obra}/${pasta}/pt.md`]: `---\n${fm}\n---\n\nTexto.\n`,
});

/**
 * O site do PDF do autor, em miniatura (os mesmos números de ordem do work.json de verdade):
 *   lançamento: hdvr 1 (externa, fora da cronológica) · firestriker 2 · light-and-blood 3 · roadside 5 (rascunho) · pendulum 6 (rascunho, sem capítulo)
 *   cronológica: light-and-blood 5 · firestriker 6 · roadside 7 · pendulum 11
 */
function sitePdf(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "works/hdvr/work.json": wj({ kind: "video", title: { en: "Hello? Di Vario Residency", pt: "Alô? Residência dos Di Vario" }, external: "https://www.youtube.com/@ResidenciaDosDiVario", order: { release: 1, chrono: false }, media: "misc", cover: "covers/hdvr.png" }),
    "works/firestriker/work.json": wj({ kind: "prose", oneshot: true, title: { en: "Firestriker", pt: "Pederneira" }, order: { release: 2, chrono: 6 }, media: "short-story", cover: "covers/fs.png" }),
    ...cap("firestriker"),
    "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_images: ["ordem/lb-1.png", "ordem/lb-2.png"] }),
    ...cap("light-and-blood", "01"),
    ...cap("light-and-blood", "02", "date: 2026-02-01"),
    "works/roadside/work.json": wj({ kind: "comic", oneshot: true, draft: true, title: { en: "Roadside", pt: "Beira de Estrada" }, order: { release: 5, chrono: 7 }, media: "webcomic", order_images: ["ordem/rs-1.png", "ordem/rs-2.png"] }),
    ...cap("roadside"),
    "works/the-pendulum/work.json": wj({ kind: "film", oneshot: true, draft: true, title: { en: "The Pendulum", pt: "O Pêndulo" }, order: { release: 6, chrono: 11 }, media: "short-film", cover: "covers/pd.png" }),
    ...extra,
  };
}

function ler(arquivos: Record<string, string>, comRascunhos: boolean) {
  const raiz = pastaTemporaria(arquivos);
  const entradas = carregarConteudo(raiz, { comRascunhos, mostrarExtras: false });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos, mostrarExtras: false, emissariosEscondidos: [], todosOsIdiomas: langs });
  const dados = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  /** O bloco do fim dos capítulos da obra `slug`. */
  const bloco = (slug: string, lang: Lang): BlocoDaOrdem => {
    const d = dados[lang];
    const obra = d.obras.find((o) => o.data._origem.slug === slug);
    if (!obra) throw new Error(`a obra ${slug} não está no site (${comRascunhos ? "prévia" : "publicado"})`);
    return blocoDaOrdem(obra, lang, d.universo, d.capitulosDe, comRascunhos);
  };
  return { entradas, dados, bloco };
}

/** Quem vem antes e depois, como texto: "anterior ← obra → proximo" (null = lado vazio). */
function vizinhos(b: BlocoDaOrdem, ordem: "chrono" | "release") {
  const l = b.listas[ordem];
  return { anterior: l.anterior?.slug ?? null, proximo: l.proximo?.slug ?? null, fora: l.foraDaOrdem };
}

describe("o exemplo do PDF do autor: Pederneira", () => {
  test("site publicado: só Alô?, Pederneira e Luz & Sangue existem", () => {
    const { dados, bloco } = ler(sitePdf(), false);
    expect(dados.pt.universo.map((o) => o.data._origem.slug)).toEqual(["hdvr", "firestriker", "light-and-blood"]);
    // cronológica: Luz & Sangue (5) → Pederneira (6) → ninguém (Beira de Estrada é rascunho)
    expect(vizinhos(bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
    // lançamento: Alô? (1) → Pederneira (2) → Luz & Sangue (3)
    expect(vizinhos(bloco("firestriker", "pt"), "release")).toEqual({ anterior: "hdvr", proximo: "light-and-blood", fora: false });
  });

  test("prévia com rascunhos: Beira de Estrada aparece depois da Pederneira (cronológica); O Pêndulo depois dela", () => {
    const { bloco } = ler(sitePdf(), true);
    expect(vizinhos(bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: "roadside", fora: false });
    expect(vizinhos(bloco("roadside", "pt"), "chrono")).toEqual({ anterior: "firestriker", proximo: "the-pendulum", fora: false });
    // lançamento: Pederneira (2) → Luz & Sangue (3); Luz & Sangue → Beira de Estrada (5) → O Pêndulo (6)
    expect(vizinhos(bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: "roadside", fora: false });
    expect(vizinhos(bloco("roadside", "pt"), "release")).toEqual({ anterior: "light-and-blood", proximo: "the-pendulum", fora: false });
  });

  test("nas pontas: o lado de fora fica vazio (primeira da ordem sem anterior, última sem seguinte)", () => {
    const pub = ler(sitePdf(), false);
    expect(vizinhos(pub.bloco("light-and-blood", "pt"), "chrono").anterior).toBeNull(); // a primeira da cronológica publicada
    expect(vizinhos(pub.bloco("light-and-blood", "pt"), "release").proximo).toBeNull(); // a última do lançamento publicado
    const pre = ler(sitePdf(), true);
    expect(vizinhos(pre.bloco("roadside", "pt"), "chrono").proximo).toBe("the-pendulum");
    expect(vizinhos(pre.bloco("light-and-blood", "pt"), "chrono").anterior).toBeNull();
  });

  test("o título e o verbo de cada lado seguem o tipo da obra de DESTINO; o título de cima, o da obra ATUAL", () => {
    const { bloco } = ler(sitePdf(), true);
    const ped = bloco("firestriker", "pt");
    expect(ped.titulo).toBe("estou lendo em ordem");
    expect(ped.listas.chrono.anterior?.rotulo).toBe("Assistir Light & Blood"); // Luz & Sangue é vídeo
    // Beira de Estrada é rascunho SEM capítulo ainda… neste site inventado ela tem capítulo: "Ler"
    expect(ped.listas.chrono.proximo?.rotulo).toBe("Ler Beira de Estrada");
    expect(bloco("light-and-blood", "pt").titulo).toBe("estou assistindo em ordem");
    expect(bloco("firestriker", "en").listas.chrono.proximo?.rotulo).toBe("Read Roadside");
    expect(bloco("firestriker", "en").titulo).toBe("I’m reading in");
    expect(bloco("light-and-blood", "en").titulo).toBe("I’m watching in");
  });
});

describe("a história nova 'entre' duas: os vizinhos se ajustam sozinhos", () => {
  // O Golfinho Que Nasceu Sem Tentáculos: depois de Beira de Estrada, antes de O Pêndulo (nas duas ordens)
  const golfinho = (publicado: boolean) => ({
    "works/golfinho/work.json": wj({ kind: "prose", oneshot: true, title: "O Golfinho Que Nasceu Sem Tentáculos", order: { release: 5.5, chrono: 8 }, media: "short-story", ...(publicado ? {} : { draft: true }) }),
    ...cap("golfinho"),
  });
  test("publicado na prévia: Beira de Estrada → Golfinho → O Pêndulo", () => {
    const { bloco } = ler(sitePdf(golfinho(true)), true);
    expect(vizinhos(bloco("roadside", "pt"), "chrono").proximo).toBe("golfinho");
    expect(vizinhos(bloco("the-pendulum", "pt"), "chrono").anterior).toBe("golfinho");
    expect(vizinhos(bloco("golfinho", "pt"), "release")).toEqual({ anterior: "roadside", proximo: "the-pendulum", fora: false });
  });
  test("a história nova como rascunho e o site publicado: nada muda para quem já estava", () => {
    const antes = ler(sitePdf(), false).bloco("firestriker", "pt");
    const depois = ler(sitePdf(golfinho(false)), false).bloco("firestriker", "pt");
    expect(depois.listas).toEqual(antes.listas);
  });
  test("a história nova PUBLICADA no site publicado entra na sequência dos vizinhos (e só ela)", () => {
    // sem os rascunhos de Beira de Estrada e O Pêndulo: Luz & Sangue (5) → Pederneira (6) → Golfinho (8)
    const { bloco } = ler(sitePdf(golfinho(true)), false);
    expect(vizinhos(bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: "golfinho", fora: false });
    expect(vizinhos(bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: "golfinho", fora: false });
  });
});

describe("as regras de ordem são as do seletor de Histórias", () => {
  test("`chrono: false` fica fora da cronológica e dentro da de lançamento; a página dela explica", () => {
    const arquivos = {
      "works/a-fora/work.json": wj({ kind: "prose", title: "A Fora", order: { release: 1, chrono: false } }),
      ...cap("a-fora"),
      "works/b-dentro/work.json": wj({ kind: "prose", title: "B Dentro", order: { release: 2, chrono: 1 } }),
      ...cap("b-dentro"),
    };
    const { bloco, dados } = ler(arquivos, false);
    expect(sequenciaDaOrdem(dados.pt.universo, "chrono", "pt").map((o) => o.data._origem.slug)).toEqual(["b-dentro"]);
    expect(vizinhos(bloco("a-fora", "pt"), "chrono")).toEqual({ anterior: null, proximo: null, fora: true });
    expect(vizinhos(bloco("a-fora", "pt"), "release")).toEqual({ anterior: null, proximo: "b-dentro", fora: false });
    expect(vizinhos(bloco("b-dentro", "pt"), "release")).toEqual({ anterior: "a-fora", proximo: null, fora: false });
    expect(bloco("a-fora", "pt").avisosDeForaDaOrdem.chrono).toBe("Esta história fica fora da ordem cronológica.");
    expect(bloco("a-fora", "en").avisosDeForaDaOrdem.chrono).toBe("This story sits outside the chronological order.");
  });

  test("obra sem número naquela ordem vai depois das numeradas; o 999 e os empates seguem a ordem de lançamento e das pastas", () => {
    const arquivos = {
      "works/a-sem-chrono/work.json": wj({ kind: "prose", title: "A", order: { release: 1 } }),
      ...cap("a-sem-chrono"),
      "works/b-empate/work.json": wj({ kind: "prose", title: "B", order: { release: 2, chrono: 5 } }),
      ...cap("b-empate"),
      "works/c-empate/work.json": wj({ kind: "prose", title: "C", order: { release: 3, chrono: 5 } }),
      ...cap("c-empate"),
      "works/d-sem-release/work.json": wj({ kind: "prose", title: "D", order: { chrono: 1 } }),
      ...cap("d-sem-release"),
      "works/e-sem-nada/work.json": wj({ kind: "prose", title: "E" }),
      ...cap("e-sem-nada"),
    };
    const { dados } = ler(arquivos, false);
    const seq = (o: "chrono" | "release") => sequenciaDaOrdem(dados.pt.universo, o, "pt").map((x) => x.data._origem.slug);
    // lançamento: 1, 2, 3 e depois os sem número (999 na grade), na ordem das pastas
    expect(seq("release")).toEqual(["a-sem-chrono", "b-empate", "c-empate", "d-sem-release", "e-sem-nada"]);
    // cronológica: 1 (d), empate 5 (b antes de c, por vir antes na lista de lançamento) e, no fim, os sem número (a, e)
    expect(seq("chrono")).toEqual(["d-sem-release", "b-empate", "c-empate", "a-sem-chrono", "e-sem-nada"]);
  });

  test("a sequência é a MESMA que a grade de Histórias mostra ao ordenar (organizarCartoes) — o site de verdade, nos dois modos", () => {
    for (const comRascunhos of [false, true]) {
      const { dados } = ler(Object.fromEntries(realContent()), comRascunhos);
      for (const lang of langs) {
        for (const ordem of ORDENS_DE_LEITURA) {
          const doBloco = sequenciaDaOrdem(dados[lang].universo, ordem, lang).map((o) => o.data._origem.slug);
          // a lista que a grade mostra, ordenada por aquela ordem: universo na ordem de lançamento, os `false` fora, os sem número no fim
          const num = (o: (typeof dados)[Lang]["universo"][number]) => o.data.order?.[ordem];
          const esperado = dados[lang].universo
            .filter((o) => num(o) !== false)
            .map((o, i) => ({ o, i }))
            .sort((a, b) => (num(a.o) === undefined) !== (num(b.o) === undefined) ? (num(a.o) === undefined ? 1 : -1) : Number(num(a.o) ?? 0) - Number(num(b.o) ?? 0) || a.i - b.i)
            .map((x) => x.o.data._origem.slug);
          expect(doBloco, `${comRascunhos ? "prévia" : "publicado"} ${lang} ${ordem}`).toEqual(esperado);
        }
      }
    }
  });

  test("idioma: obra com `langs` restrito só conta nesse idioma", () => {
    const arquivos = {
      "works/a/work.json": wj({ kind: "prose", title: "A", order: { release: 1, chrono: 1 } }),
      ...cap("a"),
      "works/b-so-pt/work.json": wj({ kind: "prose", title: "B Só PT", langs: ["pt"], order: { release: 2, chrono: 2 } }),
      ...cap("b-so-pt"),
      "works/c/work.json": wj({ kind: "prose", title: "C", order: { release: 3, chrono: 3 } }),
      ...cap("c"),
    };
    const { bloco } = ler(arquivos, false);
    expect(vizinhos(bloco("c", "pt"), "chrono").anterior).toBe("b-so-pt");
    expect(vizinhos(bloco("c", "en"), "chrono").anterior).toBe("a");
  });

  test("uma obra `listed: false` com capítulos fica fora das duas ordens", () => {
    const arquivos = {
      "works/a/work.json": wj({ kind: "prose", title: "A", order: { release: 1, chrono: 1 } }),
      ...cap("a"),
      "works/b-escondida/work.json": wj({ kind: "prose", title: "B", listed: false, order: { release: 2, chrono: 2 } }),
      ...cap("b-escondida"),
    };
    const { bloco } = ler(arquivos, false);
    expect(vizinhos(bloco("a", "pt"), "release").proximo).toBeNull();
    expect(vizinhos(bloco("b-escondida", "pt"), "release")).toEqual({ anterior: null, proximo: null, fora: true });
  });
});

describe("o destino de cada lado é o do cartão da obra em Histórias", () => {
  test("link externo (HDVR), capítulo de obra de capítulo único, página da obra e 'em breve'", () => {
    const { dados } = ler(sitePdf(), true);
    const lado = (slug: string, lang: Lang = "pt") => {
      const d = dados[lang];
      const o = d.obras.find((x) => x.data._origem.slug === slug);
      if (!o) throw new Error(slug);
      return ladoDaObra(o, lang, d.capitulosDe(o), true);
    };
    expect(lado("hdvr").destino).toEqual({ tipo: "link", href: "https://www.youtube.com/@ResidenciaDosDiVario", externo: true });
    expect(lado("firestriker").destino).toEqual({ tipo: "link", href: "/pt/works/firestriker/01/", externo: false }); // oneshot → o capítulo
    expect(lado("light-and-blood").destino).toEqual({ tipo: "link", href: "/pt/works/light-and-blood/", externo: false }); // seriada → a página da obra
    expect(lado("the-pendulum").destino).toEqual({ tipo: "em-breve" });
    expect(lado("the-pendulum").rotulo).toBe("Em breve: O Pêndulo");
    expect(lado("the-pendulum", "en").rotulo).toBe("Coming soon: The Pendulum");
  });

  test("para TODA obra do conteúdo de verdade, nos dois modos e idiomas: o destino é o botão do cartão", () => {
    for (const comRascunhos of [false, true]) {
      const { dados } = ler(Object.fromEntries(realContent()), comRascunhos);
      for (const lang of langs) {
        const d = dados[lang];
        for (const o of d.universo) {
          const botao = cartaoDaObra(o, lang, d.capitulosDe(o), comRascunhos).botao;
          const destino = ladoDaObra(o, lang, d.capitulosDe(o), comRascunhos).destino;
          expect(destino, `${o.data._origem.slug} ${lang}`).toEqual(botao.tipo === "link" ? { tipo: "link", href: botao.href, externo: botao.externo } : { tipo: "em-breve" });
        }
      }
    }
  });
});

describe("o verbo e a arte de cada obra", () => {
  const o = (kind: string | undefined, media: string | undefined) => ({ data: { kind, media, _origem: { slug: "x" } } }) as Parameters<typeof verboDaObra>[0];
  test("ler = prosa e quadrinho; assistir = vídeo, filme, curta, animação e RPG ao vivo; jogar = videogame", () => {
    expect(verboDaObra(o("prose", "short-story"))).toBe("read");
    expect(verboDaObra(o("comic", "webcomic"))).toBe("read");
    expect(verboDaObra(o(undefined, undefined))).toBe("read");
    expect(verboDaObra(o("video", "misc"))).toBe("watch");
    expect(verboDaObra(o("video", "live-ttrpg"))).toBe("watch");
    expect(verboDaObra(o("film", "short-film"))).toBe("watch");
    expect(verboDaObra(o("prose", "live-ttrpg"))).toBe("watch");
    expect(verboDaObra(o("prose", "animated-show"))).toBe("watch");
    expect(verboDaObra(o("prose", "videogame"))).toBe("play");
    expect(verboDaObra(o("video", "videogame"))).toBe("play");
    expect(verboDaObra(o(undefined, "videogame"))).toBe("play");
  });
  test("o título de cima muda com o tipo: estou lendo / assistindo / jogando", () => {
    expect(TEXTOS_DA_ORDEM.pt.titulo).toEqual({ read: "estou lendo em ordem", watch: "estou assistindo em ordem", play: "estou jogando em ordem" });
    expect(TEXTOS_DA_ORDEM.pt.verbo).toEqual({ read: "Ler", watch: "Assistir", play: "Jogar" });
    expect(Object.keys(TEXTOS_DA_ORDEM.en.titulo)).toEqual(Object.keys(TEXTOS_DA_ORDEM.pt.titulo));
  });
  test("arte própria (order_images) ou, sem ela, a capa — e sem capa, a logo; sem nada, null", () => {
    const { dados } = ler(sitePdf({ "works/so-logo/work.json": wj({ kind: "prose", title: "So Logo", logo: "logos/x.png", order: { release: 9 } }), "works/nada/work.json": wj({ kind: "prose", title: "Nada", order: { release: 10 } }) }), true);
    const arte = (slug: string) => arteDaObra(dados.pt.obras.find((x) => x.data._origem.slug === slug)!, "pt");
    expect(arte("light-and-blood")).toEqual({ principal: "ordem/lb-1.png", hover: "ordem/lb-2.png", ehCapa: false });
    expect(arte("firestriker")).toEqual({ principal: "covers/fs.png", hover: null, ehCapa: true });
    expect(arte("so-logo")).toEqual({ principal: "logos/x.png", hover: null, ehCapa: true });
    expect(arte("nada")).toBeNull();
  });
  test("order_images com uma imagem só: sem a de mouse por cima; com três: erro no build", () => {
    const um = ler(sitePdf({ "works/um/work.json": wj({ kind: "prose", title: "Um", order_images: ["ordem/um-1.png"] }) }), true);
    expect(arteDaObra(um.dados.pt.obras.find((x) => x.data._origem.slug === "um")!, "pt")).toEqual({ principal: "ordem/um-1.png", hover: null, ehCapa: false });
    expect(() => ler(sitePdf({ "works/tres/work.json": wj({ kind: "prose", title: "Tres", order_images: ["a.png", "b.png", "c.png"] }) }), true)).toThrow(/no máximo 2 imagens/);
  });
});

// ───────────── o componente ─────────────

const container = await AstroContainer.create();

describe("o componente ProximaHistoria", () => {
  const { bloco } = ler(sitePdf(), false);
  const b = bloco("firestriker", "pt");
  test("as duas ordens estão no HTML (a padrão visível, a outra `hidden`) e o seletor vem desligado (sem JavaScript ele não funcionaria)", async () => {
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: b } });
    expect(html).toContain('data-story-order data-ordem="chrono"');
    expect(html).toMatch(/<div class="so-order" data-ordem="chrono">/);
    expect(html).toMatch(/<div class="so-order" data-ordem="release" hidden>/);
    expect(html).toMatch(/<select class="so-select" aria-labelledby="story-order-title" disabled>/);
    expect(html).toContain('<option value="chrono" selected>Cronológica</option><option value="release">Lançamento</option>');
    expect(html).toContain('<span class="so-valor" aria-hidden="true">Cronológica</span>');
    expect(html).toContain(">estou lendo em ordem</p>");
    // cronológica: só o anterior (Light & Blood), com link para a página da obra e arte própria (as duas imagens, alt vazio)
    const cronologica = /<div class="so-order" data-ordem="chrono">([\s\S]*?)<\/div><div class="so-order"/.exec(html)?.[1] ?? "";
    expect(cronologica).toContain('<a class="so-side prev" href="/pt/works/light-and-blood/">');
    expect(cronologica).not.toContain("so-side next");
    expect(cronologica).toContain('src="/ordem/lb-1.png"');
    expect(cronologica).toContain('src="/ordem/lb-2.png"');
    expect(cronologica.match(/ alt=""/g)).toHaveLength(2);
    expect(cronologica).toContain("Assistir Light &amp; Blood");
    // lançamento: Alô? (link externo, em outra aba; arte = capa) e Light & Blood
    const lancamento = /<div class="so-order" data-ordem="release" hidden>([\s\S]*?)<\/div><\/section>/.exec(html)?.[1] ?? "";
    expect(lancamento).toContain('href="https://www.youtube.com/@ResidenciaDosDiVario" target="_blank" rel="noopener noreferrer"');
    expect(lancamento).toContain("so-side prev is-cover");
    expect(lancamento).toContain("so-side next");
  });

  test("um lado sem nada para abrir (Em breve) não é link; obra fora da ordem mostra o aviso", async () => {
    const pre = ler(sitePdf(), true);
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: pre.bloco("roadside", "pt") } });
    expect(html).toContain('<div class="so-side next is-cover so-soon">');
    expect(html).toContain("Em breve: O Pêndulo");
    const fora = ler({ "works/a-fora/work.json": wj({ kind: "prose", title: "A Fora", order: { release: 1, chrono: false } }), ...cap("a-fora") }, false);
    const html2 = await container.renderToString(ProximaHistoria, { props: { bloco: fora.bloco("a-fora", "pt") } });
    expect(html2).toContain('<p class="so-note">Esta história fica fora da ordem cronológica.</p>');
  });

  test("o título de uma obra com '<' ou '&' sai escapado (nada vira HTML)", async () => {
    const ataque = ler({ ...sitePdf(), "works/x-ataque/work.json": wj({ kind: "prose", title: '<img src=x onerror="alert(1)"> & Cia', order: { release: 4, chrono: 6.5 } }), ...cap("x-ataque") }, false);
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: ataque.bloco("firestriker", "pt") } });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("a exceção de paridade tira só o bloco (semBlocoDeOrdem)", () => {
  const { dados, bloco } = ler(sitePdf(), false);
  const obra = dados.pt.obras.find((o) => o.data._origem.slug === "light-and-blood")!;
  const ferramentas = { glob: (p: string) => arquivosDoGlob(RAIZ, p), comentarios: () => null };
  const caps = Object.fromEntries(langs.map((l) => [l, dados[l].capitulosDe(dados[l].obras.find((o) => o.data._origem.slug === "light-and-blood")!)])) as unknown as Parameters<typeof leiturasDaObra>[2];
  const leitura = leiturasDaObra(obra, "pt", caps, ferramentas)[0]!;

  test("a página do Leitor COM o bloco, sem ele, é a mesma do Leitor SEM o bloco (e o bloco sai inteiro, uma vez)", async () => {
    const sem = finalizarMain(await container.renderToString(Leitor, { props: { leitura } }), "pt");
    const com = finalizarMain(await container.renderToString(Leitor, { props: { leitura, ordem: bloco("light-and-blood", "pt") } }), "pt");
    expect(com.html).toContain("data-story-order");
    expect(sem.html).not.toContain("data-story-order");
    const tirado = semBlocoDeOrdem(com.html);
    expect(tirado.removidos).toHaveLength(1);
    expect(tirado.removidos[0]).toMatch(/^<section class="reader-box paper story-order" data-story-order[\s\S]*<\/section>$/);
    expect(canonicoDoMiolo(tirado.html)).toBe(canonicoDoMiolo(sem.html));
    // o script do bloco vai para o fim da página (fora do <main>), como os dos outros componentes
    expect(com.scripts).toMatch(/ProximaHistoria\.astro/);
    expect(sem.scripts).not.toMatch(/ProximaHistoria\.astro/);
  });

  test("o que a exceção remove não tem comentários, script, texto do autor nem a caixa do capítulo", async () => {
    const com = finalizarMain(await container.renderToString(Leitor, { props: { leitura, ordem: bloco("light-and-blood", "pt") } }), "pt");
    const [removido = ""] = semBlocoDeOrdem(com.html).removidos;
    expect(removido).not.toMatch(/data-page|hc-comments|<script|reader-box paper slim|video-wrapper|<iframe|class="pager"/);
    // e só tem classes e elementos do bloco
    const classes = new Set([...removido.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? "").split(/\s+/)));
    for (const c of classes) expect(c, `classe fora do bloco: ${c}`).toMatch(/^(reader-box|paper|story-order|so-[a-z0-9-]+|prev|next|is-cover)$/);
  });

  test("sem bloco, nada é removido; com dois, saem os dois (a exceção não esconde um bloco repetido por engano: o teste das páginas exige exatamente 1)", () => {
    expect(semBlocoDeOrdem("<main><p>oi</p></main>").removidos).toEqual([]);
    const dois = '<main><section data-story-order>a</section><p>x</p><section data-story-order>b</section></main>';
    expect(semBlocoDeOrdem(dois).removidos).toHaveLength(2);
    expect(semBlocoDeOrdem(dois).html).toBe("<main><p>x</p></main>");
    // outra <section> (ou um elemento que não é section) com o mesmo atributo NÃO sai
    expect(semBlocoDeOrdem('<main><div data-story-order>a</div><section class="x">b</section></main>').removidos).toEqual([]);
  });
});

/** O content/ de verdade, como { caminho relativo → texto } (só o que o carregador lê: work.json e .md). */
function realContent(): [string, string][] {
  const achados: [string, string][] = [];
  const andar = (dir: string, rel: string) => {
    for (const nome of readdirSyncOrdenado(dir)) {
      const caminho = join(dir, nome);
      const r = rel ? `${rel}/${nome}` : nome;
      if (isDir(caminho)) andar(caminho, r);
      else if (/\.(md|json|html)$/.test(nome)) achados.push([r, readFileSync(caminho, "utf8")]);
    }
  };
  andar(join(RAIZ, "content"), "");
  return achados;
}
import { readdirSync, statSync } from "node:fs";
function readdirSyncOrdenado(dir: string): string[] {
  return readdirSync(dir).sort();
}
function isDir(p: string): boolean {
  return statSync(p).isDirectory();
}

// a ordem padrão e as duas ordens existem e são as do work.json
test("as duas ordens e a padrão", () => {
  expect(ORDENS_DE_LEITURA).toEqual(["chrono", "release"]);
  expect(ORDEM_PADRAO).toBe("chrono");
});
