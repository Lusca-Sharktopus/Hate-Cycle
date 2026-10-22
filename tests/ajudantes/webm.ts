// Leitor mínimo de arquivos .webm (Matroska/EBML), só para os testes do vídeo da abertura (T17e): lê, SEM ffmpeg, o que precisamos comparar entre o
// vídeo do autor e a versão 720p: tamanho, transparência (AlphaMode), duração, quantos quadros e em que instante (ms) cada quadro entra.
// Não decodifica vídeo; só anda pela estrutura do contêiner. Serve para arquivos com tamanhos de elemento conhecidos (o que o ffmpeg e o
// libvpx gravam); se achar um tamanho desconhecido (transmissão ao vivo), para com erro em vez de adivinhar.
import { readFileSync } from "node:fs";

export interface FichaDoWebm {
  largura: number;
  altura: number;
  /** AlphaMode = 1 na trilha de vídeo: o vídeo tem canal de transparência. */
  alfa: boolean;
  codec: string;
  /** Duração do segmento em milissegundos (Info/Duration × TimecodeScale). */
  duracaoMs: number;
  /** O instante, em ms, de cada quadro (SimpleBlock e Block de BlockGroup), na ordem do arquivo. */
  instantesMs: number[];
}

// IDs que importam (os bytes do ID, como número, com o marcador de tamanho incluído)
const SEGMENT = 0x18538067, INFO = 0x1549a966, TIMECODE_SCALE = 0x2ad7b1, DURATION = 0x4489;
const TRACKS = 0x1654ae6b, TRACK_ENTRY = 0xae, CODEC_ID = 0x86, VIDEO = 0xe0, PIXEL_W = 0xb0, PIXEL_H = 0xba, ALPHA_MODE = 0x53c0;
const CLUSTER = 0x1f43b675, CLUSTER_TIMECODE = 0xe7, SIMPLE_BLOCK = 0xa3, BLOCK_GROUP = 0xa0, BLOCK = 0xa1;
const FILHOS = new Set([SEGMENT, INFO, TRACKS, TRACK_ENTRY, VIDEO, CLUSTER, BLOCK_GROUP]);

function id(b: Buffer, i: number): [number, number] {
  const primeiro = b[i] ?? 0;
  let n = 1;
  while (n < 4 && !(primeiro & (0x80 >> (n - 1)))) n++;
  let v = 0;
  for (let k = 0; k < n; k++) v = v * 256 + (b[i + k] ?? 0);
  return [v, n];
}
function tamanho(b: Buffer, i: number): [number, number] {
  const primeiro = b[i] ?? 0;
  let n = 1;
  while (n <= 8 && !(primeiro & (0x80 >> (n - 1)))) n++;
  let v = primeiro & (0xff >> n);
  let todosUm = v === 0xff >> n;
  for (let k = 1; k < n; k++) {
    const x = b[i + k] ?? 0;
    v = v * 256 + x;
    if (x !== 0xff) todosUm = false;
  }
  if (todosUm) throw new Error("elemento de tamanho desconhecido (transmissão ao vivo): não suportado");
  return [v, n];
}
const inteiro = (b: Buffer, i: number, n: number): number => {
  let v = 0;
  for (let k = 0; k < n; k++) v = v * 256 + (b[i + k] ?? 0);
  return v;
};

export function lerWebm(caminho: string): FichaDoWebm {
  const b = readFileSync(caminho);
  const f: FichaDoWebm = { largura: 0, altura: 0, alfa: false, codec: "", duracaoMs: 0, instantesMs: [] };
  let escala = 1_000_000; // ns por unidade de tempo (padrão do Matroska: 1 ms)
  let duracao = 0;
  const andar = (de: number, ate: number, tempoDoCluster: number) => {
    let i = de;
    while (i < ate) {
      const [eid, ni] = id(b, i);
      const [tam, nt] = tamanho(b, i + ni);
      const ini = i + ni + nt;
      const fim = ini + tam;
      if (FILHOS.has(eid)) andar(ini, fim, eid === CLUSTER ? 0 : tempoDoCluster);
      else if (eid === TIMECODE_SCALE) escala = inteiro(b, ini, tam);
      else if (eid === DURATION) duracao = tam === 8 ? b.readDoubleBE(ini) : b.readFloatBE(ini);
      else if (eid === CODEC_ID) f.codec = b.toString("latin1", ini, fim);
      else if (eid === PIXEL_W) f.largura = inteiro(b, ini, tam);
      else if (eid === PIXEL_H) f.altura = inteiro(b, ini, tam);
      else if (eid === ALPHA_MODE) f.alfa = inteiro(b, ini, tam) === 1;
      else if (eid === CLUSTER_TIMECODE) tempoDoCluster = inteiro(b, ini, tam);
      else if (eid === SIMPLE_BLOCK || eid === BLOCK) {
        const [, nTrilha] = tamanho(b, ini); // o número da trilha é um "vint"
        const relativo = b.readInt16BE(ini + nTrilha);
        f.instantesMs.push(((tempoDoCluster + relativo) * escala) / 1_000_000);
      }
      i = fim;
    }
  };
  // O tempo de um Cluster vale só dentro dele: cada Cluster é visitado com tempo 0 e começa pelo seu Timecode, antes de qualquer bloco.
  andar(0, b.length, 0);
  f.duracaoMs = (duracao * escala) / 1_000_000;
  return f;
}
