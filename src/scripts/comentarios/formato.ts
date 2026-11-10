// A FORMATAÇÃO dos comentários (10/11/2026, pedido do autor): negrito, itálico, sublinhado, riscado, spoiler, citação, GIFs do KLIPY e
// imagens enviadas. Tudo como funções puras (texto entra, uma árvore sai); quem desenha a árvore é ./midia.ts, só com el() e
// createElement (nunca HTML). Prova: tests/formato-dos-comentarios.test.ts.
//
// Como o visitante escreve (os botões da barra de ferramentas, ./editor.ts, escrevem estas marcas por ele):
//   **negrito**   *itálico*   __sublinhado__   ~~riscado~~   ||spoiler||   > citação (no começo da linha)
//   uma linha só com {gif:<endereço do KLIPY>}  → o GIF
//   uma linha só com {img:<caminho no balde>}   → a imagem enviada (balde "comment-images" do Supabase)
//   \* \_ \~ \| \\  → o caractere em si, sem virar marca
// O banco guarda o TEXTO com as marcas (public.comments.body, até 2000 caracteres), como sempre; o site antigo (comments.js) mostra
// as marcas como letras. Endereço que não é do KLIPY, caminho fora do formato ou mídia além de MAXIMO_DE_MIDIAS ficam como texto.
//
// ⚠ Vai para o navegador: não importa nada.

/** Os estilos de texto. */
export type Estilo = "negrito" | "italico" | "sublinhado" | "riscado" | "spoiler";

/** Um pedaço de uma linha: texto puro ou um estilo com pedaços dentro. */
export type Trecho = string | { estilo: Estilo; filhos: Trecho[] };

/** Um bloco do comentário. */
export type Bloco =
  | { tipo: "texto"; trechos: Trecho[] }
  | { tipo: "citacao"; trechos: Trecho[] }
  | { tipo: "gif"; endereco: string }
  | { tipo: "imagem"; caminho: string };

/** As marcas, na ordem em que são procuradas (as de dois caracteres antes do "*" sozinho). */
export const MARCAS: readonly (readonly [string, Estilo])[] = [
  ["**", "negrito"],
  ["__", "sublinhado"],
  ["~~", "riscado"],
  ["||", "spoiler"],
  ["*", "italico"],
];

/** No máximo 4 GIFs/imagens por comentário (o resto fica como texto). */
export const MAXIMO_DE_MIDIAS = 4;
/** Estilo dentro de estilo dentro de estilo… só até aqui (o resto fica como texto). */
const PROFUNDIDADE_MAXIMA = 6;

const ESCAPAVEIS = "*_~|\\";

/** O caminho de uma imagem no balde: <id da conta>/<nome aleatório>.<webp|jpg|gif> (a mesma regra do banco). */
export const CAMINHO_DA_IMAGEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9]{12,40}\.(webp|jpg|gif)$/;

/** O endereço do GIF, se for um arquivo do KLIPY (https, klipy.com ou subdomínio, sem usuário/senha nem porta); senão null. */
export function enderecoDoGif(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 400 || !/^https:\/\//.test(valor)) return null;
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
  if (host !== "klipy.com" && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.klipy\.com$/.test(host)) return null;
  if (!/^\/[A-Za-z0-9/_.%-]+$/.test(u.pathname) || u.pathname.includes("..")) return null;
  if (u.search && !/^\?[A-Za-z0-9=&_.%-]+$/.test(u.search)) return null;
  // só o endereço já na forma canônica (nada de espaços ou letras que o navegador "conserta")
  return u.href === valor ? u.href : null;
}

/** O endereço público de uma imagem enviada, ou null se o caminho não tem a forma esperada. `base` = a URL do Supabase do config.json. */
export function enderecoDaImagem(base: string, caminho: unknown): string | null {
  if (typeof caminho !== "string" || !CAMINHO_DA_IMAGEM.test(caminho)) return null;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) return null;
  return `${base}/storage/v1/object/public/comment-images/${caminho}`;
}

/** A linha de mídia ({gif:…} ou {img:…}), se for uma válida. */
function midiaDaLinha(linha: string): Bloco | null {
  const m = /^\{(gif|img):([^\s{}]+)\}$/.exec(linha.trim());
  if (!m) return null;
  if (m[1] === "gif") {
    const endereco = enderecoDoGif(m[2]);
    return endereco ? { tipo: "gif", endereco } : null;
  }
  return CAMINHO_DA_IMAGEM.test(m[2] as string) ? { tipo: "imagem", caminho: m[2] as string } : null;
}

/** A marca de um GIF, para guardar no texto. */
export function marcaDoGif(endereco: string): string {
  return `{gif:${endereco}}`;
}
/** A marca de uma imagem enviada. */
export function marcaDaImagem(caminho: string): string {
  return `{img:${caminho}}`;
}

/** Os estilos de UMA linha (sem quebras). */
export function analisarLinha(texto: string, profundidade = 0): Trecho[] {
  const saida: Trecho[] = [];
  let atual = "";
  const empurrar = (t: Trecho) => {
    if (typeof t === "string") {
      if (!t) return;
      const ultimo = saida[saida.length - 1];
      if (typeof ultimo === "string") saida[saida.length - 1] = ultimo + t;
      else saida.push(t);
    } else saida.push(t);
  };
  let i = 0;
  while (i < texto.length) {
    const c = texto[i] as string;
    if (c === "\\" && i + 1 < texto.length && ESCAPAVEIS.includes(texto[i + 1] as string)) {
      atual += texto[i + 1];
      i += 2;
      continue;
    }
    let achou = false;
    if (profundidade < PROFUNDIDADE_MAXIMA) {
      for (const [marca, estilo] of MARCAS) {
        if (!texto.startsWith(marca, i)) continue;
        const fim = fechamento(texto, i + marca.length, marca);
        if (fim === -1) continue;
        const dentro = texto.slice(i + marca.length, fim);
        // "**" vazio ou só espaço nas pontas ("a * b * c") não é marca
        if (!dentro.trim() || /^\s/.test(dentro) || /\s$/.test(dentro)) continue;
        empurrar(atual);
        atual = "";
        saida.push({ estilo, filhos: analisarLinha(dentro, profundidade + 1) });
        i = fim + marca.length;
        achou = true;
        break;
      }
    }
    if (achou) continue;
    atual += c;
    i++;
  }
  empurrar(atual);
  return saida;
}

/** Onde a marca fecha (pulando os escapes); -1 se não fecha. "*" sozinho não fecha num "**". */
function fechamento(texto: string, desde: number, marca: string): number {
  for (let j = desde; j < texto.length; j++) {
    if (texto[j] === "\\" && j + 1 < texto.length && ESCAPAVEIS.includes(texto[j + 1] as string)) {
      j++;
      continue;
    }
    if (!texto.startsWith(marca, j)) continue;
    // numa fileira de três ou mais ("***"), a marca dupla fecha nos ÚLTIMOS caracteres (o "*" de antes é do itálico de dentro)
    if (marca.length === 2 && texto[j + 2] === marca[0]) continue;
    if (marca === "*" && texto[j + 1] === "*") {
      // um "**" dentro do itálico: pula o par inteiro (é negrito por dentro)
      const fimDoNegrito = fechamento(texto, j + 2, "**");
      if (fimDoNegrito !== -1) {
        j = fimDoNegrito + 1;
        continue;
      }
    }
    return j;
  }
  return -1;
}

/** O comentário inteiro em blocos: linhas de texto juntas, citações juntas, cada mídia sozinha. */
export function analisarComentario(corpo: string): Bloco[] {
  const blocos: Bloco[] = [];
  let midias = 0;
  let grupo: { tipo: "texto" | "citacao"; linhas: string[] } | null = null;
  const fecharGrupo = () => {
    if (!grupo) return;
    blocos.push({ tipo: grupo.tipo, trechos: analisarLinhas(grupo.linhas) });
    grupo = null;
  };
  for (const linha of corpo.split("\n")) {
    const midia = midias < MAXIMO_DE_MIDIAS ? midiaDaLinha(linha) : null;
    if (midia) {
      fecharGrupo();
      blocos.push(midia);
      midias++;
      continue;
    }
    const citacao = /^>\s?(.*)$/.exec(linha);
    const tipo = citacao ? "citacao" : "texto";
    const conteudo = citacao ? (citacao[1] as string) : linha;
    if (!grupo || grupo.tipo !== tipo) {
      fecharGrupo();
      grupo = { tipo, linhas: [] };
    }
    (grupo as { linhas: string[] }).linhas.push(conteudo);
  }
  fecharGrupo();
  // as linhas em branco em volta das mídias não viram blocos vazios
  return blocos.filter((b) => !((b.tipo === "texto" || b.tipo === "citacao") && b.trechos.length === 0) && !(b.tipo === "texto" && soEspacos(b.trechos)));
}

function soEspacos(trechos: Trecho[]): boolean {
  return trechos.every((t) => typeof t === "string" && !t.trim());
}

/** Várias linhas: cada uma com os seus estilos (uma marca não atravessa a quebra), juntas pelo "\n". */
function analisarLinhas(linhas: readonly string[]): Trecho[] {
  const saida: Trecho[] = [];
  linhas.forEach((linha, n) => {
    if (n > 0) saida.push("\n");
    saida.push(...analisarLinha(linha));
  });
  // junta textos vizinhos
  return saida.reduce<Trecho[]>((acc, t) => {
    const ultimo = acc[acc.length - 1];
    if (typeof t === "string" && typeof ultimo === "string") acc[acc.length - 1] = ultimo + t;
    else if (t !== "") acc.push(t);
    return acc;
  }, []);
}

/** O comentário não tem nenhuma marca que mude a aparência (aí a caixa desenha só o texto, como sempre). */
export function semFormatacao(corpo: string): boolean {
  const b = analisarComentario(corpo);
  return b.length <= 1 && b.every((x) => x.tipo === "texto" && x.trechos.every((t) => typeof t === "string")) && !/\\[*_~|\\]/.test(corpo);
}

// ───────────── o editor (os botões da barra) ─────────────

/** O texto do campo e a seleção. */
export interface Selecao {
  valor: string;
  inicio: number;
  fim: number;
}

/** O que cada botão de estilo escreve. */
export const MARCA_DO_ESTILO: Readonly<Record<Estilo, string>> = { negrito: "**", italico: "*", sublinhado: "__", riscado: "~~", spoiler: "||" };

/**
 * O botão de um estilo: põe a marca em volta da seleção (sem seleção, o cursor fica entre as duas marcas); se a seleção já está
 * entre as marcas, tira. Espaços nas pontas da seleção ficam de fora (a marca só vale grudada no texto).
 */
export function alternarEstilo(s: Selecao, estilo: Estilo): Selecao {
  const marca = MARCA_DO_ESTILO[estilo];
  let { inicio, fim } = s;
  const v = s.valor;
  while (inicio < fim && /\s/.test(v[inicio] as string)) inicio++;
  while (fim > inicio && /\s/.test(v[fim - 1] as string)) fim--;
  const n = marca.length;
  const antes = v.slice(inicio - n, inicio);
  const depois = v.slice(fim, fim + n);
  // o "*" de itálico grudado em outro "*" é parte de um "**" de negrito, não itálico
  const ehDoNegrito = estilo === "italico" && (v[inicio - n - 1] === "*" || v[fim + n] === "*");
  if (inicio >= n && antes === marca && depois === marca && !ehDoNegrito) {
    return { valor: v.slice(0, inicio - n) + v.slice(inicio, fim) + v.slice(fim + n), inicio: inicio - n, fim: fim - n };
  }
  const meio = v.slice(inicio, fim);
  if (meio.startsWith(marca) && meio.endsWith(marca) && meio.length >= 2 * n + 1) {
    const sem = meio.slice(n, meio.length - n);
    return { valor: v.slice(0, inicio) + sem + v.slice(fim), inicio, fim: inicio + sem.length };
  }
  return { valor: v.slice(0, inicio) + marca + meio + marca + v.slice(fim), inicio: inicio + n, fim: fim + n };
}

/** O botão de citação: as linhas da seleção ganham "> " no começo (ou perdem, se todas já têm). */
export function alternarCitacao(s: Selecao): Selecao {
  const v = s.valor;
  const comeco = v.lastIndexOf("\n", s.inicio - 1) + 1;
  let final = v.indexOf("\n", s.fim > s.inicio && v[s.fim - 1] === "\n" ? s.fim - 1 : s.fim);
  if (final === -1) final = v.length;
  const linhas = v.slice(comeco, final).split("\n");
  const todas = linhas.every((l) => /^>\s?/.test(l));
  const novas = linhas.map((l) => (todas ? l.replace(/^>\s?/, "") : `> ${l}`));
  const bloco = novas.join("\n");
  return { valor: v.slice(0, comeco) + bloco + v.slice(final), inicio: comeco, fim: comeco + bloco.length };
}

/** Põe um texto (emoji, runa) no lugar da seleção; o cursor fica depois dele. */
export function inserirTexto(s: Selecao, texto: string): Selecao {
  const valor = s.valor.slice(0, s.inicio) + texto + s.valor.slice(s.fim);
  const pos = s.inicio + texto.length;
  return { valor, inicio: pos, fim: pos };
}

/** Uma mídia anexada ao comentário (o que fica na bandeja embaixo do campo). */
export type Midia = { tipo: "gif"; endereco: string } | { tipo: "imagem"; caminho: string };

/** Separa as mídias (linhas {gif:…}/{img:…} válidas) do texto: para a edição, o texto volta para o campo e as mídias para a bandeja. */
export function separarMidias(corpo: string): { texto: string; midias: Midia[] } {
  const midias: Midia[] = [];
  const linhas: string[] = [];
  for (const linha of corpo.split("\n")) {
    const m = midias.length < MAXIMO_DE_MIDIAS ? midiaDaLinha(linha) : null;
    if (m && m.tipo === "gif") midias.push({ tipo: "gif", endereco: m.endereco });
    else if (m && m.tipo === "imagem") midias.push({ tipo: "imagem", caminho: m.caminho });
    else linhas.push(linha);
  }
  return { texto: linhas.join("\n").trim(), midias };
}

/** O texto que vai para o banco: o texto do campo e, cada uma numa linha, as mídias da bandeja. Nada = null (não envia). */
export function juntarMidias(texto: string, midias: readonly Midia[]): string | null {
  const partes = [texto.trim(), ...midias.slice(0, MAXIMO_DE_MIDIAS).map((m) => (m.tipo === "gif" ? marcaDoGif(m.endereco) : marcaDaImagem(m.caminho)))].filter(Boolean);
  const corpo = partes.join("\n");
  return corpo ? corpo : null;
}

/** Os caminhos das imagens de um comentário (para apagar os arquivos junto com ele). */
export function imagensDoComentario(corpo: string): string[] {
  return separarMidias(corpo)
    .midias.filter((m): m is { tipo: "imagem"; caminho: string } => m.tipo === "imagem")
    .map((m) => m.caminho);
}
