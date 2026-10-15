#!/usr/bin/env python3
"""Lista, linha a linha, cada trecho de texto de um PDF com fonte, tamanho e cor.

Uso:  python3 -I estilos.py arquivo.pdf [--pagina N] [--bruto]

Saída (uma linha do PDF por linha):
  [p2 y182 x72] <P10>would be considered <PI10>“the blink of an eye”<P10>. Once he…
Abreviações: T = Times New Roman, TI = Times itálico, P = PT Serif, PI = PT Serif itálico,
RR = Road Rage, AR = Arial; o número é o tamanho em pt; a cor só aparece quando não é preto
nem o quase-preto #111012. Outras fontes aparecem com o nome completo.

--bruto imprime o texto na ordem do fluxo do PDF (preserva letras + acentos combinantes,
útil para texto "zalgo"), em vez de ordenado por posição.
"""
import sys, argparse, unicodedata
import pdfplumber

AB = {"ArialMT": "AR", "TimesNewRomanPSMT": "T", "TimesNewRomanPS-ItalicMT": "TI", "TimesNewRomanPS-BoldMT": "TB",
      "RoadRage-Regular": "RR", "PTSerif-Regular": "P", "PTSerif-Italic": "PI", "PTSerif-Bold": "PB"}
QUIET = {(0.0, 0.0, 0.0), (0.0667, 0.0588, 0.0745)}

def tag(c):
    name = c["fontname"].split("+")[-1]
    col = c.get("non_stroking_color")
    col = tuple(round(x, 4) for x in col) if isinstance(col, (list, tuple)) else col
    cs = "" if col in QUIET or col is None else "#" + "".join(f"{round(v*255):02x}" for v in col) if isinstance(col, tuple) and len(col) == 3 else ("" if col in QUIET else str(col))
    return f"{AB.get(name, name)}{round(c['size'], 1):g}{cs}"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("pdf"); ap.add_argument("--pagina", type=int); ap.add_argument("--bruto", action="store_true")
    a = ap.parse_args()
    pdf = pdfplumber.open(a.pdf)
    for pn, p in enumerate(pdf.pages, 1):
        if a.pagina and pn != a.pagina:
            continue
        print(f"=== PÁGINA {pn}  ({p.width:.0f}×{p.height:.0f} pt)")
        if a.bruto:
            print("".join(c["text"] for c in p.chars)); continue
        lines = {}
        for c in p.chars:
            lines.setdefault(round(c["top"] / 3), []).append(c)
        for k in sorted(lines):
            cs = sorted(lines[k], key=lambda c: c["x0"])
            if all(unicodedata.combining(c["text"]) or not c["text"].strip() for c in cs):
                continue   # linhas só de acentos soltos (zalgo transbordando) ou vazias
            out, cur = f"[p{pn} y{round(cs[0]['top'])} x{round(cs[0]['x0'])}] ", None
            for c in cs:
                t = tag(c)
                if t != cur:
                    out += f"<{t}>"; cur = t
                out += c["text"]
            print(out.rstrip())
        print("imagens:", [(round(i["x0"]), round(i["top"]), round(i["x1"]), round(i["bottom"])) for i in p.images])
        print("linhas:", [(round(l["x0"]), round(l["top"]), round(l["x1"])) for l in p.lines])

if __name__ == "__main__":
    main()
