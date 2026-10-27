// Prova de que os COMPONENTES e os miolos das páginas da T11 (home, Histórias, obra) desenham o mesmo HTML que o build.py,
// também para os cantos que o conteúdo de hoje não tem: obra fora do universo ("Outras histórias"), obra externa, sem capa,
// com "Em breve", com "👁 Prévia" (só na prévia), emissário com texto, sem foto, com todas as redes, home sem notícias…
//
// A referência (tests/fixtures/componentes-python.json) é o que o build.py escreve em cada <main> e os três atalhos do SHORT
// ({{stories}}, {{other-stories}}, {{emissaries}}); veio de `python3 tools/paginas_ref.py`. Os cenários inventados são os de
// tools/regras_ref.py (tests/fixtures/regras-python.json), recriados numa pasta temporária.
// Aqui os componentes são desenhados um a um pela Container API do Astro (experimental_AstroContainer), recebendo os MESMOS
// dados que as páginas recebem (src/lib/paginas.ts); depois passam pelo MESMO acabamento do layout (src/lib/pagina.ts).
// A comparação é estrutural (tests/ajudantes/html.ts), não por texto cru.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, describe, expect, test } from "vitest";
import ConteudoDaHome from "../src/components/ConteudoDaHome.astro";
import ConteudoDaObra from "../src/components/ConteudoDaObra.astro";
import ConteudoDeHistorias from "../src/components/ConteudoDeHistorias.astro";
import OutrasHistorias from "../src/components/OutrasHistorias.astro";
import SecaoEmissarios from "../src/components/SecaoEmissarios.astro";
import SecaoHistorias from "../src/components/SecaoHistorias.astro";
import { paginaDaObra } from "../src/lib/capitulos";
import { langs, t, tDoConfig, type Lang } from "../src/lib/config";
import { CHAVES_DO_BLOG, TEXTOS_DO_BLOG } from "../src/lib/textosDoBlog";
import { dadosDoIdioma } from "../src/lib/idioma";
import { finalizarMain, separarScripts } from "../src/lib/pagina";
import { dadosDaHome, dadosDosAtalhos } from "../src/lib/paginas";
import { blogComoNoPython, canonicoDoMiolo, cartaoEmOutroIdiomaComoNoPython, homeComoNoPython, soQuatroHistoriasNaHome } from "./ajudantes/html";
import { carregarConteudo } from "./ajudantes/conteudo";

interface Ambiente {
  nome: string;
  rascunhos: boolean;
  arquivos_sha1: string | null;
  short: Record<Lang, Record<"stories" | "other-stories" | "emissaries", string>>;
  mains: Record<string, string>;
}
const ref: { ambientes: Ambiente[] } = JSON.parse(readFileSync(new URL("./fixtures/componentes-python.json", import.meta.url), "utf8"));
const regras: { cenarios: { nome: string; arquivos: Record<string, string>; build: { config: { show_extras: boolean; emissaries_hide: string[]; emissaries_show_texts: boolean } } }[]; real: { build: { config: { show_extras: boolean; emissaries_hide: string[]; emissaries_show_texts: boolean } } } } = JSON.parse(
  readFileSync(new URL("./fixtures/regras-python.json", import.meta.url), "utf8"),
);
const RAIZ = fileURLToPath(new URL("../content/", import.meta.url));
const REFAZER = "A referência está velha: rode `python3 tools/regras_ref.py` e `python3 tools/paginas_ref.py` e depois `pnpm test` de novo.";

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});
function pastaTemporaria(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "hc-paginas-teste-"));
  pastas.push(raiz);
  for (const [caminho, texto] of Object.entries(arquivos)) {
    const alvo = join(raiz, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, texto, "utf8");
  }
  return raiz;
}
const sha = (arquivos: Record<string, string>) => createHash("sha1").update(pythonJson(arquivos)).digest("hex");
/** json.dumps(x, sort_keys=True, ensure_ascii=False) do Python: chaves em ordem, ", " e ": " como separadores. */
function pythonJson(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(pythonJson).join(", ")}]`;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${pythonJson((o as Record<string, unknown>)[k])}`).join(", ")}}`;
}

const container = await AstroContainer.create();
/** Desenha um componente e devolve o HTML sem os <script> do componente (que o layout leva para o fim da página). */
const desenhar = async (componente: Parameters<typeof container.renderToString>[0], props: Record<string, unknown>) =>
  separarScripts(await container.renderToString(componente, { props })).html;

let comparados = 0;
afterAll(() => console.log(`\nComponentes e miolos das páginas — ${comparados} trechos de HTML comparados com o build.py (estrutura, atributos, classes e texto).\n`));

for (const amb of ref.ambientes) {
  const cenario = amb.nome === "real" ? undefined : regras.cenarios.find((c) => c.nome === amb.nome);
  const cfg = (cenario ?? regras.real).build.config;
  const raiz = cenario ? pastaTemporaria(cenario.arquivos) : RAIZ;
  const entradas = carregarConteudo(raiz, { comRascunhos: amb.rascunhos, mostrarExtras: cfg.show_extras });

  describe(`${amb.nome} · ${amb.rascunhos ? "prévia" : "build"}`, () => {
    test("a referência é do mesmo conteúdo", () => {
      if (cenario) expect(sha(cenario.arquivos), REFAZER).toBe(amb.arquivos_sha1);
    });

    for (const lang of langs) {
      const dados = dadosDoIdioma(entradas, lang, { comRascunhos: amb.rascunhos, mostrarExtras: cfg.show_extras, emissariosEscondidos: cfg.emissaries_hide, todosOsIdiomas: langs });
      const atalhos = dadosDosAtalhos(dados, amb.rascunhos, cfg.emissaries_show_texts);

      // T17m: o cartão da obra que só tem capítulo no outro idioma leva até lá; no Python, "Em breve" (tests/obras-em-outro-idioma.test.ts)
      // T17n: a etiqueta "Post do blog"/"Blog post" dos cartões de "Últimas atualizações" volta ao texto do config.json (tests/blog.test.ts)
      const doConfig = Object.fromEntries(CHAVES_DO_BLOG.map((k) => [k, tDoConfig(lang, k)])) as Record<(typeof CHAVES_DO_BLOG)[number], string>;
      const igual = (atual: string, esperado: string, quem: string) => {
        const semBlog = blogComoNoPython(atual, TEXTOS_DO_BLOG[lang], doConfig).html;
        expect(canonicoDoMiolo(cartaoEmOutroIdiomaComoNoPython(semBlog, t(lang, "soon")).html), quem).toBe(canonicoDoMiolo(esperado));
        comparados++;
      };

      test(`${lang}: os três atalhos do SHORT ({{stories}}, {{other-stories}}, {{emissaries}})`, async () => {
        const py = amb.short[lang];
        igual(await desenhar(SecaoHistorias, { lang, ...atalhos.historias }), py["stories"], "{{stories}}");
        igual(await desenhar(OutrasHistorias, { lang, cartoes: atalhos.outras }), py["other-stories"], "{{other-stories}}");
        igual(await desenhar(SecaoEmissarios, { lang, cartoes: atalhos.emissarios }), py["emissaries"], "{{emissaries}}");
      });

      test(`${lang}: home — o <main> inteiro, depois do acabamento do layout`, async () => {
        const url = `/${lang}/`;
        const miolo = await desenhar(ConteudoDaHome, { lang, dados: dadosDaHome(dados, amb.rascunhos) });
        // T17j: o trilho e o link "Ver todas as histórias" só do Astro, e no máximo 4 histórias (tests/ajudantes/html.ts, tests/home.test.ts)
        igual(homeComoNoPython(finalizarMain(miolo, lang).html).html, soQuatroHistoriasNaHome(amb.mains[url] ?? "").html, url);
      });

      test(`${lang}: Histórias — o <main> inteiro, com {{stories}} trocado pelo componente`, async () => {
        const url = `/${lang}/works/`;
        const miolo = await desenhar(ConteudoDeHistorias, { lang });
        const stories = await desenhar(SecaoHistorias, { lang, ...atalhos.historias });
        igual(finalizarMain(miolo, lang, { stories }).html, amb.mains[url] ?? "", url);
      });

      test(`${lang}: páginas de obra — as mesmas obras, cada <main> inteiro`, async () => {
        const esperadas = Object.keys(amb.mains).filter((u) => u.startsWith(`/${lang}/works/`) && u !== `/${lang}/works/`).sort();
        const feitas: string[] = [];
        for (const obra of dados.obras) {
          const pagina = paginaDaObra(obra, lang, dados.capitulosDe(obra));
          if (!pagina) continue;
          const url = `/${lang}/works/${obra.data._origem.slug}/`;
          feitas.push(url);
          igual(finalizarMain(await desenhar(ConteudoDaObra, { pagina }), lang).html, amb.mains[url] ?? "", url);
        }
        expect(feitas.sort(), "obras com página própria").toEqual(esperadas);
      });
    }
  });
}
