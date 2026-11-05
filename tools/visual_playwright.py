#!/usr/bin/env python3
"""T18 — Capturas das páginas-chave, Astro × Python, COM AS MESMAS FONTES dos dois lados, comparadas pixel a pixel.

Uso (a ferramenta sobe os próprios servidores; rode sob `timeout`):
  timeout 1800 python3 tools/visual_playwright.py --python <site Python publicado> --astro <site Astro publicado> --saida <pasta fora do projeto>
      [--paginas /pt/ /en/about/ ...] [--sem-fontes-reais]

Por que "as mesmas fontes": o sandbox não alcança o Google Fonts, então o site Python sempre sai com as fontes de reserva; o
Astro (desde a T17) serve as fontes do próprio site. Para comparar o resto (layout, cores, imagens), o Astro também é
fotografado com os arquivos de fonte BLOQUEADOS (*.woff2 → erro): os dois caem nas mesmas fontes de reserva. Depois, uma
terceira captura do Astro com as fontes REAIS, para o autor ver como fica.
Em cada página e largura (1100 e 390 px), salva em --saida:
  <nome>-<largura>-python.png, -astro.png (sem fontes), -dif.png (diferença ampliada), -lado-a-lado.png e -astro-fontes.png;
  resumo.json com a altura das duas páginas, a fração de pixels diferentes (> 24/255 em algum canal) e o maior bloco 64×64 com
  diferença média alta (imagem WebP × PNG original nunca é idêntica ao pixel: procura-se diferença pequena e espalhada, sem
  pulo de layout e sem imagem faltando).
Igual nos dois: tela de abertura pulada, animações e transições desligadas, imagens preguiçosas carregadas (rola até o fim),
páginas cortadas em 9000 px (como a baseline), nada sai para a internet (posts incorporados e YouTube ficam vazios nos dois), e a
caixa de comentários recebe a mesma resposta (lista vazia) de um Supabase falso, com a mesma versão do supabase-js nos dois.
O bloco "estou lendo em ordem…" (T17c, só no Astro) é escondido (display: none) nas capturas comparadas — sem ele, o Astro
tem de ficar igual ao Python —, e aparece nas capturas com fontes reais.
"""
import argparse, io, json, os, sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comportamento_playwright import servidor  # noqa: E402  (o mesmo servidor, que imita o GitHub Pages)

RAIZ = Path(__file__).resolve().parent.parent
UMD = RAIZ / "node_modules" / "@supabase" / "supabase-js" / "dist" / "umd" / "supabase.js"
PAGINAS = [
    ("home", "/{l}/"), ("historias", "/{l}/works/"), ("obra-luz-e-sangue", "/{l}/works/light-and-blood/"),
    ("pederneira-01", "/{l}/works/firestriker/01/"), ("luz-e-sangue-02", "/{l}/works/light-and-blood/02/"),
    ("noticias", "/{l}/news/"), ("noticia-comum", "/{l}/news/2024-06-14-lucas-viciado-em-cafeina/"),
    ("noticia-colagem", "/{l}/news/2024-06-13-primeiro-video-hdvr/"), ("noticia-fundo", "/{l}/news/2025-04-18-saiu-pederneira/"),
    ("sobre", "/{l}/about/"), ("apoio", "/{l}/support/"), ("404", "/404.html"),
]
ALTURA_MAX = 22000   # a baseline corta em 9000; aqui vai até o fim (o capítulo mais longo tem ~20000 px no celular)
CSS_IGUAL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
SEM_BLOCO_DE_ORDEM = "[data-story-order]{display:none!important}"
# posição e tamanho de cada elemento do <body> (fora scripts, estilos e o bloco de ordem do Astro), como em tools/layout_playwright.py
JS_LAYOUT = """() => [...document.querySelectorAll('body *')].filter(e => !['SCRIPT','STYLE','NOSCRIPT','LINK','TEMPLATE'].includes(e.tagName) && !e.closest('[data-story-order]')).map(e => {
  const r = e.getBoundingClientRect();
  return [e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''), r.x, r.y + scrollY, r.width, r.height];
})"""
TOLERANCIA = 0.75   # px, a mesma de tools/layout_playwright.py


def rotas(ctx, base, bloquear_fontes):
    def rota(r):
        u = r.request.url
        if u.startswith("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"):
            return r.fulfill(status=200, content_type="application/javascript", body=UMD.read_bytes())
        if "/rest/v1/" in u:   # Supabase: a lista de comentários (e de perfis) vem vazia, nos dois
            return r.fulfill(status=200, content_type="application/json", body="[]", headers={"access-control-allow-origin": "*"})
        if not u.startswith(base) and not u.startswith("data:") and not u.startswith("blob:"):
            return r.abort()
        if bloquear_fontes and u.split("?")[0].endswith((".woff2", ".woff")):
            return r.abort()
        return r.continue_()
    ctx.route("**/*", rota)


def capturar(br, base, caminho, largura, bloquear_fontes, esconder_ordem, layout=None):
    ctx = br.new_context(viewport={"width": largura, "height": 900}, reduced_motion="reduce", locale="pt-BR")
    ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    rotas(ctx, base, bloquear_fontes)
    pg = ctx.new_page()
    pg.set_default_timeout(60000)
    r = pg.goto(base + caminho, wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    pg.add_style_tag(content=CSS_IGUAL + (SEM_BLOCO_DE_ORDEM if esconder_ordem else ""))
    pg.evaluate("""async (max) => { const h = () => document.documentElement.scrollHeight;
        for (let y = 0; y < Math.min(h(), max); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
        window.scrollTo(0, 0); }""", ALTURA_MAX)
    try:
        pg.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(700)
    altura = pg.evaluate("document.documentElement.scrollHeight")
    if layout is not None:
        layout.extend(pg.evaluate(JS_LAYOUT))
        if layout_so:
            ctx.close()
            return None, altura, r.status, []
    png = pg.screenshot(full_page=True, clip={"x": 0, "y": 0, "width": largura, "height": min(altura, ALTURA_MAX)})
    fontes = pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i)")
    ctx.close()
    return Image.open(io.BytesIO(png)).convert("RGB"), altura, r.status, fontes


layout_so = False


def comparar_layout(la, lb):
    if len(la) != len(lb):
        return {"elementos": [len(la), len(lb)], "iguais": False}
    maior, fora = 0.0, []
    for x, y in zip(la, lb):
        d = max(abs(u - v) for u, v in zip(x[1:], y[1:]))
        maior = max(maior, d)
        if x[0] != y[0] or d > TOLERANCIA:
            fora.append(f"{x[0][:60]}: {[round(v, 1) for v in x[1:]]} × {[round(v, 1) for v in y[1:]]}")
    return {"elementos": len(la), "maior_diferenca_px": round(maior, 3), "acima_da_tolerancia": len(fora), "exemplos": fora[:5]}


def comparar(a, b):
    h, w = min(a.height, b.height), min(a.width, b.width)
    pa, pb = np.asarray(a.crop((0, 0, w, h)), dtype=np.int16), np.asarray(b.crop((0, 0, w, h)), dtype=np.int16)
    d = np.abs(pa - pb).max(axis=2)
    # alturas diferentes: o que vem depois do ponto em que a página "cresceu" é comparado alinhando pelo FIM
    fim = None
    if a.height != b.height:
        qa, qb = np.asarray(a.crop((0, a.height - h, w, a.height)), dtype=np.int16), np.asarray(b.crop((0, b.height - h, w, b.height)), dtype=np.int16)
        df = np.abs(qa - qb).max(axis=2) > 24
        linhas = np.nonzero(df.any(axis=1))[0]
        fim = {"linhas_diferentes_alinhando_pelo_fim": int(len(linhas)), "ultima_linha_diferente_contando_do_fim": int(h - linhas.max()) if len(linhas) else None}
    hh, ww = (h // 64) * 64, (w // 64) * 64
    blocos = d[:hh, :ww].reshape(hh // 64, 64, ww // 64, 64).mean(axis=(1, 3)) if hh and ww else np.zeros((1, 1))
    ys, xs = np.nonzero(d > 24)
    caixa = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None
    pior = np.unravel_index(int(blocos.argmax()), blocos.shape)
    linhas = np.nonzero((d > 24).any(axis=1))[0]
    return d, {"primeira_linha_diferente": int(linhas.min()) if len(linhas) else None, "alinhado_pelo_fim": fim, "pixels_dif_pct": round(float((d > 24).mean()) * 100, 4), "identicas": bool((d == 0).all()) and a.size == b.size,
               "maior_bloco_media": round(float(blocos.max()), 1), "maior_bloco_em": [int(pior[1]) * 64, int(pior[0]) * 64], "caixa_da_diferenca": caixa}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", required=True)
    ap.add_argument("--astro", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--paginas", nargs="*", help="endereços (padrão: as páginas-chave, nos dois idiomas)")
    ap.add_argument("--sem-fontes-reais", action="store_true", help="não tira a 3ª captura (Astro com as fontes de verdade)")
    ap.add_argument("--so-layout", action="store_true", help="só compara a posição dos elementos (sem capturas; rápido)")
    a = ap.parse_args()
    global layout_so
    layout_so = a.so_layout
    saida = Path(a.saida).resolve()
    if saida == RAIZ or RAIZ in saida.parents:
        sys.exit("--saida tem de ficar FORA do projeto")
    saida.mkdir(parents=True, exist_ok=True)
    alvos = []
    if a.paginas:
        alvos = [(c.strip("/").replace("/", "_").replace(".html", "") or "raiz", c) for c in a.paginas]
    else:
        for nome, modelo in PAGINAS:
            for l in (["pt", "en"] if "{l}" in modelo else [None]):
                alvos.append((f"{nome}-{l}" if l else nome, modelo.format(l=l) if l else modelo))
    sp, sa = servidor(os.path.abspath(a.python), 8841), servidor(os.path.abspath(a.astro), 8842)
    bp, ba = "http://127.0.0.1:8841", "http://127.0.0.1:8842"
    resumo = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        for largura in (1100, 390):
            for nome, caminho in alvos:
                lp, la = [], []
                ip, hp, stp, fp = capturar(br, bp, caminho, largura, True, False, lp)
                ia, ha, sta, fa = capturar(br, ba, caminho, largura, True, True, la)
                if a.so_layout:
                    linha = {"pagina": caminho, "largura": largura, "altura": [hp, ha], "layout": comparar_layout(lp, la)}
                    resumo.append(linha)
                    print(json.dumps(linha, ensure_ascii=False), flush=True)
                    continue
                d, cmp = comparar(ip, ia)
                cmp["layout"] = comparar_layout(lp, la)
                base = saida / f"{nome}-{largura}"
                ip.save(f"{base}-python.png")
                ia.save(f"{base}-astro.png")
                Image.fromarray(np.clip(d * 6, 0, 255).astype("uint8")).save(f"{base}-dif.png")
                lado = Image.new("RGB", (ip.width + ia.width + 20, max(ip.height, ia.height)), "white")
                lado.paste(ip, (0, 0))
                lado.paste(ia, (ip.width + 20, 0))
                lado.save(f"{base}-lado-a-lado.png")
                linha = {"pagina": caminho, "nome": nome, "largura": largura, "status": [stp, sta], "altura": [hp, ha], **cmp,
                         "fontes_carregadas": {"python": fp, "astro_bloqueado": fa}}
                if not a.sem_fontes_reais:
                    ir, hr, _, fr = capturar(br, ba, caminho, largura, False, False)
                    ir.save(f"{base}-astro-fontes.png")
                    linha["fontes_carregadas"]["astro_real"] = fr
                    linha["altura_astro_com_fontes"] = hr
                resumo.append(linha)
                print(json.dumps({k: v for k, v in linha.items() if k != "fontes_carregadas"}, ensure_ascii=False), flush=True)
        br.close()
    sp.shutdown()
    sa.shutdown()
    (saida / "resumo.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
