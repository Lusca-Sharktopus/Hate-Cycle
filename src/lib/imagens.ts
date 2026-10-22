// Imagens otimizadas (T17): as VERSÕES LEVES (WebP, vários tamanhos) de um arquivo de static/.
//
// A ideia, em português de gente: o autor continua guardando a imagem grande e bonita em static/ (a capa de 3,5 MB, a logo de
// 6500 px). O site continua publicando esse arquivo no mesmo endereço de sempre (quem apontar para /covers/… continua achando).
// Mas a página não manda o visitante baixar o arquivo grande: ela diz ao navegador, no atributo `srcset`, "tenho este desenho
// em 240, 400 e 600 px de largura, em WebP; pegue o que couber na sua tela". Quem faz as versões leves é o `getImage()` do
// Astro (astro:assets, com o Sharp por baixo), no `pnpm build`. O que ele já fez fica guardado no cache do Astro
// (node_modules/.astro/assets): o segundo build só refaz as imagens que mudaram.
//
// Duas regras que mantêm o site igual ao de hoje:
//   1. O `src` da <img> NÃO muda: continua sendo o arquivo original (/covers/PT/Capa Pederneira.png). As versões leves entram
//      só no `srcset`. Por isso toda imagem do site aponta para o mesmo arquivo que o build.py usaria, e quem não entende
//      `srcset` (leitores antigos, RSS) continua vendo a imagem de sempre.
//   2. Só se otimiza o que compensa e o que não perde nada: PNG e JPEG que não são animados, maiores que ~30 KB e maiores que o
//      menor tamanho do perfil. GIF (animados), SVG, WebP/AVIF que o autor já fez e ícones minúsculos ficam como estão.
//
// Este arquivo é lógica de build (roda no seu computador, nunca no navegador). A parte que só ESCOLHE (tamanhos, regras) é pura e
// está provada em tests/imagens.test.ts; a parte que chama o getImage() só existe durante o build do Astro.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { assetUrl } from "./assets";

// ───────────────────────── os perfis: um por "lugar da página onde a imagem aparece" ─────────────────────────

/** Como otimizar as imagens de um mesmo lugar da página. */
export interface Perfil {
  /** Nome curto (aparece nos testes e na lição). */
  nome: string;
  /** Larguras (em px) das versões leves, da menor para a maior. Valem até 2x o tamanho que a imagem ocupa na tela. */
  larguras: readonly number[];
  /** O atributo `sizes`: quantos px de largura a imagem ocupa na tela (medido a 1500, 1100, 700 e 390 px). */
  sizes: string;
  /** Qualidade do WebP (0–100). 82 = igual ao olho para foto e desenho; sobe um pouco onde há texto ou traço fino. */
  qualidade: number;
}

// Medidas feitas no navegador (Playwright), em px CSS. As larguras cobrem tela comum (1x) e retina (2x); tela 3x (celular)
// pega a maior versão, que ainda é ~2x o tamanho na tela.
export const PERFIS = {
  /** Logo do cabeçalho: --logo-w = clamp(130px, 17vw, 230px) (tokens.css). */
  logo: { nome: "logo", larguras: [260, 520, 780], sizes: "clamp(130px, 17vw, 230px)", qualidade: 85 },
  /** Capas no carrossel da home: 180 px no celular e no tablet; 150–200 px na tela larga, com os 4 lado a lado (T17j). */
  capaDoCarrossel: { nome: "capa-do-carrossel", larguras: [200, 360, 540], sizes: "180px", qualidade: 82 },
  /** Capas na grade de Histórias: 193 px (1100), 224 (1500), 258 (700), 289 (390). */
  capaDaGrade: { nome: "capa-da-grade", larguras: [240, 400, 600], sizes: "(max-width: 700px) 290px, 230px", qualidade: 82 },
  /** Capa na página da obra: 240–260 px. */
  capaDaObra: { nome: "capa-da-obra", larguras: [260, 520], sizes: "260px", qualidade: 82 },
  /** Imagem de uma "Últimas atualizações" da home: 217–279 px de largura, cortada em 150 de altura. */
  atualizacao: { nome: "atualizacao", larguras: [280, 560], sizes: "(max-width: 700px) 290px, 270px", qualidade: 82 },
  /** Foto de emissário: quadrada, 126–179 px. */
  emissario: { nome: "emissario", larguras: [180, 360], sizes: "180px", qualidade: 82 },
  /** Miniatura da lista de notícias: quadrada, 96–160 px. */
  miniatura: { nome: "miniatura", larguras: [160, 320], sizes: "160px", qualidade: 82 },
  /** Figura grande de uma notícia comum (a folha estreita, até ~760 px). */
  figuraDeNoticia: { nome: "figura-de-noticia", larguras: [480, 760, 1140], sizes: "(max-width: 800px) 100vw, 760px", qualidade: 82 },
  /** Figurinhas (stickers) da notícia colagem: 149–284 px, com transparência. */
  figurinha: { nome: "figurinha", larguras: [300, 600], sizes: "300px", qualidade: 85 },
  /** Bloco "estou lendo em ordem…" do fim do capítulo (T17c): a arte de cada lado, ~34% da folha (até ~340 px; 46% da tela no celular), com transparência.
   *  Também serve à capa usada no lugar da arte (obra sem `order_images`). */
  ordemDeLeitura: { nome: "ordem-de-leitura", larguras: [300, 600, 900], sizes: "(max-width: 700px) 46vw, 340px", qualidade: 85 },
  /** Bloco "estou lendo em ordem…": uma CAMADA da arte animada (T17h; um personagem com fundo transparente). A tela de montagem ocupa o mesmo
   *  espaço da arte de um lado (até ~340 px; 46% da tela no celular) e a camada, uma fração dela: as larguras vão até o tamanho da tela em tela 2x. */
  camadaDaOrdem: { nome: "camada-da-ordem", larguras: [160, 320, 640, 960], sizes: "(max-width: 700px) 46vw, 340px", qualidade: 85 },
  /** Logo do título de um capítulo (as "title-image"): 159–370 px, com transparência. */
  tituloDeCapitulo: { nome: "titulo-de-capitulo", larguras: [380, 760], sizes: "380px", qualidade: 85 },
  /** Páginas de quadrinho no leitor: a largura do leitor, até 900 px. */
  paginaDeQuadrinho: { nome: "pagina-de-quadrinho", larguras: [480, 900, 1400, 1800], sizes: "(max-width: 900px) 100vw, 900px", qualidade: 86 },
  /** Texto do autor: a figura que contorna o texto (Giuseppe em Ossos do Ofício), 240 px. */
  contornada: { nome: "contornada", larguras: [240, 480], sizes: "240px", qualidade: 85 },
  /** Texto do autor: a ilustração grande de uma cena (Ossos do Ofício), ~890 px. */
  ilustracaoGrande: { nome: "ilustracao-grande", larguras: [600, 900, 1300, 1800], sizes: "(max-width: 940px) 100vw, 890px", qualidade: 86 },
  /** Texto do autor: as tiras de quadrinho dentro da prosa, 710 px. */
  tira: { nome: "tira", larguras: [480, 720, 1080, 1440], sizes: "(max-width: 760px) 100vw, 710px", qualidade: 88 },
  /** Texto do autor: a carta que vira (300 × 450 px). */
  carta: { nome: "carta", larguras: [300, 600], sizes: "300px", qualidade: 86 },
  /** Texto do autor: a foto do autor na página Sobre, 320–520 px. */
  fotoDoAutor: { nome: "foto-do-autor", larguras: [460, 920], sizes: "(max-width: 700px) 100vw, 520px", qualidade: 85 },
  /** Texto do autor: qualquer outra imagem solta no texto (`![]()` ou <img>). A largura do texto, até 900 px. */
  imagemDoTexto: { nome: "imagem-do-texto", larguras: [480, 800, 1200, 1800], sizes: "(max-width: 940px) 100vw, 900px", qualidade: 85 },
} as const satisfies Record<string, Perfil>;

export type NomeDoPerfil = keyof typeof PERFIS;

/** Abaixo disto o arquivo já é leve: o WebP não ganharia nada que valha uma versão a mais para manter. */
export const BYTES_MINIMOS = 30 * 1024;

// ───────────────────────── escolher as larguras (puro, testado) ─────────────────────────

/**
 * Que larguras gerar para uma imagem de `larguraOriginal` px. Nunca amplia: só vale o que é MENOR que o original; se o perfil
 * pede mais que o original tem, a última versão é o próprio tamanho do original (em WebP). Devolve [] quando não vale a pena
 * (original menor ou igual à menor versão do perfil): aí a imagem fica como está.
 */
export function largurasDaImagem(larguraOriginal: number, larguras: readonly number[]): number[] {
  const menor = larguras[0];
  if (menor === undefined || larguraOriginal <= menor) return [];
  const cabem = larguras.filter((l) => l < larguraOriginal);
  if (cabem.length < larguras.length) cabem.push(larguraOriginal);
  return cabem;
}

// ───────────────────────── ler o arquivo original ─────────────────────────

export interface InfoDaImagem {
  /** Caminho relativo a static/ ("covers/PT/Capa X.png"). */
  arquivo: string;
  largura: number;
  altura: number;
  /** O formato REAL, pelo conteúdo (a capa "Cover Roadside.png" é na verdade um JPEG). */
  formato: "png" | "jpg";
  bytes: number;
  /** Os 8 primeiros dígitos do SHA-1 do conteúdo: muda quando o autor troca a imagem (e então o cache do Astro refaz as versões). */
  carimbo: string;
}

const RAIZ_ESTATICOS = (): string => join(process.cwd(), "static");
const infos = new Map<string, Promise<InfoDaImagem | null>>();

/**
 * O que importa saber do arquivo para decidir se compensa otimizá-lo. `null` = não otimizar (não existe, não é PNG/JPEG,
 * é animado ou é leve demais). Lê cada arquivo uma vez só por build.
 */
export function lerImagem(arquivo: string): Promise<InfoDaImagem | null> {
  const guardada = infos.get(arquivo);
  if (guardada) return guardada;
  // Chave de comparação, só para teste: `HC_IMAGENS=originais pnpm build` gera o site SEM nenhuma versão leve (nem ícones, nem o fundo da
  // abertura), igual ao de antes da T17 nas imagens. Serve para conferir, no navegador, que as versões leves não mudam o layout nem o desenho
  // (tools/layout_playwright.py compara os dois). O site publicado nunca usa isso.
  if (process.env["HC_IMAGENS"] === "originais") return Promise.resolve(null);
  const lendo = (async (): Promise<InfoDaImagem | null> => {
    const caminho = join(RAIZ_ESTATICOS(), arquivo);
    if (!/\.(png|jpe?g)$/i.test(arquivo) || !existsSync(caminho) || !statSync(caminho).isFile()) return null;
    const bytes = readFileSync(caminho);
    if (bytes.length < BYTES_MINIMOS) return null;
    // pages: -1 = todos os quadros, para saber se é animado (um APNG tem mais de um)
    const m = await sharp(bytes, { pages: -1 }).metadata();
    if ((m.pages ?? 1) > 1 || !m.width || !m.height || (m.format !== "png" && m.format !== "jpeg")) return null;
    return {
      arquivo,
      largura: m.width,
      altura: m.pageHeight ?? m.height,
      formato: m.format === "jpeg" ? "jpg" : "png",
      bytes: bytes.length,
      carimbo: createHash("sha1").update(bytes).digest("hex").slice(0, 8),
    };
  })();
  infos.set(arquivo, lendo);
  return lendo;
}

// ───────────────────────── gerar as versões (só no build do Astro) ─────────────────────────

/** O que se escreve na <img> além do `src`. */
export interface ImagemOtimizada {
  srcset: string;
  sizes: string;
  /** Largura e altura do ORIGINAL: servem para o navegador reservar o espaço (a proporção é a mesma das versões leves). */
  width: number;
  height: number;
}

const feitas = new Map<string, Promise<ImagemOtimizada | null>>();

/**
 * As versões leves de uma imagem de static/ para um perfil, ou `null` se ela deve ficar como está.
 * `arquivo` é o caminho relativo a static/ ("covers/PT/Capa Pederneira.png"), sem "/" no começo.
 */
export function otimizar(arquivo: string, perfil: Perfil): Promise<ImagemOtimizada | null> {
  const chave = `${perfil.nome}|${arquivo}`;
  const guardada = feitas.get(chave);
  if (guardada) return guardada;
  const fazendo = (async (): Promise<ImagemOtimizada | null> => {
    const info = await lerImagem(arquivo);
    if (!info) return null;
    const larguras = largurasDaImagem(info.largura, perfil.larguras);
    if (larguras.length === 0) return null;
    // import dinâmico: "astro:assets" só existe dentro do Astro (build/dev); os testes que importam este arquivo não o carregam
    const { getImage } = await import("astro:assets");
    const imagem = await getImage({
      // Um objeto ImageMetadata "feito à mão": o `src` é o endereço do arquivo no site (já publicado por static/, que o Astro copia
      // para o dist/ antes de gerar as imagens); o `?v=` carrega o carimbo do conteúdo, que entra na conta do nome/cache das versões.
      src: { src: `/${arquivo}?v=${info.carimbo}`, width: info.largura, height: info.altura, format: info.formato },
      widths: larguras,
      sizes: perfil.sizes,
      format: "webp",
      quality: perfil.qualidade,
    });
    return { srcset: imagem.srcSet.attribute, sizes: perfil.sizes, width: info.largura, height: info.altura };
  })();
  feitas.set(chave, fazendo);
  return fazendo;
}

/** O endereço do arquivo no site, para quem monta a <img> à mão (o `src` que não muda). */
export function enderecoDaImagem(arquivo: string): string {
  return assetUrl(arquivo);
}

// ───────────────────────── ícones (favicon) ─────────────────────────

/** Um ícone quadrado já pronto: o endereço do PNG e o lado, em px. */
export interface Icone {
  href: string;
  lado: number;
}

const iconesFeitos = new Map<string, Promise<Icone[]>>();

/**
 * PNGs pequenos de um desenho grande, para o <link rel="icon">. O favicon.png do autor tem 3508 px e 1,7 MB, e o navegador o baixa
 * por inteiro para desenhar 16 px na aba. Aqui saem versões de `lados` px (o desenho inteiro cabe no quadrado; a proporção é mantida,
 * então o PNG pode sair com 1 px a menos num dos lados). Se o arquivo não for PNG/JPEG ou não existir, devolve [] e o chamador usa o original.
 */
export function icones(arquivo: string, lados: readonly number[]): Promise<Icone[]> {
  const chave = `${arquivo}|${lados.join(",")}`;
  const guardados = iconesFeitos.get(chave);
  if (guardados) return guardados;
  const fazendo = (async (): Promise<Icone[]> => {
    const info = await lerImagem(arquivo);
    if (!info) return [];
    const { getImage } = await import("astro:assets");
    const pronto: Icone[] = [];
    for (const lado of lados) {
      if (lado >= info.largura) continue;
      const imagem = await getImage({
        src: { src: `/${arquivo}?v=${info.carimbo}`, width: info.largura, height: info.altura, format: info.formato },
        width: lado,
        height: lado,
        fit: "inside",
        format: "png",
      });
      pronto.push({ href: imagem.src, lado });
    }
    return pronto;
  })();
  iconesFeitos.set(chave, fazendo);
  return fazendo;
}

// ───────────────────────── imagem de fundo (a tela de abertura) ─────────────────────────

const fundosFeitos = new Map<string, Promise<string | null>>();

/**
 * Uma versão leve, no tamanho original, de uma imagem de FUNDO (CSS `background-image`), que só tem um endereço (não existe `srcset`
 * em CSS). Serve ao degradê roxo da tela de abertura (intro/fundo.png, 287 KB: um degradê escuro com "ruído" fino, que o PNG guarda
 * sem perda). Vira JPEG de qualidade 95: ~15 KB, erro médio de ~0,5 num total de 255 níveis de cor, imperceptível sobre o roxo
 * escuro (WebP com perda alisaria o ruído e o degradê ganharia "degraus"; por isso JPEG e não WebP). `null` = ficar com o original.
 */
export function fundoLeve(arquivo: string): Promise<string | null> {
  const guardado = fundosFeitos.get(arquivo);
  if (guardado) return guardado;
  const fazendo = (async (): Promise<string | null> => {
    const info = await lerImagem(arquivo);
    if (!info) return null;
    const { getImage } = await import("astro:assets");
    const imagem = await getImage({
      src: { src: `/${arquivo}?v=${info.carimbo}`, width: info.largura, height: info.altura, format: info.formato },
      format: "jpeg",
      quality: 95,
    });
    return imagem.src;
  })();
  fundosFeitos.set(arquivo, fazendo);
  return fazendo;
}
