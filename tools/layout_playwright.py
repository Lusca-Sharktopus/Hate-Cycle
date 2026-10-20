#!/usr/bin/env python3
"""Compara DOIS sites gerados (A e B) no navegador: layout de cada elemento e pixels da página inteira (T17).

Uso (rode sob `timeout`; a ferramenta sobe os dois servidores):
  # A = o site sem versões leves; B = o site com elas (mesmas fontes, mesmo código):
  HC_IMAGENS=originais HC_OUT_DIR=/tmp/ctrl pnpm build         # A
  pnpm build                                                   # B (dist/)
  timeout 900 python3 tools/layout_playwright.py --a /tmp/ctrl --b dist --saida <pasta fora do projeto> [--paginas /pt/ ...]

Para cada página e largura (1100 e 390 px):
  - layout: a posição e o tamanho de TODOS os elementos do <body> nos dois sites; lista os que diferem mais que TOLERANCIA (0,75 px);
  - pixels: captura da página inteira dos dois, e a diferença entre elas (fração de pixels que diferem mais de 24/255 em algum canal,
    e o maior bloco de 64x64 px com diferença média alta). Imagem WebP × PNG original nunca é idêntica ao pixel; o que se procura é
    nitidez/cor equivalentes (diferença pequena e espalhada), nenhum pulo de layout e nenhuma imagem faltando.
Salva as capturas e um mapa de diferença em --saida.
"""
import argparse, io, json, os, sys
from PIL import Image, ImageChops
import numpy as np
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peso_playwright as pp

PAGINAS = ["/pt/", "/pt/works/", "/pt/works/light-and-blood/", "/pt/about/", "/en/works/all-in-a-nights-work/01/", "/pt/works/firestriker/01/",
           "/pt/news/", "/pt/news/2024-06-13-primeiro-video-hdvr/", "/pt/news/2025-04-18-saiu-pederneira/"]

# O Chrome calcula a altura de uma imagem pela proporção ou pelas medidas naturais com arredondamentos de 1/64 px diferentes:
# diferenças de até ~0,1 px não são mudança de layout. Acima de TOLERANCIA (px) o elemento é listado.
TOLERANCIA = 0.75

JS_LAYOUT = """() => [...document.querySelectorAll('body *')].filter(e => !['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName)).map((e, i) => {
  const r = e.getBoundingClientRect();
  return [i, e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''),
          r.x, r.y + scrollY, r.width, r.height];
})"""


def abrir(browser, base, caminho, largura, dpr):
    ctx = browser.new_context(viewport={"width": largura, "height": 900}, device_scale_factor=dpr)
    pg = ctx.new_page()
    pg.set_default_timeout(90000)
    pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    pg.route(lambda u: not u.startswith(base) and not u.startswith("data:"), lambda r: r.abort())
    pg.goto(base + caminho, wait_until="load")
    altura = pg.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < altura:  # rola para as imagens preguiçosas carregarem
        y += 400
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(100)
        altura = pg.evaluate("document.documentElement.scrollHeight")
    pg.evaluate("window.scrollTo(0,0)")
    pg.add_style_tag(content="*{animation:none!important;transition:none!important} .runes{display:none!important}")
    pg.wait_for_load_state("networkidle")
    pg.wait_for_timeout(1500)
    return ctx, pg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True); ap.add_argument("--b", required=True); ap.add_argument("--saida", required=True)
    ap.add_argument("--paginas", nargs="*", default=PAGINAS)
    ap.add_argument("--dpr", type=float, default=1)
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    sa = pp.servidor(os.path.abspath(a.a), 8811); sb = pp.servidor(os.path.abspath(a.b), 8812)
    resumo = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        for largura in (1100, 390):
            for caminho in a.paginas:
                dados = {}
                for nome, porta in (("A", 8811), ("B", 8812)):
                    ctx, pg = abrir(br, f"http://127.0.0.1:{porta}", caminho, largura, a.dpr)
                    dados[nome] = (pg.evaluate(JS_LAYOUT), Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert("RGB"))
                    ctx.close()
                (la, ia), (lb, ib) = dados["A"], dados["B"]
                difs = []
                maior = 0.0
                if len(la) != len(lb):
                    difs.append(f"quantidade de elementos: {len(la)} × {len(lb)}")
                else:
                    for x, y in zip(la, lb):
                        delta = max(abs(u - v) for u, v in zip(x[2:], y[2:]))
                        maior = max(maior, delta)
                        if x[1] != y[1] or delta > TOLERANCIA:
                            difs.append(f"#{x[0]} {x[1][:50]}: A={x[2:]} B={y[2:]}")
                h = min(ia.height, ib.height)
                pa, pb = np.asarray(ia.crop((0, 0, ia.width, h)), dtype=int), np.asarray(ib.crop((0, 0, ib.width, h)), dtype=int)
                d = np.abs(pa - pb).max(axis=2)
                frac = float((d > 24).mean())
                # maior bloco 64x64 com diferença média
                hh, ww = (d.shape[0] // 64) * 64, (d.shape[1] // 64) * 64
                blocos = d[:hh, :ww].reshape(hh // 64, 64, ww // 64, 64).mean(axis=(1, 3)) if hh and ww else np.zeros((1, 1))
                tag = caminho.strip("/").replace("/", "_") or "home"
                ia.save(f"{a.saida}/{tag}-{largura}-A.png"); ib.save(f"{a.saida}/{tag}-{largura}-B.png")
                Image.fromarray(np.clip(d * 6, 0, 255).astype("uint8")).save(f"{a.saida}/{tag}-{largura}-dif.png")
                linha = {"pagina": caminho, "largura": largura, "altura": [ia.height, ib.height], "maior_diferenca_de_layout_px": round(maior, 3), "elementos_com_layout_diferente": len(difs),
                         "pixels_com_dif>24": round(frac * 100, 3), "maior_bloco_dif_media": round(float(blocos.max()), 1), "exemplos": difs[:6]}
                resumo.append(linha)
                print(json.dumps(linha, ensure_ascii=False), flush=True)
        br.close()
    sa.shutdown(); sb.shutdown()
    json.dump(resumo, open(f"{a.saida}/resumo.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
