#!/usr/bin/env python3
"""Teste, no navegador, do que a T17d acrescentou (só no Astro, só na PRÉVIA): o leitor página a página da Beira de Estrada, a página
de jogo do Cat-Crow-Thing, o vídeo provisório de O Pêndulo e o bloco "estou lendo em ordem" com as três obras novas.

O que confere:
  1. leitor (1100 px): abre na página 1 (só ela visível), runa 1 brilhando (aria-current + brilho no CSS), seta da esquerda escondida
     (primeiro capítulo), a da direita para #p2; clicar numa runa, na seta, ← e → do teclado; o "voltar" e o "avançar" do navegador;
     link direto para #p5; o aviso para leitor de tela ("Página 5 de 8"); Tab nas runas com o nome "Página N de 8" e Enter;
     na 8ª página do 01 a seta leva à 1ª do 02; na 1ª do 02, à 8ª do 01; na 8ª do 02 (o capítulo mais recente) a seta some e → não faz
     nada; a página vizinha já baixada (loading="eager" e a imagem carregada); as fontes das runas (do próprio site) carregadas;
  1b. (T17l) o FUNDO: a caixa do leitor página a página é a folha de papel (não o roxo-noite do quadrinho), com o título verde, a logo
     sem inverter e o pager nas cores do papel; as runas legíveis no papel: a da página atual em petróleo (--teal) com brilho, contraste
     de pelo menos 3:1 contra a folha; as apagadas no verde dos títulos; as setas (botões verdes) com contraste;
  2. sem JavaScript: as 8 páginas uma embaixo da outra, sem setas nem runas;
  3. 390 e 320 px: nada de rolagem horizontal, a página cabe na largura, as 8 runas numa linha, as setas embaixo;
  4. Cat-Crow-Thing (pt e en): a janela 16:9 vazia com "Demo em breve", o botão com a logo À ESQUERDA do texto do autor, sem link (não é
     <a>, não pega foco no Tab) e "Link em breve" ao lado; nenhum <iframe> na página do jogo;
  5. O Pêndulo: o <iframe> do YouTube com o vídeo provisório (o sandbox não alcança o YouTube: o quadro aparece vazio/cinza);
  6. o bloco "em ordem" na prévia (regras da T17l): Pederneira → Beira de Estrada (a lista de capítulos); Beira ← Pederneira (cronológica)
     e ← Ossos do Ofício (lançamento; em português leva ao capítulo em inglês), sem ninguém depois (O Pêndulo e Cat-Crow-Thing, sem arte para
     a caixa, são pulados); O Pêndulo e Cat-Crow-Thing ← Beira; Cat-Crow-Thing "estou jogando em ordem"; o verbo de cada lado;
  7. com --astro (o site PUBLICADO): nenhuma das três obras existe (404 nos endereços, nada em Histórias nem na home).
Com --fotos <pasta>: grava as capturas (1100 e 390 px; 320 px do leitor) para OLHAR (ferramenta Read no PNG).

Como usar (servidores sob timeout; nunca pkill):
  NODE_ENV=development HC_OUT_DIR=<pasta fora do projeto> pnpm build      # a prévia com rascunhos
  timeout 600 python3 -m http.server 8792 -d <pasta> &
  pnpm build && timeout 600 python3 -m http.server 8791 -d dist &        # (opcional) o publicado
  python3 tools/folheador_playwright.py --previa 8792 [--astro 8791] [--fotos <pasta>]

Sai com código 0 se tudo passar, 1 se algo falhar (e imprime o quê). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import sys
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

FALHAS: list[str] = []


def conferir(ok: bool, texto: str) -> None:
    print(("  ok    " if ok else "  FALHA ") + texto)
    if not ok:
        FALHAS.append(texto)


ESTADO = """() => {
  const f = document.querySelector('[data-folheador]');
  const imgs = [...f.querySelectorAll('.comic > img')];
  const vis = imgs.map((img, i) => getComputedStyle(img).display !== 'none' ? i + 1 : 0).filter(Boolean);
  const runas = [...f.querySelectorAll('.fl-runa')];
  const atual = runas.map((r, i) => r.getAttribute('aria-current') === 'page' ? i + 1 : 0).filter(Boolean);
  const seta = (s) => { const a = f.querySelector('.fl-seta.' + s); return { href: a.getAttribute('href'), visivel: getComputedStyle(a).visibility !== 'hidden' && getComputedStyle(a).display !== 'none', rotulo: a.getAttribute('aria-label') }; };
  const brilho = runas.map(r => getComputedStyle(r).textShadow);
  return { vis, atual, prev: seta('prev'), next: seta('next'), hash: location.hash, path: location.pathname,
           aviso: f.querySelector('[data-fl-status]').textContent, brilhoAtual: brilho[atual[0] - 1], brilhoOutra: brilho[atual[0] % runas.length],
           opacAtual: getComputedStyle(runas[atual[0] - 1]).opacity, opacOutra: getComputedStyle(runas[atual[0] % runas.length]).opacity,
           loading: imgs.map(i => i.getAttribute('loading')), carregadas: imgs.map(i => i.complete && i.naturalWidth > 0),
           rolagem: document.documentElement.scrollWidth, largura: window.innerWidth };
}"""


def novo_contexto(browser, largura, altura=900, **kw):
    ctx = browser.new_context(viewport={"width": largura, "height": altura}, **kw)
    ctx.route("**/fonts.g*/**", lambda r: r.abort())
    ctx.route("**/*.supabase.co/**", lambda r: r.abort())
    ctx.route("**/*youtube*/**", lambda r: r.abort())
    ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    return ctx


def abrir(pg, porta, caminho, rolar=None):
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    if rolar:
        pg.locator(rolar).first.scroll_into_view_if_needed()
    pg.wait_for_timeout(250)


def foto(pg, pasta, nome, seletor=None):
    if not pasta:
        return
    caminho = str(Path(pasta) / nome)
    if seletor:
        pg.locator(seletor).first.screenshot(path=caminho)
    else:
        pg.screenshot(path=caminho, full_page=False)
    print(f"        foto: {caminho}")


def esperar(pg):
    pg.wait_for_timeout(200)


FUNDO = """() => {
  const caixa = document.querySelector('[data-folheador]').closest('.reader-box');
  const c = (e) => getComputedStyle(e);
  const rgb = (t) => (t.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contraste = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const folha = c(caixa).backgroundColor;
  const atual = caixa.querySelector('.fl-runa[aria-current="page"]'), outra = caixa.querySelector('.fl-runa:not([aria-current])');
  const titulo = caixa.querySelector('.chapter-title, h1'), logo = caixa.querySelector('.title-image');
  const seta = caixa.querySelector('.fl-seta.next');
  const mid = caixa.querySelector('.pager .mid');
  return { folha, imagemDeFundo: c(caixa).backgroundImage !== 'none', titulo: c(titulo).color, logo: logo ? c(logo).filter : null,
           runaAtual: c(atual).color, brilho: c(atual).textShadow, contrasteDaAtual: contraste(c(atual).color, folha),
           runaApagada: c(outra).color, opacApagada: +c(outra).opacity, contrasteDaApagada: contraste(c(outra).color, folha),
           seta: c(seta).backgroundColor, contrasteDaSeta: contraste(c(seta).backgroundColor, folha),
           mid: mid ? c(mid).color : null, contrasteDoMid: mid ? contraste(c(mid).color, folha) : null };
}"""


def leitor(browser, porta, lang, fotos):
    pt = lang == "pt"
    c1, c2 = f"/{lang}/works/roadside/01/", f"/{lang}/works/roadside/02/"
    print(f"\n== {lang}: leitor página a página (Beira de Estrada, porta {porta})")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, c1, "[data-folheador]")
    f = pg.evaluate(FUNDO)
    conferir(f["folha"] == "rgb(236, 236, 236)" and f["imagemDeFundo"], f"T17l: a caixa do leitor é a folha de papel ({f['folha']}, textura: {f['imagemDeFundo']}), não o roxo-noite rgb(39, 27, 57)")
    conferir(f["titulo"] == "rgb(19, 92, 72)" and f["logo"] in (None, "none"), f"T17l: título verde ({f['titulo']}) e logo sem inverter ({f['logo']})")
    conferir(f["runaAtual"] == "rgb(37, 115, 122)" and f["brilho"] != "none" and f["contrasteDaAtual"] >= 3, f"T17l: a runa atual em petróleo, com brilho, contraste {f['contrasteDaAtual']:.1f}:1 com a folha")
    conferir(f["runaApagada"] == "rgb(19, 92, 72)" and f["opacApagada"] < 0.6 and f["contrasteDaApagada"] >= 3, f"T17l: as runas apagadas no verde dos títulos (opacidade {f['opacApagada']}; a cor tem {f['contrasteDaApagada']:.1f}:1)")
    conferir(f["contrasteDaSeta"] >= 3, f"T17l: as setas (botões {f['seta']}) com contraste {f['contrasteDaSeta']:.1f}:1")
    conferir(f["mid"] is None or f["contrasteDoMid"] >= 3, f"T17l: o \"Todos os capítulos\" do pager legível ({f['mid']}, {f['contrasteDoMid'] and round(f['contrasteDoMid'], 1)}:1)")
    e = pg.evaluate(ESTADO)
    conferir(e["vis"] == [1] and e["atual"] == [1], f"abre na página 1, só ela visível, runa 1 brilhando ({e['vis']}, {e['atual']})")
    conferir(e["brilhoAtual"] != "none" and e["brilhoOutra"] == "none" and float(e["opacAtual"]) == 1 and float(e["opacOutra"]) < 0.6, f"a runa atual brilha (text-shadow), as outras apagadas (opacidade {e['opacOutra']})")
    conferir(not e["prev"]["visivel"] and e["prev"]["href"] is None, "primeiro capítulo, página 1: a seta da esquerda some")
    conferir(e["next"]["href"] == "#p2" and e["next"]["visivel"] and e["next"]["rotulo"] == ("Próxima página" if pt else "Next page"), "a seta da direita leva à página 2")
    pg.wait_for_timeout(400)
    e = pg.evaluate(ESTADO)
    conferir(e["loading"][:2] == ["eager", "eager"] and e["carregadas"][1], "a página 2 (escondida) já foi baixada")
    fontes = pg.evaluate("""async () => { await document.fonts.ready; return ['Noto Sans Runic','Noto Sans KR','Noto Sans Yi','Noto Sans Glagolitic','Noto Sans Symbols'].map(f => [f, document.fonts.check('24px "' + f + '"', 'ᚣ弓♐ꑭⰭ')]); }""")
    carregadas = [f for f, ok in fontes if ok]
    conferir(len(carregadas) >= 3, f"as fontes das runas (servidas pelo site) estão carregadas: {carregadas}")
    foto(pg, fotos, f"leitor-{lang}-1100-p1.png", ".reader-box")
    # runa 5
    pg.click(".fl-runa[href='#p5']")
    esperar(pg)
    e = pg.evaluate(ESTADO)
    conferir(e["hash"] == "#p5" and e["vis"] == [5] and e["atual"] == [5], f"clicar na 5ª runa: #p5, página 5, runa 5 ({e['hash']}, {e['vis']})")
    conferir(e["aviso"] == ("Página 5 de 8" if pt else "Page 5 of 8"), f"aviso para leitor de tela: {e['aviso']!r}")
    conferir(e["prev"]["href"] == "#p4" and e["next"]["href"] == "#p6" and e["prev"]["visivel"], "setas: 4 e 6")
    foto(pg, fotos, f"leitor-{lang}-1100-p5.png", "[data-folheador]")
    pg.click(".fl-seta.next")
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [6], "clicar na seta da direita: página 6")
    pg.keyboard.press("ArrowRight")
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [7], "→ no teclado: página 7")
    pg.keyboard.press("ArrowLeft")
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [6], "← no teclado: página 6")
    pg.go_back()
    esperar(pg)
    e = pg.evaluate(ESTADO)
    conferir(e["vis"] == [7] and e["hash"] == "#p7", f"voltar do navegador: página 7 ({e['hash']})")
    pg.go_back()
    pg.go_back()
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [5], "voltar mais duas: página 5")
    pg.go_back()
    esperar(pg)
    e = pg.evaluate(ESTADO)
    conferir(e["vis"] == [1] and e["hash"] == "", f"voltar até o endereço sem # : página 1 ({e['hash']!r})")
    pg.go_forward()
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [5], "avançar do navegador: página 5")
    # teclado nas runas
    pg.focus(".fl-runa[href='#p2']")
    pg.keyboard.press("Tab")
    nome = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    conferir(nome == ("Página 3 de 8" if pt else "Page 3 of 8"), f"Tab nas runas: o foco vai à próxima, com o nome {nome!r}")
    pg.keyboard.press("Enter")
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [3], "Enter na runa: página 3")
    foco = pg.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    conferir(foco != "none", f"o foco aparece na runa (outline {foco})")
    # 8ª página: para o capítulo 2
    pg.click(".fl-runa[href='#p8']")
    esperar(pg)
    e = pg.evaluate(ESTADO)
    conferir(e["next"]["href"] == f"/{lang}/works/roadside/02/#p1" and e["next"]["visivel"], f"8ª do 01: a seta leva à 1ª do 02 ({e['next']['href']})")
    pg.click(".fl-seta.next")
    pg.wait_for_load_state("load")
    pg.wait_for_timeout(300)
    e = pg.evaluate(ESTADO)
    conferir(e["path"] == c2 and e["vis"] == [1], f"clicar: capítulo 2, página 1 ({e['path']}{e['hash']})")
    conferir(e["prev"]["href"] == f"/{lang}/works/roadside/01/#p8" and e["prev"]["visivel"], "1ª do 02: a seta da esquerda leva à 8ª do 01")
    pg.goto(f"http://localhost:{porta}{c2}#p8", wait_until="load")
    pg.wait_for_timeout(300)
    e = pg.evaluate(ESTADO)
    conferir(e["vis"] == [8] and not e["next"]["visivel"] and e["next"]["href"] is None, "8ª do 02 (o capítulo mais recente): a seta da direita some")
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(300)
    conferir(pg.evaluate("location.pathname + location.hash") == f"{c2}#p8", "e → no teclado não faz nada")
    pg.keyboard.press("ArrowLeft")
    esperar(pg)
    conferir(pg.evaluate(ESTADO)["vis"] == [7], "← volta à 7")
    ctx.close()

    # link direto
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{porta}{c1}#p5", wait_until="load")
    pg.wait_for_timeout(300)
    e = pg.evaluate(ESTADO)
    conferir(e["vis"] == [5] and e["atual"] == [5] and e["aviso"] == "", "link direto para #p5: abre na página 5 (sem anunciar nada na chegada)")
    ids = pg.evaluate("[...document.querySelectorAll('[data-page]')].map(e => e.dataset.page)")
    conferir(ids == ["works/roadside/01"], f"ID dos comentários continua o de sempre: {ids}")
    ctx.close()

    # sem JavaScript
    ctx = novo_contexto(browser, 1100, java_script_enabled=False)
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{porta}{c1}#p5", wait_until="load")
    sem = pg.evaluate("""() => { const f = document.querySelector('[data-folheador]');
      return { vis: [...f.querySelectorAll('.comic > img')].filter(i => getComputedStyle(i).display !== 'none').length,
               setas: [...f.querySelectorAll('.fl-seta')].map(a => getComputedStyle(a).display), runas: getComputedStyle(f.querySelector('.fl-runas')).display,
               topos: [...f.querySelectorAll('.comic > img')].map(i => Math.round(i.getBoundingClientRect().top)) }; }""")
    conferir(sem["vis"] == 8 and sem["topos"] == sorted(sem["topos"]) and len(set(sem["topos"])) == 8, f"sem JavaScript: as 8 páginas, uma embaixo da outra ({sem['vis']})")
    conferir(sem["runas"] == "none" and set(sem["setas"]) == {"none"}, "sem JavaScript: sem setas nem runas")
    foto(pg, fotos, f"leitor-{lang}-1100-sem-js.png")
    ctx.close()

    # celular
    for largura in (390, 320):
        ctx = novo_contexto(browser, largura, 844)
        pg = ctx.new_page()
        abrir(pg, porta, c1 + "#p2", "[data-folheador]")
        e = pg.evaluate(ESTADO)
        medidas = pg.evaluate("""() => { const f = document.querySelector('[data-folheador]'); const img = f.querySelectorAll('.comic > img')[1].getBoundingClientRect();
          const runas = [...f.querySelectorAll('.fl-runa')].map(r => r.getBoundingClientRect()); const setas = [...f.querySelectorAll('.fl-seta')].map(a => a.getBoundingClientRect());
          return { img: [img.left, img.right, img.bottom], topos: [...new Set([...f.querySelectorAll('.fl-runa')].map(r => r.offsetTop))], menor: Math.min(...runas.map(r => r.width)), setasTopo: setas.map(s => Math.round(s.top)), dentro: runas.every(r => r.left >= 0 && r.right <= innerWidth) }; }""")
        fora = pg.evaluate("() => [...document.querySelectorAll('[data-folheador] *')].filter(x => x.getBoundingClientRect().right > innerWidth + 0.5 || x.getBoundingClientRect().left < -0.5).length")
        conferir(fora == 0, f"{largura} px: nada do leitor sai da tela")
        if e["rolagem"] > e["largura"]:
            # o pager dos capítulos ("Anterior · Todos os capítulos · Próximo") é o de sempre (o mesmo do Python e das notícias) e, em
            # português, a 320 px, passa da tela: bug antigo, registrado no backlog (B36); não é do leitor
            culpados = pg.evaluate("() => [...new Set([...document.querySelectorAll('body *')].filter(x => x.getBoundingClientRect().right > innerWidth + 0.5 && !x.closest('.runes')).map(x => x.closest('.pager') ? 'pager' : x.tagName + '.' + x.className))]")
            conferir(culpados == ["pager"], f"{largura} px: rolagem horizontal ({e['rolagem']} px) só por causa do pager de sempre: {culpados}")
            print(f"  aviso {largura} px: o pager dos capítulos passa da tela ({e['rolagem']} > {e['largura']}): bug antigo (B36), fora do leitor")
        else:
            conferir(True, f"{largura} px: sem rolagem horizontal ({e['rolagem']} ≤ {e['largura']})")
        conferir(medidas["img"][0] >= 0 and medidas["img"][1] <= largura, f"{largura} px: a página cabe na largura ({medidas['img'][:2]})")
        conferir(len(medidas["topos"]) == 1 and medidas["dentro"] and medidas["menor"] >= 24, f"{largura} px: as 8 runas numa linha, na tela, com ≥ 24 px cada (menor {medidas['menor']:.1f})")
        conferir(all(t > medidas["img"][2] for t in medidas["setasTopo"]), f"{largura} px: as setas embaixo da página")
        foto(pg, fotos, f"leitor-{lang}-{largura}.png")
        ctx.close()


def jogo(browser, porta, lang, fotos):
    pt = lang == "pt"
    print(f"\n== {lang}: Cat-Crow-Thing e O Pêndulo")
    for largura in (1100, 390):
        ctx = novo_contexto(browser, largura)
        pg = ctx.new_page()
        abrir(pg, porta, f"/{lang}/works/cat-crow-thing/01/", ".jogo")
        m = pg.evaluate("""() => { const t = document.querySelector('.jogo-tela').getBoundingClientRect(); const b = document.querySelector('.steam-btn');
          const logo = b.querySelector('img').getBoundingClientRect(); const texto = b.querySelector('span').getBoundingClientRect();
          return { razao: t.width / t.height, largura: t.width, tag: b.tagName, href: b.getAttribute('href'), texto: b.textContent, aviso: document.querySelector('.jogo-aviso').textContent,
                   breve: document.querySelector('.steam-breve') && getComputedStyle(document.querySelector('.steam-breve')).display !== 'none' ? document.querySelector('.steam-breve').textContent : null,
                   logoAntes: logo.right <= texto.left, logoTam: [logo.width, logo.height], logoCarregou: b.querySelector('img').naturalWidth > 0,
                   iframes: document.querySelectorAll('main iframe').length, rolagem: document.documentElement.scrollWidth, cursor: getComputedStyle(b).cursor,
                   titulo: document.querySelector('[data-story-order] .so-title').textContent }; }""")
        conferir(abs(m["razao"] - 16 / 9) < 0.02, f"{largura} px: janela da demo 16:9 ({m['razao']:.3f}, {m['largura']:.0f} px de largura)")
        conferir(m["aviso"] == ("Demo em breve" if pt else "Demo coming soon") and m["iframes"] == 0, "janela vazia com o aviso, nenhum <iframe>")
        conferir(m["tag"] == "SPAN" and m["href"] is None and m["texto"] == ("Adicione à Wishlist" if pt else "Wishlist on Steam"), f"botão do texto do autor, sem link ({m['texto']!r})")
        conferir(m["logoAntes"] and m["logoCarregou"] and m["logoTam"] == [32, 32], f"a logo da Steam à esquerda do texto, 32 × 32 ({m['logoTam']})")
        conferir(m["breve"] == ("Link em breve" if pt else "Link coming soon") and m["cursor"] != "pointer", "\"Link em breve\" ao lado e sem mãozinha")
        conferir(m["rolagem"] <= largura, f"{largura} px: sem rolagem horizontal")
        conferir(m["titulo"] == ("estou jogando em ordem" if pt else "I’m playing in"), f"bloco em ordem: {m['titulo']!r}")
        if largura == 1100:
            focaveis = pg.evaluate("""() => { const b = document.querySelector('.steam-btn'); return b.tabIndex; }""")
            conferir(focaveis < 0, "o botão sem link não pega foco no Tab")
        foto(pg, fotos, f"jogo-{lang}-{largura}.png", ".reader-box")
        ctx.close()
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, f"/{lang}/works/the-pendulum/01/", ".video-wrapper")
    src = pg.evaluate("document.querySelector('.video-wrapper iframe').src")
    conferir(src == "https://www.youtube.com/embed/J2j6xoIz0LE", f"O Pêndulo: o vídeo provisório ({src})")
    foto(pg, fotos, f"pendulo-{lang}-1100.png", ".reader-box")
    ctx.close()


LADOS = """() => { const b = document.querySelector('[data-story-order]'); const r = {};
  for (const o of ['chrono', 'release']) { const d = b.querySelector('.so-order[data-ordem="' + o + '"]');
    r[o] = ['prev', 'next'].map(s => { const a = d.querySelector('a.so-side.' + s); return a ? [a.getAttribute('href'), a.querySelector('.so-label').textContent.trim()] : null; }); }
  r.titulo = b.querySelector('.so-title').textContent; return r; }"""


def bloco(browser, porta, fotos):
    print("\n== bloco \"estou lendo em ordem\" com as obras novas (prévia, pt)")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    # T17l: obra de vários capítulos → a lista de capítulos; O Pêndulo e Cat-Crow-Thing (sem arte) pulados; Ossos em português → inglês
    casos = {
        "/pt/works/firestriker/01/": {"chrono": [["/pt/works/light-and-blood/", "Assistir Luz & Sangue"], ["/pt/works/roadside/", "Ler Beira de Estrada"]]},
        "/pt/works/roadside/01/": {"titulo": "estou lendo em ordem", "chrono": [["/pt/works/firestriker/01/", "Ler Pederneira"], None],
                                   "release": [["/en/works/all-in-a-nights-work/01/", "Ler Ossos do Ofício"], None]},
        "/pt/works/the-pendulum/01/": {"titulo": "estou assistindo em ordem", "chrono": [["/pt/works/roadside/", "Ler Beira de Estrada"], None],
                                       "release": [["/pt/works/roadside/", "Ler Beira de Estrada"], None]},
        "/pt/works/cat-crow-thing/01/": {"titulo": "estou jogando em ordem", "chrono": [["/pt/works/roadside/", "Ler Beira de Estrada"], None], "release": [["/pt/works/roadside/", "Ler Beira de Estrada"], None]},
    }
    for url, esperado in casos.items():
        abrir(pg, porta, url, "[data-story-order]")
        lados = pg.evaluate(LADOS)
        for chave, valor in esperado.items():
            conferir(lados[chave] == valor, f"{url} {chave}: {lados[chave]}")
    abrir(pg, porta, "/pt/works/roadside/01/", "[data-story-order]")
    fundo = pg.evaluate("getComputedStyle(document.querySelector('[data-story-order]')).backgroundColor")
    conferir(fundo != "rgb(39, 27, 57)", f"no capítulo de quadrinho o bloco continua papel (T17i), não roxo-noite ({fundo})")
    foto(pg, fotos, "ordem-beira-1100.png", "[data-story-order]")
    pg.hover("[data-story-order] .so-order:not([hidden]) a.so-side.prev")  # T17l: depois da Beira não vem ninguém (O Pêndulo e Cat-Crow-Thing, sem arte)
    pg.wait_for_timeout(800)
    foto(pg, fotos, "ordem-beira-1100-mouse.png", "[data-story-order]")
    ctx.close()
    ctx = novo_contexto(browser, 390)
    pg = ctx.new_page()
    abrir(pg, porta, "/pt/works/firestriker/01/", "[data-story-order]")
    foto(pg, fotos, "ordem-pederneira-390.png", "[data-story-order]")
    abrir(pg, porta, "/pt/works/the-pendulum/01/", "[data-story-order]")
    foto(pg, fotos, "ordem-pendulo-390.png", "[data-story-order]")
    ctx.close()


def publicado(browser, porta):
    print(f"\n== site publicado (porta {porta}): as três obras novas não existem")
    for url in ("/pt/works/roadside/", "/pt/works/roadside/01/", "/en/works/roadside/02/", "/pt/works/the-pendulum/01/", "/pt/works/cat-crow-thing/01/", "/en/works/cat-crow-thing/01/"):
        try:
            codigo = urllib.request.urlopen(f"http://localhost:{porta}{url}").status
        except urllib.error.HTTPError as erro:
            codigo = erro.code
        conferir(codigo == 404, f"{url}: {codigo}")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    for url in ("/pt/works/", "/en/works/", "/pt/", "/en/"):
        abrir(pg, porta, url)
        texto = pg.content()
        conferir(not any(x in texto for x in ("roadside", "the-pendulum", "cat-crow-thing", "Cat-Crow-Thing")), f"{url}: nenhuma das três")
    ctx.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--previa", type=int, required=True, help="porta do servidor com a PRÉVIA do Astro (NODE_ENV=development pnpm build)")
    ap.add_argument("--astro", type=int, help="porta do servidor com o site PUBLICADO (dist/)")
    ap.add_argument("--fotos", help="pasta onde gravar as capturas (fora do projeto)")
    a = ap.parse_args()
    if a.fotos:
        Path(a.fotos).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in ("pt", "en"):
            leitor(browser, a.previa, lang, a.fotos)
            jogo(browser, a.previa, lang, a.fotos)
        bloco(browser, a.previa, a.fotos)
        if a.astro:
            publicado(browser, a.astro)
        browser.close()
    print(f"\n{'TUDO CERTO' if not FALHAS else str(len(FALHAS)) + ' FALHA(S)'}")
    for f in FALHAS:
        print("  - " + f)
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(main())
