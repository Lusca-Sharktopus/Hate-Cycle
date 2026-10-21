#!/usr/bin/env python3
"""Posts incorporados SÓ COM CLIQUE (T17g, B27), no navegador: o que o visitante e o servidor de terceiros "veem".

Sem internet no sandbox, os três serviços são FALSOS: o Playwright responde, em nome de embed.reddit.com, platform.twitter.com e
www.instagram.com, com uma página de mentira (o "widget falso") que (1) tenta, de dentro do quadro, ler e escrever o localStorage
da página, ler o documento do topo, o cookie e navegar o topo; (2) guarda o resultado em window.__sondagem; e
(3) manda a altura para a página no formato do serviço. Tudo o mais fora de localhost é bloqueado e registrado.

O que o roteiro prova, em notícias com Reddit, X, Instagram e com a alternância .embed-alt, em /pt/ e /en/, a 1100 e 390 px:
  1. ANTES do clique: nenhum pedido a reddit/x/twitter/instagram/tiktok (nem aos widgets.js/embed.js de sempre), nenhum <iframe> de
     terceiros, nenhum <script src> externo; o botão aparece; sem rolagem lateral na página.
  2. O clique carrega UM <iframe> com o sandbox combinado, sem srcdoc, da origem do serviço; o pedido vai SÓ ao serviço daquele post.
  3. O quadro cresce quando o widget falso manda a altura certa; mensagens de outra janela (outro iframe, a própria página) são ignoradas.
  4. De dentro do widget falso: ler/escrever o localStorage da página, ler o documento do topo e o cookie dão SecurityError; navegar o
     topo não funciona; a página continua no mesmo endereço e o localStorage dela intacto.
  5. .embed-alt: nada carrega até o clique; trocar de painel não carrega nada; cada post carrega só quando clicado.
  6. Sem JavaScript: o blockquote e o link para o original aparecem; o botão não.
  7. Teclado: Tab chega ao botão, o foco é visível (contorno de 3 px) e Enter carrega; contraste do botão ≥ 4,5:1.
  8. Capturas (--fotos <pasta>): antes e depois do clique.

Como usar (o servidor do dist/ é levantado pelo próprio script, em uma thread, na porta livre que o sistema der):
  pnpm build
  python3 tools/embeds_playwright.py [--dist dist] [--fotos <pasta fora do projeto>]

Sai com código 0 se tudo passar, 1 se houver qualquer falha (e imprime qual). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import functools
import http.server
import json
import os
import re
import sys
import threading
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

# ───────────────────────── o que existe no site e quais são os "serviços" falsos ─────────────────────────

NOTICIAS = {
    "reddit": "2024-02-23-avialuna-aeternogyrinians",
    "x": "2024-04-29-hygranocianos",
    "alt": "2023-08-19-conheca-os-talassimbiontes",  # Reddit | Instagram
    "alt-x": "2024-01-09-white-mans-wendigo",  # X | Instagram
}
HOSTS_DO_QUADRO = {"reddit": "embed.reddit.com", "x": "platform.twitter.com", "instagram": "www.instagram.com"}
ALTURA_FALSA = {"reddit": 833, "x": 431, "instagram": 917}  # de propósito diferentes das alturas padrão do site (740, 560, 720)
ROTULOS = {"pt": {"reddit": "Mostrar post do Reddit", "x": "Mostrar post do X", "instagram": "Mostrar post do Instagram"}, "en": {"reddit": "Show Reddit post", "x": "Show X post", "instagram": "Show Instagram post"}}

# Qualquer pedido a um destes é "terceiro de rede social". Antes do clique não pode haver NENHUM.
TERCEIROS = re.compile(r"(^|\.)(reddit\.com|redd\.it|redditstatic\.com|redditmedia\.com|twitter\.com|x\.com|twimg\.com|instagram\.com|cdninstagram\.com|fbcdn\.net|facebook\.com|tiktok\.com|tiktokcdn\.com)$")
SCRIPTS_PROIBIDOS = re.compile(r"/(widgets|embed)\.js(\?|$)")

PAGINA_DO_WIDGET = """<!doctype html><html><head><meta charset="utf-8"><title>widget falso</title></head>
<body style="margin:0;background:#fff;color:#111;font:16px sans-serif">
<div style="box-sizing:border-box;height:__ALTURA__px;border:3px solid #7a3;background:#efe;padding:16px">
<b>WIDGET FALSO __SERVICO__</b><br>(a página de incorporação de mentira do Playwright)</div>
<script>
const S = {};
const t = (nome, f) => { try { S[nome] = f(); } catch (e) { S[nome] = 'ERRO:' + e.name; } };
t('origem', () => location.origin);
t('lerLocalStorageDaPagina', () => String(parent.localStorage.getItem('sb-sessao-falsa')));
t('escreverLocalStorageDaPagina', () => { parent.localStorage.setItem('invadido', '1'); return 'escreveu'; });
t('lerDocumentoDoTopo', () => top.document.title);
t('lerCookieDaPagina', () => parent.document.cookie);
t('proprioLocalStorage', () => { localStorage.setItem('meu', '1'); return localStorage.getItem('meu'); });
t('navegarOTopo', () => { top.location.href = 'https://evil.test/'; return 'tentou'; });
window.__sondagem = S;
const servico = '__SERVICO__';
const H = __ALTURA__;
let msg;
if (servico === 'reddit') msg = JSON.stringify({ type: 'resize.embed', data: H });
else if (servico === 'x') msg = { 'twttr.embed': { method: 'twttr.private.resize', params: [{ width: 550, height: H }], id: new URLSearchParams(location.search).get('embedId') } };
else msg = JSON.stringify({ type: 'MEASURE', details: { height: H } });
setTimeout(() => parent.postMessage(msg, '*'), 150);
</script></body></html>"""


def servico_do_host(host):
    return next((s for s, h in HOSTS_DO_QUADRO.items() if h == host), None)


# ───────────────────────── servidor do dist/ ─────────────────────────


class Quieto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir(pasta):
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quieto, directory=pasta))
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor


# ───────────────────────── resultado ─────────────────────────

FALHAS = []
PASSOS = []


def confere(ok, o_que, detalhe=""):
    PASSOS.append(o_que)
    if not ok:
        FALHAS.append(f"{o_que}{(' — ' + str(detalhe)) if detalhe != '' else ''}")


# ───────────────────────── um visitante ─────────────────────────


class Visitante:
    """Uma aba com os três serviços falsos, o registro de pedidos e de erros."""

    def __init__(self, browser, porta, largura, js=True, altura=900):
        self.porta = porta
        self.ctx = browser.new_context(viewport={"width": largura, "height": altura}, reduced_motion="reduce", java_script_enabled=js)
        self.pg = self.ctx.new_page()
        self.pedidos = []  # (url, resource_type)
        self.bloqueados = []
        self.erros = []
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("request", lambda r: self.pedidos.append((r.url, r.resource_type)))
        self.pg.route("**/*", self._rota)
        self.pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")

    def _rota(self, rota):
        u = urlparse(rota.request.url)
        if u.hostname in ("127.0.0.1", "localhost"):
            rota.continue_()
            return
        servico = servico_do_host(u.hostname)
        if servico and u.scheme == "https" and not SCRIPTS_PROIBIDOS.search(rota.request.url):
            corpo = PAGINA_DO_WIDGET.replace("__SERVICO__", servico).replace("__ALTURA__", str(ALTURA_FALSA[servico]))
            rota.fulfill(status=200, content_type="text/html; charset=utf-8", body=corpo)
            return
        self.bloqueados.append(rota.request.url)
        rota.abort()

    def abrir(self, caminho):
        self.pg.goto(f"http://127.0.0.1:{self.porta}{caminho}", wait_until="load")
        self.pg.wait_for_timeout(400)

    def pedidos_a_terceiros(self):
        return [u for u, _ in self.pedidos + [(b, "") for b in self.bloqueados] if TERCEIROS.search(urlparse(u).hostname or "")]

    def fechar(self):
        self.ctx.close()


def sem_rolagem_lateral(pg):
    return pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")


def contraste(rgb1, rgb2):
    def lum(rgb):
        c = [int(x) / 255 for x in re.findall(r"\d+", rgb)[:3]]
        c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    a, b = sorted([lum(rgb1), lum(rgb2)], reverse=True)
    return (a + 0.05) / (b + 0.05)


def foto(pg, pasta, nome, seletor=".embed"):
    if not pasta:
        return
    os.makedirs(pasta, exist_ok=True)
    alvo = pg.locator(seletor).first
    alvo.scroll_into_view_if_needed()
    pg.evaluate("(s) => { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); window.scrollBy(0, r.top - 90); } }", seletor)
    pg.wait_for_timeout(250)
    pg.screenshot(path=os.path.join(pasta, nome + ".png"))


# ───────────────────────── os roteiros ─────────────────────────


def roteiro_um_post(browser, porta, servico, lang, largura, fotos):
    """Uma notícia com um post (ou mais) de `servico`: antes do clique, o clique, a altura, o isolamento."""
    slug = NOTICIAS[servico]
    etiqueta = f"{servico}/{lang}/{largura}"
    v = Visitante(browser, porta, largura)
    v.abrir(f"/{lang}/news/{slug}/")
    pg = v.pg
    pg.evaluate("localStorage.setItem('sb-sessao-falsa', 'SEGREDO-DA-SESSAO')")
    endereco = pg.url

    # 1. antes do clique
    confere(v.pedidos_a_terceiros() == [], f"{etiqueta}: antes do clique, ZERO pedidos a reddit/x/twitter/instagram/tiktok", v.pedidos_a_terceiros()[:3])
    confere(not any(SCRIPTS_PROIBIDOS.search(u) for u, _ in v.pedidos), f"{etiqueta}: antes do clique, nenhum widgets.js/embed.js foi pedido")
    scripts_externos = pg.evaluate("Array.from(document.scripts).map(s => s.src).filter(s => s && new URL(s).origin !== location.origin)")
    confere(scripts_externos == [], f"{etiqueta}: nenhum <script src> de outro site na página", scripts_externos)
    confere(pg.locator("iframe").evaluate_all("els => els.filter(e => !/youtube|tiktok/.test(e.src)).length") == 0, f"{etiqueta}: antes do clique, nenhum <iframe> de post")
    rotulo = ROTULOS[lang][servico]
    botao = pg.locator(f".embed[data-embed-servico='{servico}'] button.embed-load").first
    confere(botao.is_visible() and botao.inner_text().strip() == rotulo, f"{etiqueta}: o botão '{rotulo}' aparece", botao.inner_text() if botao.count() else "sem botão")
    confere(pg.locator(f".embed[data-embed-servico='{servico}'] a.embed-origin").first.is_visible(), f"{etiqueta}: o link para o post original aparece")
    confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral antes do clique")
    foto(pg, fotos, f"{servico}-{lang}-{largura}-1-antes", f".embed[data-embed-servico='{servico}']")

    # 2. o clique
    antes = len(v.pedidos)
    botao.click()
    pg.wait_for_selector(f".embed[data-embed-servico='{servico}'] iframe", timeout=5000)
    pg.wait_for_function("(h) => document.querySelector('.embed iframe').style.height === h + 'px'", arg=ALTURA_FALSA[servico], timeout=5000)
    pg.wait_for_timeout(300)
    novos = [u for u, _ in v.pedidos[antes:] if TERCEIROS.search(urlparse(u).hostname or "")]  # (o Supabase dos comentários é outro assunto)
    hosts = sorted({urlparse(u).hostname for u in novos})
    confere(hosts == [HOSTS_DO_QUADRO[servico]], f"{etiqueta}: depois do clique o pedido vai só ao serviço do post ({HOSTS_DO_QUADRO[servico]})", hosts)
    confere(not any(SCRIPTS_PROIBIDOS.search(u) for u in novos), f"{etiqueta}: nenhum widgets.js/embed.js, nem depois do clique")
    f = pg.locator(f".embed[data-embed-servico='{servico}'] iframe").first
    attrs = f.evaluate("e => ({sandbox: e.getAttribute('sandbox'), srcdoc: e.hasAttribute('srcdoc'), src: e.src, title: e.title, altura: e.getBoundingClientRect().height})")
    confere(attrs["sandbox"] == "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox", f"{etiqueta}: sandbox do quadro", attrs["sandbox"])
    confere(not attrs["srcdoc"], f"{etiqueta}: o quadro não usa srcdoc")
    confere(urlparse(attrs["src"]).hostname == HOSTS_DO_QUADRO[servico] and urlparse(attrs["src"]).scheme == "https", f"{etiqueta}: o endereço do quadro é https do serviço", attrs["src"])
    confere(attrs["title"] != "", f"{etiqueta}: o quadro tem título", attrs["title"])
    confere(abs(attrs["altura"] - ALTURA_FALSA[servico]) < 1.5, f"{etiqueta}: o quadro cresceu para a altura que o widget mandou ({ALTURA_FALSA[servico]})", attrs["altura"])
    confere(pg.locator("iframe[src*='" + HOSTS_DO_QUADRO[servico] + "']").count() == 1, f"{etiqueta}: exatamente um quadro criado")
    confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral depois do clique")
    confere(pg.locator(f".embed[data-embed-servico='{servico}'] a.embed-origin").first.is_visible(), f"{etiqueta}: o link para o original continua visível depois do clique")

    # 3. o isolamento, visto de dentro do widget falso
    quadro = next((fr for fr in pg.frames if urlparse(fr.url).hostname == HOSTS_DO_QUADRO[servico]), None)
    confere(quadro is not None, f"{etiqueta}: o Playwright achou a janela do widget falso")
    if quadro is not None:
        s = quadro.evaluate("window.__sondagem")
        confere(s["origem"] == f"https://{HOSTS_DO_QUADRO[servico]}", f"{etiqueta}: o widget roda na origem DELE", s["origem"])
        for chave in ("lerLocalStorageDaPagina", "escreverLocalStorageDaPagina", "lerDocumentoDoTopo", "lerCookieDaPagina"):
            confere(str(s[chave]).startswith("ERRO:SecurityError"), f"{etiqueta}: widget × {chave} → SecurityError", s[chave])
        confere(s["proprioLocalStorage"] == "1", f"{etiqueta}: o widget usa o localStorage DELE normalmente (é a origem dele)", s["proprioLocalStorage"])
    pg.wait_for_timeout(300)
    confere(pg.url == endereco, f"{etiqueta}: o widget não conseguiu navegar a página (continua em {endereco})", pg.url)
    confere(pg.evaluate("localStorage.getItem('sb-sessao-falsa')") == "SEGREDO-DA-SESSAO" and pg.evaluate("localStorage.getItem('invadido')") is None, f"{etiqueta}: o localStorage da página está intacto")

    # 4. mensagens falsas de outra janela são ignoradas
    antes_h = pg.locator(f".embed[data-embed-servico='{servico}'] iframe").first.evaluate("e => e.style.height")
    pg.evaluate(
        """() => {
      const i = document.createElement('iframe'); i.setAttribute('sandbox', 'allow-scripts'); i.hidden = true;
      i.srcdoc = '<script>for (const m of [{type:"resize.embed",data:2999},JSON.stringify({type:"MEASURE",details:{height:2999}}),{"twttr.embed":{method:"twttr.private.resize",params:[{height:2999}]}}]) parent.postMessage(m, "*")<\\/script>';
      document.body.append(i);
      window.postMessage({type: 'resize.embed', data: 2999}, '*');
      window.postMessage(JSON.stringify({type: 'MEASURE', details: {height: 2999}}), '*');
    }"""
    )
    pg.wait_for_timeout(500)
    depois_h = pg.locator(f".embed[data-embed-servico='{servico}'] iframe").first.evaluate("e => e.style.height")
    confere(antes_h == depois_h, f"{etiqueta}: mensagens de outro iframe e da própria página não mudam a altura ({antes_h})", depois_h)
    foto(pg, fotos, f"{servico}-{lang}-{largura}-2-depois", f".embed[data-embed-servico='{servico}']")
    confere(v.erros == [], f"{etiqueta}: nenhum erro de JavaScript na página", v.erros[:2])
    v.fechar()


def roteiro_alternancia(browser, porta, slug, lang, largura, fotos, nome):
    etiqueta = f"{nome}/{lang}/{largura}"
    v = Visitante(browser, porta, largura)
    v.abrir(f"/{lang}/news/{slug}/")
    pg = v.pg
    confere(v.pedidos_a_terceiros() == [], f"{etiqueta}: antes de qualquer clique, ZERO pedidos a terceiros", v.pedidos_a_terceiros()[:3])
    botoes_de_troca = pg.locator(".embed-alt .embed-btn")
    n = botoes_de_troca.count()
    confere(n >= 2, f"{etiqueta}: a alternância tem {n} botões de troca")
    painel_ligado = lambda: pg.locator(".embed-alt .embed-panel.is-on").first.evaluate("e => Array.from(e.parentElement.children).indexOf(e)")
    confere(painel_ligado() == 0, f"{etiqueta}: o primeiro painel está ligado")
    foto(pg, fotos, f"{nome}-{lang}-{largura}-1-antes", ".embed-alt")
    # trocar de painel NÃO carrega nada
    for i in range(1, n):
        botoes_de_troca.nth(i).click()
        pg.wait_for_timeout(250)
        confere(painel_ligado() == i, f"{etiqueta}: o botão de troca {i + 1} liga o painel {i + 1}")
        confere(v.pedidos_a_terceiros() == [], f"{etiqueta}: trocar para o painel {i + 1} não pediu nada a terceiros", v.pedidos_a_terceiros()[:3])
        confere(pg.locator("iframe[sandbox]").count() == 0, f"{etiqueta}: trocar de painel não criou quadro")
        confere(pg.locator(".embed-alt .embed-panel.is-on button.embed-load").first.is_visible(), f"{etiqueta}: o painel {i + 1} mostra o botão 'Mostrar post'")
    botoes_de_troca.nth(0).click()
    pg.wait_for_timeout(200)
    # clicar no post do painel 1 carrega só ele
    servicos = pg.locator(".embed-alt .embed[data-embed-servico]").evaluate_all("els => els.map(e => e.dataset.embedServico)")
    pg.locator(".embed-alt .embed-panel.is-on button.embed-load").first.click()
    pg.wait_for_selector(".embed-alt iframe", timeout=5000)
    pg.wait_for_timeout(300)
    confere(pg.locator(".embed-alt iframe").count() == 1, f"{etiqueta}: clicar no post do painel 1 carrega só ele (1 quadro)")
    hosts = sorted({urlparse(u).hostname for u, _ in v.pedidos if TERCEIROS.search(urlparse(u).hostname or "")})
    confere(hosts == [HOSTS_DO_QUADRO[servicos[0]]], f"{etiqueta}: o único serviço pedido é o do post clicado ({servicos[0]})", hosts)
    foto(pg, fotos, f"{nome}-{lang}-{largura}-2-depois-do-1o", ".embed-alt")
    # trocar de painel de novo: o segundo continua sem carregar; clicar nele carrega
    botoes_de_troca.nth(1).click()
    pg.wait_for_timeout(250)
    confere(pg.locator(".embed-alt iframe").count() == 1, f"{etiqueta}: voltar à alternância não carregou o outro post sozinho")
    pg.locator(".embed-alt .embed-panel.is-on button.embed-load").first.click()
    pg.wait_for_function("document.querySelectorAll('.embed-alt iframe').length === 2", timeout=5000)
    pg.wait_for_timeout(300)
    hosts = sorted({urlparse(u).hostname for u, _ in v.pedidos if TERCEIROS.search(urlparse(u).hostname or "")})
    confere(hosts == sorted(HOSTS_DO_QUADRO[s] for s in servicos[:2]), f"{etiqueta}: depois do segundo clique, os dois serviços (e só eles) foram pedidos", hosts)
    foto(pg, fotos, f"{nome}-{lang}-{largura}-3-depois-dos-2", ".embed-alt")
    confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral")
    confere(v.erros == [], f"{etiqueta}: nenhum erro de JavaScript", v.erros[:2])
    v.fechar()


def roteiro_sem_javascript(browser, porta, fotos):
    for lang in ("pt", "en"):
        for servico in ("reddit", "x"):
            etiqueta = f"sem-js/{servico}/{lang}"
            v = Visitante(browser, porta, 1100, js=False)
            v.abrir(f"/{lang}/news/{NOTICIAS[servico]}/")
            pg = v.pg
            confere(pg.locator(f".embed[data-embed-servico='{servico}'] a.embed-origin").first.is_visible(), f"{etiqueta}: o link para o post original aparece")
            confere(not pg.locator(f".embed[data-embed-servico='{servico}'] button.embed-load").first.is_visible(), f"{etiqueta}: o botão NÃO aparece")
            confere(not pg.locator(f".embed[data-embed-servico='{servico}'] .embed-gate-aviso").first.is_visible(), f"{etiqueta}: o aviso do botão NÃO aparece")
            if servico == "reddit":
                confere(pg.locator(".embed[data-embed-servico='reddit'] blockquote a").first.is_visible(), f"{etiqueta}: o blockquote do post (texto e link) aparece")
                alt = pg.locator(".embed[data-embed-servico='reddit'] blockquote").first.evaluate("e => e.getBoundingClientRect().height")
                confere(alt < 200, f"{etiqueta}: o blockquote não ocupa os 500px do estilo inline do código do Reddit", alt)
            confere(v.pedidos_a_terceiros() == [], f"{etiqueta}: zero pedidos a terceiros")
            confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral")
            if servico == "reddit":
                foto(pg, fotos, f"sem-js-{servico}-{lang}-1100", f".embed[data-embed-servico='{servico}']")
            v.fechar()

def roteiro_teclado(browser, porta, fotos):
    for lang in ("pt", "en"):
        etiqueta = f"teclado/{lang}"
        v = Visitante(browser, porta, 1100)
        v.abrir(f"/{lang}/news/{NOTICIAS['x']}/")
        pg = v.pg
        # Tab até o botão
        alcancou = False
        for _ in range(80):
            pg.keyboard.press("Tab")
            if pg.evaluate("document.activeElement && document.activeElement.classList.contains('embed-load')"):
                alcancou = True
                break
        confere(alcancou, f"{etiqueta}: Tab chega ao botão 'Mostrar post'")
        if alcancou:
            est = pg.evaluate(
                """() => { const b = document.activeElement, c = getComputedStyle(b);
                  return {cor: c.color, fundo: c.backgroundColor, contorno: c.outlineStyle, largura: parseFloat(c.outlineWidth), nome: b.textContent.trim(), altura: b.getBoundingClientRect().height,
                          legivel: b.matches(':focus-visible')}; }"""
            )
            confere(est["legivel"] and est["contorno"] == "solid" and est["largura"] >= 3, f"{etiqueta}: foco visível no botão (contorno de 3 px)", est)
            razao = contraste(est["cor"], est["fundo"])
            confere(razao >= 4.5, f"{etiqueta}: contraste do botão {razao:.1f}:1 (≥ 4,5)", est)
            confere(est["altura"] >= 44, f"{etiqueta}: alvo de toque de 44 px ou mais", est["altura"])
            if lang == "pt":
                pg.evaluate("window.scrollBy(0, document.activeElement.getBoundingClientRect().top - 300)")
                pg.wait_for_timeout(150)
                if fotos:
                    pg.screenshot(path=os.path.join(fotos, "teclado-foco-pt-1100.png"))
            pg.keyboard.press("Enter")
            pg.wait_for_selector(".embed iframe", timeout=5000)
            pg.wait_for_function("document.querySelector('.embed')?.dataset.estado === 'carregado'", timeout=5000)
            pg.wait_for_timeout(200)
            oculto = pg.locator(".embed-status").first.evaluate("e => { const r = e.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; }")
            confere(oculto, f"{etiqueta}: depois de carregar, a linha de status sai da tela (continua para o leitor de tela)")
            confere(pg.evaluate("document.activeElement && document.activeElement.tagName") == "IFRAME", f"{etiqueta}: depois do Enter o foco vai para o post")
            confere(pg.locator("[role=status]").first.inner_text() in ("", "Carregando o post…", "Loading the post…", "Post carregado.", "Post loaded."), f"{etiqueta}: a linha de status fala o idioma certo")
        v.fechar()


def principal():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", default="dist", help="pasta do site Astro construído (padrão: dist)")
    ap.add_argument("--fotos", default="", help="pasta onde salvar as capturas (fora do projeto)")
    args = ap.parse_args()
    pasta = os.path.abspath(args.dist)
    if not os.path.isfile(os.path.join(pasta, "pt", "news", NOTICIAS["reddit"], "index.html")):
        print(f"não achei o site em {pasta}: rode `pnpm build` antes", file=sys.stderr)
        return 2
    servidor = servir(pasta)
    porta = servidor.server_address[1]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for lang in ("pt", "en"):
                for largura in (1100, 390):
                    for servico in ("reddit", "x"):
                        roteiro_um_post(browser, porta, servico, lang, largura, args.fotos)
                    roteiro_alternancia(browser, porta, NOTICIAS["alt"], lang, largura, args.fotos, "alt")
                roteiro_alternancia(browser, porta, NOTICIAS["alt-x"], lang, 1100, "", "alt-x")
            roteiro_sem_javascript(browser, porta, args.fotos)
            roteiro_teclado(browser, porta, args.fotos)
        finally:
            browser.close()
    servidor.shutdown()
    print(f"{len(PASSOS)} conferências, {len(FALHAS)} falha(s)")
    for f in FALHAS:
        print("FALHOU:", f)
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(principal())
