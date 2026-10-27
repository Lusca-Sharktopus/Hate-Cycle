// Provas da T17 (imagens leves, fontes do próprio site, silhuetas): o que o visitante vê NÃO muda, e o que mudou é exatamente o que se disse.
//
// Parte 1 — regras puras (src/lib/imagens.ts, src/lib/imagensDoHtml.ts): que larguras gerar, qual perfil para qual lugar, o que entra na tag.
// Parte 2 — o site construído de verdade (`astro build` numa pasta temporária, ou HC_DIST=<pasta> para reaproveitar um dist/):
//   * TODA <img> com versões leves, de TODAS as páginas: o `src` continua sendo um arquivo que existe; cada endereço do `srcset` é um arquivo
//     que existe, é WebP, tem a largura que o `srcset` diz, nunca é maior que o original, sai do MESMO arquivo do `src` (o nome leva o nome do
//     original) e, comparado em miniatura, é a MESMA imagem (não uma outra, nem trocada de lugar); `width`/`height` são os do original;
//   * as fontes: nenhuma página nem CSS fala com o Google Fonts ou com o jsDelivr; todo @font-face aponta para um arquivo que existe; os dois
//     pré-carregamentos apontam para fontes que o CSS declara; src/styles/fontes.css é o que o gerador produz (tools/gerar_fontes_css.mjs);
//   * as runas: cada glifo de RUNES tem fonte (cobertura.json), os arquivos existem e as famílias são as da lista `font-family` das runas;
//   * as silhuetas do `shape-outside`: mesmo tamanho e mesmo contorno (alfa > 0) do desenho; o CSS não mexe no limiar do contorno;
//   * o fundo leve da abertura e o ícone do site.
// As diferenças aceitas no HTML (os 5 atributos novos da <img>, os <link> de fonte e o ícone) estão em tests/ajudantes/html.ts, e
// tests/paginas.test.ts prova que, fora isso, cada página continua igual à do site Python.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { gerarWebpAnimado, lerAnimada, urlDaAnimada } from "../src/lib/animadas";
import { BYTES_MINIMOS, largurasDaImagem, PERFIS } from "../src/lib/imagens";
import { arquivoDoSrc, atributosNovos, perfilDoLugar } from "../src/lib/imagensDoHtml";
import { GLIFOS } from "../src/lib/runas";
import { gerarSilhueta, SILHUETAS } from "../src/lib/silhuetas";
import { cabecalhoDoWebpAnimado } from "./ajudantes/webp";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// ───────────────────────── parte 1: regras puras ─────────────────────────

describe("largurasDaImagem: nunca amplia, nunca gera à toa", () => {
  test("original maior que todas as larguras: as do perfil", () => {
    expect(largurasDaImagem(6000, [480, 800, 1200, 1800])).toEqual([480, 800, 1200, 1800]);
  });
  test("original no meio: só as menores, mais o próprio tamanho do original", () => {
    expect(largurasDaImagem(1000, [480, 800, 1200, 1800])).toEqual([480, 800, 1000]);
    expect(largurasDaImagem(1200, [480, 800, 1200, 1800])).toEqual([480, 800, 1200]);
  });
  test("original menor ou igual à menor versão: nada a fazer", () => {
    expect(largurasDaImagem(480, [480, 800])).toEqual([]);
    expect(largurasDaImagem(300, [480, 800])).toEqual([]);
    expect(largurasDaImagem(1000, [])).toEqual([]);
  });
  test("o resultado é sempre crescente e nunca passa do original", () => {
    for (const perfil of Object.values(PERFIS)) {
      for (const original of [100, 250, 481, 900, 1500, 4000, 9000]) {
        const r = largurasDaImagem(original, perfil.larguras);
        expect([...r].sort((a, b) => a - b)).toEqual(r);
        for (const l of r) expect(l).toBeLessThanOrEqual(original);
      }
    }
  });
});

describe("PERFIS: larguras crescentes e `sizes` bem formado", () => {
  test.each(Object.entries(PERFIS))("%s", (_nome, perfil) => {
    expect([...perfil.larguras].sort((a, b) => a - b)).toEqual([...perfil.larguras]);
    expect(new Set(perfil.larguras).size).toBe(perfil.larguras.length);
    expect(perfil.sizes).toMatch(/^(\([^)]+\)\s[^,]+,\s)*[^,()]+(\([^)]*\))?$|^clamp\([^)]+\)$/);
    expect(perfil.qualidade).toBeGreaterThanOrEqual(80);
    expect(perfil.qualidade).toBeLessThanOrEqual(95);
  });
  test("os nomes dos perfis são únicos", () => {
    const nomes = Object.values(PERFIS).map((p) => p.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
  test("o limite de peso é o de 30 KB", () => {
    expect(BYTES_MINIMOS).toBe(30 * 1024);
  });
});

const lugar = (propria: string, ...ancestrais: string[]) => ({ propria: new Set(propria.split(" ").filter(Boolean)), ancestrais: new Set(ancestrais) });

describe("perfilDoLugar: o lugar da imagem decide o perfil", () => {
  test("capas: no carrossel e na grade", () => {
    expect(perfilDoLugar(lugar("", "work-card", "rail"))).toBe(PERFIS.capaDoCarrossel);
    expect(perfilDoLugar(lugar("", "work-card"))).toBe(PERFIS.capaDaGrade);
  });
  test("o que os componentes desenham", () => {
    expect(perfilDoLugar(lugar("", "update"))).toBe(PERFIS.atualizacao);
    expect(perfilDoLugar(lugar("", "emi-photo"))).toBe(PERFIS.emissario);
    expect(perfilDoLugar(lugar("", "news-thumb"))).toBe(PERFIS.miniatura);
    expect(perfilDoLugar(lugar("news-stk"))).toBe(PERFIS.figurinha);
    expect(perfilDoLugar(lugar("cover", "work-head"))).toBe(PERFIS.capaDaObra);
    expect(perfilDoLugar(lugar("title-image"))).toBe(PERFIS.tituloDeCapitulo);
    expect(perfilDoLugar(lugar("so-img so-img-1"))).toBe(PERFIS.ordemDeLeitura); // T17c: arte do bloco "estou lendo em ordem"
    expect(perfilDoLugar(lugar("so-img so-img-2"))).toBe(PERFIS.ordemDeLeitura);
    expect(perfilDoLugar(lugar("so-layer"))).toBe(PERFIS.camadaDaOrdem); // T17h: cada personagem da arte em camadas
    expect(perfilDoLugar(lugar("so-layer so-surge"))).toBe(PERFIS.camadaDaOrdem);
    expect(perfilDoLugar(lugar("", "comic"))).toBe(PERFIS.paginaDeQuadrinho);
    expect(perfilDoLugar(lugar("", "lead"))).toBe(PERFIS.figuraDeNoticia);
  });
  test("o que o autor escreve", () => {
    expect(perfilDoLugar(lugar("jusep"))).toBe(PERFIS.contornada);
    expect(perfilDoLugar(lugar("autor-foto"))).toBe(PERFIS.fotoDoAutor);
    expect(perfilDoLugar(lugar("", "s1-art"))).toBe(PERFIS.ilustracaoGrande);
    expect(perfilDoLugar(lugar("", "strip-row"))).toBe(PERFIS.tira);
    expect(perfilDoLugar(lugar("", "flip-card"))).toBe(PERFIS.carta);
    expect(perfilDoLugar(lugar("", "prose"))).toBe(PERFIS.imagemDoTexto);
    expect(perfilDoLugar(lugar(""))).toBe(PERFIS.imagemDoTexto);
  });
  test("ícones dos botões e o divisor de cena ficam como estão", () => {
    expect(perfilDoLugar(lugar("", "embed-btn"))).toBeNull();
    expect(perfilDoLugar(lugar("scene-divider"))).toBeNull();
  });
});

describe("arquivoDoSrc: só caminhos locais do site", () => {
  test.each([
    ["/covers/PT/Capa%20X.png", "covers/PT/Capa X.png"],
    ["/covers/PT/Capa%20X.png?v=3", "covers/PT/Capa X.png"],
    ["/other images/Giuseppe.png", "other images/Giuseppe.png"],
    ["/logos/Anf%C3%ADbio.png#x", "logos/Anfíbio.png"],
  ])("%s → %s", (src, esperado) => expect(arquivoDoSrc(src)).toBe(esperado));
  test.each(["https://exemplo.com/a.png", "//cdn.exemplo.com/a.png", "data:image/png;base64,AAAA", "a/b.png", "/../segredo.png", "/a/../b.png", "/%E0%A4%A", "/", ""])(
    "%j não é um arquivo local",
    (src) => expect(arquivoDoSrc(src)).toBeNull(),
  );
});

describe("atributosNovos: o que entra no fim da tag", () => {
  const imagem = { srcset: "/a_x.webp 480w, /a_y.webp 800w", sizes: "800px", width: 1600, height: 900 };
  const tag = { temWidthOuHeight: false, styleComHeight: false, temDecoding: false, preguicosa: false };
  test("o caso comum: srcset, sizes, width e height (e `decoding` só nas preguiçosas)", () => {
    expect(atributosNovos(imagem, tag)).toBe(' srcset="/a_x.webp 480w, /a_y.webp 800w" sizes="800px" width="1600" height="900"');
    expect(atributosNovos(imagem, { ...tag, preguicosa: true })).toBe(' srcset="/a_x.webp 480w, /a_y.webp 800w" sizes="800px" width="1600" height="900" decoding="async"');
  });
  test("se o autor já deu largura/altura, ou uma altura no style, a tag não ganha width/height", () => {
    expect(atributosNovos(imagem, { ...tag, temWidthOuHeight: true })).toBe(' srcset="/a_x.webp 480w, /a_y.webp 800w" sizes="800px"');
    expect(atributosNovos(imagem, { ...tag, styleComHeight: true })).toBe(' srcset="/a_x.webp 480w, /a_y.webp 800w" sizes="800px"');
  });
  test("nunca repete `decoding` que o autor já pôs", () => {
    expect(atributosNovos(imagem, { ...tag, preguicosa: true, temDecoding: true })).not.toContain("decoding");
  });
  test("aspas dentro do valor são escapadas", () => {
    expect(atributosNovos({ ...imagem, sizes: 'a"b' }, tag)).toContain('sizes="a&quot;b"');
  });
  test("T17i: a tag que já diz quanto ocupa (as camadas do bloco \"em ordem\") fica com o próprio sizes; só ganha o srcset e o resto", () => {
    expect(atributosNovos(imagem, { ...tag, temSizes: true })).toBe(' srcset="/a_x.webp 480w, /a_y.webp 800w" width="1600" height="900"');
  });
});

// ───────────────────────── parte 2: o site construído ─────────────────────────

type No = DefaultTreeAdapterMap["node"];
type Elemento = DefaultTreeAdapterMap["element"];
const ehElemento = (n: No): n is Elemento => "tagName" in n;
const filhosDe = (n: No): No[] => {
  const alvo = "content" in n ? n.content : n;
  return "childNodes" in alvo ? alvo.childNodes : [];
};
const attr = (e: Elemento, nome: string): string | undefined => e.attrs.find((a) => a.name === nome)?.value;
function varrer(n: No, quando: (e: Elemento) => boolean, achados: Elemento[] = []): Elemento[] {
  if (ehElemento(n) && quando(n)) achados.push(n);
  for (const f of filhosDe(n)) varrer(f, quando, achados);
  return achados;
}

function arquivosDe(pasta: string): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else achados.push(relative(pasta, caminho).split(sep).join("/"));
    }
  };
  andar(pasta);
  return achados.sort();
}

let dist = process.env["HC_DIST"] ? join(RAIZ, process.env["HC_DIST"]) : "";
let pastaTemporaria = "";
beforeAll(() => {
  if (dist) return;
  pastaTemporaria = mkdtempSync(join(tmpdir(), "hc-imagens-dist-"));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", HC_OUT_DIR: pastaTemporaria };
  for (const chave of Object.keys(env)) if (chave.startsWith("VITEST") || ["MODE", "DEV", "PROD", "SSR", "TEST", "BASE_URL", "SITE", "ASSETS_PREFIX", "FORCE_TTY"].includes(chave)) delete env[chave];
  delete env["HC_SHOW_EXTRAS"];
  delete env["HC_IMAGENS"];
  const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "astro", "bin", "astro.mjs"), "build"], { cwd: RAIZ, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`astro build falhou:\n${r.stdout}\n${r.stderr}`);
  dist = pastaTemporaria;
}, 300_000);
afterAll(() => {
  if (pastaTemporaria) rmSync(pastaTemporaria, { recursive: true, force: true });
});

const htmlsDoDist = () => arquivosDe(dist).filter((a) => a.endsWith(".html"));
const semConsulta = (url: string) => url.replace(/[?#].*$/, "");
const doDisco = (url: string) => join(dist, decodeURIComponent(semConsulta(url)).replace(/^\//, ""));

/** O mesmo nome que o Astro dá à versão: o do original, sem a extensão, com os caracteres perigosos trocados por "_". */
const nomeSeguro = (nome: string) => nome.replace(/[\u0000-\u001F"#$%&*+,:;<=>?[\]^`{|}\u007F]/g, "_");

/** Uma miniatura 24×24 em cinza sobre fundo branco: serve para ver se duas imagens são a mesma (cor, brilho, posição das formas). */
async function miniatura(entrada: string | Buffer): Promise<Uint8Array> {
  return new Uint8Array(await sharp(entrada).flatten({ background: "#ffffff" }).resize(24, 24, { fit: "fill" }).greyscale().raw().toBuffer());
}
const diferencaMedia = (a: Uint8Array, b: Uint8Array) => a.reduce((s, v, i) => s + Math.abs(v - (b[i] ?? 0)), 0) / a.length;

/**
 * O original encolhido ao tamanho da versão e a própria versão, ambos reduzidos a 48×48 em cinza sobre branco. A redução apaga o ruído fino da
 * compressão (os traços de hachura de um desenho a lápis mudam de pixel mas não de lugar) e deixa o que importa: cor, brilho e posição das formas.
 */
async function paresNoTamanhoDaVersao(original: string, versao: string): Promise<[Uint8Array, Uint8Array]> {
  const m = await sharp(versao).metadata();
  const encolhido = await sharp(original).resize(m.width, m.height, { fit: "fill" }).flatten({ background: "#ffffff" }).png().toBuffer();
  const reduzir = async (e: string | Buffer) => new Uint8Array(await sharp(e).flatten({ background: "#ffffff" }).resize(48, 48, { fit: "fill" }).greyscale().raw().toBuffer());
  return [await reduzir(encolhido), await reduzir(versao)];
}

/** O WebP com perda (4:2:0) muda um pouco as bordas de cores saturadas e as hachuras finas: nas versões do site a diferença média em miniatura
 *  fica abaixo de 9/255 (conferido a olho, lado a lado, nas piores). Além disso a miniatura tem de ACOMPANHAR a do original (correlação
 *  de Pearson acima de 0,95 quando a imagem tem contraste): uma imagem trocada, deslocada ou espelhada reprova nas duas medidas. */
const LIMITE_DA_DIFERENCA = 14;
function correlacao(a: Uint8Array, b: Uint8Array): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] ?? 0) - ma, y = (b[i] ?? 0) - mb;
    ab += x * y; aa += x * x; bb += y * y;
  }
  return aa < n * 64 || bb < n * 64 ? 1 : ab / Math.sqrt(aa * bb); // desvio padrão < 8: quase uma cor só, a correlação não diz nada
}

describe("as imagens leves de TODAS as páginas são a mesma imagem, no arquivo certo", () => {
  interface Achada {
    pagina: string;
    src: string;
    srcset: string;
    width: string | undefined;
    height: string | undefined;
  }
  let achadas: Achada[] = [];
  beforeAll(() => {
    for (const arquivo of htmlsDoDist()) {
      const doc = parse(readFileSync(join(dist, arquivo), "utf8"));
      // Os GIFs animados (T17e) têm versão própria (WebP animado, descritor "1x", sem perda): são provados em "T17e no site construído", abaixo.
      for (const img of varrer(doc, (e) => e.tagName === "img" && attr(e, "srcset") !== undefined && !/\.gif$/i.test(attr(e, "src") ?? ""))) {
        achadas.push({ pagina: arquivo, src: attr(img, "src") ?? "", srcset: attr(img, "srcset") ?? "", width: attr(img, "width"), height: attr(img, "height") });
      }
    }
  });

  test("há muitas imagens leves (a otimização está ligada) e cada uma tem sizes", () => {
    expect(achadas.length).toBeGreaterThan(350);
    for (const a of achadas) expect(a.srcset, a.pagina).toMatch(/^(\/[^ ,]+\.webp \d+w)(, \/[^ ,]+\.webp \d+w)*$/);
  });

  test("o src continua sendo o arquivo original de static/ (nenhum endereço novo no src)", () => {
    const sem: string[] = [];
    for (const a of achadas) {
      const arquivo = arquivoDoSrc(a.src);
      if (!arquivo || !existsSync(join(RAIZ, "static", arquivo)) || !existsSync(doDisco(a.src))) sem.push(`${a.pagina}: ${a.src}`);
    }
    expect(sem).toEqual([]);
  });

  test("cada versão: existe, é WebP, tem a largura do descritor, não amplia e sai do arquivo do src", async () => {
    const unicas = new Map<string, { src: string; largura: number }>(); // endereço da versão → o src de onde saiu e a largura que o srcset diz
    for (const a of achadas) for (const parte of a.srcset.split(", ")) unicas.set(parte.split(" ")[0] ?? "", { src: a.src, largura: Number(parte.split(" ")[1]?.replace("w", "")) });
    expect(unicas.size).toBeGreaterThan(200);
    const problemas: string[] = [];
    for (const [versao, { src, largura }] of unicas) {
      const caminho = doDisco(versao);
      if (!existsSync(caminho)) {
        problemas.push(`não existe: ${versao}`);
        continue;
      }
      const original = arquivoDoSrc(src) ?? "";
      const nomeDoOriginal = nomeSeguro((original.split("/").pop() ?? "").replace(/\.[^.]+$/, ""));
      const nomeDaVersao = decodeURIComponent(versao).split("/").pop() ?? "";
      const dirDoOriginal = original.split("/").slice(0, -1).join("/");
      const dirDaVersao = decodeURIComponent(semConsulta(versao)).replace(/^\//, "").split("/").slice(0, -1).join("/");
      if (!new RegExp(`^${nomeDoOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_[A-Za-z0-9]+\\.webp$`).test(nomeDaVersao) || dirDoOriginal !== dirDaVersao) {
        problemas.push(`${versao} não sai de ${src}`);
        continue;
      }
      const m = await sharp(caminho).metadata();
      const orig = await sharp(join(RAIZ, "static", original)).metadata();
      if (m.format !== "webp") problemas.push(`${versao} não é webp (${m.format})`);
      else if (m.width !== largura) problemas.push(`${versao}: ${m.width}px, o srcset diz ${largura}w`);
      else if (orig.width && m.width > orig.width) problemas.push(`${versao} amplia o original (${m.width} > ${orig.width})`);
      else if (orig.width && orig.height && m.height && Math.abs(m.height - (m.width * orig.height) / orig.width) > 1) problemas.push(`${versao} mudou a proporção`);
    }
    expect(problemas).toEqual([]);
  }, 120_000);

  test("cada versão é a mesma imagem do original: encolhido o original ao tamanho dela, a diferença média (em miniatura) é só o ruído da compressão", async () => {
    const pares = new Map<string, string>();
    for (const a of achadas) for (const parte of a.srcset.split(", ")) pares.set(parte.split(" ")[0] ?? "", a.src);
    const ruins: string[] = [];
    let pior = 0;
    for (const [versao, src] of pares) {
      const [antigo, novo] = await paresNoTamanhoDaVersao(join(RAIZ, "static", arquivoDoSrc(src) ?? ""), doDisco(versao));
      const d = diferencaMedia(antigo, novo);
      pior = Math.max(pior, d);
      const r = correlacao(antigo, novo);
      if (d > LIMITE_DA_DIFERENCA || r < 0.95) ruins.push(`${versao}: diferença média ${d.toFixed(1)}/255, correlação ${r.toFixed(3)}`);
    }
    expect(ruins).toEqual([]);
    expect(pior).toBeLessThan(LIMITE_DA_DIFERENCA);
  }, 300_000);

  test("width e height são os do original (a proporção que o navegador reserva antes de a imagem chegar)", async () => {
    const ruins: string[] = [];
    const vistos = new Map<string, { width?: number; height?: number }>();
    for (const a of achadas) {
      if (a.width === undefined && a.height === undefined) continue;
      const original = arquivoDoSrc(a.src) ?? "";
      if (!vistos.has(original)) vistos.set(original, await sharp(join(RAIZ, "static", original)).metadata());
      const m = vistos.get(original);
      if (String(m?.width) !== a.width || String(m?.height) !== a.height) ruins.push(`${a.pagina}: ${a.src} ${a.width}x${a.height}, o arquivo tem ${m?.width}x${m?.height}`);
    }
    expect(ruins).toEqual([]);
  }, 120_000);

  test("o desenho do original continua publicado, igual ao de static/ (as versões são ACRÉSCIMO)", () => {
    for (const a of achadas.slice(0, 400)) {
      const original = arquivoDoSrc(a.src) ?? "";
      expect(statSync(doDisco(a.src)).size, a.src).toBe(statSync(join(RAIZ, "static", original)).size);
    }
  });
});

// ───────────────────────── fontes ─────────────────────────

describe("fontes: servidas pelo próprio site", () => {
  test("nenhuma página nem CSS fala com o Google Fonts ou com o jsDelivr (o build não precisa de rede para as fontes)", () => {
    const culpados: string[] = [];
    for (const arquivo of arquivosDe(dist).filter((a) => /\.(html|css|js)$/.test(a))) {
      const texto = readFileSync(join(dist, arquivo), "utf8");
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/.test(texto)) culpados.push(arquivo);
    }
    expect(culpados).toEqual([]);
  });

  test("todo @font-face do CSS publicado aponta para um arquivo que existe, e as famílias são as de sempre", () => {
    const familias = new Set<string>();
    let blocos = 0;
    for (const css of arquivosDe(dist).filter((a) => a.startsWith("_astro/") && a.endsWith(".css"))) {
      const texto = readFileSync(join(dist, css), "utf8");
      for (const m of texto.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        blocos++;
        const corpo = m[1] ?? "";
        familias.add(/font-family:\s*"?([^";]+?)"?\s*[;}]/.exec(corpo + ";")?.[1] ?? "?");
        const url = /url\(["']?([^)"']+)["']?\)/.exec(corpo)?.[1] ?? "";
        expect(url, corpo).toMatch(/^\/_astro\/[^/]+\.woff2$/);
        expect(existsSync(join(dist, url)), url).toBe(true);
        expect(corpo).toContain("font-display:swap");
      }
    }
    expect(blocos).toBeGreaterThan(40);
    for (const f of ["Lexend", "Oswald", "Vollkorn SC", "Noto Emoji", "PT Serif", "Road Rage", "Noto Sans", "Noto Sans Runic", "Noto Sans KR"]) expect([...familias], f).toContain(f);
    expect([...familias].filter((f) => /variable/i.test(f)), "os nomes das famílias são os do Google Fonts (sem 'Variable')").toEqual([]);
  });

  test("toda página pré-carrega as duas fontes do começo (Lexend e Oswald, latim) e só elas; ambas estão declaradas no CSS", () => {
    const css = arquivosDe(dist).filter((a) => a.startsWith("_astro/") && a.endsWith(".css")).map((a) => readFileSync(join(dist, a), "utf8")).join("\n");
    for (const arquivo of htmlsDoDist()) {
      if (/^[^/]+\.html$/.test(arquivo) && arquivo !== "404.html" && arquivo !== "index.html") continue; // os redirects do site antigo não têm <head> do site
      const doc = parse(readFileSync(join(dist, arquivo), "utf8"));
      const pre = varrer(doc, (e) => e.tagName === "link" && attr(e, "rel") === "preload");
      if (arquivo === "index.html") continue; // a raiz é só o redirecionamento por idioma
      expect(pre.map((l) => attr(l, "href")?.replace(/^\/_astro\/([a-z-]+)-latin-wght-normal\..*$/, "$1")).sort(), arquivo).toEqual(["lexend", "oswald"]);
      for (const l of pre) {
        expect(attr(l, "as"), arquivo).toBe("font");
        expect(attr(l, "type"), arquivo).toBe("font/woff2");
        expect(attr(l, "crossorigin"), arquivo).not.toBeUndefined(); // fonte sem crossorigin no preload é baixada duas vezes
        expect(existsSync(join(dist, attr(l, "href") ?? "")), attr(l, "href")).toBe(true);
        expect(css, attr(l, "href")).toContain(attr(l, "href") ?? "?");
      }
    }
  });

  test("src/styles/fontes.css é exatamente o que tools/gerar_fontes_css.mjs produz", () => {
    const r = spawnSync(process.execPath, [join(RAIZ, "tools", "gerar_fontes_css.mjs"), "--conferir"], { cwd: RAIZ, encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("confere com o gerador");
    expect(r.status).toBe(0);
  });
});

// ───────────────────────── as runas ─────────────────────────

describe("runas: os recortes de fonte cobrem todos os glifos do fundo", () => {
  interface Recorte {
    familia: string;
    arquivo: string;
    glifos: string[];
    bytes: number;
  }
  const pasta = join(RAIZ, "src", "assets", "fontes", "runas");
  const cobertura: Recorte[] = JSON.parse(readFileSync(join(pasta, "cobertura.json"), "utf8"));
  const cps = (s: string) => Array.from(s).map((c) => c.codePointAt(0) ?? 0);

  test("cada glifo de RUNES tem exatamente um recorte, e nenhum recorte tem glifo que o site não usa", () => {
    const esperados = GLIFOS.flatMap(cps).sort((a, b) => a - b);
    const cobertos = cobertura.flatMap((r) => r.glifos.map((h) => parseInt(h, 16))).sort((a, b) => a - b);
    expect(cobertos).toEqual(esperados);
  });
  test("os arquivos existem, são WOFF2 e pequenos (os 25 juntos têm poucos KB)", () => {
    for (const r of cobertura) {
      const bytes = readFileSync(join(pasta, r.arquivo));
      expect(bytes.subarray(0, 4).toString("latin1"), r.arquivo).toBe("wOF2");
      expect(bytes.length, r.arquivo).toBe(r.bytes);
      expect(bytes.length, r.arquivo).toBeLessThan(10_000);
    }
    expect(cobertura.reduce((s, r) => s + r.bytes, 0)).toBeLessThan(40_000);
  });
  test("as famílias dos recortes são as da lista font-family das runas (Runas.astro), e o CSS gerado declara cada recorte", () => {
    const runas = readFileSync(join(RAIZ, "src", "components", "Runas.astro"), "utf8");
    const lista = /font-family:\s*([^;]*"Noto Sans"[^;]*);/.exec(runas)?.[1] ?? "";
    const daLista = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(daLista.length).toBeGreaterThan(15);
    const css = readFileSync(join(RAIZ, "src", "styles", "fontes-das-runas.css"), "utf8");
    for (const r of cobertura) {
      expect(daLista, r.familia).toContain(r.familia);
      expect(css, r.arquivo).toContain(`font-family: "${r.familia}"`);
      expect(css, r.arquivo).toContain(`/${r.arquivo}")`);
    }
    // a ordem de escolha é a da lista: um glifo está no recorte da PRIMEIRA família da lista que o tem. Aqui só se confere que a ordem
    // dos recortes no CSS acompanha a da lista (o gerador as escreve nessa ordem).
    const ordem = [...css.matchAll(/font-family: "([^"]+)"/g)].map((m) => daLista.indexOf(m[1] ?? ""));
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });
});

// ───────────────────────── silhuetas ─────────────────────────

describe("silhuetas do shape-outside: mesmo tamanho, mesmo contorno", () => {
  test.each(Object.entries(SILHUETAS))("%s", async (nome, arquivo) => {
    const publicada = readFileSync(join(dist, "silhuetas", `${nome}.png`));
    expect(publicada.equals(await gerarSilhueta(arquivo))).toBe(true); // o que o build publica é o que o gerador produz hoje
    const original = await sharp(join(RAIZ, "static", arquivo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const silhueta = await sharp(publicada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([silhueta.info.width, silhueta.info.height]).toEqual([original.info.width, original.info.height]);
    let diferentes = 0;
    const pixels = original.info.width * original.info.height;
    for (let i = 0; i < pixels; i++) {
      const dentroOriginal = (original.data[i * original.info.channels + 3] ?? 0) > 0;
      const dentroSilhueta = (silhueta.data[i * silhueta.info.channels + (silhueta.info.channels - 1)] ?? 0) > 0;
      if (dentroOriginal !== dentroSilhueta) diferentes++;
    }
    expect(diferentes, "pixels em que 'tem desenho' difere (o contorno do texto seria outro)").toBe(0);
    expect(publicada.length, "a silhueta tem de ser leve").toBeLessThan(20_000);
  });

  test("o CSS do site contorna pelas silhuetas (nunca pelo desenho inteiro) e nunca muda o limiar do contorno", () => {
    const css = arquivosDe(dist).filter((a) => a.startsWith("_astro/") && a.endsWith(".css")).map((a) => readFileSync(join(dist, a), "utf8")).join("\n");
    const html = htmlsDoDist().map((a) => readFileSync(join(dist, a), "utf8")).join("\n");
    const tudo = css + "\n" + html;
    expect(tudo).not.toContain("shape-image-threshold"); // com o limiar padrão (0) a silhueta binária dá o MESMO contorno
    const formas = [...tudo.matchAll(/shape-outside:\s*url\(([^)]+)\)/g)].map((m) => (m[1] ?? "").replace(/["']/g, ""));
    expect(formas.length).toBeGreaterThanOrEqual(4);
    for (const f of formas) expect(f, "contorno pelo desenho inteiro baixaria o arquivo todo de novo").toMatch(/^\/silhuetas\/[a-z]+\.png$/);
    // o static/custom.css do autor fica fora desta prova: não é nosso (e nem sempre existe no repositório)
    const custom = join(RAIZ, "static", "custom.css");
    if (existsSync(custom)) expect(readFileSync(custom, "utf8")).not.toContain("shape-image-threshold");
  });
});

// ───────────────────────── abertura e ícone ─────────────────────────

describe("fundo da abertura e ícone", () => {
  test("o degradê da abertura é um JPEG leve e fica igual ao original", async () => {
    const html = readFileSync(join(dist, "pt", "index.html"), "utf8");
    const url = /background-image:\s*url\(["']?(\/intro\/[^)"']+\.jpeg)["']?\)/.exec(html)?.[1];
    expect(url, "a abertura usa o fundo leve").toBeTruthy();
    const leve = doDisco(url ?? "");
    expect(statSync(leve).size).toBeLessThan(40_000);
    const original = join(RAIZ, "static", "intro", "fundo.png");
    if (existsSync(original)) {
      const a = await miniatura(original);
      const b = await miniatura(leve);
      expect(diferencaMedia(a, b)).toBeLessThan(2);
      const m1 = await sharp(original).metadata();
      const m2 = await sharp(leve).metadata();
      expect([m2.width, m2.height]).toEqual([m1.width, m1.height]);
    }
  });
  test("o ícone tem duas versões leves (32 e 192 px) e o original continua publicado", async () => {
    const doc = parse(readFileSync(join(dist, "pt", "index.html"), "utf8"));
    const icones = varrer(doc, (e) => e.tagName === "link" && attr(e, "rel") === "icon");
    expect(icones.map((l) => attr(l, "sizes"))).toEqual(["32x32", "192x192"]);
    for (const l of icones) {
      const m = await sharp(doDisco(attr(l, "href") ?? "")).metadata();
      const lado = Number(attr(l, "sizes")?.split("x")[0]);
      expect(Math.max(m.width ?? 0, m.height ?? 0)).toBe(lado);
    }
    expect(existsSync(join(dist, "logos", "favicon.png"))).toBe(true);
  });
});

// ───────────────────────── T17e no site construído: o vídeo da abertura em 720p e os GIFs em WebP animado ─────────────────────────
// O que cada coisa É (mesmos quadros, mesmos instantes, mesma transparência) está em tests/video-da-abertura.test.ts e tests/animadas.test.ts;
// aqui se prova que o SITE de verdade usa essas versões, nos lugares certos, e que o arquivo do autor continua intacto e publicado.

describe("T17e no site construído", () => {
  const original = (arquivo: string) => readFileSync(join(RAIZ, "static", arquivo));

  test("a abertura de toda página usa o vídeo 720p (em /_astro/, com carimbo no nome), que é o arquivo de src/assets/intro/", () => {
    const leve = readFileSync(join(RAIZ, "src", "assets", "intro", "logo-720p.webm"));
    const usados = new Set<string>();
    let paginasComAbertura = 0;
    for (const arquivo of htmlsDoDist()) {
      const html = readFileSync(join(dist, arquivo), "utf8");
      expect(html, `${arquivo} ainda aponta para o vídeo do autor`).not.toContain("/intro/logo.webm");
      const m = /const video = "([^"]*)";/.exec(html);
      if (!m) continue;
      paginasComAbertura++;
      expect(m[1], arquivo).toMatch(/^\/_astro\/logo-720p\.[A-Za-z0-9_-]+\.webm$/);
      usados.add(m[1] ?? "");
    }
    expect(paginasComAbertura).toBeGreaterThan(150);
    expect([...usados].length).toBe(1);
    const [url] = [...usados];
    expect(readFileSync(doDisco(url ?? "")).equals(leve)).toBe(true);
    expect(arquivosDe(dist).filter((a) => a.endsWith(".webm") && a.startsWith("_astro/")).length).toBe(1);
  });

  test("o vídeo do autor continua publicado no endereço de sempre, byte a byte (o site só deixa de usá-lo)", () => {
    expect(readFileSync(join(dist, "intro", "logo.webm")).equals(original("intro/logo.webm"))).toBe(true);
  });

  // T17n: + o "NÃO… …EU NÃO POSSO…" da versão em português de Ossos do Ofício (também só na prévia)
  const gifsAnimadosDoAutor = ["other images/Apollo Site.gif", "other images/Anfíbio Site.gif", "other images/no-i-cant.gif", "other images/nao-eu-nao-posso.gif"];

  test("toda <img> de GIF animado, de todas as páginas, tem o WebP animado no srcset (1x), com o tamanho do GIF; o src continua sendo o GIF", async () => {
    const vistas = new Map<string, number>(); // arquivo → em quantas páginas apareceu
    const problemas: string[] = [];
    for (const pagina of htmlsDoDist()) {
      const doc = parse(readFileSync(join(dist, pagina), "utf8"));
      for (const img of varrer(doc, (e) => e.tagName === "img" && /\.gif$/i.test(attr(e, "src") ?? ""))) {
        const src = attr(img, "src") ?? "";
        const arquivo = arquivoDoSrc(src) ?? "";
        const info = await lerAnimada(arquivo);
        if (!info) continue; // GIF de um quadro só: fica como está
        vistas.set(arquivo, (vistas.get(arquivo) ?? 0) + 1);
        const esperado = `${urlDaAnimada(info.nome)} 1x`;
        if (attr(img, "srcset") !== esperado) problemas.push(`${pagina}: srcset "${attr(img, "srcset")}", esperado "${esperado}"`);
        if (attr(img, "sizes") !== undefined) problemas.push(`${pagina}: sizes não vale com 1x`);
        if (attr(img, "width") !== String(info.largura) || attr(img, "height") !== String(info.altura)) problemas.push(`${pagina}: ${attr(img, "width")}x${attr(img, "height")}`);
        if (!existsSync(doDisco(src)) || !readFileSync(doDisco(src)).equals(original(arquivo))) problemas.push(`${pagina}: o GIF original não está publicado igual`);
        const webp = doDisco(urlDaAnimada(info.nome));
        if (!existsSync(webp)) problemas.push(`${pagina}: falta ${info.nome}`);
        else {
          const c = cabecalhoDoWebpAnimado(readFileSync(webp));
          if (!c.animado || c.repeticoes !== 0 || c.atrasos.join() !== info.atrasos.join()) problemas.push(`${info.nome} não toca como o GIF`);
        }
      }
    }
    expect(problemas).toEqual([]);
    // no site PUBLICADO (sem rascunhos) os dois GIFs da página Sobre aparecem em /pt/ e /en/; os dois de Ossos do Ofício (EN e PT) só na prévia (é rascunho)
    expect(vistas.get("other images/Apollo Site.gif")).toBe(2);
    expect(vistas.get("other images/Anfíbio Site.gif")).toBe(2);
  }, 120_000);

  test("os quatro WebP animados estão publicados em /animadas/ (inclusive os dois de Ossos do Ofício, que só aparecem na prévia) e nada mais fica lá", async () => {
    const nomes = new Set<string>();
    for (const g of gifsAnimadosDoAutor) {
      const info = await lerAnimada(g);
      expect(info, g).not.toBeNull();
      nomes.add(info?.nome ?? "");
      const publicado = readFileSync(join(dist, "animadas", info?.nome ?? ""));
      const c = cabecalhoDoWebpAnimado(publicado);
      expect(c.atrasos, g).toEqual(info?.atrasos);
      expect(publicado.length, g).toBeLessThanOrEqual(original(g).length);
    }
    expect(new Set(arquivosDe(join(dist, "animadas")))).toEqual(nomes);
  });

  test("a versão leve dos GIFs é a MESMA que gerarWebpAnimado() faz (o endpoint não muda nada no caminho)", async () => {
    for (const g of gifsAnimadosDoAutor) {
      const info = await lerAnimada(g);
      const feito = await gerarWebpAnimado(g);
      expect(readFileSync(join(dist, "animadas", info?.nome ?? "")).equals(feito), g).toBe(true);
    }
  });
});
