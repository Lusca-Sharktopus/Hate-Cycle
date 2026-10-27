// Provas da T17e, parte 2: os GIFs animados do autor viram WebP animado SEM PERDA e tocam exatamente igual.
//
// O que é provado, para TODO GIF animado de static/ (hoje quatro: Apollo e Anfíbio da página Sobre, "NO… …I CAN'T…" de Ossos do Ofício e a versão em português, "NÃO… …EU NÃO POSSO…"):
//   - o WebP tem o mesmo tamanho, o mesmo número de quadros, a MESMA duração em cada quadro (lida do cabeçalho do arquivo, byte a byte,
//     não pelo sharp) e a mesma repetição (para sempre, como o GIF);
//   - cada quadro, decodificado, é IGUAL ao do GIF (sem perda: cor e transparência de cada pixel visível, quadro a quadro);
//   - os tempos do próprio GIF são os que o autor fez (o "NO…" fica 2000 ms parado e depois vêm dois quadros de 100 ms, não 2000 ms em cada um):
//     se o autor trocar o GIF, esta lista é a que avisa.
// No navegador (tempos na tela e repetição de verdade) a prova é tools/animadas_playwright.py. O que o HTML ganha (e que o Python não tem) está
// em tests/imagens.test.ts, bloco "T17e no site construído".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { apelidoDoArquivo, atrasoComoNoNavegador, gerarWebpAnimado, gifsDeStatic, lerAnimada, nomeDaAnimada, otimizarAnimada, urlDaAnimada } from "../src/lib/animadas";
import { atributosNovos } from "../src/lib/imagensDoHtml";
import { cabecalhoDoWebpAnimado } from "./ajudantes/webp";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** Os GIFs animados que o site tem hoje e como o autor os fez (conferido nos bytes do GIF: bloco de controle de cada quadro e extensão NETSCAPE). */
const DO_AUTOR: Record<string, { largura: number; altura: number; atrasos: number[] }> = {
  "other images/Apollo Site.gif": { largura: 395, altura: 560, atrasos: [120, 130, 120, 130, 120, 130, 120, 130] },
  "other images/Anfíbio Site.gif": { largura: 509, altura: 560, atrasos: [120, 130, 120, 130, 120, 130, 120, 130] },
  "other images/no-i-cant.gif": { largura: 943, altura: 376, atrasos: [2000, 100, 100] },
  // T17n: a versão em português que o autor fez ("NÃO… …EU NÃO POSSO…", para /pt/works/all-in-a-nights-work/01/), com os mesmos tempos
  "other images/nao-eu-nao-posso.gif": { largura: 943, altura: 376, atrasos: [2000, 100, 100] },
};

describe("regras puras", () => {
  test("apelido do arquivo: sem acento, sem espaço, minúsculo", () => {
    expect(apelidoDoArquivo("other images/Apollo Site.gif")).toBe("apollo-site");
    expect(apelidoDoArquivo("other images/Anfíbio Site.gif")).toBe("anfibio-site");
    expect(apelidoDoArquivo("no-i-cant.gif")).toBe("no-i-cant");
    expect(apelidoDoArquivo("???.gif")).toBe("animada");
  });
  test("o nome leva o carimbo do conteúdo (outro GIF de mesmo nome = outro endereço) e vai para /animadas/", () => {
    expect(nomeDaAnimada("other images/Apollo Site.gif", "1a2b3c4d")).toBe("apollo-site-1a2b3c4d.webp");
    expect(urlDaAnimada("apollo-site-1a2b3c4d.webp")).toBe("/animadas/apollo-site-1a2b3c4d.webp");
  });
  test("atraso de 10 ms ou menos toca como 100 ms, igual ao navegador com o GIF; o resto fica como está", () => {
    expect([0, 1, 10, 11, 20, 100, 2000].map(atrasoComoNoNavegador)).toEqual([100, 100, 100, 11, 20, 100, 2000]);
  });
  test("a <img> do GIF ganha só o srcset 1x e width/height: nada de sizes (que não vale com 1x)", () => {
    const tag = { temWidthOuHeight: false, styleComHeight: false, temDecoding: false, preguicosa: false };
    expect(atributosNovos({ srcset: "/animadas/a-12345678.webp 1x", sizes: "", width: 395, height: 560 }, tag)).toBe(' srcset="/animadas/a-12345678.webp 1x" width="395" height="560"');
    // com o autor já tendo dado largura, a tag não ganha width/height; preguiçosa ganha decoding
    expect(atributosNovos({ srcset: "/animadas/a.webp 1x", sizes: "", width: 395, height: 560 }, { ...tag, temWidthOuHeight: true, preguicosa: true })).toBe(' srcset="/animadas/a.webp 1x" decoding="async"');
  });
});

describe("os GIFs animados de static/", () => {
  test("o site tem exatamente os GIFs animados que a lista do autor diz (GIF novo ou trocado: atualize DO_AUTOR depois de conferir)", async () => {
    const animados: string[] = [];
    for (const g of gifsDeStatic()) if (await lerAnimada(g)) animados.push(g);
    expect(animados.sort()).toEqual(Object.keys(DO_AUTOR).sort());
  });

  test.each(Object.entries(DO_AUTOR))("%s: lido do GIF", async (arquivo, esperado) => {
    const info = await lerAnimada(arquivo);
    expect(info).not.toBeNull();
    expect({ largura: info?.largura, altura: info?.altura, atrasos: info?.atrasos, quadros: info?.quadros, repeticoes: info?.repeticoes }).toEqual({
      largura: esperado.largura,
      altura: esperado.altura,
      atrasos: esperado.atrasos,
      quadros: esperado.atrasos.length,
      repeticoes: 0, // para sempre
    });
  });

  test("GIF de um quadro só (ou que não existe, ou que não é GIF) não ganha versão", async () => {
    expect(await lerAnimada("other images/Giuseppe.png")).toBeNull();
    expect(await lerAnimada("nao-existe.gif")).toBeNull();
    expect(await otimizarAnimada("covers/PT/Capa Pederneira.png")).toBeNull();
  });
});

describe.each(Object.entries(DO_AUTOR))("o WebP animado de %s toca igual ao GIF", (arquivo, esperado) => {
  let webp: Buffer;
  const gerar = async () => (webp ??= await gerarWebpAnimado(arquivo));

  test("é um WebP animado, com a duração de cada quadro do GIF e repetindo para sempre (lido do cabeçalho do arquivo)", async () => {
    const c = cabecalhoDoWebpAnimado(await gerar());
    expect(c.animado).toBe(true);
    expect(c.atrasos).toEqual(esperado.atrasos);
    expect(c.repeticoes).toBe(0);
  });

  test("mesmo tamanho e mesmo número de quadros", async () => {
    const m = await sharp(await gerar(), { pages: -1 }).metadata();
    expect(m.format).toBe("webp");
    expect([m.width, m.pageHeight, m.pages]).toEqual([esperado.largura, esperado.altura, esperado.atrasos.length]);
  });

  test("cada quadro é IGUAL ao do GIF: mesma transparência e a mesma cor em todo pixel visível (sem perda)", async () => {
    const gif = await sharp(readFileSync(join(RAIZ, "static", arquivo)), { pages: -1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const novo = await sharp(await gerar(), { pages: -1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(novo.info.width).toBe(gif.info.width);
    expect(novo.info.height).toBe(gif.info.height); // todos os quadros empilhados
    let alfaDiferente = 0;
    let corDiferente = 0;
    let visiveis = 0;
    const a = gif.data;
    const b = novo.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] !== b[i + 3]) alfaDiferente++;
      else if (a[i + 3] !== 0) {
        visiveis++;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) corDiferente++;
      }
    }
    expect(visiveis).toBeGreaterThan(1000); // o teste está olhando para um desenho de verdade
    expect(alfaDiferente).toBe(0);
    expect(corDiferente).toBe(0);
  });

  test("não é maior que o GIF (hoje: de 14% a 90% menor)", async () => {
    expect((await gerar()).length).toBeLessThanOrEqual(readFileSync(join(RAIZ, "static", arquivo)).length);
  });
});
