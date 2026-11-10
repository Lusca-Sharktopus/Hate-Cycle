// (09/11/2026, pedido do autor: "em todas as instâncias de HATE CYCLE em versalete, deixe ATE e YCLE em semibold, para igualar a
// grossura da fonte com o H e o C") O versalete do site é o do navegador (`.hc { font-variant: small-caps }`): as letras pequenas são
// as maiúsculas encolhidas, e por isso saem mais finas que o H e o C. Este passo, no fim de TODA página (src/middleware.ts), separa as
// letras pequenas de "Hate Cycle" num <span class="hc-semi">, que o CSS deixa mais grosso (src/styles/global.css).
// Só "Hate Cycle" (os outros versaletes do site, como "Senhor", ficam como estão, pedido literal do autor).
// O Python não tem: tests/ajudantes/html.ts → semVersaleteSemibold() desfaz antes de comparar.

const RE_HATE_CYCLE = /<span class="hc">Hate Cycle<\/span>/g;
export const HATE_CYCLE_SEMIBOLD = '<span class="hc">H<span class="hc-semi">ate</span> C<span class="hc-semi">ycle</span></span>';

/** Troca todo <span class="hc">Hate Cycle</span> do HTML pela forma com as letras pequenas em semibold. */
export function versaleteSemibold(html: string): string {
  return html.replace(RE_HATE_CYCLE, HATE_CYCLE_SEMIBOLD);
}
