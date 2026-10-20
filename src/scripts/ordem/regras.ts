// "Estou lendo em ordem…" (T17c): as REGRAS do script do navegador — quais ordens existem, qual é a padrão e como lembrar a escolha.
//
// ⚠ Vai para o navegador (e também é lido por src/lib/ordemDeLeitura.ts, no build): NÃO importa nada. Qualquer import traria junto
// o config.json, e o que vai para o visitante não pode levar nada do que é do autor (as chaves do Supabase moram lá).
//
// O visitante escolhe a ordem (Cronológica ou Lançamento) no fim de um capítulo; o site LEMBRA a escolha no navegador dele (localStorage)
// e a próxima história já abre na ordem escolhida. localStorage pode faltar ou dar erro (janela privada, dados do site bloqueados, previews):
// toda leitura e escrita vai dentro de try/catch, e sem armazenamento o bloco continua funcionando, só não lembra.

/** As duas ordens (os nomes são os de `order` no work.json). */
export const ORDENS = ["chrono", "release"] as const;
export type Ordem = (typeof ORDENS)[number];

/** A ordem de quem nunca escolheu nada: a cronológica (é a que o desenho do autor mostra). */
export const ORDEM_PADRAO: Ordem = "chrono";

/** O nome da chave no localStorage do visitante. */
export const CHAVE_DA_ORDEM = "hc-ordem-de-leitura";

/** O que o script precisa de um armazenamento (o `localStorage` do navegador, ou um falso nos testes). */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export function ordemValida(valor: unknown): valor is Ordem {
  return typeof valor === "string" && (ORDENS as readonly string[]).includes(valor);
}

/** O `localStorage` do navegador, ou null se o navegador não deixa nem acessá-lo (o simples acesso pode lançar erro). */
export function armazenamentoDoNavegador(): Armazenamento | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A ordem que o visitante escolheu da última vez; null = nada guardado, valor estranho ou armazenamento que falhou. */
export function lerOrdemGuardada(armazenamento: Armazenamento | null | undefined): Ordem | null {
  try {
    const valor = armazenamento?.getItem(CHAVE_DA_ORDEM);
    return ordemValida(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Guarda a escolha. Devolve false se não deu (o bloco segue funcionando, só não lembra). */
export function guardarOrdem(armazenamento: Armazenamento | null | undefined, ordem: Ordem): boolean {
  try {
    if (!armazenamento) return false;
    armazenamento.setItem(CHAVE_DA_ORDEM, ordem);
    return true;
  } catch {
    return false;
  }
}
