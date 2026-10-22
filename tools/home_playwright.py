#!/usr/bin/env python3
"""T17j no navegador: a home com no máximo 4 histórias (e a seta que é o link "Ver todas as histórias") e o degradê no fim do resumo
cortado da lista de Notícias. Pedidos do autor de 21/10/2026.

O que o roteiro prova (site Astro construído; o servidor é levantado pelo próprio script):
  Home, /pt/ e /en/, 1100 px (tela larga):
    1. no máximo 4 cartões, todos na mesma linha, sem rolagem; sem seta de rolar (nem a da esquerda);
    2. a seta da direita é um <a href> para Histórias que não cobre cartão nenhum; o rótulo fica escondido até o mouse passar por cima
       ou o foco chegar pelo teclado (Tab); o clique (e o Enter) leva direto a /<idioma>/works/.
  Home a 390 px (celular): os cartões rolam para o lado; o link fica abaixo, com o rótulo sempre à vista; rolar até o fim chega ao fim
    (o B31: o encaixe parava antes); a seta de rolar some no fim.
  Home sem JavaScript: o link existe e leva a Histórias.
  Home da prévia (--previa <pasta>, com rascunhos: 6 histórias): só 4 cartões.
  Notícias, /pt/news/ e /en/news/, 1100 e 390 px: todo resumo cortado tem o fim em degradê (cor transparente com gradiente recortado no
    texto) e o link começa com "…"; o texto continua inteiro no HTML (leitor de tela); buscar uma palavra que está no degradê acha a
    notícia; a barra de páginas troca de página; sem rolagem lateral.
  Capturas (--fotos <pasta>).

Como usar:
  pnpm build                                                   # dist/
  NODE_ENV=development HC_OUT_DIR=<pasta> pnpm build           # (opcional) a prévia, para --previa
  python3 tools/home_playwright.py [--dist dist] [--previa <pasta>] [--fotos <pasta fora do projeto>]
Sai com 0 se tudo passar, 1 se não.
"""
import argparse
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

FALHAS, PASSOS = [], []


def confere(ok, o_que, detalhe=""):
    PASSOS.append(o_que)
    if not ok:
        FALHAS.append(f"{o_que}{(' — ' + str(detalhe)) if detalhe != '' else ''}")


class Quieto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir(pasta):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quieto, directory=pasta))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def aba(browser, porta, largura, js=True):
    ctx = browser.new_context(viewport={"width": largura, "height": 900}, reduced_motion="reduce", java_script_enabled=js)
    pg = ctx.new_page()
    base = f"http://127.0.0.1:{porta}"
    pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
    pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    return ctx, pg, base


def foto(pg, pasta, nome, seletor):
    if not pasta:
        return
    os.makedirs(pasta, exist_ok=True)
    pg.evaluate("(s) => { const e = document.querySelector(s); if (e) window.scrollBy(0, e.getBoundingClientRect().top - 80); }", seletor)
    pg.wait_for_timeout(250)
    pg.screenshot(path=os.path.join(pasta, nome + ".png"))


ESTADO = """() => {
  const w = document.querySelector('.rail-home > .works'), l = document.querySelector('.rail-more');
  const cs = [...w.querySelectorAll('.work-card')].map(c => c.getBoundingClientRect());
  const lr = l.getBoundingClientRect(), rot = l.querySelector('.rail-label');
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  return { cartoes: cs.length, topos: [...new Set(cs.map(r => Math.round(r.top)))], direitaDoUltimo: Math.max(...cs.map(r => r.right)),
    link: { esquerda: lr.left, topo: lr.top, largura: lr.width, href: l.getAttribute('href'), rotuloVisivel: vis(rot), nome: l.getAttribute('aria-label') },
    fundoDosCartoes: Math.max(...cs.map(r => r.bottom)),
    rola: w.scrollWidth > w.clientWidth + 1, scrollLeft: w.scrollLeft, max: w.scrollWidth - w.clientWidth,
    setaEsquerda: vis(document.querySelector('.rail-rolar.rail-prev')), setaDireita: vis(document.querySelector('.rail-rolar.rail-next')),
    rolagemLateral: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
}"""


def home_larga(browser, porta, lang, fotos):
    et = f"home/{lang}/1100"
    ctx, pg, base = aba(browser, porta, 1100)
    pg.goto(f"{base}/{lang}/", wait_until="load")
    pg.wait_for_timeout(400)
    e = pg.evaluate(ESTADO)
    confere(1 <= e["cartoes"] <= 4, f"{et}: de 1 a 4 cartões", e["cartoes"])
    confere(len(e["topos"]) == 1, f"{et}: todos na mesma linha", e["topos"])
    confere(not e["rola"], f"{et}: sem rolagem nos cartões", (e["max"],))
    confere(not e["setaEsquerda"] and not e["setaDireita"], f"{et}: nenhuma seta de rolar", (e["setaEsquerda"], e["setaDireita"]))
    confere(e["link"]["href"] == f"/{lang}/works/", f"{et}: a seta leva a /{lang}/works/", e["link"]["href"])
    confere(e["link"]["esquerda"] > e["direitaDoUltimo"], f"{et}: a seta não cobre cartão nenhum", (e["link"]["esquerda"], e["direitaDoUltimo"]))
    confere(not e["link"]["rotuloVisivel"], f"{et}: o rótulo começa escondido")
    confere(bool(e["link"]["nome"]), f"{et}: o link tem nome para o leitor de tela", e["link"]["nome"])
    confere(not e["rolagemLateral"], f"{et}: sem rolagem lateral na página")
    foto(pg, fotos, f"home-{lang}-1100", ".rail-home")
    pg.hover(".rail-more")
    pg.wait_for_timeout(400)
    h = pg.evaluate(ESTADO)
    confere(h["link"]["rotuloVisivel"] and h["link"]["largura"] > 120, f"{et}: no mouse, o rótulo aparece", h["link"])
    foto(pg, fotos, f"home-{lang}-1100-mouse", ".rail-home")
    pg.mouse.move(5, 5)
    pg.wait_for_timeout(300)
    # teclado: Tab até o link
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    chegou = False
    for _ in range(80):
        pg.keyboard.press("Tab")
        if pg.evaluate("() => document.activeElement && document.activeElement.classList.contains('rail-more')"):
            chegou = True
            break
    confere(chegou, f"{et}: Tab chega à seta")
    if chegou:
        f = pg.evaluate("() => { const l = document.activeElement, c = getComputedStyle(l); return { foco: l.matches(':focus-visible'), contorno: c.outlineStyle, rotulo: getComputedStyle(l.querySelector('.rail-label')).display }; }")
        confere(f["foco"] and f["contorno"] == "solid" and f["rotulo"] != "none", f"{et}: no foco, contorno visível e o rótulo aparece", f)
        foto(pg, fotos, f"home-{lang}-1100-foco", ".rail-home")
        with pg.expect_navigation():
            pg.keyboard.press("Enter")
        confere(pg.url.endswith(f"/{lang}/works/"), f"{et}: Enter leva a Histórias", pg.url)
    pg.goto(f"{base}/{lang}/", wait_until="load")
    with pg.expect_navigation():
        pg.click(".rail-more")
    confere(pg.url.endswith(f"/{lang}/works/"), f"{et}: o clique leva direto a Histórias (sem rolar antes)", pg.url)
    ctx.close()


def home_celular(browser, porta, lang, fotos):
    et = f"home/{lang}/390"
    ctx, pg, base = aba(browser, porta, 390)
    pg.goto(f"{base}/{lang}/", wait_until="load")
    pg.wait_for_timeout(400)
    e = pg.evaluate(ESTADO)
    confere(1 <= e["cartoes"] <= 4, f"{et}: de 1 a 4 cartões", e["cartoes"])
    confere(e["link"]["rotuloVisivel"], f"{et}: o rótulo do link está sempre à vista (sem mouse no celular)")
    confere(e["link"]["topo"] >= e["fundoDosCartoes"], f"{et}: o link fica abaixo dos cartões", (e["link"]["topo"], e["fundoDosCartoes"]))
    confere(not e["rolagemLateral"], f"{et}: sem rolagem lateral na página")
    foto(pg, fotos, f"home-{lang}-390", ".rail-home")
    if e["rola"]:
        confere(e["setaDireita"], f"{et}: há seta de rolar para a direita no começo")
        # anda com a seta até o fim (o B31: antes, o encaixe parava ~47 px antes do fim)
        for _ in range(8):
            if not pg.evaluate(ESTADO)["setaDireita"]:
                break
            pg.click(".rail-rolar.rail-next")
            pg.wait_for_timeout(700)
        f = pg.evaluate(ESTADO)
        confere(f["scrollLeft"] >= f["max"] - 4, f"{et}: a rolagem chega ao fim", (f["scrollLeft"], f["max"]))
        confere(not f["setaDireita"] and f["setaEsquerda"], f"{et}: no fim, some a seta da direita e aparece a da esquerda", (f["setaDireita"], f["setaEsquerda"]))
        foto(pg, fotos, f"home-{lang}-390-fim", ".rail-home")
    with pg.expect_navigation():
        pg.click(".rail-more")
    confere(pg.url.endswith(f"/{lang}/works/"), f"{et}: o link leva a Histórias", pg.url)
    ctx.close()


def home_sem_js(browser, porta):
    ctx, pg, base = aba(browser, porta, 1100, js=False)
    pg.goto(f"{base}/pt/", wait_until="load")
    confere(pg.locator(".rail-more").count() == 1 and pg.locator(".rail-more").get_attribute("href") == "/pt/works/", "home/sem-js: o link existe")
    with pg.expect_navigation():
        pg.click(".rail-more")
    confere(pg.url.endswith("/pt/works/"), "home/sem-js: o link leva a Histórias", pg.url)
    ctx.close()


def home_previa(browser, porta, fotos):
    for largura in (1100, 390):
        ctx, pg, base = aba(browser, porta, largura)
        pg.goto(f"{base}/pt/", wait_until="load")
        pg.wait_for_timeout(400)
        e = pg.evaluate(ESTADO)
        confere(e["cartoes"] == 4, f"home/prévia/{largura}: exatamente 4 cartões (há 6 histórias na prévia)", e["cartoes"])
        if largura == 1100:
            confere(len(e["topos"]) == 1 and not e["rola"] and e["link"]["esquerda"] > e["direitaDoUltimo"], "home/prévia/1100: os 4 numa linha, sem rolar, a seta fora dos cartões", e)
        foto(pg, fotos, f"home-previa-pt-{largura}", ".rail-home")
        ctx.close()


def noticias(browser, porta, lang, largura, fotos):
    et = f"notícias/{lang}/{largura}"
    ctx, pg, base = aba(browser, porta, largura)
    pg.goto(f"{base}/{lang}/news/", wait_until="load")
    pg.wait_for_timeout(400)
    r = pg.evaluate(
        """() => [...document.querySelectorAll('.news-item:not([hidden]) .news-text p')].map(p => {
          const f = p.querySelector('.news-fade'), m = p.querySelector('.more');
          const c = f ? getComputedStyle(f) : null;
          return { corte: !!f, more: m.textContent, cor: c && c.color, fundo: c && c.backgroundImage, clip: c && (c.backgroundClip || c.webkitBackgroundClip),
                   texto: p.textContent, terminaComReticencias: !!f && /…\\s*$/.test(f.textContent) };
        })"""
    )
    cortados = [x for x in r if x["corte"]]
    confere(len(cortados) >= 3, f"{et}: há resumos cortados na primeira página", len(cortados))
    for x in cortados:
        confere(x["more"].startswith("…") and x["cor"] == "rgba(0, 0, 0, 0)" and "linear-gradient" in (x["fundo"] or "") and x["clip"] == "text" and not x["terminaComReticencias"], f"{et}: degradê no fim e \"…\" no link", x)
    for x in r:
        if not x["corte"]:
            confere(not x["more"].startswith("…"), f"{et}: resumo inteiro (do autor) sem \"…\" no link", x["more"])
    foto(pg, fotos, f"noticias-{lang}-{largura}", ".news-list")
    confere(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), f"{et}: sem rolagem lateral")
    # a busca acha uma palavra que está no degradê
    palavra = pg.evaluate("() => { const f = document.querySelector('.news-item:not([hidden]) .news-fade'); return f.textContent.trim().split(/\\s+/).pop().replace(/[^\\p{L}\\p{N}]/gu, ''); }")
    titulo = pg.evaluate("() => document.querySelector('.news-item:not([hidden]) .news-fade').closest('.news-item').querySelector('h2').textContent")
    pg.fill(".news-search", palavra)
    pg.wait_for_timeout(300)
    achados = pg.evaluate("() => [...document.querySelectorAll('.news-item:not([hidden]) h2')].map(h => h.textContent)")
    confere(titulo in achados, f"{et}: buscar \"{palavra}\" (no degradê) acha a notícia", achados[:3])
    pg.fill(".news-search", "")
    pg.wait_for_timeout(300)
    primeira = pg.evaluate("() => document.querySelector('.news-item:not([hidden]) h2').textContent")
    pg.click(".pagination a.pg-num >> text='2'")
    pg.wait_for_timeout(400)
    segunda = pg.evaluate("() => document.querySelector('.news-item:not([hidden]) h2').textContent")
    confere(primeira != segunda and pg.url.endswith("?p=2"), f"{et}: a página 2 da lista funciona", (primeira, segunda, pg.url))
    confere(pg.locator(".news-item:not([hidden]) .news-fade").count() >= 1, f"{et}: na página 2 também há degradê")
    ctx.close()


def principal():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", default="dist")
    ap.add_argument("--previa", default="")
    ap.add_argument("--fotos", default="")
    a = ap.parse_args()
    s = servir(os.path.abspath(a.dist))
    sp = servir(os.path.abspath(a.previa)) if a.previa else None
    with sync_playwright() as p:
        b = p.chromium.launch()
        try:
            for lang in ("pt", "en"):
                home_larga(b, s.server_address[1], lang, a.fotos)
                home_celular(b, s.server_address[1], lang, a.fotos)
                for largura in (1100, 390):
                    noticias(b, s.server_address[1], lang, largura, a.fotos)
            home_sem_js(b, s.server_address[1])
            if sp:
                home_previa(b, sp.server_address[1], a.fotos)
        finally:
            b.close()
    s.shutdown()
    if sp:
        sp.shutdown()
    print(f"{len(PASSOS)} conferências, {len(FALHAS)} falha(s)")
    for f in FALHAS:
        print("FALHOU:", f)
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(principal())
