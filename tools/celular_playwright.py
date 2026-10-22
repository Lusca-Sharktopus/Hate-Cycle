#!/usr/bin/env python3
"""T17k — Correções pequenas do celular (B22, B32, B36), provadas no navegador, nos DOIS sites (Python e Astro).

O que confere (cada item nos dois sites, a menos que a página só exista num deles):
  1. NADA ROLA PARA O LADO (scrollWidth <= clientWidth) a 320, 360 e 390 px nas páginas que tinham o problema:
       - capítulos da Beira de Estrada em português e inglês (B36: a barra "Todos os capítulos · Próximo" passava da tela a 320 px);
       - a notícia de título longo (B22: "importantes/interessantes" empurrava a página; o título agora quebra a palavra);
       - Ossos do Ofício em inglês (a carta que vira, de 300 px, passava da tela a 320 px);
       - as notícias com posts alternados e o 404.
     Só as páginas que o site tem (a Beira e Ossos só existem na PRÉVIA; no site publicado a página é pulada).
  2. PAGER (B36): a 320 px a barra cabe e o botão do meio fica numa linha só, inteiro; de 390 px para cima nada mudou — a posição
     dos três pedaços é a de sempre (conferida com os números de antes da T17k) — e, com os DOIS vizinhos (caso que ainda não existe no
     conteúdo, simulado trocando o HTML da barra), também cabe a 320, 360 e 390 px.
  3. MENU DE IDIOMA (B32): a 320, 390 e 700 px o menu aberto do seletor de idioma fica INTEIRO dentro da tela, no 404 e nas outras
     páginas (home, notícias, capítulo); a 701 e a 1100 px continua alinhado à direita do botão, como sempre; fechar tira o ajuste.
  4. POSTS ALTERNADOS a 320 px: os três botões (Instagram, TikTok, YouTube) ficam inteiros dentro da caixa.
  5. NOTÍCIAS (B22): a busca por "hate", "Hate", "HATE", "cycle" acha os títulos com Hᴀᴛᴇ Cʏᴄʟᴇ (e continua achando "Hᴀᴛᴇ" e sem acento);
     `?p=2x`, `abc`, `-2`, `0`, vazio = página 1; `?p=2` = página 2.
Com --fotos <pasta fora do projeto>: grava capturas (o 404 com o menu aberto a 390 e 320 px, o pager a 320, 390 e 1100 px).

Como usar (servidores sob timeout; nunca pkill):
  python3 -c "import build as b; from pathlib import Path; b.BASE=''; b.DRAFTS=True; b.OUT=Path('<pasta py>'); b.build()"
  NODE_ENV=development HC_OUT_DIR=<pasta astro> pnpm build
  timeout 900 python3 -m http.server 8791 -d <pasta py> &
  timeout 900 python3 -m http.server 8792 -d <pasta astro> &
  python3 tools/celular_playwright.py --python 8791 --astro 8792 [--fotos <pasta>]

Sai com 0 se tudo passar, 1 se algo falhar (e diz o quê). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

FALHAS: list[str] = []
PASSOS = 0

NOTICIA_LONGA = {"pt": "/pt/news/2025-07-24-guia-produtos-arcanos-atualizado/", "en": "/en/news/2025-07-24-guia-produtos-arcanos-atualizado/"}
PAGINAS_DE_ROLAGEM = [
    "/pt/works/roadside/01/", "/pt/works/roadside/02/", "/en/works/roadside/01/", "/en/works/roadside/02/",
    NOTICIA_LONGA["pt"], NOTICIA_LONGA["en"],
    "/en/works/all-in-a-nights-work/01/",
    "/en/news/2023-08-19-conheca-os-talassimbiontes/", "/pt/news/2023-08-19-conheca-os-talassimbiontes/",
    "/en/news/2024-02-23-avialuna-aeternogyrinians/", "/pt/news/2025-07-24-guia-produtos-arcanos-atualizado/",
    "/pt/", "/en/", "/pt/news/", "/en/news/", "/pt/works/", "/404.html",
]
# Onde ficava cada pedaço do pager ANTES da T17k, a 390 e a 1100 px (lado, esquerda, direita), medido nos dois sites (T17k, 22/10/2026).
PAGER_DE_SEMPRE = {
    (390, "/pt/works/roadside/01/"): [["mid", 46, 216], ["pg next", 234, 362]],
    (390, "/en/works/roadside/01/"): [["mid", 72, 193], ["pg next", 237, 362]],
    (390, "/pt/works/roadside/02/"): [["pg prev", 28, 155], ["mid", 173, 344]],
    (1100, "/pt/works/roadside/01/"): [["mid", 401, 571], ["pg next", 890, 1018]],
    (1100, "/en/works/roadside/01/"): [["mid", 427, 548], ["pg next", 893, 1018]],
    (1100, "/pt/works/roadside/02/"): [["pg prev", 82, 209], ["mid", 528, 699]],
}


def confere(ok: bool, texto: str) -> None:
    global PASSOS
    PASSOS += 1
    if not ok:
        FALHAS.append(texto)
        print("  FALHA " + texto)


def existe(porta: int, caminho: str) -> bool:
    try:
        return urllib.request.urlopen(f"http://localhost:{porta}{caminho}", timeout=10).status == 200
    except (urllib.error.URLError, OSError):
        return False


def novo(browser, largura, altura=800):
    ctx = browser.new_context(viewport={"width": largura, "height": altura})
    for padrao in ("**/fonts.g*/**", "**/*.supabase.co/**", "**/*youtube*/**", "**/*instagram*/**", "**/*twitter*/**", "**/*redditmedia*/**", "**/*tiktok*/**"):
        ctx.route(padrao, lambda r: r.abort())
    ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    return ctx


def abrir(pg, porta, caminho):
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    pg.wait_for_timeout(300)


def foto(pg, pasta, nome, seletor=None):
    if not pasta:
        return
    alvo = pg.locator(seletor).last if seletor else None
    if alvo:
        alvo.scroll_into_view_if_needed()
        pg.wait_for_timeout(150)
    pg.screenshot(path=f"{pasta}/{nome}.png")


# 1. rolagem lateral ---------------------------------------------------------------------------------------------------------------
def rolagem(browser, lado, porta):
    for largura in (320, 360, 390):
        ctx = novo(browser, largura)
        pg = ctx.new_page()
        for caminho in PAGINAS_DE_ROLAGEM:
            if not existe(porta, caminho):
                continue
            abrir(pg, porta, caminho)
            sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            confere(sw <= cw, f"{lado} {largura}px {caminho}: a página rola para o lado ({sw} > {cw})")
        ctx.close()


# 2. pager -------------------------------------------------------------------------------------------------------------------------
LER_PAGER = """() => { const n = document.querySelector('.pager'); if (!n) return null;
  return [...n.children].filter(c => c.getBoundingClientRect().width > 0).map(c => { const r = c.getBoundingClientRect(); return [c.className, Math.round(r.left), Math.round(r.right)]; }); }"""
# a barra com os DOIS vizinhos, com os textos mais compridos (o caso que o conteúdo de hoje ainda não tem)
TROCAR_POR_DOIS_VIZINHOS = """(lang) => {
  const [ant, prox, meio] = lang === 'pt' ? ['Anterior', 'Próximo', 'Todos os capítulos'] : ['Previous', 'Next', 'All chapters'];
  const svg = document.querySelector('.pg-btn').innerHTML;
  const html = `<nav class="pager" aria-label="Chapters"><a class="pg prev" href="#"><span class="pg-btn">${svg}</span><span class="pg-txt">${ant}<small>Capítulo 1: a estrada longa</small></span></a><a class="mid" href="#">${meio}</a><a class="pg next" href="#"><span class="pg-txt">${prox}<small>Capítulo 3: o fim da linha</small></span><span class="pg-btn">${svg}</span></a></nav>`;
  document.querySelectorAll('.pager').forEach(n => { n.outerHTML = html; }); }"""


def pager(browser, lado, porta, fotos):
    for largura in (320, 360, 390, 1100):
        ctx = novo(browser, largura)
        pg = ctx.new_page()
        for caminho in ("/pt/works/roadside/01/", "/en/works/roadside/01/", "/pt/works/roadside/02/", "/pt/news/2025-10-14-henrique-not-having-it/"):
            if not existe(porta, caminho):
                continue
            abrir(pg, porta, caminho)
            pedacos = pg.evaluate(LER_PAGER)
            confere(pedacos is not None, f"{lado} {largura}px {caminho}: sem barra .pager")
            if not pedacos:
                continue
            for classe, esq, dir_ in pedacos:
                confere(esq >= 0 and dir_ <= largura, f"{lado} {largura}px {caminho}: o pedaço '{classe}' ({esq}–{dir_}) sai da tela")
            if largura == 320:
                meio = [p for p in pedacos if p[0] == "mid"]
                confere(len(meio) == 1, f"{lado} 320px {caminho}: devia ter o botão do meio")
                if meio:
                    caixa = pg.evaluate("(() => { const m = document.querySelector('.pager .mid'); const r = m.getBoundingClientRect(); return [m.scrollWidth <= m.clientWidth, Math.round(r.height)]; })()")
                    confere(caixa[0] and caixa[1] < 50, f"{lado} 320px {caminho}: o botão do meio devia ficar numa linha só, inteiro ({caixa})")
            esperado = PAGER_DE_SEMPRE.get((largura, caminho))
            if esperado and lado == "Astro":   # o Python usa fontes do Google (bloqueadas no sandbox): só o Astro, que serve as fontes, tem medida fixa
                confere(pedacos == esperado, f"{lado} {largura}px {caminho}: a barra mudou de lugar (antes {esperado}, agora {pedacos})")
            if fotos and caminho in ("/pt/works/roadside/01/", "/pt/news/2025-10-14-henrique-not-having-it/"):
                foto(pg, fotos, f"pager-{lado}-{largura}-{caminho.strip('/').replace('/', '_')}", ".pager")
        # os dois vizinhos (só o que cabe: troca o HTML da barra de um capítulo)
        for lang in ("pt", "en"):
            caminho = f"/{lang}/works/roadside/02/"
            if not existe(porta, caminho):
                continue
            abrir(pg, porta, caminho)
            pg.evaluate(TROCAR_POR_DOIS_VIZINHOS, lang)
            pg.wait_for_timeout(150)
            sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            confere(sw <= cw, f"{lado} {largura}px {caminho} com os DOIS vizinhos: a página rola para o lado ({sw} > {cw})")
            for classe, esq, dir_ in pg.evaluate(LER_PAGER):
                confere(esq >= 0 and dir_ <= largura, f"{lado} {largura}px {caminho} com os DOIS vizinhos: '{classe}' ({esq}–{dir_}) sai da tela")
            if fotos and largura in (320, 390):
                foto(pg, fotos, f"pager-dois-vizinhos-{lado}-{lang}-{largura}", ".pager")
        ctx.close()


# 3. menu de idioma ----------------------------------------------------------------------------------------------------------------
ABRIR_MENU = """() => { const d = document.querySelector('details.lang-dd'); d.open = true; return new Promise(ok => setTimeout(() => {
  const m = d.querySelector('.dd-menu').getBoundingClientRect(), s = d.querySelector('summary').getBoundingClientRect();
  ok({ esq: Math.round(m.left), dir: Math.round(m.right), botaoDir: Math.round(s.right), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, virou: d.classList.contains('dd-flip') }); }, 120)); }"""


def menu(browser, lado, porta, fotos):
    for largura in (320, 390, 700, 701, 1100):
        ctx = novo(browser, largura, 700)
        pg = ctx.new_page()
        for caminho in ("/404.html", "/pt/", "/en/news/", "/pt/works/roadside/01/"):
            if not existe(porta, caminho):
                continue
            abrir(pg, porta, caminho)
            r = pg.evaluate(ABRIR_MENU)
            confere(r["esq"] >= 0 and r["dir"] <= r["vw"], f"{lado} {largura}px {caminho}: o menu de idioma aberto sai da tela ({r['esq']}–{r['dir']} de {r['vw']})")
            confere(r["sw"] <= r["vw"], f"{lado} {largura}px {caminho}: o menu aberto faz a página rolar para o lado")
            if largura >= 701:
                confere(r["dir"] == r["botaoDir"] and not r["virou"], f"{lado} {largura}px {caminho}: no computador o menu devia continuar alinhado à direita do botão ({r})")
            if fotos and caminho == "/404.html" and largura in (320, 390):
                foto(pg, fotos, f"menu-404-{lado}-{largura}")
            pg.evaluate("document.querySelector('details.lang-dd').open = false")
            pg.wait_for_timeout(100)
            confere(not pg.evaluate("document.querySelector('details.lang-dd').classList.contains('dd-flip')"), f"{lado} {largura}px {caminho}: fechar o menu devia tirar o ajuste (.dd-flip)")
        ctx.close()


# 4. posts alternados a 320 px ------------------------------------------------------------------------------------------------------
def posts(browser, lado, porta):
    ctx = novo(browser, 320)
    pg = ctx.new_page()
    for caminho in ("/en/news/2023-08-19-conheca-os-talassimbiontes/", "/pt/news/2025-04-14-speedpaint-pederneira/", "/en/news/2025-04-14-speedpaint-pederneira/"):
        if not existe(porta, caminho):
            continue
        abrir(pg, porta, caminho)
        r = pg.evaluate("""() => { const caixa = document.querySelector('.embed-alt .embed-switch'); if (!caixa) return null; const c = caixa.getBoundingClientRect();
          return [...caixa.querySelectorAll('.embed-btn')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), b.scrollWidth <= b.clientWidth]; }).concat([[Math.round(c.left), Math.round(c.right), true]]); }""")
        confere(r is not None, f"{lado} 320px {caminho}: sem .embed-switch")
        for esq, dir_, inteiro in r or []:
            confere(esq >= 0 and dir_ <= 320 and inteiro, f"{lado} 320px {caminho}: botão dos posts fora da tela ou cortado ({esq}–{dir_})")
    ctx.close()


# 5. notícias: busca e ?p= ---------------------------------------------------------------------------------------------------------
def noticias(browser, lado, porta):
    ctx = novo(browser, 1100)
    pg = ctx.new_page()
    for lang in ("en", "pt"):
        caminho = f"/{lang}/news/"
        abrir(pg, porta, caminho)

        def achados(q):
            pg.fill(".news-search", q)
            pg.wait_for_timeout(120)
            return pg.evaluate("[document.querySelectorAll('.news-item:not([hidden])').length, !document.querySelector('.news-none').hidden]")

        versalete = achados("Hᴀᴛᴇ")[0]
        confere(versalete > 0, f"{lado} {caminho}: a busca 'Hᴀᴛᴇ' devia achar títulos")
        for q in ("hate", "Hate", "HATE", "cycle", "CYCLE", "hate cycle", "  hate   cycle "):
            n, nenhuma = achados(q)
            confere(n >= versalete and not nenhuma, f"{lado} {caminho}: a busca {q!r} devia achar os títulos com Hᴀᴛᴇ Cʏᴄʟᴇ ({n} × {versalete})")
        confere(achados("hate zzzz")[1], f"{lado} {caminho}: 'hate zzzz' devia dar 'nenhuma notícia'")
        n_normal = achados("residencia")[0], achados("RESIDÊNCIA")[0]
        confere(n_normal[0] == n_normal[1], f"{lado} {caminho}: sem acento e com acento devem achar o mesmo ({n_normal})")
        for pedido, pagina in (("?p=2", "2"), ("?p=2x", "1"), ("?p=abc", "1"), ("?p=-2", "1"), ("?p=0", "1"), ("?p=", "1"), ("?p=2.5", "1"), ("?p=99", "último")):
            abrir(pg, porta, caminho + pedido)
            atual = pg.evaluate("document.querySelector('.pagination [aria-current]').textContent")
            ultimo = pg.evaluate("[...document.querySelectorAll('.pagination .pg-num, .pagination [aria-current]')].map(e => e.textContent).pop()")
            confere(atual == (ultimo if pagina == "último" else pagina), f"{lado} {caminho}{pedido}: devia mostrar a página {pagina} (mostrou {atual})")
    ctx.close()


def principal() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", type=int, default=8791, help="porta do site gerado pelo Python (prévia com rascunhos, de preferência)")
    ap.add_argument("--astro", type=int, default=8792, help="porta do site Astro (prévia com rascunhos, de preferência)")
    ap.add_argument("--fotos", default="", help="pasta onde salvar as capturas (fora do projeto)")
    a = ap.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for lado, porta in (("Python", a.python), ("Astro", a.astro)):
                if not existe(porta, "/404.html"):
                    print(f"{lado}: nada respondendo em localhost:{porta}", file=sys.stderr)
                    return 2
                print(f"{lado} (porta {porta})…")
                rolagem(browser, lado, porta)
                pager(browser, lado, porta, a.fotos)
                menu(browser, lado, porta, a.fotos)
                posts(browser, lado, porta)
                noticias(browser, lado, porta)
        finally:
            browser.close()
    print(f"{PASSOS} conferências, {len(FALHAS)} falha(s)")
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(principal())
