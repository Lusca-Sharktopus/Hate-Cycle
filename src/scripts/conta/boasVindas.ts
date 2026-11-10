// A conta acabou de ser criada? (10/11/2026, pedido do autor.) Quem cria uma conta vê o próprio perfil abrir na hora, para escolher o
// nome e a foto antes de comentar. Quem decide e quem abre é ./painel.ts (o botão da conta do cabeçalho, que existe em toda página);
// aqui ficam só as duas perguntas, em funções puras que o teste usa:
//
//   1. ehContaNova(): este login é o PRIMEIRO da conta? O Supabase não avisa "conta nova", então a resposta sai das datas que ele
//      mesmo põe na pessoa (todas do relógio do servidor): no primeiro login, a data do último login (last_sign_in_at) é a mesma da
//      criação da conta ou, no cadastro por e-mail, a da confirmação do e-mail (o clique no link). Num login qualquer de depois, a
//      data do último login já ficou longe dessas duas. O relógio do navegador entra só como trava frouxa (um dia), para a conta de
//      quem se cadastrou faz tempo e nunca saiu não ser tratada como nova.
//   2. jaRecebida(): este navegador já abriu o perfil para esta conta? (a sessão do primeiro login dura semanas; sem essa marca, o
//      perfil abriria de novo a cada página.) A marca é uma lista curta de IDs em localStorage.
//
// ⚠ Vai para o navegador: sem imports.

/** As datas da pessoa como o supabase-js entrega (session.user). */
export interface DatasDaConta {
  id: string;
  created_at?: string | undefined;
  /** O clique no link do e-mail (ou, no login com Google/Twitter/Discord, a criação). */
  email_confirmed_at?: string | undefined;
  confirmed_at?: string | undefined;
  last_sign_in_at?: string | undefined;
}

/** Quanto o último login pode estar longe do nascimento da conta para ainda ser o primeiro (as duas datas saem do mesmo pedido). */
export const FOLGA_DO_PRIMEIRO_LOGIN = 2 * 60 * 1000;
/** A trava do relógio do navegador: conta nascida há mais de um dia nunca é "nova" (nem com o relógio errado em algumas horas). */
export const IDADE_MAXIMA_DA_CONTA_NOVA = 24 * 60 * 60 * 1000;
/** Sem a data do último login (não deveria acontecer), vale só o relógio do navegador, bem mais apertado. */
export const IDADE_SEM_DATA_DO_LOGIN = 10 * 60 * 1000;

function instante(data: string | undefined): number {
  const n = typeof data === "string" ? Date.parse(data) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

/** Este login é o primeiro da conta? `agora` = Date.now() do navegador. */
export function ehContaNova(u: DatasDaConta, agora: number): boolean {
  const criada = instante(u.created_at);
  if (Number.isNaN(criada)) return false;
  const confirmada = instante(u.email_confirmed_at ?? u.confirmed_at);
  // o "nascimento": a criação ou, quando o e-mail foi confirmado depois, a confirmação
  const nascimento = Number.isNaN(confirmada) ? criada : Math.max(criada, confirmada);
  if (Math.abs(agora - nascimento) > IDADE_MAXIMA_DA_CONTA_NOVA) return false;
  const login = instante(u.last_sign_in_at);
  if (Number.isNaN(login)) return Math.abs(agora - nascimento) <= IDADE_SEM_DATA_DO_LOGIN;
  return Math.abs(login - nascimento) <= FOLGA_DO_PRIMEIRO_LOGIN;
}

export const CHAVE_DAS_RECEBIDAS = "hc-contas-recebidas";
const MAXIMO_DE_RECEBIDAS = 20;

type Armazem = Pick<Storage, "getItem" | "setItem">;

function recebidas(armazem: Armazem): string[] {
  try {
    const lista: unknown = JSON.parse(armazem.getItem(CHAVE_DAS_RECEBIDAS) ?? "[]");
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Este navegador já abriu o perfil para esta conta? */
export function jaRecebida(id: string, armazem: Armazem): boolean {
  return recebidas(armazem).includes(id);
}

/** Anota que o perfil já abriu para esta conta (as mais recentes no fim; lista curta). */
export function marcarRecebida(id: string, armazem: Armazem): void {
  try {
    const lista = recebidas(armazem).filter((x) => x !== id);
    lista.push(id);
    armazem.setItem(CHAVE_DAS_RECEBIDAS, JSON.stringify(lista.slice(-MAXIMO_DE_RECEBIDAS)));
  } catch {
    /* sem localStorage: a marca fica só na memória da página (./painel.ts) */
  }
}
