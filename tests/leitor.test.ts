// Prova de que o LEITOR DE CAPÍTULOS (T12) desenha o mesmo que o build.py também no que o conteúdo de hoje não tem:
// quadrinhos (pages + pages_glob em ordem natural, pastas que casam, arquivos ocultos, "**"), vídeo com e sem setas,
// prosa com fonte de leitura, divisor e logo, os efeitos do texto (sonho, carta que vira, Giuseppe, tiras, degradê),
// obra de capítulo único com e sem logo, obra externa e escondida, rascunho (só na prévia), `unlisted` (noindex, sem
// vizinhos), `comments: false`, comentários sem chaves (nada no build; aviso na prévia) e com chaves "sujas".
//
// A referência (tests/fixtures/paginas-t12-python.json → "ambientes") vem de `python3 tools/paginas_ref.py`: o build()
// de verdade sobre cada site inventado (os de tools/regras_ref.py e os do leitor), em build e em prévia. De cada capítulo:
// os argumentos que o Python passou ao shell() e o <main> final. Aqui, o mesmo site é recriado numa pasta temporária,
// lido com o MESMO carregador e as MESMAS regras do Astro (src/lib/idioma.ts, src/lib/leitura.ts), desenhado pelo
// componente Leitor (Container API do Astro) e acabado pelo MESMO finalizarMain() do layout. Comparação estrutural
// (tests/ajudantes/html.ts). As páginas REAIS (o site construído de verdade) são provadas em tests/paginas.test.ts.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import Leitor from "../src/components/Leitor.astro";
import { assetVersioned } from "../src/lib/assets";
import { jsonComoPython, limparUrlDoSupabase, secaoDeComentarios, type ChavesDoSupabase, type TextosDaInterface } from "../src/lib/comentarios";
import { langs, type Lang } from "../src/lib/config";
import { dadosDoIdioma } from "../src/lib/idioma";
import { leiturasDaObra, usaClasse, type LeituraDoCapitulo } from "../src/lib/leitura";
import { versaleteEntreTags } from "../src/lib/markdown";
import { compararNatural } from "../src/lib/ordem";
import { finalizarMain, protegerAtributos, separarScripts, textoDoAutor, versaleteNoMain } from "../src/lib/pagina";
import { arquivosDoGlob, globNaPasta } from "../src/lib/quadrinhos";
import { canonicoDoMiolo } from "./ajudantes/html";
import { carregarConteudo } from "./ajudantes/conteudo";

interface Shell {
  titulo: string;
  alt: Record<string, string>;
  cls: string;
  desc: string;
  imagem: string;
  noindex: boolean;
}
interface Ambiente {
  nome: string;
  rascunhos: boolean;
  arquivos_sha1: string | null;
  config: { show_extras: boolean; comments: ChavesDoSupabase; ui_c: TextosDaInterface };
  capitulos: Record<string, { shell: Shell; main: string }>;
}
const ref: { ambientes: Ambiente[]; arquivos_do_leitor: Record<string, string>; estaticos_do_leitor: string[] } = JSON.parse(
  readFileSync(new URL("./fixtures/paginas-t12-python.json", import.meta.url), "utf8"),
);
const regras: { cenarios: { nome: string; arquivos: Record<string, string> }[] } = JSON.parse(readFileSync(new URL("./fixtures/regras-python.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/regras_ref.py` e `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string | Uint8Array>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-leitor-teste-"));
  pastas.push(raiz);
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return raiz;
}
/** json.dumps(x, sort_keys=True, ensure_ascii=False) do Python (o carimbo dos arquivos de cada cenário). */
function pythonJson(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(pythonJson).join(", ")}]`;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${pythonJson((o as Record<string, unknown>)[k])}`).join(", ")}}`;
}
const sha = (arquivos: Record<string, string>) => createHash("sha1").update(pythonJson(arquivos)).digest("hex");

// static/ dos cenários do leitor: as imagens (vazias) dos quadrinhos inventados e uma cópia do comments.js de verdade
const staticDoLeitor = pastaTemporaria(Object.fromEntries(ref.estaticos_do_leitor.map((rel) => [rel, new Uint8Array()])));
copyFileSync(join(RAIZ, "static", "comments.js"), join(staticDoLeitor, "comments.js"));
const SCRIPT_DOS_COMENTARIOS = assetVersioned("comments.js");

const container = await AstroContainer.create();

let comparados = 0;
afterAll(() => console.log(`\nLeitor de capítulos — ${comparados} capítulos de sites inventados e reais comparados com o build.py (<main> e argumentos do shell()).\n`));

for (const amb of ref.ambientes) {
  const doLeitor = amb.nome.startsWith("leitor");
  const arquivos = amb.nome === "real" ? undefined : doLeitor ? ref.arquivos_do_leitor : regras.cenarios.find((c) => c.nome === amb.nome)?.arquivos;
  const raiz = arquivos ? pastaTemporaria(arquivos) : join(RAIZ, "content");
  const pastaStatic = doLeitor ? staticDoLeitor : join(RAIZ, "static");
  const entradas = carregarConteudo(raiz, { comRascunhos: amb.rascunhos, mostrarExtras: amb.config.show_extras });
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { comRascunhos: amb.rascunhos, mostrarExtras: amb.config.show_extras, emissariosEscondidos: [], todosOsIdiomas: langs });
  const dadosDe = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  const ferramentas = {
    glob: (padrao: string) => arquivosDoGlob(pastaStatic, padrao),
    comentarios: (lang: Lang, id: string | null) =>
      secaoDeComentarios(lang, id, { chaves: amb.config.comments, ui: amb.config.ui_c, comRascunhos: amb.rascunhos, scriptDosComentarios: SCRIPT_DOS_COMENTARIOS }),
  };
  const leituras: LeituraDoCapitulo[] = [];
  for (const lang of langs) {
    for (const obra of dadosDe[lang].obras) {
      const capitulos = Object.fromEntries(langs.map((l) => [l, dadosDe[l].capitulosDe(obra)])) as Record<Lang, ReturnType<(typeof dadosDe)[Lang]["capitulosDe"]>>;
      leituras.push(...leiturasDaObra(obra, lang, capitulos, ferramentas));
    }
  }

  describe(`${amb.nome} · ${amb.rascunhos ? "prévia" : "build"}`, () => {
    test("a referência é do mesmo conteúdo", () => {
      if (arquivos) expect(sha(arquivos), REFAZER).toBe(amb.arquivos_sha1);
    });

    test("os mesmos capítulos (nenhum a mais, nenhum a menos; rascunho só na prévia)", () => {
      expect(leituras.map((l) => l.url).sort(), REFAZER).toEqual(Object.keys(amb.capitulos).sort());
    });

    test.each(leituras.map((l) => [l.url, l] as const))("%s", async (url, leitura) => {
      const py = amb.capitulos[url];
      if (!py) throw new Error(`o Python não gerou ${url}`);
      // o que vai para o <head> e o <body> (BaseLayout): os mesmos argumentos do shell()
      const altDefinidas = Object.fromEntries(Object.entries(leitura.alternativas).filter(([, v]) => v));
      expect({ titulo: leitura.tituloDaPagina, alt: altDefinidas, cls: leitura.classeDoCorpo, desc: leitura.descricao, imagem: leitura.imagem, noindex: leitura.noindex }, url).toEqual(py.shell);
      // o <main>: o Leitor + o acabamento do layout (versalete, data-prev/next; scripts de componente vão para o fim)
      const pronto = finalizarMain(await container.renderToString(Leitor, { props: { leitura } }), leitura.lang);
      expect(canonicoDoMiolo(pronto.html), url).toBe(canonicoDoMiolo(py.main));
      // JavaScript só onde precisa: a carta que vira / os posts alternados
      expect(pronto.scripts !== "", `${url}: scripts de componente`).toBe(leitura.temCartaQueVira || leitura.temPostsAlternados);
      comparados++;
    });
  });
}

describe("peças soltas", () => {
  test("usaClasse(): palavra inteira dentro de class, com aspas duplas, simples ou sem aspas", () => {
    expect(usaClasse('<div class="flip-card">', "flip-card")).toBe(true);
    expect(usaClasse("<div class='a flip-card b'>", "flip-card")).toBe(true);
    expect(usaClasse("<div class=flip-card>", "flip-card")).toBe(true);
    expect(usaClasse('<div class="flip-card-inner">', "flip-card")).toBe(false);
    expect(usaClasse("flip-card fora de class", "flip-card")).toBe(false);
  });

  test("limparUrlDoSupabase(): como o re.sub do build.py", () => {
    expect(limparUrlDoSupabase("  https://x.supabase.co/rest/v1/  ")).toBe("https://x.supabase.co");
    expect(limparUrlDoSupabase("https://x.supabase.co///")).toBe("https://x.supabase.co");
    expect(limparUrlDoSupabase("https://x.supabase.co/auth/v1/callback")).toBe("https://x.supabase.co");
    expect(limparUrlDoSupabase("https://x.supabase.co//rest/v1")).toBe("https://x.supabase.co/"); // o Python deixa a "/" (uma passada só)
  });

  test("jsonComoPython(): separadores do json.dumps e escapes", () => {
    expect(jsonComoPython({ a: "x</y", b: ["\t", 1], c: { d: null } })).toBe('{"a": "x</y", "b": ["\\t", 1], "c": {"d": null}}');
  });

  test("comments: false → nada, em build e em prévia", () => {
    for (const comRascunhos of [false, true]) {
      expect(secaoDeComentarios("pt", null, { chaves: { supabase_url: "u", supabase_anon_key: "k" }, ui: {}, comRascunhos, scriptDosComentarios: "/c.js" })).toBeNull();
    }
  });

  test("versalete no <main>: '<' e '>' nos atributos dos COMPONENTES ficam protegidos (o Python os escreve como &lt; &gt;)", () => {
    const html = '<img src="/x.png" alt="A -> Hᴀᴛᴇ <- B 1" loading="lazy"><a title=\'Anterior: A -> Hᴀᴛᴇ <- B\' aria-label="x">Hᴀᴛᴇ</a>';
    // sem a proteção (a regex do shell() direto no HTML do Astro), o alt quebra:
    expect(versaleteEntreTags(html)).toContain('alt="A -> <span class="hc">');
    // com a proteção, os atributos ficam intactos e o texto fora das tags recebe o versalete:
    expect(versaleteNoMain(html)).toBe('<img src="/x.png" alt="A -> Hᴀᴛᴇ <- B 1" loading="lazy"><a title=\'Anterior: A -> Hᴀᴛᴇ <- B\' aria-label="x"><span class="hc">Hate</span></a>');
  });

  test("versalete no <main>: texto do autor, <script> e comentários ficam com a semântica EXATA do Python", () => {
    const autor = '<div title="raw -> Hᴀᴛᴇ <- html">x</div>';
    const script = "<script>window.HC={\"a\": \"x > Hᴀᴛᴇ <\"};</script>";
    const comentario = '<!-- <b title="> Hᴀᴛᴇ <"> -->';
    // dentro da marca do autor, igual à regex do Python (que estraga o atributo, como no site atual)
    expect(versaleteNoMain(textoDoAutor(autor))).toBe(versaleteEntreTags(autor));
    // conteúdo de <script> e comentários: nenhuma proteção (a regex do Python entra neles também)
    expect(versaleteNoMain(script)).toBe(versaleteEntreTags(script));
    expect(versaleteNoMain(comentario)).toBe(versaleteEntreTags(comentario));
    // um texto sem "<"/">" em atributos sai idêntico ao da regex pura
    const comum = '<p class="a">Hᴀᴛᴇ Cʏᴄʟᴇ /ˈwɪθ/</p><img alt="Hᴀᴛᴇ">';
    expect(versaleteNoMain(comum)).toBe(versaleteEntreTags(comum));
  });

  test("protegerAtributos(): só valores entre aspas; aspas simples e duplas; espaço em volta do '='; atributo sem aspas não muda", () => {
    expect(protegerAtributos('<a x = "<>" y=\'<\' z=a>b<c</a>', "{", "}")).toBe('<a x = "{}" y=\'{\' z=a>b<c</a>');
    expect(protegerAtributos('<textarea title="<">a <b title="<"></textarea>', "{", "}")).toBe('<textarea title="{">a <b title="<"></textarea>');
  });

  test("<script type=\"module\"> escrito pelo AUTOR fica no <main>; o dos componentes vai para o fim da página", () => {
    const doAutor = '<script type="module">console.log("Hᴀᴛᴇ")</script>';
    const doComponente = '<script type="module" src="/_astro/x.js"></script>';
    const r = separarScripts(`<div>${textoDoAutor(doAutor)}</div>${doComponente}`);
    expect(r.scripts).toEqual([doComponente]);
    const pronto = finalizarMain(`<div>${textoDoAutor(doAutor)}</div>${doComponente}`, "pt");
    expect(pronto.html).toBe(versaleteEntreTags(`<div>${doAutor}</div>`)); // marcas tiradas, script no lugar
    expect(pronto.scripts).toBe(doComponente);
  });

  test("compararNatural(): algarismos de qualquer escrita e números enormes, como o natural() do Python", () => {
    // python3 -c "import re; natural=lambda s:[int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]; print(sorted(xs, key=natural))"
    const python = ["c\u{1d7d8}.png", "c4.png", "c\u{1d7ff}.png", "c\u{1d7e3}\u{1d7ce}.png", "n9007199254740992.png", "n9007199254740993.png",
      "n12345678901234567890.png", "n12345678901234567891.png", "p\uff11.png", "p2.png", "p\u0663.png", "p10.png"];
    expect([...python].reverse().sort(compararNatural)).toEqual(python);
    expect(compararNatural("n9007199254740992", "n9007199254740993")).toBeLessThan(0); // com Number seriam iguais
  });

  test("globNaPasta(): padrão absoluto ou vazio é erro (o Python também pára)", () => {
    expect(() => globNaPasta(staticDoLeitor, "/comics/*.png")).toThrow(/relativo/);
    expect(() => globNaPasta(staticDoLeitor, "")).toThrow();
  });
});
