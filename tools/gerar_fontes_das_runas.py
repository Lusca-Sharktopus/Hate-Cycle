#!/usr/bin/env python3
"""Gera os recortes de fonte das RUNAS do fundo (T17): só os glifos que o site desenha, servidos pelo próprio site.

Antes: cada página pedia ao Google Fonts, uma <link> por família Noto, um recorte (`&text=`) só com os glifos usados.
Agora: este script faz o mesmo recorte UMA vez, aqui, e grava o resultado no repositório:
  src/assets/fontes/runas/*.woff2     os recortes (poucos KB cada)
  src/styles/fontes-das-runas.css     os @font-face (um por recorte, com unicode-range exato)
  src/assets/fontes/runas/cobertura.json   o que cada recorte cobre (os testes conferem com a lista de runas)
O build NÃO roda este script (não depende de Python nem de rede): ele só usa os arquivos que ficaram no repositório.
Rode de novo só se a lista de runas mudar (RUNES em src/lib/runas.ts) ou se quiser atualizar as fontes Noto.

Como rodar (precisa de `pip install fonttools brotli` e dos pacotes @fontsource das famílias Noto baixados numa pasta FORA do projeto):
  mkdir /tmp/noto && cd /tmp/noto
  for p in noto-sans noto-sans-symbols noto-sans-symbols-2 noto-sans-math noto-sans-runic noto-sans-cherokee noto-sans-kr noto-sans-jp \\
           noto-sans-yi noto-sans-phoenician noto-sans-glagolitic noto-sans-tifinagh noto-sans-balinese noto-sans-canadian-aboriginal \\
           noto-sans-old-turkic noto-sans-old-italic noto-sans-lycian noto-sans-linear-a noto-sans-old-south-arabian noto-sans-warang-citi; do
    npm pack @fontsource/$p@5.3.0 --silent; done          # (noto-sans-kr e -jp: @5.3.1)
  for f in *.tgz; do mkdir -p x/${f%.tgz}; tar xzf $f -C x/${f%.tgz} --strip-components=1; done
  python3 tools/gerar_fontes_das_runas.py --pacotes /tmp/noto/x
(Os pacotes ficam fora do projeto de propósito: o do Noto Sans JP sozinho tem 84 MB e só 3 glifos do site vêm de CJK.)

Regra de escolha (a mesma do navegador): cada runa é desenhada pela PRIMEIRA família da lista `font-family` de `.runes i`
(src/components/Runas.astro) que tiver o glifo. Aqui, para cada glifo acha-se essa família e o recorte do pacote que o contém.
"""
import argparse, glob, json, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A ordem do `font-family` de `.runes i` (Runas.astro): a primeira família que tem o glifo o desenha.
FAMILIAS = [
    ("Noto Sans", "noto-sans"), ("Noto Sans Runic", "noto-sans-runic"), ("Noto Sans Symbols", "noto-sans-symbols"),
    ("Noto Sans Symbols 2", "noto-sans-symbols-2"), ("Noto Sans Math", "noto-sans-math"), ("Noto Sans Cherokee", "noto-sans-cherokee"),
    ("Noto Sans Yi", "noto-sans-yi"), ("Noto Sans Phoenician", "noto-sans-phoenician"), ("Noto Sans Glagolitic", "noto-sans-glagolitic"),
    ("Noto Sans Tifinagh", "noto-sans-tifinagh"), ("Noto Sans Balinese", "noto-sans-balinese"),
    ("Noto Sans Canadian Aboriginal", "noto-sans-canadian-aboriginal"), ("Noto Sans Old Turkic", "noto-sans-old-turkic"),
    ("Noto Sans Old Italic", "noto-sans-old-italic"), ("Noto Sans Lycian", "noto-sans-lycian"), ("Noto Sans Linear A", "noto-sans-linear-a"),
    ("Noto Sans Old South Arabian", "noto-sans-old-south-arabian"), ("Noto Sans Warang Citi", "noto-sans-warang-citi"),
    ("Noto Sans KR", "noto-sans-kr"), ("Noto Sans JP", "noto-sans-jp"),
]


def glifos_do_site() -> list[str]:
    """Os símbolos sem repetição, na ordem da 1ª aparição (RUNES de src/lib/runas.ts)."""
    ts = open(os.path.join(RAIZ, "src", "lib", "runas.ts"), encoding="utf8").read()
    m = re.search(r'export const RUNES =\s*"([^"]+)"', ts)
    if not m:
        sys.exit("não achei RUNES em src/lib/runas.ts")
    return list(dict.fromkeys(m.group(1)))


def recortes_da_familia(pacotes: str, slug: str) -> list[tuple[str, str, set[int]]]:
    """Os arquivos .woff de peso 400 de uma família: (id do recorte, caminho, pontos de código que têm glifo)."""
    pasta = glob.glob(os.path.join(pacotes, f"fontsource-{slug}-5.*"))
    if not pasta:
        sys.exit(f"pacote não encontrado: {slug} em {pacotes}")
    saida = []
    for arq in sorted(glob.glob(os.path.join(pasta[0], "files", f"{slug}-*-400-normal.woff"))):
        recorte = os.path.basename(arq)[len(slug) + 1 : -len("-400-normal.woff")]
        saida.append((recorte, arq, set(TTFont(arq).getBestCmap())))
    if not saida:  # famílias variáveis só no pacote variável: tenta qualquer arquivo normal
        for arq in sorted(glob.glob(os.path.join(pasta[0], "files", f"{slug}-*-normal.woff"))):
            recorte = os.path.basename(arq)[len(slug) + 1 : -len("-normal.woff")]
            saida.append((recorte, arq, set(TTFont(arq).getBestCmap())))
    return saida


def faixa(cps: list[int]) -> str:
    """unicode-range compacto: U+16A3,U+16A9,U+16B1-16B8…"""
    cps = sorted(cps)
    partes, ini, fim = [], cps[0], cps[0]
    for c in cps[1:] + [None]:
        if c is not None and c == fim + 1:
            fim = c
            continue
        partes.append(f"U+{ini:X}" if ini == fim else f"U+{ini:X}-{fim:X}")
        if c is not None:
            ini = fim = c
    return ",".join(partes)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pacotes", required=True, help="pasta com os pacotes @fontsource extraídos (fontsource-<nome>-<versão>/)")
    a = ap.parse_args()
    glifos = glifos_do_site()
    cps = [ord(g) for g in glifos]
    print(f"{len(glifos)} glifos de runa")

    # 1. quem desenha cada glifo: a primeira família da lista que o tem
    atribuicao: dict[int, tuple[str, str, str, str]] = {}  # cp -> (família, slug, recorte, arquivo)
    for nome, slug in FAMILIAS:
        for recorte, arq, tem in recortes_da_familia(a.pacotes, slug):
            for cp in cps:
                if cp in tem and cp not in atribuicao:
                    atribuicao[cp] = (nome, slug, recorte, arq)
    faltam = [f"U+{c:X} {chr(c)}" for c in cps if c not in atribuicao]
    if faltam:
        sys.exit("glifos sem fonte nenhuma (o navegador os desenharia com a fonte de reserva): " + ", ".join(faltam))

    # 2. um recorte por (família, recorte do pacote)
    grupos: dict[tuple[str, str, str, str], list[int]] = {}
    for cp, chave in atribuicao.items():
        grupos.setdefault(chave, []).append(cp)
    saida_dir = os.path.join(RAIZ, "src", "assets", "fontes", "runas")
    os.makedirs(saida_dir, exist_ok=True)
    for velho in glob.glob(os.path.join(saida_dir, "*.woff2")):
        os.remove(velho)
    cobertura, css = [], []
    for (nome, slug, recorte, arq), lista in sorted(grupos.items(), key=lambda kv: [f[0] for f in FAMILIAS].index(kv[0][0])):
        lista.sort()
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = []     # sem ligaduras/kerning: cada runa é um glifo só
        opts.hinting = False
        opts.name_IDs = [1, 2]
        opts.notdef_outline = False
        opts.glyph_names = False
        opts.legacy_kern = False
        opts.drop_tables += ["DSIG"]
        fonte = subset.load_font(arq, opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=lista)
        sub.subset(fonte)
        nome_arq = f"{slug}-{recorte}.woff2"
        subset.save_font(fonte, os.path.join(saida_dir, nome_arq), opts)
        # confere: o arquivo gravado tem MESMO os glifos
        cmap = set(TTFont(os.path.join(saida_dir, nome_arq)).getBestCmap())
        assert set(lista) <= cmap, (nome_arq, [hex(c) for c in set(lista) - cmap])
        tam = os.path.getsize(os.path.join(saida_dir, nome_arq))
        cobertura.append({"familia": nome, "arquivo": nome_arq, "glifos": [f"{c:X}" for c in lista], "bytes": tam})
        css.append(
            f'/* {nome}: {" ".join(chr(c) for c in lista)} */\n'
            f'@font-face {{ font-family: "{nome}"; font-style: normal; font-weight: 400; font-display: swap; '
            f'src: url("../assets/fontes/runas/{nome_arq}") format("woff2"); unicode-range: {faixa(lista)}; }}\n'
        )
        print(f"  {nome_arq:55s} {len(lista):3d} glifos  {tam:6d} bytes")
    open(os.path.join(saida_dir, "cobertura.json"), "w", encoding="utf8").write(json.dumps(cobertura, ensure_ascii=False, indent=1) + "\n")
    cabeca = (
        "/* Fontes das RUNAS do fundo, servidas pelo próprio site (T17). GERADO por tools/gerar_fontes_das_runas.py — não edite à mão.\n"
        "   Cada recorte tem só os glifos de runa do site (src/lib/runas.ts → RUNES), tirados das fontes Noto (@fontsource, versão fixa);\n"
        "   a primeira família da lista `font-family` de `.runes i` (Runas.astro) que tem o glifo é a que o desenha, como no Google Fonts.\n"
        "   Os nomes das famílias são os do Google Fonts, para o `font-family` das runas não mudar. Fora de @layer: é só @font-face. */\n\n"
    )
    open(os.path.join(RAIZ, "src", "styles", "fontes-das-runas.css"), "w", encoding="utf8").write(cabeca + "\n".join(css))
    total = sum(c["bytes"] for c in cobertura)
    print(f"{len(cobertura)} recortes, {total} bytes no total ({total/1024:.1f} KB)")


if __name__ == "__main__":
    main()
