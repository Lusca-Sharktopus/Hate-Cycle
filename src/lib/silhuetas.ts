// Silhuetas (T17): o "molde" que o CSS usa para o texto contornar um desenho (`shape-outside: url(…)`).
//
// O problema: para o texto da página contornar o Giuseppe (Ossos do Ofício), a foto do autor e os GIFs da página Sobre, o CSS aponta
// `shape-outside` para o PRÓPRIO arquivo do desenho. O navegador baixa esse arquivo inteiro (1,6 MB o Giuseppe, 0,7 MB a foto, 0,4 MB cada
// GIF) só para ler o contorno, e, como o pedido do contorno é feito de outro jeito que o da <img>, baixa DE NOVO o que a <img> já tinha
// (os dois GIFs aparecem duas vezes na rede). O contorno só depende da transparência (o canal alfa) do desenho.
//
// A solução: no build, de cada desenho sai uma silhueta com o MESMO tamanho e o MESMO canal alfa, mas sem as cores
// (/silhuetas/giuseppe.png, poucos KB). O contorno que o navegador calcula é exatamente o mesmo (provado no navegador: as linhas do texto
// ficam nas mesmas posições, ao pixel). Se o autor trocar o desenho, a silhueta é refeita sozinha no próximo build.
//
// Por que só "tem desenho ou não tem": o `shape-outside` conta como "dentro da forma" todo pixel com alfa MAIOR QUE O LIMIAR
// (`shape-image-threshold`), e o limiar padrão é 0 (nenhum CSS do site o muda; tests/imagens.test.ts confere). Então qualquer pixel
// com alfa > 0 vira 255 e o resto 0: o contorno é o mesmo e o PNG fica minúsculo (o brilho suave do Giuseppe, com alfa de 1 a 254,
// custava 298 KB; assim, poucos KB).
// O desenho continua publicado, no mesmo endereço, e a <img> continua usando-o: só o `shape-outside` aponta para a silhueta.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** nome da silhueta → arquivo de static/ de onde sai. O CSS (prosa.css, PaginaAvulsa.astro) usa /silhuetas/<nome>.png. */
export const SILHUETAS = {
  giuseppe: "other images/Giuseppe.png",
  autor: "other images/1000172301.png",
  apollo: "other images/Apollo Site.gif",
  anfibio: "other images/Anfíbio Site.gif",
} as const;

export type NomeDaSilhueta = keyof typeof SILHUETAS;

/**
 * A silhueta como PNG: cinza + transparência. O alfa vale 255 onde o desenho tem qualquer alfa > 0 e 0 no resto (no GIF animado, vale o
 * primeiro quadro, que é o que o navegador usa para o contorno). O cinza é preto fixo: o contorno só lê o alfa.
 */
export async function gerarSilhueta(arquivo: string): Promise<Buffer> {
  const bytes = readFileSync(join(process.cwd(), "static", arquivo));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const cinzaEAlfa = Buffer.alloc(pixels * 2); // cinza = 0 (preto); só o alfa vem do desenho
  for (let i = 0; i < pixels; i++) cinzaEAlfa[i * 2 + 1] = (data[i * info.channels + 3] ?? 0) > 0 ? 255 : 0;
  return sharp(cinzaEAlfa, { raw: { width: info.width, height: info.height, channels: 2 } })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
}
