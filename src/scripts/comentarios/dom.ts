// Comentários (T15): o ÚNICO jeito de a caixa de comentários criar HTML no navegador.
//
// SEGURANÇA — texto de comentário e nome de usuário são escritos por qualquer visitante. Por isso:
//   - texto só entra com `textContent` (o navegador mostra "<img onerror=…>" como letras, nunca como HTML);
//   - atributos só com `setAttribute`, e o nome do atributo nunca pode começar com "on" (onclick, onerror…): isso
//     ligaria código. Eventos só pela lista `ao` (addEventListener com uma função deste script);
//   - nada de innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser nem createContextualFragment em
//     src/scripts/comentarios/ (tests/comentarios.test.ts procura essas palavras nos arquivos e falha se achar).
// É o mesmo cuidado do el() do static/comments.js, com duas travas a mais: lá, uma chave "on…" virava evento e qualquer
// outra virava atributo; aqui o nome do atributo é conferido, e evento e atributo ficam em listas separadas.
//
// ⚠ Vai para o navegador: não importa nada.

type Filho = Node | null | undefined | false;

export interface OpcoesDoElemento {
  /** Atributos (setAttribute). Nome começando com "on" é recusado: evento vai em `ao`. */
  attrs?: Readonly<Record<string, string>>;
  /** O texto do elemento (textContent): nunca vira HTML. */
  texto?: string;
  /** Eventos: { click: () => … }. */
  ao?: Readonly<{ [Evento in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[Evento]) => void }>;
}

/** Nome de atributo aceito: letras, números, "-", "_", ":" e "."; nunca "on…" (atributos de evento). */
const NOME_DE_ATRIBUTO = /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/;
export function atributoPermitido(nome: string): boolean {
  return NOME_DE_ATRIBUTO.test(nome) && !/^on/i.test(nome);
}

/** Cria um elemento com atributos, texto, eventos e filhos. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, o: OpcoesDoElemento = {}, filhos: readonly Filho[] = []): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [nome, valor] of Object.entries(o.attrs ?? {})) {
    if (!atributoPermitido(nome)) throw new Error(`atributo recusado: ${nome}`);
    n.setAttribute(nome, valor);
  }
  if (o.texto !== undefined) n.textContent = o.texto;
  for (const [evento, funcao] of Object.entries(o.ao ?? {})) {
    if (typeof funcao === "function") n.addEventListener(evento, funcao as EventListener);
  }
  for (const f of filhos) if (f) n.appendChild(f);
  return n;
}
