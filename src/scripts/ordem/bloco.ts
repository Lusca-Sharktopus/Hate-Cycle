// "Estou lendo em ordem…" (T17c): o que o script faz com o bloco do fim do capítulo (src/components/ProximaHistoria.astro).
//
// O servidor já desenhou AS DUAS ordens (cada uma é um <div class="so-order" data-ordem="…">; a que não é a padrão vem com `hidden`)
// e o seletor com `disabled` (sem JavaScript ele não funcionaria). Este script só: (1) lê a ordem que o visitante guardou e mostra a
// lista certa, (2) liga o seletor, (3) guarda a nova escolha quando ele troca. Nenhum HTML é criado aqui — só muda `hidden`, o `value`
// do seletor e o texto (textContent) do nome da ordem; não há innerHTML (tests/ordem.test.ts procura essas palavras nos arquivos).
//
// ⚠ Vai para o navegador: só importa ./regras (que não importa nada).
import { ORDEM_PADRAO, armazenamentoDoNavegador, guardarOrdem, lerOrdemGuardada, ordemValida, type Armazenamento, type Ordem } from "./regras";

/** Liga um bloco. `armazenamento` = onde lembrar a escolha (o localStorage; nos testes, um falso). Devolve a ordem mostrada. */
export function iniciarBloco(bloco: HTMLElement, armazenamento: Armazenamento | null): Ordem | null {
  const seletor = bloco.querySelector<HTMLSelectElement>("select.so-select");
  const nome = bloco.querySelector<HTMLElement>(".so-valor");
  const listas = bloco.querySelectorAll<HTMLElement>(".so-order[data-ordem]");
  if (!seletor || !nome || listas.length === 0) return null;

  const mostrar = (ordem: Ordem): void => {
    for (const lista of listas) lista.hidden = lista.dataset["ordem"] !== ordem;
    seletor.value = ordem;
    nome.textContent = seletor.selectedOptions[0]?.textContent ?? "";
    bloco.dataset["ordem"] = ordem;
  };

  const inicial = ordemValida(bloco.dataset["ordem"]) ? bloco.dataset["ordem"] : ORDEM_PADRAO;
  const ordem = lerOrdemGuardada(armazenamento) ?? inicial;
  mostrar(ordem);
  seletor.disabled = false;
  seletor.addEventListener("change", () => {
    if (!ordemValida(seletor.value)) return;
    mostrar(seletor.value);
    guardarOrdem(armazenamento, seletor.value);
  });
  return ordem;
}

/** Liga todos os blocos da página (só há um por capítulo). */
export function iniciarBlocos(raiz: ParentNode = document): void {
  const armazenamento = armazenamentoDoNavegador();
  for (const bloco of raiz.querySelectorAll<HTMLElement>("[data-story-order]")) iniciarBloco(bloco, armazenamento);
}
