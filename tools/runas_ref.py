#!/usr/bin/env python3
"""T07 — Referência das runas do fundo, tirada do gerador Python, para o teste do Astro.

Uso (na raiz do repositório):
  python3 tools/runas_ref.py                 # regrava tests/fixtures/runas-python.json
  python3 tools/runas_ref.py --semente /pt/  # só imprime o HTML das runas de uma semente (para olhar)

O que faz: importa o build.py SEM gerar o site e chama as funções de verdade dele —
rune_imprint(semente) e rune_fonts_links() — para:
  1. a semente real de cada página da baseline (baseline/urls.json → "html"): o endereço da página
     sem o base_url, ex. "/pt/" (é o `seed=url` de page() no build.py); a 404 usa "404"
     (shell() sem seed cai em `seed or title`, e o título da 404 é "404");
  2. 500 sementes sorteadas (sempre as mesmas: o sorteio daqui também tem semente fixa), com
     acentos, letras fora do BMP (𐤉, 🜁…), vazio, números e endereços inventados.
O teste (tests/runas.test.ts, `pnpm test`) compara, texto a texto, o que src/lib/runas.ts produz
com o que está gravado aqui. Por que um arquivo e não chamar o Python na hora do teste: depois da
virada (T20) o build.py sai da branch principal, e o teste tem de continuar funcionando sem ele.

Só biblioteca padrão. Não cria public/ nem __pycache__.
"""
import argparse, json, random, sys
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  (só importar não gera nada: o build() roda apenas em `python build.py`)

SAIDA = ROOT / "tests" / "fixtures" / "runas-python.json"
QUANTAS_SORTEADAS = 500


def semente_da_pagina(url):
    """A string que o build.py passa para rune_imprint() ao gerar a página `url`."""
    return "404" if url == "/404.html" else url


def sementes_sorteadas(n):
    rnd = random.Random(20261015)
    letras = "abcdefghijklmnopqrstuvwxyz0123456789-_/ áéíóúãõçÁÉÜü—…“”'\"&<>"
    exoticas = list(dict.fromkeys(build.RUNES)) + ["😀", "🦈", "Hᴀᴛᴇ Cʏᴄʟᴇ", "︎", "\n", "\t"]
    fixas = ["", "0", "1", " ", "404", "/", "/en", "/pt", "/PT.html", "Hᴀᴛᴇ Cʏᴄʟᴇ", "Ossos do Ofício"]
    out = list(fixas)
    while len(out) < n:
        tipo = rnd.randrange(4)
        if tipo == 0:                                # endereço plausível
            partes = ["".join(rnd.choice("abcdefghijklmnopqrstuvwxyz-0123456789") for _ in range(rnd.randint(1, 18)))
                      for _ in range(rnd.randint(1, 4))]
            out.append(f"/{rnd.choice(['en', 'pt'])}/" + "/".join(partes) + "/")
        elif tipo == 1:                              # texto com acentos e pontuação
            out.append("".join(rnd.choice(letras) for _ in range(rnd.randint(1, 40))))
        elif tipo == 2:                              # mistura com caracteres fora do BMP
            out.append("".join(rnd.choice(exoticas + list(letras)) for _ in range(rnd.randint(1, 12))))
        else:                                        # número
            out.append(str(rnd.randrange(10 ** rnd.randint(1, 30))))
    return out[:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--semente", help="só imprime rune_imprint(SEMENTE) e sai")
    a = ap.parse_args()
    if a.semente is not None:
        print(build.rune_imprint(a.semente))
        return
    urls = json.loads((ROOT / "baseline" / "urls.json").read_text("utf-8"))["html"]
    casos = [{"origem": "pagina", "url": u, "semente": semente_da_pagina(u)} for u in urls]
    casos += [{"origem": "sorteada", "semente": s} for s in sementes_sorteadas(QUANTAS_SORTEADAS)]
    for c in casos:
        c["html"] = build.rune_imprint(c["semente"])
    dados = {
        "_leia": "Gerado por tools/runas_ref.py a partir do build.py (rune_imprint e rune_fonts_links). "
                 "Não edite à mão: rode `python3 tools/runas_ref.py` de novo. Usado por tests/runas.test.ts.",
        "python": sys.version.split()[0],
        "fontes": build.rune_fonts_links(),
        "casos": casos,
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=0) + "\n", "utf-8")
    print(f"✔ {len(casos)} casos ({len(urls)} páginas + {QUANTAS_SORTEADAS} sorteadas) em {SAIDA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
