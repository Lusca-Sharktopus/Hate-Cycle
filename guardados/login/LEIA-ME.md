# O círculo mágico dos botões de login (05/11/2026)

O desenho do autor é `circulo-login-original.png` (2272 × 558). O site usa duas imagens com a METADE desse tamanho, em `src/assets/login/`:

- `circulo.png`: o desenho reduzido (com o brilho);
- `tempo.png`: o "mapa de tempo" — em que momento (0 a 1) a caneta passa por cada pixel, em 16 bits (canal R = parte alta, G = parte baixa).

Como refazer o mapa (se o autor mudar o desenho), com Python + numpy, scipy, scikit-image e Pillow:

```bash
python3 guardados/login/mapa_de_tempo.py guardados/login/circulo-login-original.png /tmp/tempo16.png 6
```

O script acha o miolo branco dos traços, afina até virar um esqueleto de 1 pixel e calcula, a partir das duas bolinhas (em cima à
esquerda, perto de x 244 / y 148, e embaixo à direita, perto de x 2027 / y 409), quanto a caneta anda até cada ponto do esqueleto
(fora do traço ela "paga" 6 vezes mais por pixel, para atravessar as falhinhas e chegar aos enfeites). Cada pixel do desenho recebe o
tempo do ponto do esqueleto mais perto. Depois, reduza as duas imagens à metade (1136 × 279) e grave o tempo em R/G:

```python
import numpy as np; from PIL import Image
T = np.array(Image.open("/tmp/tempo16.png")).astype(np.float32) / 65535
m = np.array(Image.fromarray(T, mode="F").resize((1136, 279), Image.BILINEAR))
v = np.clip(m * 65535, 0, 65535).astype(np.uint32)
rg = np.zeros(m.shape + (3,), np.uint8); rg[..., 0] = v >> 8; rg[..., 1] = v & 255
Image.fromarray(rg).save("src/assets/login/tempo.png")
Image.open("guardados/login/circulo-login-original.png").resize((1136, 279), Image.LANCZOS).save("src/assets/login/circulo.png", optimize=True)
```

Se a moldura mudar de lugar no desenho, atualize `MOLDURA` em `src/scripts/login/circulo.ts` e os três números do CSS em
`src/components/EstiloDoLogin.astro`. A versão "saindo do canto" foi testada e recusada pelo autor (preferiu as bolinhas).
