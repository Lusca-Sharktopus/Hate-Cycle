#!/usr/bin/env python3
"""Extrai as imagens de um PDF já com a transparência (smask) aplicada.

Uso:  python3 -I imagens.py arquivo.pdf pasta-de-saida

Gera pasta-de-saida/img-NN.png (RGBA). Imagens sem máscara saem como RGB.
Depois compare com o que já existe em static/ antes de copiar (pode ser o mesmo arquivo).
"""
import sys, subprocess, tempfile, pathlib
from PIL import Image

def main():
    pdf, out = sys.argv[1], pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    lst = subprocess.run(["pdfimages", "-list", pdf], capture_output=True, text=True, check=True).stdout.splitlines()[2:]
    kinds = [l.split()[2] for l in lst]          # image | smask | mask
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-png", pdf, f"{tmp}/x"], check=True)
        files = sorted(pathlib.Path(tmp).glob("x-*.png"))
        n, i = 0, 0
        while i < len(files):
            im = Image.open(files[i])
            if i + 1 < len(files) and kinds[i + 1] in ("smask", "mask"):
                im = im.convert("RGB"); im.putalpha(Image.open(files[i + 1]).convert("L")); i += 2
            else:
                i += 1
            n += 1
            dest = out / f"img-{n:02d}.png"; im.save(dest)
            print(dest, im.size, im.mode)

if __name__ == "__main__":
    main()
