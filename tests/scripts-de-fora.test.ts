// T17m (decisão do autor de 22/10): os posts do X, do Reddit e do Instagram voltaram aos SCRIPTS OFICIAIS, como no site antigo (o B27
// fica para depois da virada). O passo "Conferir o resultado" do .github/workflows/deploy.yml só deixa passar esses endereços EXATOS
// (tools/scripts_de_fora.mjs, com --permitir) e lê cada HTML INTEIRO (a busca da T20 era linha por linha). Aqui se prova:
//   1. a regra (tools/scripts_de_fora.mjs): o permitido passa; desconhecido, tag quebrada em linhas, aspas simples, sem aspas, `//cdn…`,
//      maiúsculas, entidades, `data:`/`javascript:` barram; os scripts do próprio site (`/_astro/…`) passam;
//   2. a lista do workflow é EXATAMENTE a dos scripts que o conteúdo usa (content/embeds/*.html + os {{embed:https://…}} montados por
//      src/lib/markdown.ts): nem falta (o deploy pararia) nem sobra (um endereço a mais seria uma porta aberta à toa);
//   3. o site construído (dist/) passa, e os scripts permitidos só aparecem dentro de um post (div.embed), como no Python.
// A paridade do HTML dos posts com o Python (sem exceção nenhuma) está em tests/paginas.test.ts e em tools/paridade_t18.py.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import { describe, expect, test } from "vitest";
import { ehDeFora, scriptsProibidos, srcsDosScripts } from "../tools/scripts_de_fora.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DIST = process.env["HC_DIST"] ?? join(RAIZ, "dist");

/** Os --permitir do passo "Conferir o resultado" do workflow. */
function permitidosNoWorkflow(): string[] {
  const yml = readFileSync(join(RAIZ, ".github/workflows/deploy.yml"), "utf8");
  expect(yml).toContain("node tools/scripts_de_fora.mjs dist");
  return [...yml.matchAll(/--permitir "([^"]+)"/g)].map((m) => m[1] ?? "");
}
const PERMITIDOS = permitidosNoWorkflow();

describe("T17m: a regra do CI para <script src> de fora", () => {
  test("a lista do workflow: os três scripts oficiais dos posts, exatos", () => {
    expect(PERMITIDOS).toEqual(["https://platform.x.com/widgets.js", "https://embed.reddit.com/widgets.js", "//www.instagram.com/embed.js"]);
  });

  test("o permitido passa; os scripts do próprio site passam", () => {
    const ok = [
      '<blockquote class="twitter-tweet"><a href="https://x.com/a/status/1">x</a></blockquote> <script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>',
      '<script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>',
      '<script async src="//www.instagram.com/embed.js"></script>',
      '<script type="module" src="/_astro/CaixaDeComentarios.astro_astro_type_script_index_0_lang.Bx1.js"></script>',
      '<script>window.HC={"url":"x"};</script><script type="module">import "/_astro/a.js";</script>',
      '<script src="site.js"></script><script src="./a.js"></script><div data-src="https://evil.example/x.js"></div>',
    ];
    for (const html of ok) expect(scriptsProibidos(html, PERMITIDOS), html).toEqual([]);
  });

  test("barram: desconhecido, tag em várias linhas, aspas simples, sem aspas, //cdn, maiúsculas, entidades, data:, javascript:, barra invertida", () => {
    const casos: [string, string][] = [
      ['<script src="https://cdn.example.com/x.js"></script>', "https://cdn.example.com/x.js"],
      ['<script\n  async\n  src="https://cdn.example.com/x.js"\n></script>', "https://cdn.example.com/x.js"],
      ["<script src='https://cdn.example.com/x.js'></script>", "https://cdn.example.com/x.js"],
      ["<script src=https://cdn.example.com/x.js></script>", "https://cdn.example.com/x.js"],
      ['<script src="//cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', "//cdn.jsdelivr.net/npm/@supabase/supabase-js@2"],
      ['<SCRIPT SRC="HTTPS://CDN.EXAMPLE.COM/X.JS"></SCRIPT>', "HTTPS://CDN.EXAMPLE.COM/X.JS"],
      ['<script src="&#47;&#47;cdn.example.com/x.js"></script>', "//cdn.example.com/x.js"],
      ['<script src="data:text/javascript,alert(1)"></script>', "data:text/javascript,alert(1)"],
      ['<script src="javascript:alert(1)"></script>', "javascript:alert(1)"],
      ['<script src="\\\\cdn.example.com/x.js"></script>', "\\\\cdn.example.com/x.js"],
      ['<script/src="//cdn.example.com/x.js"></script>', "//cdn.example.com/x.js"],
      ['<script data-x=">" src="//cdn.example.com/x.js"></script>', "//cdn.example.com/x.js"],
      // um parecido com o permitido, mas não EXATO
      ['<script src="https://platform.x.com/widgets.js?v=2"></script>', "https://platform.x.com/widgets.js?v=2"],
      ['<script src="http://platform.x.com/widgets.js"></script>', "http://platform.x.com/widgets.js"],
      ['<script src="https://platform.twitter.com/widgets.js"></script>', "https://platform.twitter.com/widgets.js"],
    ];
    for (const [html, src] of casos) expect(scriptsProibidos(html, PERMITIDOS), html).toEqual([src]);
    expect(ehDeFora("/_astro/x.js")).toBe(false);
    expect(srcsDosScripts('<script\nsrc="a.js"></script><script>1</script>')).toEqual(["a.js"]);
  });

  test("a lista é exatamente a dos scripts que o conteúdo usa (content/embeds/*.html e os {{embed:https://…}} do src/lib/markdown.ts)", () => {
    const usados = new Set<string>();
    const andar = (d: string) => {
      for (const n of readdirSync(d)) {
        const c = join(d, n);
        if (statSync(c).isDirectory()) andar(c);
        else if (/\.(md|html)$/.test(n)) for (const s of srcsDosScripts(readFileSync(c, "utf8"))) if (ehDeFora(s)) usados.add(s);
      }
    };
    andar(join(RAIZ, "content"));
    for (const m of readFileSync(join(RAIZ, "src/lib/markdown.ts"), "utf8").matchAll(/<script async src="([^"]+)"/g)) usados.add(m[1] ?? "");
    expect([...usados].sort()).toEqual([...PERMITIDOS].sort());
  });
});

describe("T17m: o site construído passa no CI e os scripts permitidos só moram dentro dos posts", () => {
  const htmls = (() => {
    const saida: string[] = [];
    const andar = (d: string) => {
      for (const n of readdirSync(d)) {
        const c = join(d, n);
        if (statSync(c).isDirectory()) andar(c);
        else if (n.endsWith(".html")) saida.push(c);
      }
    };
    andar(DIST);
    return saida;
  })();
  test(`dist/: nenhum script de fora fora da lista (${DIST})`, () => {
    expect(htmls.length).toBeGreaterThan(100);
    let permitidos = 0;
    for (const f of htmls) {
      const html = readFileSync(f, "utf8");
      expect(scriptsProibidos(html, PERMITIDOS), f).toEqual([]);
      // cada script de fora mora dentro de um div.embed (o código de incorporação do autor), como no Python
      const doc = parse(html);
      const pilha: { no: unknown; noEmbed: boolean }[] = [{ no: doc, noEmbed: false }];
      while (pilha.length) {
        const { no, noEmbed } = pilha.pop()!;
        const e = no as { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: unknown[]; content?: { childNodes?: unknown[] } };
        const classe = e.attrs?.find((a) => a.name === "class")?.value.split(/\s+/) ?? [];
        const dentro = noEmbed || (e.tagName === "div" && classe.includes("embed"));
        if (e.tagName === "script") {
          const src = e.attrs?.find((a) => a.name === "src")?.value ?? "";
          if (ehDeFora(src)) {
            permitidos++;
            expect(dentro, `${f}: ${src} fora de um div.embed`).toBe(true);
          }
        }
        for (const filho of [...(e.childNodes ?? []), ...(e.content?.childNodes ?? [])]) pilha.push({ no: filho, noEmbed: dentro });
      }
    }
    expect(permitidos).toBeGreaterThan(0); // as notícias com posts têm os scripts oficiais, como no site antigo
  });
});
