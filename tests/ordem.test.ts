// Prova do bloco "estou lendo/assistindo/jogando em ordem…" (T17c) do fim de cada capítulo: quem vem antes e quem vem depois, na ordem
// cronológica e na de lançamento, só entre as histórias que existem no site NAQUELE modo (publicado × prévia com rascunhos) e que já têm
// algo lançado (T17h: quem ainda é "Em breve" é PULADO, nunca aparece no bloco).
//
// O bloco só existe no Astro (o build.py não o tem), então não há referência do Python para ele: o que se prova aqui é
//   1. as regras (src/lib/ordemDeLeitura.ts), em SITES INVENTADOS recriados numa pasta temporária e lidos pelo MESMO carregador e pelas
//      MESMAS regras do site — o exemplo do PDF do autor (Pederneira em cronológica → anterior Luz & Sangue; Beira de Estrada e O Pêndulo,
//      rascunhos sem capítulo, são puladas e só entram quando ganham capítulo, e só na prévia), uma história nova "entre" duas, as pontas,
//      `chrono: false`, empates, "999", idioma, obra de rascunho, obra externa, obra sem nada para abrir (pulada), verbo por tipo,
//      arte própria (camadas, duas imagens); obra SEM arte para a caixa (pulada, T17l); obra só com capítulo em outro idioma (T17l);
//   2. o destino de cada lado (T17l): o link externo do cartão; a página da obra (lista de capítulos) com mais de um capítulo; o capítulo,
//      com um só (no conteúdo de verdade, nos dois modos);
//   3. o componente (Container API): as duas ordens no HTML, a outra escondida, o seletor desligado sem JavaScript, textos e links;
//   4. a exceção de paridade (tests/ajudantes/html.ts → semBlocoDeOrdem) tira SÓ o bloco: sem ele a página do Leitor é a mesma de antes.
// O script do navegador está em tests/ordem-dom.test.ts; as páginas reais construídas, no fim de tests/paginas.test.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { Window } from "happy-dom";
import { afterAll, describe, expect, test } from "vitest";
import Leitor from "../src/components/Leitor.astro";
import ProximaHistoria from "../src/components/ProximaHistoria.astro";
import { langs, type Lang } from "../src/lib/config";
import { dadosDoIdioma } from "../src/lib/idioma";
import { leiturasDaObra } from "../src/lib/leitura";
import { cartaoDaObra } from "../src/lib/obras";
import { APOIO_DA_ESCALA, arteEmCamadas, camadasEscaladas, ESCALA_MAXIMA, ESCALA_MINIMA, estiloDaCamada, PROPORCAO_DA_MOLDURA, sizesDaCamada, type ArteCrua } from "../src/lib/artesDaOrdem";
import { CARIMBOS_DA_FONTE, LARGURA_MAXIMA } from "../src/lib/largurasDoRotulo";
import { arteDaObra, blocoDaOrdem, emDaLinha, ESPACO_ENTRE_ROTULOS_EM, ladoDaObra, larguraDoRotulo, ORDEM_PADRAO, ORDENS_DE_LEITURA, sequenciaDaOrdem, TEXTOS_DA_ORDEM, verboDaObra, type BlocoDaOrdem } from "../src/lib/ordemDeLeitura";
import { finalizarMain } from "../src/lib/pagina";
import { arquivosDoGlob } from "../src/lib/quadrinhos";
import { iniciarBloco } from "../src/scripts/ordem/bloco";
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

/**
 * Um work.json. Desde a T17l só entra no bloco quem tem arte para a caixa (`order_art` ou `order_images`): para os testes de ordem não
 * dependerem disso, toda obra inventada ganha `order_images: ["ordem/teste.png"]`, a não ser que já tenha arte ou peça `semArte: true`.
 */
const wj = (o: Record<string, unknown>) => {
  const { semArte, ...resto } = o;
  const comArte = semArte === true || "order_art" in resto || "order_images" in resto ? resto : { ...resto, order_images: ["ordem/teste.png"] };
  return JSON.stringify(comArte, null, 2) + "\n";
};
const cap = (obra: string, pasta = "01", fm = "date: 2026-01-01") => ({
  [`works/${obra}/${pasta}/en.md`]: `---\n${fm}\n---\n\nText.\n`,
  [`works/${obra}/${pasta}/pt.md`]: `---\n${fm}\n---\n\nTexto.\n`,
});

/**
 * O site do PDF do autor, em miniatura (os mesmos números de ordem e o mesmo estado do work.json de verdade; todas com arte para a caixa):
 *   lançamento: hdvr 1 (externa, fora da cronológica) · firestriker 2 · light-and-blood 3 · roadside 5 (rascunho, SEM capítulo) · pendulum 6 (rascunho, sem capítulo)
 *   cronológica: light-and-blood 5 · firestriker 6 · roadside 7 · pendulum 11
 * `extra` acrescenta (ou troca) arquivos: `COM_BEIRA` dá um capítulo à Beira de Estrada; `COM_PENDULO`, ao Pêndulo.
 */
function sitePdf(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "works/hdvr/work.json": wj({ kind: "video", title: { en: "Hello? Di Vario Residence", pt: "Alô? Residência dos Di Vario" }, external: "https://www.youtube.com/@ResidenciaDosDiVario", order: { release: 1, chrono: false }, media: "misc", cover: "covers/hdvr.png", order_images: ["ordem/hdvr.png"] }),
    "works/firestriker/work.json": wj({ kind: "prose", oneshot: true, title: { en: "Firestriker", pt: "Pederneira" }, order: { release: 2, chrono: 6 }, media: "short-story", cover: "covers/fs.png" }),
    ...cap("firestriker"),
    "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_images: ["ordem/lb-1.png", "ordem/lb-2.png"] }),
    ...cap("light-and-blood", "01"),
    ...cap("light-and-blood", "02", "date: 2026-02-01"),
    "works/roadside/work.json": wj({ kind: "comic", oneshot: true, draft: true, title: { en: "Roadside", pt: "Beira de Estrada" }, order: { release: 5, chrono: 7 }, media: "webcomic", order_images: ["ordem/rs-1.png", "ordem/rs-2.png"] }),
    "works/the-pendulum/work.json": wj({ kind: "film", oneshot: true, draft: true, title: { en: "The Pendulum", pt: "O Pêndulo" }, order: { release: 6, chrono: 11 }, media: "short-film", cover: "covers/pd.png" }),
    ...extra,
  };
}

const COM_BEIRA = cap("roadside");
const COM_PENDULO = cap("the-pendulum");

function ler(arquivos: Record<string, string>, comRascunhos: boolean) {
  const raiz = pastaTemporaria(arquivos);
  const entradas = carregarConteudo(raiz, { comRascunhos, mostrarExtras: false });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos, mostrarExtras: false, emissariosEscondidos: [], todosOsIdiomas: langs });
  const dados = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  /** O bloco do fim dos capítulos da obra `slug` (com os capítulos dos outros idiomas, como a rota faz: T17l). */
  const bloco = (slug: string, lang: Lang): BlocoDaOrdem => {
    const d = dados[lang];
    const obra = d.obras.find((o) => o.data._origem.slug === slug);
    if (!obra) throw new Error(`a obra ${slug} não está no site (${comRascunhos ? "prévia" : "publicado"})`);
    const outros = (o: (typeof d.obras)[number]) => langs.filter((l) => l !== lang).map((l) => ({ lang: l, capitulos: dados[l].capitulosDe(o) }));
    return blocoDaOrdem(obra, lang, d.universo, d.capitulosDe, comRascunhos, outros);
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

  test("prévia com rascunhos: Beira de Estrada e O Pêndulo (rascunhos SEM capítulo) são puladas: nada de \"Em breve\" (T17h)", () => {
    const { bloco, dados } = ler(sitePdf(), true);
    // elas existem na prévia (aparecem como cartão "Em breve" em Histórias)…
    expect(dados.pt.universo.map((o) => o.data._origem.slug)).toEqual(["hdvr", "firestriker", "light-and-blood", "roadside", "the-pendulum"]);
    // …mas o bloco vai direto para a próxima já lançada (aqui, ninguém: Pederneira é a última da cronológica com algo para abrir)
    expect(vizinhos(bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
    expect(vizinhos(bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: null, fora: false });
    // e o que sai do bloco nunca é "Em breve": todo lado tem link
    for (const slug of ["hdvr", "firestriker", "light-and-blood"]) {
      for (const ordem of ["chrono", "release"] as const) {
        for (const lado of [bloco(slug, "pt").listas[ordem].anterior, bloco(slug, "pt").listas[ordem].proximo]) {
          if (lado) expect(lado.destino.tipo, `${slug} ${ordem}`).toBe("link");
        }
      }
    }
  });

  test("quando a Beira de Estrada ganha um capítulo, entra na prévia (e só nela); O Pêndulo, sem capítulo, continua pulado", () => {
    const pre = ler(sitePdf(COM_BEIRA), true);
    expect(vizinhos(pre.bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: "roadside", fora: false });
    expect(vizinhos(pre.bloco("roadside", "pt"), "chrono")).toEqual({ anterior: "firestriker", proximo: null, fora: false });
    // lançamento: Luz & Sangue (3) → Beira de Estrada (5) → (O Pêndulo, pulado)
    expect(vizinhos(pre.bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: "roadside", fora: false });
    expect(vizinhos(pre.bloco("roadside", "pt"), "release")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
    // no site publicado a Beira de Estrada (rascunho) continua não existindo
    const pub = ler(sitePdf(COM_BEIRA), false);
    expect(vizinhos(pub.bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
  });

  test("pula MAIS DE UMA história seguida, para os dois lados: só a primeira já lançada conta", () => {
    // Beira de Estrada (7) sem capítulo entre Pederneira (6) e O Pêndulo (11), este já com capítulo
    const pre = ler(sitePdf(COM_PENDULO), true);
    expect(vizinhos(pre.bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: "the-pendulum", fora: false });
    expect(vizinhos(pre.bloco("the-pendulum", "pt"), "chrono")).toEqual({ anterior: "firestriker", proximo: null, fora: false });
    // lançamento: Luz & Sangue (3) → (Beira, pulada) → O Pêndulo (6)
    expect(vizinhos(pre.bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: "the-pendulum", fora: false });
    expect(vizinhos(pre.bloco("the-pendulum", "pt"), "release")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
    // e a anterior também pula: duas sem capítulo logo antes da atual
    const arquivos = {
      "works/a/work.json": wj({ kind: "prose", title: "A", order: { release: 1, chrono: 1 } }),
      ...cap("a"),
      "works/b-breve/work.json": wj({ kind: "prose", title: "B", draft: true, order: { release: 2, chrono: 2 } }),
      "works/c-breve/work.json": wj({ kind: "prose", title: "C", order: { release: 3, chrono: 3 } }), // pública, mas sem capítulo e sem link: "Em breve" em Histórias
      "works/d/work.json": wj({ kind: "prose", title: "D", order: { release: 4, chrono: 4 } }),
      ...cap("d"),
    };
    const r = ler(arquivos, true);
    expect(vizinhos(r.bloco("d", "pt"), "chrono")).toEqual({ anterior: "a", proximo: null, fora: false });
    expect(vizinhos(r.bloco("a", "pt"), "release")).toEqual({ anterior: null, proximo: "d", fora: false });
  });

  test("obra pública sem capítulo mas com link externo conta como lançada (HDVR); sem link e sem capítulo, não", () => {
    const { bloco } = ler(sitePdf(), false);
    expect(vizinhos(bloco("firestriker", "pt"), "release").anterior).toBe("hdvr");
    const sem = ler({ ...sitePdf(), "works/promessa/work.json": wj({ kind: "prose", title: "Promessa", order: { release: 2.5, chrono: 5.5 } }) }, false);
    expect(vizinhos(sem.bloco("firestriker", "pt"), "release")).toEqual({ anterior: "hdvr", proximo: "light-and-blood", fora: false });
    expect(vizinhos(sem.bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: "light-and-blood", proximo: null, fora: false });
  });

  test("nas pontas: o lado de fora fica vazio (primeira da ordem sem anterior, última sem seguinte)", () => {
    const pub = ler(sitePdf(), false);
    expect(vizinhos(pub.bloco("light-and-blood", "pt"), "chrono").anterior).toBeNull(); // a primeira da cronológica publicada
    expect(vizinhos(pub.bloco("light-and-blood", "pt"), "release").proximo).toBeNull(); // a última do lançamento publicado
    const pre = ler(sitePdf(COM_BEIRA), true);
    expect(vizinhos(pre.bloco("roadside", "pt"), "chrono").proximo).toBeNull(); // Beira é a última com algo lançado (O Pêndulo, sem capítulo, não conta)
    expect(vizinhos(pre.bloco("light-and-blood", "pt"), "chrono").anterior).toBeNull();
  });

  test("o título e o verbo de cada lado seguem o tipo da obra de DESTINO; o título de cima, o da obra ATUAL", () => {
    const { bloco } = ler(sitePdf(COM_BEIRA), true);
    const ped = bloco("firestriker", "pt");
    expect(ped.titulo).toBe("estou lendo em ordem");
    expect(ped.listas.chrono.anterior?.rotulo).toBe("Assistir Light & Blood"); // Luz & Sangue é vídeo
    expect(ped.listas.chrono.proximo?.rotulo).toBe("Ler Beira de Estrada"); // com um capítulo, a Beira de Estrada entra na prévia
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
    const { bloco } = ler(sitePdf({ ...golfinho(true), ...COM_BEIRA, ...COM_PENDULO }), true);
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

describe("o destino de cada lado (T17l): a página da obra com mais de um capítulo; o capítulo com um só; link externo continua o do cartão", () => {
  const ladoEm = (dados: ReturnType<typeof ler>["dados"], comRascunhos: boolean) => (slug: string, lang: Lang = "pt") => {
    const d = dados[lang];
    const o = d.obras.find((x) => x.data._origem.slug === slug);
    if (!o) throw new Error(slug);
    return ladoDaObra(o, lang, d.capitulosDe(o), comRascunhos);
  };

  test("link externo (Alô?); obra de um capítulo só (Pederneira): o capítulo; obra de dois (Luz & Sangue): a página da obra (a lista de capítulos)", () => {
    const lado = ladoEm(ler(sitePdf(), true).dados, true);
    expect(lado("hdvr")?.destino).toEqual({ tipo: "link", href: "https://www.youtube.com/@ResidenciaDosDiVario", externo: true, idioma: null });
    expect(lado("firestriker")?.destino).toEqual({ tipo: "link", href: "/pt/works/firestriker/01/", externo: false, idioma: null });
    expect(lado("firestriker", "en")?.destino).toEqual({ tipo: "link", href: "/en/works/firestriker/01/", externo: false, idioma: null });
    expect(lado("light-and-blood")?.destino).toEqual({ tipo: "link", href: "/pt/works/light-and-blood/", externo: false, idioma: null });
    expect(lado("light-and-blood", "en")?.destino.href).toBe("/en/works/light-and-blood/");
    // rascunho sem capítulo = o cartão cinza "Em breve": não vira lado do bloco, nem em português nem em inglês
    expect(lado("the-pendulum")).toBeNull();
    expect(lado("roadside", "en")).toBeNull();
  });

  test("no bloco, nas DUAS ordens e nos dois idiomas: antes e depois levam ao MESMO lugar (a regra do primeiro/último capítulo da T17i saiu)", () => {
    const { bloco } = ler(sitePdf(), false);
    for (const lang of langs) {
      expect(bloco("firestriker", lang).listas.chrono.anterior?.destino.href).toBe(`/${lang}/works/light-and-blood/`);
      expect(bloco("firestriker", lang).listas.release.proximo?.destino.href).toBe(`/${lang}/works/light-and-blood/`);
      // no capítulo de Luz & Sangue, a Pederneira (de um capítulo só) leva ao único capítulo, dos dois lados
      expect(bloco("light-and-blood", lang).listas.chrono.proximo?.destino.href).toBe(`/${lang}/works/firestriker/01/`);
      expect(bloco("light-and-blood", lang).listas.release.anterior?.destino.href).toBe(`/${lang}/works/firestriker/01/`);
      // Alô? (sem capítulo, link externo) continua no link, em outra aba
      expect(bloco("firestriker", lang).listas.release.anterior?.destino).toEqual({ tipo: "link", href: "https://www.youtube.com/@ResidenciaDosDiVario", externo: true, idioma: null });
    }
  });

  test("quantos capítulos contam: publicado × prévia (rascunho só na prévia), `unlisted` não conta, capítulo só num idioma conta só nele", () => {
    // Luz & Sangue com UM capítulo público em inglês e, na prévia, um segundo (rascunho): em inglês, o capítulo no publicado e a lista na prévia
    const umSo = {
      "works/light-and-blood/02/en.md": "---\ndate: 2026-02-01\ndraft: true\n---\n\nRascunho.\n",
      "works/light-and-blood/00-oculto/en.md": "---\ndate: 2025-12-01\nunlisted: true\n---\n\nOculto.\n", // fora das listas: não conta
    };
    const pub = ler(sitePdf(umSo), false).bloco;
    const pre = ler(sitePdf(umSo), true).bloco;
    expect(pub("firestriker", "en").listas.chrono.anterior?.destino.href).toBe("/en/works/light-and-blood/01/");
    expect(pre("firestriker", "en").listas.chrono.anterior?.destino.href).toBe("/en/works/light-and-blood/");
    // em português os dois capítulos são públicos: a lista nos dois modos
    expect(pub("firestriker", "pt").listas.chrono.anterior?.destino.href).toBe("/pt/works/light-and-blood/");
    expect(pre("firestriker", "pt").listas.chrono.anterior?.destino.href).toBe("/pt/works/light-and-blood/");
  });

  test("obra de capítulo único (`oneshot`) com dois capítulos não tem página da obra: vai ao primeiro capítulo, como o cartão", () => {
    const { bloco } = ler(sitePdf({ ...cap("firestriker", "02", "date: 2026-03-01") }), false);
    expect(bloco("light-and-blood", "pt").listas.chrono.proximo?.destino.href).toBe("/pt/works/firestriker/01/");
  });

  test("obra com link externo E capítulos: o link externo ganha (como o cartão de Histórias)", () => {
    const { bloco } = ler(sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", external: "https://example.com/lb", order: { release: 3, chrono: 5 }, media: "live-ttrpg" }) }), false);
    expect(bloco("firestriker", "pt").listas.chrono.anterior?.destino).toEqual({ tipo: "link", href: "https://example.com/lb", externo: true, idioma: null });
    expect(bloco("firestriker", "pt").listas.release.proximo?.destino).toEqual({ tipo: "link", href: "https://example.com/lb", externo: true, idioma: null });
  });

  test("para TODA obra com arte do conteúdo de verdade, nos dois modos e idiomas: externo = o botão do cartão; senão, a página da obra (2+ capítulos) ou o capítulo", () => {
    for (const comRascunhos of [false, true]) {
      const { dados } = ler(Object.fromEntries(realContent()), comRascunhos);
      const lado = ladoEm(dados, comRascunhos);
      for (const lang of langs) {
        const d = dados[lang];
        for (const o of d.universo) {
          const slug = o.data._origem.slug;
          const botao = cartaoDaObra(o, lang, d.capitulosDe(o), comRascunhos).botao;
          const listados = d.capitulosDe(o).listados.map((c) => `/${lang}/works/${slug}/${c.data._origem.capitulo}/`);
          const temArte = Boolean(o.data.order_art || o.data.order_images?.length);
          const esperado =
            !temArte || botao.tipo !== "link"
              ? undefined
              : botao.externo
                ? { tipo: "link", href: botao.href, externo: true, idioma: null }
                : { tipo: "link", href: listados.length > 1 && !o.data.oneshot ? `/${lang}/works/${slug}/` : listados[0], externo: false, idioma: null };
          expect(lado(slug, lang)?.destino, `${slug} ${lang}`).toEqual(esperado);
        }
      }
    }
  });
});

describe("T17l: quem não tem arte para a caixa é pulado; obra só com capítulo em outro idioma entra com o link para ele", () => {
  test("obra SEM order_art e SEM order_images é pulada (a capa não é mais o plano B), mesmo com capítulo e publicada; o bloco vai à próxima com arte", () => {
    const site = sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", cover: "covers/lb.png", semArte: true }) });
    const { bloco } = ler(site, false);
    // cronológica: Luz & Sangue (5, sem arte) → Pederneira (6): ninguém antes; lançamento: Alô? → Pederneira → (Luz & Sangue, pulada) → ninguém
    expect(vizinhos(bloco("firestriker", "pt"), "chrono")).toEqual({ anterior: null, proximo: null, fora: false });
    expect(vizinhos(bloco("firestriker", "pt"), "release")).toEqual({ anterior: "hdvr", proximo: null, fora: false });
    // a própria obra sem arte continua tendo o bloco no fim dos capítulos dela (só não aparece como vizinha)
    expect(vizinhos(bloco("light-and-blood", "pt"), "release")).toEqual({ anterior: "firestriker", proximo: null, fora: false });
    // com order_images (uma imagem que seja) ela volta
    const com = ler(sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_images: ["ordem/lb.png"] }) }), false);
    expect(vizinhos(com.bloco("firestriker", "pt"), "chrono").anterior).toBe("light-and-blood");
  });

  test("conteúdo de verdade (prévia): O Pêndulo e Cat-Crow-Thing, sem arte, nunca aparecem como vizinhas; as que têm arte aparecem", () => {
    const r = ler(Object.fromEntries(realContent()), true);
    const vistas = new Set<string>();
    for (const lang of langs) {
      for (const o of r.dados[lang].obras) {
        const b = r.bloco(o.data._origem.slug, lang);
        for (const ordem of ORDENS_DE_LEITURA) for (const l of [b.listas[ordem].anterior, b.listas[ordem].proximo]) if (l) vistas.add(l.slug);
      }
    }
    expect(vistas.has("the-pendulum")).toBe(false);
    expect(vistas.has("cat-crow-thing")).toBe(false);
    for (const slug of ["hdvr", "firestriker", "light-and-blood", "all-in-a-nights-work", "roadside"]) expect(vistas.has(slug), slug).toBe(true);
  });

  /** Ossos do Ofício em miniatura: só tem capítulo em inglês (como o de verdade até a T17n). Entre Luz & Sangue (5) e Pederneira (6) na cronológica. */
  const comOssos = (extra: Record<string, string> = {}) =>
    sitePdf({
      "works/ossos/work.json": wj({ kind: "prose", oneshot: true, title: { en: "All in a Night's Work", pt: "Ossos do Ofício" }, order: { release: 4, chrono: 5.5 }, media: "short-story" }),
      "works/ossos/01/en.md": "---\ndate: 2026-01-01\n---\n\nText.\n",
      ...extra,
    });

  test("numa página em português, a obra que só tem capítulo em INGLÊS entra com o rótulo em português e o link para a página em inglês (hreflang en)", () => {
    const { bloco } = ler(comOssos(), false);
    const pt = bloco("firestriker", "pt").listas.chrono.anterior;
    expect(pt?.slug).toBe("ossos");
    expect(pt?.rotulo).toBe("Ler Ossos do Ofício");
    expect(pt?.destino).toEqual({ tipo: "link", href: "/en/works/ossos/01/", externo: false, idioma: "en" });
    // em inglês é o caso normal (mesmo idioma)
    expect(bloco("firestriker", "en").listas.chrono.anterior?.destino).toEqual({ tipo: "link", href: "/en/works/ossos/01/", externo: false, idioma: null });
    // e quem vem depois de Luz & Sangue em português também é ela
    expect(bloco("light-and-blood", "pt").listas.chrono.proximo?.slug).toBe("ossos");
  });

  test("em outro idioma vale a mesma regra de destino: dois capítulos em inglês = a página da obra em inglês", () => {
    const { bloco } = ler(comOssos({ "works/ossos/work.json": wj({ kind: "prose", title: { en: "All in a Night's Work", pt: "Ossos do Ofício" }, order: { release: 4, chrono: 5.5 } }), "works/ossos/02/en.md": "---\ndate: 2026-02-01\n---\n\nText 2.\n" }), false);
    expect(bloco("firestriker", "pt").listas.chrono.anterior?.destino).toEqual({ tipo: "link", href: "/en/works/ossos/", externo: false, idioma: "en" });
  });

  test("sem capítulo em idioma nenhum: continua pulada; obra com `langs: [\"en\"]` nem entra na ordem em português", () => {
    const sem = ler(sitePdf({ "works/ossos/work.json": wj({ kind: "prose", title: { en: "AINW", pt: "Ossos" }, order: { release: 4, chrono: 5.5 } }) }), false);
    expect(vizinhos(sem.bloco("firestriker", "pt"), "chrono").anterior).toBe("light-and-blood");
    const soEn = ler(comOssos({ "works/ossos/work.json": wj({ kind: "prose", oneshot: true, langs: ["en"], title: "AINW", order: { release: 4, chrono: 5.5 } }) }), false);
    expect(vizinhos(soEn.bloco("firestriker", "pt"), "chrono").anterior).toBe("light-and-blood");
    expect(vizinhos(soEn.bloco("firestriker", "en"), "chrono").anterior).toBe("ossos");
  });

  test("o componente marca o link com hreflang (só quando o destino é de outro idioma)", async () => {
    const { bloco } = ler(comOssos(), false);
    const pt = await container.renderToString(ProximaHistoria, { props: { bloco: bloco("firestriker", "pt") } });
    expect(pt).toContain('<a class="so-side prev" href="/en/works/ossos/01/" hreflang="en">');
    const en = await container.renderToString(ProximaHistoria, { props: { bloco: bloco("firestriker", "en") } });
    expect(en).toContain('<a class="so-side prev" href="/en/works/ossos/01/">');
    expect(en).not.toContain("hreflang");
  });

  test("conteúdo de verdade (prévia): Ossos do Ofício nas páginas em português leva ao capítulo em PORTUGUÊS (T17n; até a T17m, ao inglês)", () => {
    const r = ler(Object.fromEntries(realContent()), true);
    const pt = r.dados.pt;
    // Luz & Sangue: na cronológica Ossos do Ofício (4) vem antes; no lançamento (T17o: Beira de Estrada 4, Ossos 5), vem depois da Beira de Estrada
    const obra = pt.obras.find((o) => o.data._origem.slug === "light-and-blood")!;
    const beira = pt.obras.find((o) => o.data._origem.slug === "roadside")!;
    const outros = (o: (typeof pt.obras)[number]) => [{ lang: "en" as const, capitulos: r.dados.en.capitulosDe(r.dados.en.obras.find((x) => x.data._origem.slug === o.data._origem.slug)!) }];
    expect(blocoDaOrdem(obra, "pt", pt.universo, pt.capitulosDe, true, outros).listas.release.proximo?.slug).toBe("roadside");
    // com ou sem a informação dos outros idiomas, o mesmo destino: o capítulo em português, sem hreflang (a regra do "outro idioma" não vale mais para Ossos)
    for (const [b, c] of [obra, beira].flatMap((o) => [blocoDaOrdem(o, "pt", pt.universo, pt.capitulosDe, true, outros), blocoDaOrdem(o, "pt", pt.universo, pt.capitulosDe, true)].map((x) => [x, o] as const))) {
      for (const ossos of c === obra ? [b.listas.chrono.anterior] : [b.listas.release.proximo]) {
        expect(ossos?.slug).toBe("all-in-a-nights-work");
        expect(ossos?.rotulo).toBe("Ler Ossos do Ofício");
        expect(ossos?.destino).toEqual({ tipo: "link", href: "/pt/works/all-in-a-nights-work/01/", externo: false, idioma: null });
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
  test("arte própria (order_images); sem ela, nada (T17l: nem a capa, nem a logo — a obra é pulada)", () => {
    const { dados } = ler(sitePdf({ "works/so-logo/work.json": wj({ kind: "prose", title: "So Logo", logo: "logos/x.png", order: { release: 9 }, semArte: true }), "works/so-capa/work.json": wj({ kind: "prose", title: "So Capa", cover: "covers/x.png", order: { release: 10 }, semArte: true }) }), true);
    const arte = (slug: string) => arteDaObra(dados.pt.obras.find((x) => x.data._origem.slug === slug)!);
    expect(arte("light-and-blood")).toEqual({ tipo: "imagens", principal: "ordem/lb-1.png", hover: "ordem/lb-2.png" });
    expect(arte("so-logo")).toBeNull();
    expect(arte("so-capa")).toBeNull();
  });
  test("order_images com uma imagem só: sem a de mouse por cima; com três: erro no build", () => {
    const um = ler(sitePdf({ "works/um/work.json": wj({ kind: "prose", title: "Um", order_images: ["ordem/um-1.png"] }) }), true);
    expect(arteDaObra(um.dados.pt.obras.find((x) => x.data._origem.slug === "um")!)).toEqual({ tipo: "imagens", principal: "ordem/um-1.png", hover: null });
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
    expect(cronologica).toContain('<a class="so-side prev" href="/pt/works/light-and-blood/">'); // T17l: dois capítulos = a lista de capítulos
    expect(cronologica).not.toContain("so-side next");
    expect(cronologica).toContain('src="/ordem/lb-1.png"');
    expect(cronologica).toContain('src="/ordem/lb-2.png"');
    expect(cronologica.match(/ alt=""/g)).toHaveLength(2);
    expect(cronologica).toContain("Assistir Light &amp; Blood");
    // lançamento: Alô? (link externo, em outra aba; arte própria) e Light & Blood
    const lancamento = /<div class="so-order" data-ordem="release" hidden>([\s\S]*?)<\/div><\/section>/.exec(html)?.[1] ?? "";
    expect(lancamento).toContain('<a class="so-side prev" href="https://www.youtube.com/@ResidenciaDosDiVario" target="_blank" rel="noopener noreferrer">');
    expect(lancamento).toContain('src="/ordem/hdvr.png"');
    expect(lancamento).toContain("so-side next");
    expect(html).not.toContain("is-cover"); // T17l: a capa não é mais arte do bloco
  });

  test("nada de \"Em breve\" (T17h): o bloco de todas as obras, nos dois idiomas e modos, só tem links; obra fora da ordem mostra o aviso", async () => {
    for (const comRascunhos of [false, true]) {
      const r = ler(sitePdf(), comRascunhos);
      for (const lang of langs) {
        for (const o of r.dados[lang].obras) {
          const html = await container.renderToString(ProximaHistoria, { props: { bloco: r.bloco(o.data._origem.slug, lang) } });
          expect(html, `${o.data._origem.slug} ${lang}`).not.toMatch(/so-soon|Em breve|Coming soon/);
          expect(html.match(/<div class="so-side/g)).toBeNull(); // todo lado é um <a>
        }
      }
    }
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

// ───────────── a arte em camadas (T17h) ─────────────

/** A composição de Pederneira (as camadas do work.json de verdade, em miniatura): o Thymorr surge atrás, a Olivia e o Harry crescem. */
const ARTE_PEDERNEIRA = {
  size: [2002, 2023],
  layers: [
    { image: "ordem/Thymorr Site Cronologia.png", x: 62.18, y: 44.52, width: 61.66, opacity: 0, hover: { x: 69.18, opacity: 1 } },
    { image: "ordem/Harry Site Cronologia.png", x: 32.19, y: 70.19, width: 50.3, hover: { x: 27.3, y: 71.56, width: 53.85, rotate: -5.54 } },
    { image: "ordem/Olivia Site Cronologia.png", x: 55.09, y: 65.42, width: 46.25, hover: { x: 55.48, y: 63.54, width: 48.9 } },
  ],
} as const;

describe("a arte em camadas: do work.json para o que o componente desenha", () => {
  test("proporção da tela, ordem (de trás para a frente) e variáveis de CSS de cada camada", () => {
    const arte = arteEmCamadas(ARTE_PEDERNEIRA);
    expect(arte.proporcao).toBe("2002 / 2023");
    expect(arte.camadas.map((c) => c.imagem)).toEqual(["ordem/Thymorr Site Cronologia.png", "ordem/Harry Site Cronologia.png", "ordem/Olivia Site Cronologia.png"]);
    expect(arte.camadas[0]?.estilo).toBe("--x:62.18%;--y:44.52%;--w:61.66%;--o:0;--hx:69.18%;--ho:1");
    expect(arte.camadas[1]?.estilo).toBe("--x:32.19%;--y:70.19%;--w:50.3%;--hx:27.3%;--hy:71.56%;--hw:53.85%;--hr:-5.54deg");
    expect(arte.camadas[2]?.estilo).toBe("--x:55.09%;--y:65.42%;--w:46.25%;--hx:55.48%;--hy:63.54%;--hw:48.9%");
  });
  test("só a camada cuja opacidade muda com o mouse 'surge' (é a única que aparece com movimento reduzido)", () => {
    expect(arteEmCamadas(ARTE_PEDERNEIRA).camadas.map((c) => c.surge)).toEqual([true, false, false]);
    // opacidade escrita no hover igual à de partida não é "surgir"; sem hover nenhum, a camada fica parada
    const arte = arteEmCamadas({ size: [10, 10], layers: [{ image: "a.png", x: 1, y: 1, width: 1, hover: { opacity: 1 } }, { image: "b.png", x: 2, y: 2, width: 2 }, { image: "c.png", x: 3, y: 3, width: 3, opacity: 1, hover: { opacity: 0 } }] });
    expect(arte.camadas.map((c) => c.surge)).toEqual([false, false, true]);
    expect(arte.camadas[1]?.estilo).toBe("--x:2%;--y:2%;--w:2%");
  });
  test("números sem notação científica nem zeros à toa", () => {
    expect(estiloDaCamada({ image: "a.png", x: 0.00001, y: 50, width: 12.3456789 })).toBe("--x:0%;--y:50%;--w:12.3457%");
  });
});

describe("a arte em camadas no bloco", () => {
  const comCamadas = (extra: Record<string, unknown> = {}) =>
    sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_art: ARTE_PEDERNEIRA, ...extra }), ...cap("light-and-blood") });

  test("`order_art` vale no lugar de `order_images` (se houver os dois, as camadas ganham)", () => {
    const so = ler(comCamadas(), false);
    const arte = arteDaObra(so.dados.pt.obras.find((x) => x.data._origem.slug === "light-and-blood")!);
    expect(arte?.tipo).toBe("camadas");
    const dois = ler(comCamadas({ order_images: ["ordem/lb-1.png", "ordem/lb-2.png"] }), false);
    expect(arteDaObra(dois.dados.pt.obras.find((x) => x.data._origem.slug === "light-and-blood")!)?.tipo).toBe("camadas");
  });

  test("o componente desenha uma <img> por camada, de trás para a frente, na tela com a proporção da arte; sem 'so-img' (não é a troca de duas imagens)", async () => {
    const { bloco } = ler(comCamadas(), false);
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: bloco("firestriker", "pt") } });
    const cronologica = /<div class="so-order" data-ordem="chrono">([\s\S]*?)<\/div><div class="so-order"/.exec(html)?.[1] ?? "";
    expect(cronologica).toContain('<span class="so-art so-layers"><span class="so-stage so-tem-surge" style="--ar:2002 / 2023;--razao:0.9896">');
    const imgs = [...cronologica.matchAll(/<img class="(so-layer[^"]*)" src="([^"]+)" alt="" loading="lazy" style="([^"]+)"/g)];
    expect(imgs.map((m) => m[2])).toEqual(["/ordem/Thymorr%20Site%20Cronologia.png", "/ordem/Harry%20Site%20Cronologia.png", "/ordem/Olivia%20Site%20Cronologia.png"]);
    expect(imgs.map((m) => m[1])).toEqual(["so-layer so-surge", "so-layer", "so-layer"]);
    expect(imgs[1]?.[3]).toContain("--hr:-5.54deg");
    expect(cronologica).not.toContain("so-img");
    expect(cronologica).not.toContain("is-cover");
  });

  test("a arte em camadas não leva classes nem elementos fora dos que a exceção de paridade conhece", async () => {
    const { bloco } = ler(comCamadas(), false);
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: bloco("firestriker", "pt") } });
    const classes = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? "").split(/\s+/)));
    for (const c of classes) expect(c, `classe fora do bloco: ${c}`).toMatch(/^(reader-box|paper|story-order|so-[a-z0-9-]+|prev|next)$/);
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
    for (const c of classes) expect(c, `classe fora do bloco: ${c}`).toMatch(/^(reader-box|paper|story-order|so-[a-z0-9-]+|prev|next)$/);
  });

  test("sem bloco, nada é removido; com dois, saem os dois (a exceção não esconde um bloco repetido por engano: o teste das páginas exige exatamente 1)", () => {
    expect(semBlocoDeOrdem("<main><p>oi</p></main>").removidos).toEqual([]);
    const dois = '<main><section data-story-order>a</section><p>x</p><section data-story-order>b</section></main>';
    expect(semBlocoDeOrdem(dois).removidos).toHaveLength(2);
    expect(semBlocoDeOrdem(dois).html).toBe("<main><p>x</p></main>");
    // outra <section> (ou um elemento que não é section) com o mesmo atributo NÃO sai
    expect(semBlocoDeOrdem('<main><div data-story-order>a</div><section class="x">b</section></main>').removidos).toEqual([]);
  });

  test("T17o: diz onde cada bloco estava (no <main>; logo depois da div.layout, fora do <main>; outro lugar)", () => {
    const pagina = (corpo: string) => `<!doctype html><html><head></head><body>${corpo}</body></html>`;
    const SEC = '<section data-story-order>b</section>';
    expect(semBlocoDeOrdem(pagina(`<div class="layout"><main>${SEC}</main></div>`)).lugares).toEqual(["main"]);
    const fora = semBlocoDeOrdem(pagina(`<div class="layout"><main><p>x</p></main></div>${SEC}<footer></footer>`));
    expect(fora.lugares).toEqual(["depois-do-main"]);
    expect(fora.filhasDiretasDoMain).toEqual([false]);
    expect(fora.html).toBe(pagina('<div class="layout"><main><p>x</p></main></div><footer></footer>'));
    // casos negativos: depois do rodapé, antes da .layout, dentro de outra div, depois de uma div que não é a .layout
    expect(semBlocoDeOrdem(pagina(`<div class="layout"><main></main></div><footer></footer>${SEC}`)).lugares).toEqual(["outro"]);
    expect(semBlocoDeOrdem(pagina(`${SEC}<div class="layout"><main></main></div>`)).lugares).toEqual(["outro"]);
    expect(semBlocoDeOrdem(pagina(`<div class="layout"><main></main><div>${SEC}</div></div>`)).lugares).toEqual(["outro"]);
    expect(semBlocoDeOrdem(pagina(`<div class="layoutx"></div>${SEC}`)).lugares).toEqual(["outro"]);
  });
});

// ───────────── T17i: Ossos do Ofício e Beira de Estrada em camadas; a moldura fixa; o rótulo numa linha ─────────────

describe("T17i: as artes novas (content de verdade), validadas pelo schema", () => {
  const { dados } = ler(Object.fromEntries(realContent()), true);
  const crua = (slug: string) => dados.pt.obras.find((o) => o.data._origem.slug === slug)?.data.order_art;
  const camada = (slug: string, nome: string) => crua(slug)?.layers.find((l) => l.image === `ordem/${nome} Site Cronologia.png`);

  test("Ossos do Ofício: asas atrás, Giuseppe, olhos na frente; asas e olhos vão de 0 a 1 de opacidade; os três crescem", () => {
    const a = crua("all-in-a-nights-work");
    expect(a?.layers.map((l) => l.image)).toEqual(["ordem/Giuseppe Asas Site Cronologia.png", "ordem/Giuseppe Site Cronologia.png", "ordem/Giuseppe Olhos Site Cronologia.png"]);
    for (const l of a?.layers ?? []) expect(l.hover?.width ?? 0, l.image).toBeGreaterThan(l.width);
    expect([camada("all-in-a-nights-work", "Giuseppe Asas"), camada("all-in-a-nights-work", "Giuseppe Olhos")].map((l) => [l?.opacity, l?.hover?.opacity])).toEqual([[0, 1], [0, 1]]);
    const arte = arteEmCamadas(a!);
    expect(arte.camadas.map((c) => c.surge)).toEqual([true, false, true]);
    expect(arte.temSurge).toBe(true);
  });

  test("Ossos do Ofício: os olhos acompanham EXATAMENTE o Giuseppe (mesmo crescimento; o canto de cima à esquerda dos dois PNGs coincide)", () => {
    // os dois PNGs saíram da mesma tela do autor com o mesmo canto (medido: deslocamento 0, 0): Giuseppe 828 × 1231, olhos 809 × 1182
    const [W, H] = crua("all-in-a-nights-work")!.size;
    const g = camada("all-in-a-nights-work", "Giuseppe")!;
    const o = camada("all-in-a-nights-work", "Giuseppe Olhos")!;
    const canto = (x: number, y: number, w: number, nat: [number, number]) => {
      const lpx = (w / 100) * W;
      return [(x / 100) * W - lpx / 2, (y / 100) * H - (lpx * nat[1]) / nat[0] / 2, lpx / nat[0]];
    };
    for (const estado of ["inicio", "mouse"] as const) {
      const pegar = (l: typeof g) => (estado === "inicio" ? [l.x, l.y, l.width] : [l.hover?.x ?? l.x, l.hover?.y ?? l.y, l.hover?.width ?? l.width]) as [number, number, number];
      const cg = canto(...pegar(g), [828, 1231]);
      const co = canto(...pegar(o), [809, 1182]);
      expect(Math.abs(cg[0]! - co[0]!), `x do canto (${estado})`).toBeLessThan(2); // px da tela de 3311
      expect(Math.abs(cg[1]! - co[1]!), `y do canto (${estado})`).toBeLessThan(2);
      expect(Math.abs(cg[2]! / co[2]! - 1), `escala (${estado})`).toBeLessThan(0.002);
    }
  });

  test("Beira de Estrada: Jean atrás, Cezar e Iris na frente, os olhos da Iris por cima com EXATAMENTE a posição, a largura e o giro de Cezar e Iris", () => {
    const a = crua("roadside");
    expect(a?.layers.map((l) => l.image)).toEqual(["ordem/Jean Site Cronologia.png", "ordem/Cezar e Iris Site Cronologia.png", "ordem/Iris Olhos Site Cronologia.png"]);
    const ci = camada("roadside", "Cezar e Iris")!;
    const olhos = camada("roadside", "Iris Olhos")!;
    expect({ x: olhos.x, y: olhos.y, width: olhos.width, rotate: olhos.rotate }).toEqual({ x: ci.x, y: ci.y, width: ci.width, rotate: ci.rotate });
    const { opacity: o1, ...semOpacidade } = olhos.hover ?? {};
    expect(semOpacidade).toEqual(ci.hover);
    expect([olhos.opacity, o1]).toEqual([0, 1]);
    // crescem, inclinam e se afastam (como Lucas e Wellersson): Jean para a direita, Cezar e Iris para a esquerda
    const jean = camada("roadside", "Jean")!;
    expect(jean.hover!.width!).toBeGreaterThan(jean.width);
    expect(ci.hover!.width!).toBeGreaterThan(ci.width);
    expect(jean.hover!.x!).toBeGreaterThan(jean.x);
    expect(ci.hover!.x!).toBeLessThan(ci.x);
    expect(jean.hover!.rotate!).toBeGreaterThan(3);
    expect(ci.hover!.rotate!).toBeLessThan(-3);
    // Beira de Estrada não usa mais as duas imagens antigas
    expect(dados.pt.obras.find((o) => o.data._origem.slug === "roadside")?.data.order_images).toBeUndefined();
  });

  test("todo arquivo de imagem de todo order_art existe em static/ (e as duas imagens antigas da Beira de Estrada foram apagadas)", () => {
    for (const o of dados.pt.obras) for (const l of o.data.order_art?.layers ?? []) expect(existsSync(join(RAIZ, "static", l.image)), l.image).toBe(true);
    expect(existsSync(join(RAIZ, "static/ordem/Beira de Estrada-ordem-1.png"))).toBe(false);
    expect(existsSync(join(RAIZ, "static/ordem/Beira de Estrada-ordem-2.png"))).toBe(false);
  });

  test("o schema recusa um campo errado numa camada (ex.: \"opacty\") e opacidade fora de 0–1, com mensagem em português", () => {
    const comArte = (camadaErrada: Record<string, unknown>) =>
      sitePdf({ "works/roadside/work.json": wj({ kind: "comic", oneshot: true, title: "Roadside", order: { release: 5, chrono: 7 }, order_art: { size: [1950, 2143], layers: [camadaErrada] } }) });
    expect(() => ler(comArte({ image: "ordem/Jean Site Cronologia.png", x: 1, y: 1, width: 1, opacty: 0 }), true)).toThrow(/campo desconhecido \(\\?"opacty\\?"\)\. Campos aceitos em cada camada de order_art\.layers/);
    expect(() => ler(comArte({ image: "ordem/Jean Site Cronologia.png", x: 1, y: 1, width: 1, hover: { opacity: 2 } }), true)).toThrow(/opacity tem de ficar entre 0 e 1/);
  });
});

describe("T17i: a moldura de proporção fixa e o tamanho que cada camada ocupa (sizes)", () => {
  test("a proporção da moldura é a mesma no código e no CSS (aspect-ratio de .so-art)", () => {
    const css = readFileSync(join(RAIZ, "src/components/ProximaHistoria.astro"), "utf8");
    expect(PROPORCAO_DA_MOLDURA).toBe(1);
    expect(css).toMatch(/\.so-art \{[^}]*aspect-ratio: 1 \/ 1;/);
    // a tela de montagem se encaixa na moldura: largura toda (tela larga) ou altura toda (tela alta)
    expect(css).toMatch(/\.so-stage \{[^}]*width: min\(100cqw, calc\(100cqh \* var\(--razao\)\)\)/);
  });
  test("sizes de uma camada: a fração da moldura no maior dos dois estados (tela alta ocupa menos largura)", () => {
    expect(sizesDaCamada({ image: "a.png", x: 50, y: 50, width: 25, hover: { width: 30 } }, 2)).toBe("(max-width: 700px) 13.8vw, 102px");
    expect(sizesDaCamada({ image: "a.png", x: 50, y: 50, width: 50 }, 0.5)).toBe("(max-width: 700px) 11.5vw, 85px");
    const arte = arteEmCamadas({ size: [3311, 1884], layers: [{ image: "a.png", x: 1, y: 1, width: 87.2, opacity: 0, hover: { width: 103.98, opacity: 1 } }] });
    expect(arte.razao).toBe(1.7574);
    expect(arte.camadas[0]?.sizes).toBe("(max-width: 700px) 47.8vw, 354px");
  });
  test("o componente põe a tela dentro da moldura, com a classe so-tem-surge só quando alguma camada surge, e o sizes em cada <img>", async () => {
    const lb = (art: unknown) => sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_art: art }), ...cap("light-and-blood") });
    const so = { size: [10, 10], layers: [{ image: "a.png", x: 50, y: 50, width: 50, hover: { x: 40 } }] };
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb(so), false).bloco("firestriker", "pt") } });
    expect(html).toContain('<span class="so-art so-layers"><span class="so-stage" style="--ar:10 / 10;--razao:1">');
    expect(html).toContain('style="--x:50%;--y:50%;--w:50%;--hx:40%" sizes="(max-width: 700px) 23vw, 170px"');
  });
});

describe("T17i: o rótulo numa linha só (a largura medida na fonte)", () => {
  test("a tabela de larguras saiu dos arquivos da fonte que estão no node_modules (senão: python3 tools/gerar_larguras_do_rotulo.py)", () => {
    for (const [arquivo, carimbo] of Object.entries(CARIMBOS_DA_FONTE)) {
      const bytes = readFileSync(join(RAIZ, "node_modules/@fontsource-variable/lexend/files", arquivo));
      expect(createHash("sha256").update(bytes).digest("hex"), arquivo).toBe(carimbo);
    }
  });
  test("larguraDoRotulo: soma das letras (com folga); letra fora da tabela conta como a mais larga; texto maior = mais largo", () => {
    expect(larguraDoRotulo("")).toBe(0);
    const ler1 = larguraDoRotulo("Ler Pederneira");
    expect(larguraDoRotulo("Ler Pederneira!")).toBeGreaterThan(ler1);
    expect(larguraDoRotulo("\u{1F600}")).toBe(Number(((LARGURA_MAXIMA / 1000) * 1.03).toFixed(3)));
    // "W" é mais largo que "i" na Lexend
    expect(larguraDoRotulo("W")).toBeGreaterThan(larguraDoRotulo("i"));
  });
  test("a caixa leva os 'em' da linha que precisa de mais nas DUAS ordens (a letra não muda ao trocar) e os do maior rótulo (celular)", () => {
    const b = ler(sitePdf(), false).bloco("firestriker", "pt");
    const alo = b.listas.release.anterior!.emDoRotulo;
    const lb = b.listas.release.proximo!.emDoRotulo;
    expect(b.listas.release.anterior?.rotulo).toBe("Assistir Alô? Residência dos Di Vario");
    expect(b.emDosRotulos).toBeCloseTo(alo + lb + ESPACO_ENTRE_ROTULOS_EM, 3); // o lançamento (dois lados) precisa de mais que a cronológica (um)
    expect(b.emDosRotulos).toBeGreaterThan(emDaLinha(b.listas.chrono));
    expect(b.emDoMaiorRotulo).toBeCloseTo(alo + 0.3, 3);
  });
  test("o componente escreve os dois números na caixa e guarda o lugar do lado que não existe (so-lugar, invisível para leitores de tela)", async () => {
    const b = ler(sitePdf(), false).bloco("firestriker", "pt");
    const html = await container.renderToString(ProximaHistoria, { props: { bloco: b } });
    expect(html).toContain(`style="--so-em:${b.emDosRotulos};--so-em-1:${b.emDoMaiorRotulo}"`);
    const cronologica = /<div class="so-order" data-ordem="chrono">([\s\S]*?)<\/div><div class="so-order"/.exec(html)?.[1] ?? "";
    // cronológica: a Pederneira é a última (publicado) → o lado de lá é um lugar guardado, sem link, sem texto e sem imagem
    expect(cronologica).toContain('<span class="so-lugar next" aria-hidden="true"><span class="so-art"></span><span class="so-label">&nbsp;<svg class="so-arrow" viewBox="0 0 120 14"></svg></span></span>');
    // as duas ordens têm sempre os dois lugares (lado de verdade ou lugar guardado)
    for (const div of html.split('<div class="so-order"').slice(1)) expect((div.match(/class="so-(side|lugar) (prev|next)/g) ?? []).length).toBe(2);
  });
  test("o CSS: rótulo sem quebra, letra = a menor entre o máximo e a que cabe; altura da linha fixa (a do máximo)", () => {
    const css = readFileSync(join(RAIZ, "src/components/ProximaHistoria.astro"), "utf8");
    const regra = /\.so-label \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(regra).toContain("white-space: nowrap");
    expect(regra).toContain("font-size: min(var(--so-cap), calc(100cqi / var(--so-em, 30)))");
    expect(regra).toContain("line-height: calc(var(--so-cap) * 1.2)");
    expect(css).toContain("font-size: min(var(--so-cap), calc(100cqi / var(--so-em-1, 20)))");
  });
  test("capítulo de quadrinho: o bloco continua sendo a folha de papel (a regra da folha escura do Leitor pegava a primeira <section>)", () => {
    const leitor = readFileSync(join(RAIZ, "src/components/Leitor.astro"), "utf8");
    expect(leitor).toContain(".reader-comic .reader-box:first-of-type { background: var(--night)"); // a regra que pegava o bloco
    const css = readFileSync(join(RAIZ, "src/components/ProximaHistoria.astro"), "utf8");
    expect(css).toMatch(/\.reader-comic \.reader-box\.paper\.story-order \{ background: var\(--paper\), var\(--sheet\); background-color: var\(--sheet\); color: var\(--green\); padding: clamp\(1\.4rem, 5vw, 3\.5rem\); \}/);
    // a margem é a mesma de .reader-box (as outras caixas do leitor)
    expect(leitor).toContain(".reader-box { max-width: 1000px; width: calc(100% - 2rem); margin: 0 auto 1.5rem; padding: clamp(1.4rem, 5vw, 3.5rem);");
  });
});

// ───────────── T17l: as asas do Giuseppe saem da moldura ("bleed"); o leitor página a página no papel ─────────────

describe("T17l: `bleed` (as camadas saem da moldura até a borda da caixa) e o Giuseppe do tamanho dos prints do autor", () => {
  test("o schema aceita `bleed: true/false` e recusa outra coisa, com mensagem em português", () => {
    const lb = (art: unknown) => sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_art: art }), ...cap("light-and-blood") });
    const arte = { size: [1000, 1000], layers: [{ image: "a.png", x: 50, y: 50, width: 50 }] };
    expect(() => ler(lb({ ...arte, bleed: true }), false)).not.toThrow();
    expect(() => ler(lb({ ...arte, bleed: false }), false)).not.toThrow();
    expect(() => ler(lb({ ...arte, bleed: "sim" }), false)).toThrow(/bleed tem de ser true ou false/);
  });

  test("arteEmCamadas: `sangra` só com bleed: true; o componente põe so-sangra na moldura (e só nela)", async () => {
    const base = { size: [1000, 1000] as const, layers: [{ image: "a.png", x: 50, y: 50, width: 50 }] };
    expect(arteEmCamadas(base).sangra).toBe(false);
    expect(arteEmCamadas({ ...base, bleed: true }).sangra).toBe(true);
    const lb = (art: unknown) => sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_art: art }), ...cap("light-and-blood") });
    const com = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb({ ...base, bleed: true }), false).bloco("firestriker", "pt") } });
    expect(com).toContain('<span class="so-art so-layers so-sangra"><span class="so-stage"');
    const sem = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb(base), false).bloco("firestriker", "pt") } });
    expect(sem).not.toContain("so-sangra");
  });

  test("o CSS: com so-sangra a moldura e a tela não cortam, só fora do celular; a caixa corta (overflow hidden); as camadas não pegam clique; a frase fica na frente", () => {
    const css = readFileSync(join(RAIZ, "src/components/ProximaHistoria.astro"), "utf8");
    expect(css).toMatch(/@media \(min-width: 701px\) \{\s*\.so-art\.so-sangra, \.so-art\.so-sangra > \.so-stage \{ overflow: visible; \}\s*\}/);
    // T17m: no celular a moldura continua sendo o limite, mas as bordas desvanecem (degradê radial), sem corte seco
    expect(css).toMatch(/@media \(max-width: 700px\) \{\s*\.so-art\.so-sangra \{ -webkit-mask-image: radial-gradient\(farthest-side at 50% 100%, #000 55%, transparent\); mask-image: radial-gradient\(farthest-side at 50% 100%, #000 55%, transparent\); \}\s*\}/);
    expect(css).toMatch(/\.story-order \{[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.so-layer \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.so-top \{[^}]*z-index: 2;[^}]*pointer-events: none;/);
    // a caixa de papel é a mesma dos capítulos também na página da obra (onde o CSS do Leitor não vem)
    expect(css).toContain(".reader-box.story-order { max-width: 1000px; width: calc(100% - 2rem); margin: 0 auto 1.5rem; padding: clamp(1.4rem, 5vw, 3.5rem); border-radius: var(--sheet-radius); box-shadow: 0 12px 34px #00000040; background: var(--paper), var(--sheet); background-color: var(--sheet); }");
  });

  test("Ossos do Ofício (content de verdade): tela quadrada (= a moldura), bleed, e o Giuseppe do tamanho da T17m (cabeça como a da Olivia e do Harry: 23,2% da moldura antes, 24,65% com o mouse)", () => {
    const { dados } = ler(Object.fromEntries(realContent()), true);
    const a = dados.pt.obras.find((o) => o.data._origem.slug === "all-in-a-nights-work")?.data.order_art;
    expect(a?.size).toEqual([1000, 1000]);
    expect(a?.bleed).toBe(true);
    const g = a?.layers.find((l) => l.image === "ordem/Giuseppe Site Cronologia.png");
    // T17l: 51,51% e 54,74% (medidos nos prints do autor); T17m: tudo × 0,4503 (a cabeça do Giuseppe do tamanho da da Olivia e do Harry)
    expect(g?.width).toBeCloseTo(51.51 * 0.4503, 1);
    expect(g?.hover?.width).toBeCloseTo(54.74 * 0.4503, 1);
    // as asas: a mesma escala do Giuseppe (a tela do autor), presas a ele (crescem juntas): largura das asas ÷ largura do Giuseppe = 4268 ÷ 828
    const asas = a?.layers.find((l) => l.image === "ordem/Giuseppe Asas Site Cronologia.png");
    expect((asas?.width ?? 0) / (g?.width ?? 1)).toBeCloseTo(4268 / 828, 1);
    expect((asas?.hover?.width ?? 0) / (g?.hover?.width ?? 1)).toBeCloseTo(4268 / 828, 1);
  });

  test("leitor página a página (page_runes): a caixa do quadrinho fica no papel; o quadrinho de rolagem continua roxo-noite", () => {
    const leitor = readFileSync(join(RAIZ, "src/components/Leitor.astro"), "utf8");
    expect(leitor).toContain(".reader-comic .reader-box:first-of-type { background: var(--night)");
    expect(leitor).toContain(".reader-comic .reader-box:first-of-type:has(> .folheador) { background: var(--paper), var(--sheet); background-color: var(--sheet); color: var(--ink); }");
    expect(leitor).toContain(".reader-comic .reader-box:has(> .folheador) .title-image { filter: none; }");
    const folheador = readFileSync(join(RAIZ, "src/components/Folheador.astro"), "utf8");
    expect(folheador).toContain('.reader-box:has(> .folheador) .fl-runa[aria-current="page"] { opacity: 1; color: var(--teal);');
  });
});

// ───────────── T17i: o HTML de verdade, num DOM simulado ─────────────
// O bloco desenhado pelo ProximaHistoria.astro para o site do PDF do autor em miniatura (com um capítulo em rascunho), ligado pelo MESMO
// script do navegador (src/scripts/ordem/bloco.ts) num documento do happy-dom: ao trocar de ordem, os links à vista levam à página da
// obra de vários capítulos (T17l; externo continua externo), no publicado e na prévia, nos dois idiomas; as duas ordens têm a mesma
// estrutura (dois lugares, cada um com moldura e rótulo). O resto do script está em tests/ordem-dom.test.ts.
describe("T17i/T17l: no HTML de verdade, trocar de ordem leva aos lugares certos e as duas ordens têm a mesma estrutura", () => {
  const site = sitePdf(cap("light-and-blood", "03", "date: 2026-03-01\ndraft: true"));
  for (const comRascunhos of [false, true] as const) {
    for (const lang of langs) {
      test(`${comRascunhos ? "prévia" : "publicado"}, ${lang}: Cronológica → Luz & Sangue (a lista de capítulos); Lançamento → Alô? (externo) e Luz & Sangue (a lista)`, async () => {
        const html = await container.renderToString(ProximaHistoria, { props: { bloco: ler(site, comRascunhos).bloco("firestriker", lang) } });
        const janela = new Window();
        janela.document.body.innerHTML = html;
        const bloco = janela.document.querySelector("[data-story-order]") as unknown as HTMLElement;
        const memoria = new Map<string, string>();
        iniciarBloco(bloco, { getItem: (c) => memoria.get(c) ?? null, setItem: (c, v) => void memoria.set(c, v) });
        const visiveis = () =>
          [...bloco.querySelectorAll<HTMLElement>(".so-order")].filter((l) => !l.hidden).flatMap((l) => [...l.querySelectorAll<HTMLAnchorElement>("a.so-side")].map((a) => `${a.classList.contains("prev") ? "prev" : "next"} ${a.getAttribute("href")}`));
        expect(visiveis()).toEqual([`prev /${lang}/works/light-and-blood/`]);
        const seletor = bloco.querySelector<HTMLSelectElement>("select")!;
        seletor.value = "release";
        seletor.dispatchEvent(new janela.Event("change", { bubbles: true }) as unknown as Event);
        expect(visiveis()).toEqual(["prev https://www.youtube.com/@ResidenciaDosDiVario", `next /${lang}/works/light-and-blood/`]);
        const lugar = bloco.querySelector<HTMLElement>('.so-order[data-ordem="chrono"] .so-lugar.next')!;
        expect(lugar.getAttribute("aria-hidden")).toBe("true");
        expect(lugar.querySelector("a, [tabindex], img")).toBeNull();
        for (const l of bloco.querySelectorAll(".so-order")) {
          expect([...l.children].filter((c) => c.matches(".so-side, .so-lugar")).map((c) => [c.querySelectorAll(".so-art").length, c.querySelectorAll(".so-label").length])).toEqual([[1, 1], [1, 1]]);
        }
        await janela.happyDOM.close();
      });
    }
  }
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

// ───────────── T17o: a `escala` do autor (todas as camadas de uma história juntas) ─────────────
// O autor experimenta o tamanho de cada arte mexendo num número só (`"escala": 1.2` no order_art). A conta é a da T17m, no build, em volta
// do meio da borda de baixo da tela de montagem (x 50%, y 100%: o pé do desenho). Sem `escala`, ou com 1, nada muda.
describe("T17o: `escala` no order_art (todas as camadas juntas, em volta do pé do desenho)", () => {
  const lb = (art: unknown) => sitePdf({ "works/light-and-blood/work.json": wj({ kind: "video", title: "Light & Blood", order: { release: 3, chrono: 5 }, media: "live-ttrpg", order_art: art }), ...cap("light-and-blood") });
  // tela 2000 × 1600; a camada "a" é um PNG 4 × 5 (altura = 1,25 × a largura) com o PÉ exatamente na borda de baixo (y + altura/2 = 100%);
  // "b" e "c" são os "olhos colados": os mesmos números (como os da Iris), "b" surge com o mouse
  const ARTE: ArteCrua = {
    size: [2000, 1600],
    layers: [
      { image: "a.png", x: 30, y: 68.75, width: 40, rotate: -6, hover: { x: 25, y: 66, width: 44, rotate: -9 } },
      { image: "b.png", x: 65, y: 60, width: 50, rotate: 4, opacity: 0, hover: { width: 55, opacity: 1 } },
      { image: "c.png", x: 65, y: 60, width: 50, rotate: 4, hover: { width: 55 } },
    ],
  };
  const PROPORCAO_DO_PNG_A = 5 / 4;
  /** As variáveis de CSS de uma camada como números ({ "--x": 30, "--hw": 44, … }). */
  const vars = (estilo: string) => Object.fromEntries(estilo.split(";").map((p) => { const [k = "", v = ""] = p.split(":"); return [k, parseFloat(v)]; })) as Record<string, number>;
  /** Onde fica o pé (a borda de baixo) de uma camada, em % da altura da tela, para um PNG de proporção `k` (altura ÷ largura). */
  const pe = (y: number, w: number, k: number) => y + (w * (ARTE.size[0] / ARTE.size[1]) * k) / 2;

  test("o ponto de apoio é o meio da borda de baixo da tela (o mesmo da T17m) e a faixa aceita é 0.3 a 3", () => {
    expect(APOIO_DA_ESCALA).toEqual({ x: 50, y: 100 });
    expect([ESCALA_MINIMA, ESCALA_MAXIMA]).toEqual([0.3, 3]);
  });

  for (const s of [1.5, 0.5]) {
    describe(`escala ${s}`, () => {
      const antes = arteEmCamadas(ARTE).camadas.map((c) => vars(c.estilo));
      const depois = arteEmCamadas({ ...ARTE, escala: s }).camadas.map((c) => vars(c.estilo));

      test("a largura de toda camada, antes e com o mouse, fica × o fator", () => {
        depois.forEach((d, n) => {
          expect(d["--w"], `camada ${n}`).toBeCloseTo(antes[n]!["--w"]! * s, 3);
          if (antes[n]!["--hw"] !== undefined) expect(d["--hw"], `camada ${n} (mouse)`).toBeCloseTo(antes[n]!["--hw"]! * s, 3);
        });
      });
      test("o pé do desenho fica no lugar (na borda de baixo) e a posição horizontal do conjunto também (x' − 50 = (x − 50) × fator)", () => {
        const a = depois[0]!;
        expect(pe(a["--y"]!, a["--w"]!, PROPORCAO_DO_PNG_A)).toBeCloseTo(100, 3);
        expect(pe(a["--hy"]!, a["--hw"]!, PROPORCAO_DO_PNG_A) - 100).toBeCloseTo((pe(66, 44, PROPORCAO_DO_PNG_A) - 100) * s, 3); // com o mouse: a distância até a borda × o fator
        depois.forEach((d, n) => expect(d["--x"]! - APOIO_DA_ESCALA.x, `camada ${n}`).toBeCloseTo((antes[n]!["--x"]! - APOIO_DA_ESCALA.x) * s, 3));
        // uma camada centrada (x 50) continua centrada
        expect(vars(arteEmCamadas({ size: [10, 10], layers: [{ image: "z.png", x: 50, y: 50, width: 10 }], escala: s }).camadas[0]!.estilo)["--x"]).toBe(50);
      });
      test("o movimento do mouse fica proporcional (o deslocamento × o fator; o crescimento na mesma razão)", () => {
        const a = depois[0]!;
        expect(a["--hx"]! - a["--x"]!).toBeCloseTo((25 - 30) * s, 3);
        expect(a["--hy"]! - a["--y"]!).toBeCloseTo((66 - 68.75) * s, 3);
        expect(a["--hw"]! / a["--w"]!).toBeCloseTo(44 / 40, 6);
      });
      test("giro e opacidade não mudam; os olhos colados (mesmos números) continuam iguais", () => {
        depois.forEach((d, n) => {
          for (const k of ["--r", "--hr", "--o", "--ho"]) expect(d[k], `camada ${n} ${k}`).toBe(antes[n]![k]);
        });
        const semOpacidade = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== "--o" && k !== "--ho"));
        expect(semOpacidade(depois[1]!)).toEqual(semOpacidade(depois[2]!));
        // o que o hover não tem continua não estando lá (o CSS usa o inicial, já escalado: var(--hx, var(--x)))
        expect(depois[1]!["--hx"]).toBeUndefined();
        expect(arteEmCamadas({ ...ARTE, escala: s }).camadas.map((c) => c.surge)).toEqual([false, true, false]);
      });
      test("o `sizes` acompanha a largura escalada", () => {
        const c = arteEmCamadas({ ...ARTE, escala: s }).camadas[0]!;
        expect(c.sizes).toBe(sizesDaCamada({ ...ARTE.layers[0]!, width: 40 * s, hover: { width: 44 * s } }, 2000 / 1600));
      });
    });
  }

  test("sem `escala`, ou com 1, o desenho é EXATAMENTE o de hoje (o exemplo e todas as artes de verdade; o componente também)", async () => {
    expect(arteEmCamadas({ ...ARTE, escala: 1 })).toEqual(arteEmCamadas(ARTE));
    const { dados } = ler(Object.fromEntries(realContent()), true);
    const reais = dados.pt.obras.flatMap((o) => (o.data.order_art ? [o.data.order_art] : []));
    expect(reais.length).toBeGreaterThanOrEqual(5);
    // desde 28/10 as cinco obras têm a `escala` escolhida pelo autor: sem ela (ou com 1) o desenho é o dos números escritos
    for (const a of reais) {
      const { escala: _escala, ...semEscala } = a;
      expect(arteEmCamadas({ ...semEscala, escala: 1 })).toEqual(arteEmCamadas(semEscala));
    }
    const sem = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb(ARTE), false).bloco("firestriker", "pt") } });
    const com1 = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb({ ...ARTE, escala: 1 }), false).bloco("firestriker", "pt") } });
    expect(com1).toBe(sem);
    const com15 = await container.renderToString(ProximaHistoria, { props: { bloco: ler(lb({ ...ARTE, escala: 1.5 }), false).bloco("firestriker", "pt") } });
    expect(com15).not.toBe(sem);
    expect(com15).toContain("--x:20%;--y:53.125%;--w:60%;--r:-6deg;--hx:12.5%;--hy:49%;--hw:66%;--hr:-9deg");
  });

  test("com `escala`, os olhos do Giuseppe e os da Iris (content de verdade) continuam colados, antes e com o mouse", () => {
    const { dados } = ler(Object.fromEntries(realContent()), true);
    const crua = (slug: string) => dados.pt.obras.find((o) => o.data._origem.slug === slug)?.data.order_art as ArteCrua;
    for (const s of [1.3, 0.6]) {
      // Ossos: o canto de cima à esquerda dos dois PNGs coincide (Giuseppe 828 × 1231, olhos 809 × 1182), como no teste da T17i
      const ossos = crua("all-in-a-nights-work");
      const [W, H] = ossos.size;
      const cs = camadasEscaladas({ ...ossos, escala: s });
      const g = cs.find((l) => l.image === "ordem/Giuseppe Site Cronologia.png")!;
      const o = cs.find((l) => l.image === "ordem/Giuseppe Olhos Site Cronologia.png")!;
      const canto = (x: number, y: number, w: number, nat: [number, number]) => {
        const lpx = (w / 100) * W;
        return [(x / 100) * W - lpx / 2, (y / 100) * H - (lpx * nat[1]) / nat[0] / 2, lpx / nat[0]];
      };
      for (const estado of ["inicio", "mouse"] as const) {
        const pegar = (l: typeof g) => (estado === "inicio" ? [l.x, l.y, l.width] : [l.hover?.x ?? l.x, l.hover?.y ?? l.y, l.hover?.width ?? l.width]) as [number, number, number];
        const cg = canto(...pegar(g), [828, 1231]);
        const co = canto(...pegar(o), [809, 1182]);
        expect(Math.abs(cg[0]! - co[0]!), `Ossos ${s}: x do canto (${estado})`).toBeLessThan(2 * Math.max(1, s));
        expect(Math.abs(cg[1]! - co[1]!), `Ossos ${s}: y do canto (${estado})`).toBeLessThan(2 * Math.max(1, s));
        expect(Math.abs(cg[2]! / co[2]! - 1), `Ossos ${s}: escala (${estado})`).toBeLessThan(0.002);
      }
      // Beira: os olhos da Iris continuam com os MESMOS números de Cezar e Iris
      const beira = camadasEscaladas({ ...crua("roadside"), escala: s });
      const ci = beira.find((l) => l.image === "ordem/Cezar e Iris Site Cronologia.png")!;
      const olhos = beira.find((l) => l.image === "ordem/Iris Olhos Site Cronologia.png")!;
      expect({ x: olhos.x, y: olhos.y, width: olhos.width, rotate: olhos.rotate }).toEqual({ x: ci.x, y: ci.y, width: ci.width, rotate: ci.rotate });
      const { opacity: _o, ...semOpacidade } = olhos.hover ?? {};
      expect(semOpacidade).toEqual(ci.hover);
    }
  });

  test("o schema aceita 0.3, 1, 1.2 e 3 e recusa fora da faixa, texto e true, com mensagem em português", () => {
    const arte = { size: [1000, 1000], layers: [{ image: "a.png", x: 50, y: 50, width: 50 }] };
    for (const ok of [0.3, 1, 1.2, 3]) expect(() => ler(lb({ ...arte, escala: ok }), false), String(ok)).not.toThrow();
    for (const fora of [0.29, 0, -1, 3.5, 10]) expect(() => ler(lb({ ...arte, escala: fora }), false), String(fora)).toThrow(/escala tem de ficar entre 0\.3 e 3 \(1 = o tamanho de hoje; use ponto, como em 1\.2\)/);
    expect(() => ler(lb({ ...arte, escala: "1.2" }), false)).toThrow(/escala \(o tamanho de todas as camadas juntas, com ponto: 1\.2 = 20% maior; 1 = como está\) tem de ser um número, sem aspas/);
    expect(() => ler(lb({ ...arte, escala: true }), false)).toThrow(/escala .* tem de ser um número, sem aspas/);
    // dentro de uma camada não vale (é da história inteira)
    expect(() => ler(lb({ ...arte, layers: [{ ...arte.layers[0], escala: 2 }] }), false)).toThrow(/campo desconhecido \(\\?"escala\\?"\)/);
  });
});
