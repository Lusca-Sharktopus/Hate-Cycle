// Prova de que as PÁGINAS AVULSAS (Sobre, Apoio…), o UNIVERSO, os PERSONAGENS, a RAIZ, os REDIRECTS e os FEEDS (T14) saem iguais
// aos do build.py também no que o conteúdo de hoje não tem: Sobre larga com o texto do Projeto na frente, {{emissaries}},
// {{stories}} e {{other-stories}} dentro de páginas, página sem título e sem resumo, página só em um idioma, Apoio em rascunho (só
// na prévia), carta que vira e posts alternados num texto de página; e, com `show_extras` ligado, listas e itens de Universo e
// Personagens (verbete com figura e "Veja também", ficha com retrato e "Aparece em" para obra externa, de capítulo único, com página,
// sem capítulo, escondida e inexistente) — e tudo isso DESLIGADO quando show_extras é false (nenhuma página, nenhum link).
//
// A referência (tests/fixtures/paginas-t14-python.json → "ambientes") vem de `python3 tools/paginas_ref.py`: o build() de verdade
// sobre o content/ de verdade (sem e com Extras) e sobre cada site inventado (os de tools/regras_ref.py e o cenário_paginas de
// tools/paginas_ref.py), em build e em prévia. De cada página: os argumentos que o Python passou ao shell() e o <main> final;
// de cada ambiente, também a raiz, as páginas do site antigo e os feeds, EXATOS. Aqui, o mesmo site é recriado numa pasta
// temporária, lido com o MESMO carregador e as MESMAS regras do Astro, desenhado pelos componentes (Container API do Astro) e
// acabado pelo MESMO finalizarMain() do layout. Comparação estrutural (tests/ajudantes/html.ts) para as páginas; byte a byte
// para a raiz, os redirects e os feeds. As páginas REAIS (o site construído de verdade) são provadas em tests/paginas.test.ts.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import FichaDePersonagem from "../src/components/FichaDePersonagem.astro";
import ListaDePersonagens from "../src/components/ListaDePersonagens.astro";
import ListaDoUniverso from "../src/components/ListaDoUniverso.astro";
import OutrasHistorias from "../src/components/OutrasHistorias.astro";
import PaginaAvulsa from "../src/components/PaginaAvulsa.astro";
import SecaoEmissarios from "../src/components/SecaoEmissarios.astro";
import SecaoHistorias from "../src/components/SecaoHistorias.astro";
import VerbeteDoUniverso from "../src/components/VerbeteDoUniverso.astro";
import { itensDoRss } from "../src/lib/atualizacoes";
import { langName, langs, siteName, t, type Lang } from "../src/lib/config";
import type { NomeDeAtalho } from "../src/lib/corpos";
import { dadosDoIdioma } from "../src/lib/idioma";
import { finalizarMain } from "../src/lib/pagina";
import { dadosDosAtalhos } from "../src/lib/paginas";
import { paginasAvulsas } from "../src/lib/paginasAvulsas";
import { fichasDePersonagens, listaDePersonagens, listaDoUniverso, verbetesDoUniverso } from "../src/lib/paginasDeExtras";
import { paginaDaRaiz, paginaDeRedirecionamento, redirecionamentosQueViramPagina } from "../src/lib/raiz";
import { feedRss } from "../src/lib/rss";
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
  config: { show_extras: boolean; redirects: Record<string, string>; site_url: string; emissaries_hide: string[]; emissaries_show_texts: boolean };
  paginas: Record<string, { shell: Shell; main: string }>;
  exatos: Record<string, string>;
}
const ref: { ambientes: Ambiente[]; arquivos_das_paginas: Record<string, string>; arquivos_do_redirect: Record<string, string> } = JSON.parse(
  readFileSync(new URL("./fixtures/paginas-t14-python.json", import.meta.url), "utf8"),
);
const regras: { cenarios: { nome: string; arquivos: Record<string, string> }[] } = JSON.parse(readFileSync(new URL("./fixtures/regras-python.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/regras_ref.py` e `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-avulsas-teste-"));
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

const container = await AstroContainer.create();
const desenhar = (componente: Parameters<typeof container.renderToString>[0], props: Record<string, unknown>) => container.renderToString(componente, { props });

let comparadas = 0;
afterAll(() => console.log(`\nT14 — ${comparadas} páginas avulsas / de Extras de sites inventados comparadas com o build.py (<main> e argumentos do shell()).\n`));

/** De onde vêm os arquivos de cada ambiente: o content/ de verdade, o cenário da T14, o dos redirects ou um dos de tools/regras_ref.py. */
function arquivosDoAmbiente(nome: string): Record<string, string> | null {
  if (nome.startsWith("real")) return null;
  if (nome.startsWith("paginas")) return ref.arquivos_das_paginas;
  if (nome === "redirects") return ref.arquivos_do_redirect;
  const cenario = regras.cenarios.find((c) => c.nome === nome);
  if (!cenario) throw new Error(`sem arquivos para o ambiente ${nome}`);
  return cenario.arquivos;
}

for (const amb of ref.ambientes) {
  const arquivos = arquivosDoAmbiente(amb.nome);
  const raiz = arquivos ? pastaTemporaria(arquivos) : join(RAIZ, "content");
  const cfg = amb.config;
  const opcoes = { comRascunhos: amb.rascunhos, mostrarExtras: cfg.show_extras };
  const entradas = carregarConteudo(raiz, opcoes);
  const montar = (l: Lang) => dadosDoIdioma(entradas, l, { ...opcoes, emissariosEscondidos: cfg.emissaries_hide, todosOsIdiomas: langs });
  const dadosDe = Object.fromEntries(langs.map((l) => [l, montar(l)])) as Record<Lang, ReturnType<typeof montar>>;
  const quantosDe = (campo: "universoExtra" | "personagens") => Object.fromEntries(langs.map((l) => [l, dadosDe[l][campo].length])) as Record<Lang, number>;
  const publicadas = Object.fromEntries(langs.map((l) => [l, dadosDe[l].paginas])) as Record<Lang, (typeof dadosDe)[Lang]["paginas"]>;
  const universoPor = Object.fromEntries(langs.map((l) => [l, dadosDe[l].universoExtra])) as Record<Lang, (typeof dadosDe)[Lang]["universoExtra"]>;
  const personagensPor = Object.fromEntries(langs.map((l) => [l, dadosDe[l].personagens])) as Record<Lang, (typeof dadosDe)[Lang]["personagens"]>;

  /** Cada página do ambiente: endereço, argumentos do shell() (como o BaseLayout os recebe) e o <main> pronto. */
  const paginas = async () => {
    const saida: { url: string; shell: Shell; main: string; scripts: string; esperaScripts: boolean; atalhos?: boolean }[] = [];
    for (const lang of langs) {
      const dados = dadosDe[lang];
      const atalhos = dadosDosAtalhos(dados, amb.rascunhos, cfg.emissaries_show_texts);
      for (const pagina of paginasAvulsas(dados.paginas, lang, publicadas)) {
        const pedacos: Partial<Record<NomeDeAtalho, string>> = {};
        if (pagina.atalhos.includes("stories")) pedacos.stories = await desenhar(SecaoHistorias, { lang, ...atalhos.historias });
        if (pagina.atalhos.includes("other-stories")) pedacos["other-stories"] = await desenhar(OutrasHistorias, { lang, cartoes: atalhos.outras });
        if (pagina.atalhos.includes("emissaries")) pedacos.emissaries = await desenhar(SecaoEmissarios, { lang, cartoes: atalhos.emissarios });
        const pronto = finalizarMain(await desenhar(PaginaAvulsa, { pagina }), lang, pedacos);
        saida.push({
          url: pagina.url,
          shell: { titulo: pagina.tituloDaPagina, alt: pagina.alternativas, cls: "", desc: pagina.descricao, imagem: "", noindex: false },
          main: pronto.html,
          scripts: pronto.scripts,
          esperaScripts: pagina.temCartaQueVira || pagina.temPostsAlternados,
          atalhos: pagina.atalhos.length > 0,
        });
      }
      const lista = listaDoUniverso(dados.universoExtra, lang, quantosDe("universoExtra"));
      if (lista) {
        saida.push({ url: lista.url, shell: { titulo: lista.tituloDaPagina, alt: lista.alternativas, cls: "", desc: "", imagem: "", noindex: false }, main: finalizarMain(await desenhar(ListaDoUniverso, { lista }), lang).html, scripts: "", esperaScripts: false });
      }
      for (const verbete of verbetesDoUniverso(dados.universoExtra, lang, { publicadosPorIdioma: universoPor, relacionadosDe: dados.relacionadosDe })) {
        const pronto = finalizarMain(await desenhar(VerbeteDoUniverso, { verbete }), lang);
        saida.push({
          url: verbete.url,
          shell: { titulo: verbete.tituloDaPagina, alt: verbete.alternativas, cls: "", desc: verbete.descricao, imagem: verbete.imagem, noindex: false },
          main: pronto.html,
          scripts: pronto.scripts,
          esperaScripts: verbete.temCartaQueVira || verbete.temPostsAlternados,
        });
      }
      const listaP = listaDePersonagens(dados.personagens, lang, quantosDe("personagens"));
      if (listaP) {
        saida.push({ url: listaP.url, shell: { titulo: listaP.tituloDaPagina, alt: listaP.alternativas, cls: "", desc: "", imagem: "", noindex: false }, main: finalizarMain(await desenhar(ListaDePersonagens, { lista: listaP }), lang).html, scripts: "", esperaScripts: false });
      }
      const fichas = fichasDePersonagens(dados.personagens, lang, {
        publicadosPorIdioma: personagensPor,
        relacionadosDe: dados.relacionadosDe,
        obras: dados.obras,
        capitulosListados: (obra) => dados.capitulosDe(obra).listados,
      });
      for (const ficha of fichas) {
        const pronto = finalizarMain(await desenhar(FichaDePersonagem, { ficha }), lang);
        saida.push({
          url: ficha.url,
          shell: { titulo: ficha.tituloDaPagina, alt: ficha.alternativas, cls: "", desc: ficha.descricao, imagem: ficha.imagem, noindex: false },
          main: pronto.html,
          scripts: pronto.scripts,
          esperaScripts: ficha.temCartaQueVira || ficha.temPostsAlternados,
        });
      }
    }
    return saida;
  };

  describe(`${amb.nome} · ${amb.rascunhos ? "prévia" : "build"}`, () => {
    test("a referência é do mesmo conteúdo", () => {
      if (arquivos) expect(sha(arquivos), REFAZER).toBe(amb.arquivos_sha1);
    });

    test("as mesmas páginas (avulsas, Universo, Personagens): nenhuma a mais, nenhuma a menos; a 404 é a mesma em todo ambiente", async () => {
      const feitas = (await paginas()).map((p) => p.url).sort();
      expect(feitas, REFAZER).toEqual(Object.keys(amb.paginas).filter((u) => u !== "/404.html").sort());
    });

    test("cada página: argumentos do shell() (título, descrição, imagem, idiomas) e <main> inteiro", async () => {
      for (const p of await paginas()) {
        const py = amb.paginas[p.url];
        if (!py) throw new Error(`o Python não gerou ${p.url}`);
        expect(p.shell, p.url).toEqual(py.shell);
        expect(canonicoDoMiolo(p.main), p.url).toBe(canonicoDoMiolo(py.main));
        // JavaScript só onde precisa: a carta que vira e os posts alternados (obrigatórios quando o texto os usa); os cartões dos atalhos
        // ({{stories}}, {{emissaries}}…) também trazem o seu (imagem ausente, seletor); sem nada disso, a página não leva script de componente
        if (p.atalhos) {
          if (p.esperaScripts) expect(p.scripts, `${p.url}: scripts de componente`).not.toBe("");
        } else expect(p.scripts !== "", `${p.url}: scripts de componente`).toBe(p.esperaScripts);
        comparadas++;
      }
    });

    test("RSS: o XML de cada idioma é IGUAL, byte a byte, ao do Python", () => {
      for (const lang of langs) {
        const xml = feedRss({ nomeDoSite: siteName, enderecoDoSite: cfg.site_url, lang, descricao: t(lang, "hero_sub"), itens: itensDoRss(dadosDe[lang].atualizacoes) });
        expect(xml === amb.exatos[`/${lang}/feed.xml`], `/${lang}/feed.xml`).toBe(true);
      }
    });

    test("raiz e páginas do site antigo: IGUAIS, byte a byte, às do Python (config.json → redirects, menos index.html e os que vão para /)", () => {
      expect(paginaDaRaiz(siteName, langs.map((chave) => ({ chave, nome: langName(chave) }))) === amb.exatos["/"], "/").toBe(true);
      const esperados = redirecionamentosQueViramPagina(cfg.redirects);
      const feitos = Object.fromEntries(esperados.map(([antigo, destino]) => ["/" + antigo, paginaDeRedirecionamento(destino)]));
      const doPython = Object.fromEntries(Object.entries(amb.exatos).filter(([u]) => /^\/[^/]+\.html$/.test(u)));
      expect(Object.keys(feitos).sort()).toEqual(Object.keys(doPython).sort());
      for (const [url, html] of Object.entries(feitos)) expect(html === doPython[url], url).toBe(true);
    });
  });
}

describe("o cenário da T14 exercita o que promete", () => {
  const amb = (nome: string, rascunhos: boolean) => ref.ambientes.find((a) => a.nome === nome && a.rascunhos === rascunhos);
  const main = (nome: string, rascunhos: boolean, url: string) => amb(nome, rascunhos)?.paginas[url]?.main ?? "";
  const urls = (nome: string, rascunhos: boolean) => Object.keys(amb(nome, rascunhos)?.paginas ?? {}).sort();

  test("Sobre: coluna larga, título só para leitor de tela, o texto do Projeto na frente, emissários e carta que vira", () => {
    const m = main("paginas", false, "/en/about/");
    expect(m).toContain('class="wrap wide block page-about"');
    expect(m).toContain('<h1 class="sr-only">About the author</h1>');
    expect(m.indexOf("apollo-gif")).toBeGreaterThan(-1);
    expect(m.indexOf("apollo-gif")).toBeLessThan(m.indexOf("autor-foto")); // o Projeto vem antes
    expect(m).toContain('class="emissaries"');
    expect(m).toContain("stories-block"); // {{other-stories}} do texto do Projeto
    expect(m).toContain("flip-card");
  });
  test("página simples: coluna estreita, título pelo nome da pasta, sem resumo; posts alternados", () => {
    const m = main("paginas", false, "/pt/regras/");
    expect(m).toContain('class="wrap narrow block page-regras"');
    expect(m).toContain("<h1>regras</h1>");
    expect(amb("paginas", false)?.paginas["/pt/regras/"]?.shell.desc).toBe("");
    expect(main("paginas", false, "/en/regras/")).toContain("embed-alt");
  });
  test("Apoio é rascunho: só existe na prévia, com o aviso; página só em um idioma não tem o outro", () => {
    expect(urls("paginas", false)).not.toContain("/en/support/");
    expect(main("paginas", true, "/en/support/")).toContain('<p class="draft-banner">');
    expect(urls("paginas", false)).toContain("/en/so-en/");
    expect(urls("paginas", false)).not.toContain("/pt/so-en/");
    expect(amb("paginas", false)?.paginas["/en/so-en/"]?.shell.alt).toEqual({ en: "/en/so-en/" });
  });
  test("{{stories}}, {{other-stories}} e {{emissaries}} dentro de uma página; atalho desconhecido vira nada", () => {
    const m = main("paginas", false, "/en/atalhos/");
    expect(m).toContain('class="sorter"');
    expect(m).toContain('class="emissaries"');
    expect(m).not.toContain("{{nada}}");
  });
  test("Extras ligados: listas e itens de Universo e Personagens; verbete com figura; ficha com 'Aparece em'", () => {
    const u = urls("paginas", false);
    for (const esperada of ["/en/universe/", "/pt/universe/", "/en/universe/magia/", "/en/characters/", "/pt/characters/harry/", "/en/characters/so-en/"]) expect(u).toContain(esperada);
    expect(u).not.toContain("/pt/characters/so-en/");
    expect(main("paginas", false, "/en/universe/magia/")).toContain('<figure class="lead">');
    const ficha = main("paginas", false, "/en/characters/harry/");
    expect(ficha).toContain('class="portrait"');
    expect(ficha).toContain("Appears in:");
    expect(ficha).toContain('href="#"'); // obra sem capítulo
    expect(ficha).toContain('href="https://exemplo.com/en"'); // obra externa
    expect(ficha).toContain("See also:");
  });
  test("Extras desligados: nenhuma página de Universo nem de Personagens; as avulsas continuam", () => {
    const u = urls("paginas-sem-extras", false);
    expect(u.filter((x) => /\/(universe|characters)\//.test(x))).toEqual([]);
    expect(u).toContain("/en/about/");
    expect(urls("real", true).filter((x) => /\/(universe|characters)\//.test(x))).toEqual([]);
  });
  test("o content/ de verdade com Extras ligados: os exemplos do autor são rascunhos, então só aparecem na prévia", () => {
    expect(urls("real-extras", false).filter((x) => /\/(universe|characters)\//.test(x))).toEqual([]);
    expect(urls("real-extras", true)).toEqual(expect.arrayContaining(["/en/universe/", "/pt/universe/hidden-magic/", "/en/characters/olivia-purinna/"]));
  });
  test("redirects inventados: só viram página os .html que não vão para / (index.html e b.html ficam de fora); '&' no destino fica como está", () => {
    const e = amb("redirects", false)?.exatos ?? {};
    expect(Object.keys(e).filter((u) => u.endsWith(".html")).sort()).toEqual(["/PT.html", "/a.html", "/c.html"]);
    expect(e["/c.html"]).toContain('url=/pt/?q=1&r=2');
  });
});
