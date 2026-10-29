#!/usr/bin/env python3
"""Gera a tabela de LARGURAS das letras da fonte do rótulo "Ler/Assistir/Jogar [obra]" do bloco "estou lendo em ordem" (T17i).

Para quê: o autor pediu (PDF de 21/10, mudança 8) que o rótulo fique SEMPRE numa linha só. O build mede o rótulo de cada lado (soma
das larguras das letras na fonte de verdade, Lexend 500) e o CSS escolhe o tamanho de letra que faz os dois rótulos da caixa caberem
lado a lado, sem quebrar e sem cortar, em qualquer largura de tela (src/lib/ordemDeLeitura.ts → emDosRotulos; CSS em ProximaHistoria.astro).
O navegador não roda nada: é só uma conta de CSS com um número que o build escreveu.

Saída: src/lib/largurasDoRotulo.ts (gerado; não edite à mão). O build NÃO roda este script (não depende de Python): rode de novo só se
o pacote @fontsource-variable/lexend mudar de versão ou se o peso do rótulo (font-weight: 500) mudar. tests/ordem.test.ts confere o
carimbo (SHA-256) dos arquivos da fonte: se o pacote mudar sem refazer a tabela, o teste avisa.

Como rodar (precisa de `pip install fonttools brotli`; o pnpm install já baixou a fonte em node_modules/):
  python3 tools/gerar_larguras_do_rotulo.py
"""
import hashlib, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "node_modules", "@fontsource-variable", "lexend", "files")
# os recortes que o site usa para o texto em latim (src/styles/fontes.css); o vietnamita não entra em títulos de obra
ARQUIVOS = ["lexend-latin-wght-normal.woff2", "lexend-latin-ext-wght-normal.woff2"]
PESO = 500  # o font-weight de .so-label (ProximaHistoria.astro)
SAIDA = os.path.join(RAIZ, "src", "lib", "largurasDoRotulo.ts")


def larguras(arquivo: str) -> tuple[dict[int, int], int]:
    fonte = TTFont(arquivo)
    unidades = fonte["head"].unitsPerEm
    fonte = instancer.instantiateVariableFont(fonte, {"wght": PESO})
    hmtx = fonte["hmtx"]
    return {cp: hmtx[nome][0] for cp, nome in fonte.getBestCmap().items()}, unidades


def main() -> None:
    tabela: dict[int, int] = {}
    carimbos = []
    unidades = None
    for nome in ARQUIVOS:
        caminho = os.path.join(PASTA, nome)
        carimbos.append(f'  "{nome}": "{hashlib.sha256(open(caminho, "rb").read()).hexdigest()}",')
        t, u = larguras(caminho)
        if unidades is None:
            unidades = u
        assert u == unidades, "os recortes têm unidades diferentes"
        for cp, w in t.items():
            tabela.setdefault(cp, w)
    # só o que pode aparecer num título: do espaço em diante (sem caracteres de controle)
    tabela = {cp: w for cp, w in sorted(tabela.items()) if cp >= 0x20 and cp not in (0x7F, 0xAD)}
    maior = max(tabela.values())
    # [código, largura]: as letras vão pelo código (nada invisível ou ambíguo no arquivo)
    pares = ",".join(f"[0x{cp:04X},{w}]" for cp, w in tabela.items())
    texto = f'''// GERADO por tools/gerar_larguras_do_rotulo.py — não edite à mão (rode o script de novo; ver o topo dele).
//
// A largura de cada letra da fonte Lexend no peso {PESO} (o do rótulo "Ler/Assistir/Jogar [obra]" do bloco "estou lendo em ordem"), em
// milésimos de "em" (1 em = o tamanho da letra). Serve para o build saber quantos "em" o rótulo mede (src/lib/ordemDeLeitura.ts) e o CSS
// escolher um tamanho de letra que caiba numa linha só. Letra que não está aqui vale a MAIOR largura da tabela (nunca sai mais estreita
// do que é de verdade).

/** Unidades por em da fonte. */
export const UNIDADES_POR_EM = {unidades};

/** A maior largura da tabela (vale para letras que não estão nela). */
export const LARGURA_MAXIMA = {maior};

/** O SHA-256 dos arquivos da fonte de onde a tabela saiu (tests/ordem.test.ts confere com os de node_modules). */
export const CARIMBOS_DA_FONTE: Readonly<Record<string, string>> = {{
{chr(10).join(carimbos)}
}};

/** [código da letra, largura em unidades]. */
export const LARGURAS: ReadonlyMap<number, number> = new Map<number, number>([{pares}]);
'''
    open(SAIDA, "w", encoding="utf-8").write(texto)
    print(f"{SAIDA}: {len(tabela)} letras, maior largura {maior}/{unidades}")


if __name__ == "__main__":
    main()
