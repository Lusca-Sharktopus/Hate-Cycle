// O CORTE dos títulos das laterais do pager (anterior / próximo). Pedido do autor, 16/10/2026: os títulos longos das
// notícias ("Dia 28 desenhando uma criatura de Especulação Evolutiva de Hᴀᴛᴇ Cʏᴄʟᴇ todos os dias…", 150 letras) espremiam o botão
// do meio, "Todas as notícias". Função pura, porte fiel de clip_title() do build.py (a régua da paridade).
//
// Por que 40: a metade das notícias (43 de 83 em inglês, 41 de 83 em português) passa de 40 e quase todas são os posts
// "Dia N desenhando…" (138 e 156 letras); os outros títulos (mediana ≈ 40) ficam como estão ou perdem só a última palavra. Com 40, o
// título cabe em duas linhas ao lado do botão redondo no desktop e em uma no celular. Os capítulos têm títulos de até 28 letras: nada muda neles.
//
// Contamos CARACTERES como o Python (len() = pontos de código): "Hᴀᴛᴇ Cʏᴄʟᴇ" (versalete Unicode) e emojis valem 1 cada, ainda que o
// JavaScript os tenha como 1 ou 2 "unidades". Por isso o texto vira lista de pontos de código (Array.from) antes de cortar.
import { ESPACOS_PY } from "./frontmatter";

/** Quantos caracteres cabem no título de uma lateral do pager, contando as reticências. */
export const LIMITE_DO_TITULO_NO_PAGER = 40;

const RE_ESPACO = new RegExp(`^[${ESPACOS_PY}]$`, "u");
const RE_PALAVRA_PARTIDA = new RegExp(`[${ESPACOS_PY}][^${ESPACOS_PY}]*$`, "u");
/** O que não pode ficar pendurado antes das reticências (fecha-aspas, "!", "?" e ")" ficam). */
const RE_SOLTOS = new RegExp(`[${ESPACOS_PY},;:.\\-–—_/\\\\|&+=…·(\\[{«“‘"']+$`, "u");

/** Título curto: cabe em `limite` caracteres (reticências incluídas) e só é cortado se passar do limite. */
export function cortarTitulo(titulo: string, limite: number = LIMITE_DO_TITULO_NO_PAGER): string {
  const letras = Array.from(titulo);
  if (letras.length <= limite) return titulo;
  let corte = letras.slice(0, limite - 1).join("");
  // o corte caiu no meio de uma palavra: descarta a palavra partida (se for uma palavra só, o corte duro fica)
  if (!RE_ESPACO.test(letras[limite - 1] ?? "")) {
    const m = RE_PALAVRA_PARTIDA.exec(corte);
    if (m) corte = corte.slice(0, m.index);
  }
  corte = corte.replace(RE_SOLTOS, "");
  return (corte || letras.slice(0, limite - 1).join("").replace(new RegExp(`[${ESPACOS_PY}]+$`, "u"), "")) + "…";
}
