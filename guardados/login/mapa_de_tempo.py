# Mapa de tempo, versão 2: a "caneta" sai dos dois nós redondos (em cima à esquerda e embaixo à direita) ao mesmo tempo e anda pelos
# traços; para atravessar as falhinhas entre um traço e outro (e chegar aos enfeites), ela paga mais por pixel fora do traço.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize
from skimage.graph import MCP_Geometric

ORIG, SAIDA = sys.argv[1], sys.argv[2]
FORA = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
im = np.array(Image.open(ORIG).convert("RGBA")).astype(np.float32)
r, g, b, a = [im[..., i] for i in range(4)]
nucleo = (a > 200) & (r > 215) & (g > 215) & (b > 215)
esq = skeletonize(nucleo)
custo = np.where(esq, 1.0, FORA)
# os dois nós: o centro de cada um é o pixel de esqueleto mais perto do ponto medido no desenho
inicios = []
for (y, x) in [(148, 244), (409, 2027)]:
    ys, xs = np.nonzero(esq)
    j = int(np.argmin((ys - y) ** 2 + (xs - x) ** 2)); inicios.append((int(ys[j]), int(xs[j])))
mcp = MCP_Geometric(custo)
C, _ = mcp.find_costs(inicios)
T = np.where(esq, C, np.nan)
_, idx = ndimage.distance_transform_edt(~esq, return_indices=True)
Tall = T[idx[0], idx[1]]
Tall = Tall / np.nanmax(T)
Image.fromarray(np.clip(Tall * 65535, 0, 65535).astype(np.uint16)).save(SAIDA)
print("início", inicios, "máx", float(np.nanmax(T)))
