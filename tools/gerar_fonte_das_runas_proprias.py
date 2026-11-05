#!/usr/bin/env python3
"""A fonte das runas PRÓPRIAS de Hᴀᴛᴇ Cʏᴄʟᴇ (03/11/2026, pedido do autor): símbolos que não existem no Unicode, desenhados numa fonte
nossa, "Hate Cycle Runas", em que cada um mora no lugar de uma letra:

  a = a Quinta Runa d'A Morte: o símbolo alquímico do sangue (triângulo de ponta para baixo, com uma barra e um traço dentro);
  b = a Quinta Runa d'Os Amantes: duas linhas em pé cortadas pelo mesmo traço diagonal da ᚾ (usada no lugar do 𐤚 em Alô?).

Os desenhos são os PNGs do autor (guardados/runas-proprias/), medidos pixel a pixel e passados para polígonos (abaixo, em coordenadas
da imagem: x para a direita, y para baixo). Linhas retas apenas: o glifo é exatamente o desenho.

Saída: src/assets/fontes/runas-proprias/hate-cycle-runas.ttf (a fonte inteira, pequena). Quem a recorta e a serve ao site é o
tools/gerar_fontes_das_runas.py (família "Hate Cycle Runas", a PRIMEIRA da lista: só ela tem "a" e "b" no unicode-range, então nenhuma
outra letra do site muda). Rode este script de novo só se um desenho mudar ou entrar uma runa própria nova; depois, o outro.
Precisa de: pip install fonttools skia-pathops
"""
import os

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "src", "assets", "fontes", "runas-proprias", "hate-cycle-runas.ttf")
UPM = 1000
ALTURA = 700        # a altura do desenho, em unidades (a altura das maiúsculas da Noto Sans é ~714)
MARGEM = 50         # espaço dos dois lados

# ── os desenhos (coordenadas da imagem do autor) ──

# "Quinta Runa d'A Morte.png" (1200 × 1014): triângulo de borda 75 px; a barra divide o vão em dois buracos; o traço fica no de cima.
SANGUE = {
    "fundo": 982, "esquerda": 30, "altura": 930,
    "formas": [
        [(30, 52), (1172, 52), (601, 982)],                                   # o triângulo cheio
    ],
    "buracos": [
        [(139.4, 108), (1062.6, 108), (831.1, 485), (370.9, 485)],            # o vão de cima (acima da barra)
        [(405.2, 541), (796.8, 541), (601, 859.8)],                           # o vão de baixo (abaixo da barra)
    ],
    "por_cima": [
        [(409, 268), (794, 268), (794, 325), (409, 325)],                     # o traço dentro do vão de cima
    ],
}
# "Quinta Runa d'Os Amantes.png" (386 × 564; versão corrigida pelo autor em 03/11, o traço subindo para a direita, como o da ᚾ): duas
# linhas em pé (62 px) e o traço diagonal (~30°), por cima das duas.
AMANTES = {
    "fundo": 564, "esquerda": 0, "altura": 564,
    "formas": [
        [(101, 0), (163, 0), (163, 564), (101, 564)],
        [(223, 0), (285, 0), (285, 564), (223, 564)],
        [(0, 359), (354, 153), (386, 206), (31, 411)],
    ],
    "buracos": [],
    "por_cima": [],
}


def caminho(poligonos, conv) -> pathops.Path:
    p = pathops.Path()
    pen = p.getPen()
    for poli in poligonos:
        pts = [conv(x, y) for x, y in poli]
        pen.moveTo(pts[0])
        for pt in pts[1:]:
            pen.lineTo(pt)
        pen.closePath()
    return p


def glifo(desenho):
    s = ALTURA / desenho["altura"]
    conv = lambda x, y: (round(MARGEM + (x - desenho["esquerda"]) * s, 1), round((desenho["fundo"] - y) * s, 1))
    cheio = caminho(desenho["formas"], conv)
    cheio.simplify()  # junta as formas que se cruzam (as duas linhas e o traço) num contorno só
    if desenho["buracos"]:
        cheio = pathops.op(cheio, caminho(desenho["buracos"], conv), pathops.PathOp.DIFFERENCE)
    if desenho["por_cima"]:
        cheio = pathops.op(cheio, caminho(desenho["por_cima"], conv), pathops.PathOp.UNION)
    pen = TTGlyphPen(None)
    cheio.draw(pen)
    g = pen.glyph()
    xs = [x for x, _ in conv_pts(desenho, conv)]
    largura = round(max(xs) + MARGEM)
    return g, largura


def conv_pts(desenho, conv):
    return [conv(x, y) for poli in desenho["formas"] + desenho["por_cima"] for x, y in poli]


def main() -> None:
    glifos, larguras = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}, {".notdef": (500, 0), "space": (300, 0)}
    for nome, desenho in (("a", SANGUE), ("b", AMANTES)):
        g, larg = glifo(desenho)
        glifos[nome] = g
        larguras[nome] = (larg, MARGEM)
    fb = FontBuilder(UPM, isTTF=True)
    ordem = [".notdef", "space", "a", "b"]
    fb.setupGlyphOrder(ordem)
    fb.setupCharacterMap({0x20: "space", ord("a"): "a", ord("b"): "b"})
    fb.setupGlyf(glifos)
    fb.setupHorizontalMetrics(larguras)
    fb.setupHorizontalHeader(ascent=900, descent=-200)
    fb.setupNameTable({"familyName": "Hate Cycle Runas", "styleName": "Regular", "uniqueFontIdentifier": "HateCycleRunas-Regular-20261103",
                       "fullName": "Hate Cycle Runas", "psName": "HateCycleRunas-Regular", "version": "Version 1.000",
                       "copyright": "Desenhos de Lusca Sharktopus (Hate Cycle)"})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=900, usWinDescent=200, sxHeight=500, sCapHeight=ALTURA)
    fb.setupPost()
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    fb.save(SAIDA)
    print(f"✔ {os.path.relpath(SAIDA, RAIZ)} ({os.path.getsize(SAIDA)} bytes): a = sangue, b = Os Amantes")


if __name__ == "__main__":
    main()
