// As runas da estrela dos favoritos (03/11/2026, só no Astro; pedido do autor): ao aparecer na capa, a caixinha passa rápido por
// runas sorteadas desta lista, para numa runa final e então vira a estrela. Cada obra pode ter a sua lista (`star_runes` no
// work.json); sem ela, vale a provisória abaixo (as runas do bloco rúnico que o fundo do site já usa e cujas fontes o site já serve).
// Runa nova que não está no fundo do site precisa de fonte: tools/gerar_fontes_das_runas.py (lição 11, seção 7).
import { GLIFOS } from "./runas";

export interface RunasDaEstrela {
  lista: readonly string[];
  /** a(s) runa(s) final(is), mostradas em ordem logo antes da estrela (Luz & Sangue tem duas: ✝ e o sangue). */
  finais: readonly string[];
}

/** Provisória: as runas do bloco Rúnico (U+16A0–U+16FF) que o fundo do site já desenha; a final é ᛟ (Othala). */
export const RUNAS_PROVISORIAS: RunasDaEstrela = {
  lista: GLIFOS.filter((g) => /^[ᚠ-᛿]$/u.test(g)),
  finais: ["ᛟ"],
};

/** As runas de uma obra: as do work.json (`star_runes`) ou as provisórias. */
export function runasDaEstrela(starRunes: { list: readonly string[]; final: string | readonly string[] } | undefined): RunasDaEstrela {
  if (!starRunes) return RUNAS_PROVISORIAS;
  return { lista: [...starRunes.list], finais: typeof starRunes.final === "string" ? [starRunes.final] : [...starRunes.final] };
}
