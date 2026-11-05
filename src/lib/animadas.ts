// GIFs animados do autor → WebP animado, SEM perda (T17e).
//
// O problema: um GIF animado é um dos arquivos mais pesados que existem (Apollo e Anfíbio da página Sobre ~0,4 MB cada; o "NO… …I CAN'T…"
// de Ossos do Ofício, 54 KB). O Astro não faz versões leves deles (src/lib/imagens.ts deixa GIF animado como está) e, ao contrário das
// capas, um GIF não pode virar um quadro só: a animação é a história.
//
// A solução: no build, de cada GIF animado de static/ sai um WebP animado com os MESMOS quadros, a MESMA duração de cada quadro, o MESMO
// tamanho e a MESMA repetição, e SEM PERDA (lossless): cada pixel de cada quadro é igual ao do GIF (tests/animadas.test.ts compara os
// quadros, um a um). O `src` da <img> continua sendo o GIF do autor (é o que quem não entende `srcset` vê, e o endereço de sempre);
// a versão leve entra só no `srcset`, como nas outras imagens (src/lib/imagensDoHtml.ts). O texto do autor em content/ não muda.
//
// Os arquivos saem em /animadas/<nome>-<carimbo>.webp (src/pages/animadas/[nome].webp.ts). O carimbo é o SHA-1 do GIF: se o autor trocar
// o GIF por outro de mesmo nome, o endereço muda e o navegador do visitante não fica com a versão velha no cache.
//
// Sem perda de propósito: o GIF tem no máximo 256 cores por quadro e o desenho é (quase) o mesmo de quadro em quadro; o WebP sem perda
// guarda isso muito bem (Anfíbio: 414 KB → 44 KB; "NO… …I CAN'T…": 54 → 38 KB; Apollo, cheio de pontilhado: 393 → 298 KB). Com perda o
// Apollo cairia mais (~140–200 KB), mas deixaria de ser o mesmo desenho pixel a pixel; nenhuma decisão foi tomada nesse sentido.
//
// Lógica de build (roda no computador de quem gera o site, nunca no navegador). O que só DECIDE é puro e testado.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import sharp from "sharp";

/** Onde o site publica as versões (a pasta dentro de dist/). */
export const PASTA_DAS_ANIMADAS = "animadas";

/** O mesmo que o navegador faz com um GIF: atraso de 10 ms ou menos toca como 100 ms (Chrome, Firefox e Safari), o WebP tocaria na pressa. */
export const ATRASO_MINIMO_DO_GIF_MS = 100;
export const atrasoComoNoNavegador = (ms: number): number => (ms <= 10 ? ATRASO_MINIMO_DO_GIF_MS : ms);

export interface InfoDaAnimada {
  /** Caminho relativo a static/ ("other images/Apollo Site.gif"). */
  arquivo: string;
  largura: number;
  altura: number;
  quadros: number;
  /** Duração de cada quadro em ms (já como o navegador a conta). */
  atrasos: number[];
  /** Quantas vezes repete (0 = para sempre). */
  repeticoes: number;
  /** 8 primeiros dígitos do SHA-1 do GIF. */
  carimbo: string;
  /** O nome do arquivo de saída, sem pasta: "apollo-site-1a2b3c4d.webp". */
  nome: string;
}

/** "other images/Apollo Site.gif" → "apollo-site"; "Anfíbio Site.gif" → "anfibio-site". */
export function apelidoDoArquivo(arquivo: string): string {
  const base = (arquivo.split("/").pop() ?? arquivo).replace(/\.[^.]+$/, "");
  const limpo = base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return limpo || "animada";
}

export const nomeDaAnimada = (arquivo: string, carimbo: string): string => `${apelidoDoArquivo(arquivo)}-${carimbo}.webp`;

/** O endereço (relativo à raiz do site) onde a versão leve é publicada. */
export const urlDaAnimada = (nome: string): string => `/${PASTA_DAS_ANIMADAS}/${nome}`;

const RAIZ_ESTATICOS = (): string => join(process.cwd(), "static");

/** Todos os .gif de static/ (caminhos relativos, com "/"). */
export function gifsDeStatic(pasta = RAIZ_ESTATICOS()): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const st = statSync(caminho);
      if (st.isDirectory()) andar(caminho);
      else if (/\.gif$/i.test(nome)) achados.push(relative(pasta, caminho).split(sep).join("/"));
    }
  };
  andar(pasta);
  return achados.sort();
}

const lidas = new Map<string, Promise<InfoDaAnimada | null>>();

/**
 * O que importa saber de um GIF para decidir e para gerar a versão. `null` = não é GIF, não existe ou não é animado (um GIF de um quadro só
 * não ganha versão: seria só um GIF parado). `HC_IMAGENS=originais` (só para teste de layout; ver imagens.ts) também devolve null.
 */
export function lerAnimada(arquivo: string): Promise<InfoDaAnimada | null> {
  const guardada = lidas.get(arquivo);
  if (guardada) return guardada;
  if (process.env["HC_IMAGENS"] === "originais") return Promise.resolve(null);
  const lendo = (async (): Promise<InfoDaAnimada | null> => {
    if (!/\.gif$/i.test(arquivo)) return null;
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(RAIZ_ESTATICOS(), arquivo));
    } catch {
      return null;
    }
    const m = await sharp(bytes, { pages: -1 }).metadata();
    if (m.format !== "gif" || (m.pages ?? 1) < 2 || !m.width || !m.pageHeight) return null;
    const carimbo = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
    return {
      arquivo,
      largura: m.width,
      altura: m.pageHeight,
      quadros: m.pages ?? 1,
      atrasos: (m.delay ?? []).map(atrasoComoNoNavegador),
      repeticoes: m.loop ?? 1, // sem a extensão de repetição o GIF toca uma vez só
      carimbo,
      nome: nomeDaAnimada(arquivo, carimbo),
    };
  })();
  lidas.set(arquivo, lendo);
  return lendo;
}

/** O WebP animado, sem perda, do GIF: mesmos quadros, mesmos atrasos, mesma repetição. */
export async function gerarWebpAnimado(arquivo: string): Promise<Buffer> {
  const info = await lerAnimada(arquivo);
  if (!info) throw new Error(`${arquivo} não é um GIF animado`);
  return sharp(readFileSync(join(RAIZ_ESTATICOS(), arquivo)), { pages: -1, failOn: "none" })
    .webp({ lossless: true, loop: info.repeticoes, delay: info.atrasos })
    .toBuffer();
}

/** Todos os GIFs animados de static/ (para o endpoint listar o que publicar). */
export async function animadasDoSite(): Promise<InfoDaAnimada[]> {
  const todas = await Promise.all(gifsDeStatic().map((a) => lerAnimada(a)));
  return todas.filter((a): a is InfoDaAnimada => a !== null);
}

/** O que se escreve na <img> além do `src`. `sizes` vazio = não escrever (com descritor "1x" o `sizes` não vale nada). */
export interface AnimadaOtimizada {
  srcset: string;
  sizes: "";
  width: number;
  height: number;
}

/**
 * A versão leve de um GIF animado, ou `null` (não é GIF animado). Uma versão só, no tamanho do GIF, com descritor `1x`: o tamanho natural da
 * imagem fica igual ao do GIF (395×560 continua 395×560) e o navegador a usa em qualquer tela (o CSS do site manda no tamanho desenhado).
 */
export async function otimizarAnimada(arquivo: string): Promise<AnimadaOtimizada | null> {
  const info = await lerAnimada(arquivo);
  if (!info) return null;
  return { srcset: `${urlDaAnimada(info.nome)} 1x`, sizes: "", width: info.largura, height: info.altura };
}
