// O vídeo da tela de abertura que o visitante do Astro baixa (T17e).
//
// O arquivo do autor (config.json → intro.video, hoje static/intro/logo.webm: VP9 1920x1080 com transparência, 1,1 MB) continua intacto
// em static/ e publicado no mesmo endereço de sempre. Mas a abertura não o usa: usa uma versão 720p do MESMO vídeo (~0,5 MB; mesma
// duração, mesmos 151 quadros nos mesmos instantes, mesma transparência), gerada UMA vez por tools/gerar_video_da_abertura.py e guardada
// em src/assets/intro/ (o build e o GitHub Actions não rodam ffmpeg; só servem o arquivo).
//
// Para nunca mostrar um vídeo VELHO, a versão leve vem com uma "ficha" (logo-720p.json) que guarda o SHA-256 do original de onde saiu.
// No build, se o original de hoje não for aquele (o autor trocou o vídeo e ainda ninguém refez o leve), vale o ORIGINAL e o build
// avisa. `pnpm test` também falha (tests/video-da-abertura.test.ts) até o leve ser refeito.
//
// Este arquivo só decide (função pura, provada em tests/video-da-abertura.test.ts); quem lê os arquivos e importa o vídeo é a Abertura.astro.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assetUrl } from "./assets";

/** O que tools/gerar_video_da_abertura.py grava em src/assets/intro/logo-720p.json (só o que a decisão usa). */
export interface FichaDoVideoLeve {
  origem: string;
  sha256_do_original: string;
}

export interface EscolhaDoVideo {
  /** O endereço que a abertura põe no <video>. */
  url: string;
  /** true = a versão 720p; false = o original do autor. */
  leve: boolean;
  /** Quando cai no original: por quê (o build mostra como aviso). */
  aviso?: string;
}

export function sha256DoArquivo(caminho: string): string | null {
  return existsSync(caminho) ? createHash("sha256").update(readFileSync(caminho)).digest("hex") : null;
}

/**
 * Qual vídeo a abertura usa.
 * @param videoDoConfig   config.json → intro.video ("intro/logo.webm")
 * @param shaDoOriginal   SHA-256 do arquivo de static/ de hoje (null se não existe)
 * @param ficha           a ficha do vídeo leve (null se ainda não foi gerado)
 * @param urlDoLeve       o endereço que o Astro dá ao vídeo leve (import "…logo-720p.webm?url")
 */
export function escolherVideoDaAbertura(videoDoConfig: string, shaDoOriginal: string | null, ficha: FichaDoVideoLeve | null, urlDoLeve: string): EscolhaDoVideo {
  const original = assetUrl(videoDoConfig);
  if (!videoDoConfig) return { url: "", leve: false };
  if (!ficha) return { url: original, leve: false, aviso: "ainda não há vídeo 720p da abertura; rode `python3 tools/gerar_video_da_abertura.py`" };
  if (ficha.origem !== videoDoConfig || ficha.sha256_do_original !== shaDoOriginal) {
    return {
      url: original,
      leve: false,
      aviso: `o vídeo da abertura (${videoDoConfig}) mudou desde que o 720p foi feito; o site usa o original até você rodar \`python3 tools/gerar_video_da_abertura.py\``,
    };
  }
  return { url: urlDoLeve, leve: true };
}

let jaAvisou = false;
const shas = new Map<string, string | null>(); // o original tem 1,1 MB: lê-se uma vez por build, não uma vez por página

/** Lê o original de static/ e decide (usado pela Abertura.astro, que roda uma vez por página: o aviso sai uma vez só por build). */
export function videoDaAbertura(videoDoConfig: string, ficha: FichaDoVideoLeve | null, urlDoLeve: string): EscolhaDoVideo {
  if (videoDoConfig && !shas.has(videoDoConfig)) shas.set(videoDoConfig, sha256DoArquivo(join(process.cwd(), "static", videoDoConfig)));
  const sha = shas.get(videoDoConfig) ?? null;
  const escolha = escolherVideoDaAbertura(videoDoConfig, sha, ficha, urlDoLeve);
  if (escolha.aviso && !jaAvisou) {
    jaAvisou = true;
    console.warn(`[abertura] ${escolha.aviso}`);
  }
  return escolha;
}
