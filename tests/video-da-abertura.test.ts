// Provas da T17e, parte 1: o vídeo da abertura em 720p é o MESMO vídeo do autor, só menor, e o site nunca serve um 720p desatualizado.
//
// Sem ffmpeg: o leitor de contêiner de tests/ajudantes/webm.ts lê os dois arquivos (o do autor, em static/, e o 720p, em src/assets/intro/) e
// compara o que não pode mudar: quantos quadros, o instante de CADA quadro, a duração, a transparência e a proporção da imagem.
// (Que a imagem de cada quadro continua sendo a mesma, nítida e com a mesma transparência, foi conferido a olho e por PSNR quando o vídeo foi
// gerado; as imagens estão na lição 11.) O que o site faz com o vídeo no HTML está em tests/imagens.test.ts ("T17e no site construído").
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { introConfig } from "../src/lib/config";
import { escolherVideoDaAbertura, sha256DoArquivo, type FichaDoVideoLeve } from "../src/lib/videoDaAbertura";
import { lerWebm } from "./ajudantes/webm";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ORIGINAL = join(RAIZ, "static", introConfig.video);
const LEVE = join(RAIZ, "src", "assets", "intro", "logo-720p.webm");
const FICHA = JSON.parse(readFileSync(join(RAIZ, "src", "assets", "intro", "logo-720p.json"), "utf8")) as FichaDoVideoLeve & Record<string, unknown>;
const REFAZER = "refaça o vídeo leve: python3 tools/gerar_video_da_abertura.py";

describe("o 720p da abertura corresponde ao vídeo que o autor tem hoje", () => {
  test(`a ficha é do vídeo de hoje (SHA-256 do original e caminho do config.json); ${REFAZER}`, () => {
    expect(FICHA.origem).toBe(introConfig.video);
    expect(sha256DoArquivo(ORIGINAL)).toBe(FICHA.sha256_do_original);
  });

  test("o arquivo 720p é o da ficha (ninguém trocou um dos dois sem refazer o outro)", () => {
    expect(sha256DoArquivo(LEVE)).toBe(FICHA["sha256_do_derivado"]);
    expect(statSync(LEVE).size).toBe(FICHA["bytes_do_derivado"]);
    expect(statSync(ORIGINAL).size).toBe(FICHA["bytes_do_original"]);
  });

  const original = lerWebm(ORIGINAL);
  const leve = lerWebm(LEVE);

  test("mesma duração e os MESMOS quadros nos MESMOS instantes", () => {
    expect(original.instantesMs.length).toBeGreaterThan(100);
    expect(leve.instantesMs.length).toBe(original.instantesMs.length);
    expect(leve.instantesMs).toEqual(original.instantesMs);
    expect(leve.duracaoMs).toBeCloseTo(original.duracaoMs, 0);
    expect(leve.duracaoMs).toBe(Number(FICHA["duracao_s"]) * 1000);
    expect(leve.instantesMs.length).toBe(Number(FICHA["quadros"]));
  });

  test("com transparência, como o original (a logo flutua sobre o roxo da abertura)", () => {
    expect(original.alfa).toBe(true);
    expect(leve.alfa).toBe(true);
    expect(leve.codec).toBe("V_VP9");
    expect(original.codec).toBe("V_VP9");
  });

  test("720p mesmo (1280×720), na mesma proporção do original, e bem mais leve", () => {
    expect([leve.largura, leve.altura]).toEqual([1280, 720]);
    expect(leve.largura / leve.altura).toBeCloseTo(original.largura / original.altura, 6);
    expect(leve.largura).toBeLessThan(original.largura);
    // o objetivo da T17e: bem menos da metade do arquivo do autor (1,1 MB → ~0,5 MB); 60% é a folga para outra escolha de qualidade
    expect(statSync(LEVE).size).toBeLessThan(statSync(ORIGINAL).size * 0.6);
  });

  test("o 720p cobre a tela de abertura mais larga (a regra do CSS é min(94vw, 1100px)): 1280 px ≥ 1100 px", () => {
    expect(leve.largura).toBeGreaterThanOrEqual(1100);
  });
});

describe("escolherVideoDaAbertura: nunca serve um 720p velho", () => {
  const ficha: FichaDoVideoLeve = { origem: "intro/logo.webm", sha256_do_original: "aaa" };
  const leveUrl = "/_astro/logo-720p.XYZ.webm";

  test("ficha e original combinam: vale o 720p, sem aviso", () => {
    expect(escolherVideoDaAbertura("intro/logo.webm", "aaa", ficha, leveUrl)).toEqual({ url: leveUrl, leve: true });
  });
  test("o autor trocou o vídeo (SHA diferente): vale o ORIGINAL dele e o build avisa", () => {
    const r = escolherVideoDaAbertura("intro/logo.webm", "bbb", ficha, leveUrl);
    expect(r.leve).toBe(false);
    expect(r.url).toBe("/intro/logo.webm");
    expect(r.aviso).toContain("gerar_video_da_abertura.py");
  });
  test("o config.json aponta para outro arquivo: vale o original apontado", () => {
    const r = escolherVideoDaAbertura("intro/novo video.webm", "aaa", ficha, leveUrl);
    expect(r).toMatchObject({ url: "/intro/novo%20video.webm", leve: false });
    expect(r.aviso).toBeTruthy();
  });
  test("sem ficha (ainda não gerado) ou sem arquivo de original: original e aviso; sem vídeo no config: nada", () => {
    expect(escolherVideoDaAbertura("intro/logo.webm", "aaa", null, leveUrl)).toMatchObject({ url: "/intro/logo.webm", leve: false });
    expect(escolherVideoDaAbertura("intro/logo.webm", null, ficha, leveUrl).leve).toBe(false);
    expect(escolherVideoDaAbertura("", null, ficha, leveUrl)).toEqual({ url: "", leve: false });
  });
});
