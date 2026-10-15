// As regras dos EMISSÁRIOS (a grade de gente que ajuda o projeto): ordem, redes, texto, inicial.
//
// Quais emissários existem (rascunhos e os escondidos em config.json → emissaries.hide) é de `emissariosDoIdioma()`
// em src/lib/visibilidade.ts. Prova: tests/regras.test.ts (referência: tools/regras_ref.py).
//
// De onde vem cada regra no build.py:
//   ordenarEmissarios  → build()          linha ~674   (campo `order:` em ordem natural, depois o título)
//   redesDoEmissario   → card_emissary    linhas ~488–492 (NETWORKS)
//   inicialDoEmissario → card_emissary    linha ~487  (a letra no lugar da foto)
//   mostraTexto        → card_emissary    linha ~493  (config.json → emissaries.show_texts)
import { compararComoPython, compararNatural } from "./ordem";
import type { Lang } from "./config";

/** O que as regras leem de um emissário. */
export interface EmissarioComDados {
  body?: string | undefined;
  data: {
    title?: string | undefined;
    role?: string | undefined;
    image?: string | undefined;
    order?: string | undefined;
    instagram?: string | undefined;
    tiktok?: string | undefined;
    youtube?: string | undefined;
    x?: string | undefined;
    bluesky?: string | undefined;
    website?: string | undefined;
    email?: string | undefined;
    _origem: { slug: string; lang: Lang };
  };
}

/** `order:` ausente vale 99 (vai para o fim). É texto: "2" vem antes de "10" (ordem natural). */
const ORDEM_PADRAO = "99";

/** Emissários na ordem de exibição: pelo `order:` (natural), empate pelo título (letra por letra); sem título, o nome da pasta. */
export function ordenarEmissarios<T extends EmissarioComDados>(emissarios: readonly T[]): T[] {
  const titulo = (e: T) => e.data.title || e.data._origem.slug;
  return [...emissarios]
    .sort((a, b) => compararComoPython(a.data._origem.slug, b.data._origem.slug)) // desempate final = ordem das pastas (load_items)
    .sort((a, b) => compararNatural(a.data.order ?? ORDEM_PADRAO, b.data.order ?? ORDEM_PADRAO) || compararComoPython(titulo(a), titulo(b)));
}

/** NETWORKS do build.py (linha ~482): os campos de rede do front matter, na ordem em que os ícones aparecem, e o nome de cada um. */
export const REDES = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["bluesky", "Bluesky"],
  ["website", "Website"],
  ["email", "E-mail"],
] as const;
export type ChaveDeRede = (typeof REDES)[number][0];

export interface RedeDoEmissario {
  chave: ChaveDeRede;
  rotulo: string;
  /** O link. E-mail sem "mailto:" ganha o "mailto:" na frente (só se tiver "@"). */
  url: string;
}

/** As redes que o emissário preencheu, na ordem fixa de REDES. */
export function redesDoEmissario(e: EmissarioComDados): RedeDoEmissario[] {
  const saida: RedeDoEmissario[] = [];
  for (const [chave, rotulo] of REDES) {
    const valor = e.data[chave];
    if (!valor) continue;
    const url = chave !== "email" || !valor.includes("@") || valor.startsWith("mailto:") ? valor : `mailto:${valor}`;
    saida.push({ chave, rotulo, url });
  }
  return saida;
}

/** A letra no lugar da foto, quando o emissário não tem `image:`: a primeira letra do título, em maiúscula. */
export function inicialDoEmissario(e: EmissarioComDados): string {
  const titulo = e.data.title || e.data._origem.slug;
  return (Array.from(titulo)[0] ?? "").toUpperCase();
}

/** O texto de apresentação aparece no card? Só se o emissário tem texto e `config.json → emissaries.show_texts` não for false. */
export function mostraTexto(e: EmissarioComDados, mostrarTextos: boolean): boolean {
  return mostrarTextos && (e.body ?? "").trim() !== "";
}
