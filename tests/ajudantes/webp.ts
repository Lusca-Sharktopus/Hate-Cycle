// Leitor mínimo do cabeçalho de um WebP animado (T17e): a duração de cada quadro e a repetição, lidas dos bytes do arquivo (RIFF), sem depender
// do sharp para dizer o que o sharp escreveu.

/** Lê o cabeçalho de um WebP animado: a duração de cada quadro (ANMF) e quantas vezes repete (ANIM; 0 = para sempre). */
export function cabecalhoDoWebpAnimado(bytes: Buffer): { atrasos: number[]; repeticoes: number | null; animado: boolean } {
  if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") throw new Error("não é um arquivo WebP");
  const atrasos: number[] = [];
  let repeticoes: number | null = null;
  let animado = false;
  let i = 12;
  while (i + 8 <= bytes.length) {
    const tipo = bytes.toString("latin1", i, i + 4);
    const n = bytes.readUInt32LE(i + 4);
    if (tipo === "VP8X") animado = (bytes[i + 8]! & 0x02) !== 0; // o bit de "animação" dos sinalizadores
    if (tipo === "ANIM") repeticoes = bytes.readUInt16LE(i + 8 + 4);
    if (tipo === "ANMF") atrasos.push(bytes.readUIntLE(i + 8 + 12, 3)); // 3 bytes de duração (ms) depois de x, y, largura e altura
    i += 8 + n + (n & 1);
  }
  return { atrasos, repeticoes, animado };
}
