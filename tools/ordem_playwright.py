#!/usr/bin/env python3
"""Teste, no navegador, do bloco "estou lendo em ordem…" (T17c) no fim dos capítulos do site Astro.

O que confere (em /pt/ e /en/, 1100 px e 390 px):
  1. sem nada guardado: abre na Cronológica, a lista de Lançamento está escondida, o seletor funciona;
  2. trocar no seletor mostra a outra lista, troca o nome e GUARDA a escolha (localStorage, chave hc-ordem-de-leitura);
     recarregar e abrir OUTRO capítulo já abre na ordem escolhida;
  3. pelo teclado (Tab até o seletor, setas) a troca também acontece;
  4. sem JavaScript: o bloco aparece, na Cronológica, e o seletor fica desligado (as duas listas estão no HTML);
  5. localStorage que dá erro (janela privada): o bloco funciona do mesmo jeito, só não lembra;
  6. arte em CAMADAS (T17h) com o mouse por cima, medida nas camadas de verdade (getComputedStyle):
       Luz & Sangue: os três crescem, o Oliver e o John giram para lados opostos e se afastam da Ellie;
       Pederneira: a Olivia e o Harry crescem, o Harry gira e se move, o Thymorr vai de 0 a 100% de opacidade e do centro para a direita;
       Alô? Residência dos Di Vario: Lucas e Wellersson crescem e se afastam um do outro;
     o mesmo vale com o foco do teclado (:focus-visible); uma transição só, igual para todas as camadas (mesma duração e curva);
     com "reduzir movimento" nada anima: a arte que só se mexe fica parada (Luz & Sangue, Alô?) e a que tem algo surgindo troca de uma
     vez para o desenho final (Pederneira: Olivia e Harry no lugar do mouse e o Thymorr à direita) (T17i);
  7. no celular (390 px) a página não ganha rolagem horizontal e a arte em camadas cabe na coluna;
  8. nada de "Em breve" (T17h): em nenhuma ordem, nem na prévia; com --previa (desde a T17d a Beira de Estrada tem capítulos provisórios,
     então ela vem depois da Pederneira na Cronológica e a arte dela, item 13, é medida na própria prévia; o --beira ficou opcional). Antes:
     Beira de Estrada e O Pêndulo (rascunhos sem capítulo)
     são puladas, e a Pederneira não tem história depois dela na Cronológica;
  9. (T17l, era T17i) o link de cada lado: a PÁGINA DA OBRA (lista de capítulos) quando ela tem mais de um capítulo naquele idioma, o
     capítulo quando tem um só (o externo continua externo, em outra aba); obra que só tem capítulo em outro idioma (era Ossos do Ofício em
     português até a T17n) leva à página daquele idioma, com hreflang; em todo capítulo E em toda página de obra (o bloco também mora lá, T17l);
 10. (T17i) a CAIXA DO MESMO TAMANHO: em TODO capítulo e página de obra do site (e da prévia), a 1100, 390 e 320 px, getBoundingClientRect
     da caixa na Cronológica, no Lançamento e com o mouse em cada lado: largura e altura iguais; as molduras das artes, iguais entre si e
     entre as obras; (T17o) a caixa da página da obra é a mesma dos capítulos (do mesmo tamanho, em toda página do site);
 11. (T17i) o rótulo "Ler/Assistir/Jogar [obra]" numa linha só, dentro da caixa e sem encostar no outro rótulo, em todo capítulo e largura;
 12. (T17i, com --previa) Ossos do Ofício: asas atrás, Giuseppe, olhos na frente; as três crescem juntas, asas e olhos de 0 a 1 de
     opacidade, os olhos colados no Giuseppe (mesmo canto, mesma escala) no começo, no fim e no MEIO da transição; teclado; movimento
     reduzido (troca de uma vez para o desenho final); celular;
 13. (T17i, com --beira) Beira de Estrada: Jean atrás, Cezar e Iris na frente, os olhos da Iris por cima com EXATAMENTE a posição, o
     tamanho e o giro de Cezar e Iris (começo, meio e fim); crescem, inclinam e se afastam; os olhos de 0 a 1; teclado; movimento reduzido.
     A Beira de Estrada ainda não tem capítulo (é pulada no bloco), então ela só aparece numa CÓPIA do projeto com um capítulo inventado
     (receita abaixo; nunca no projeto).
 14. (T17l, com --previa) as ASAS do Giuseppe (`"bleed": true`): com o mouse (e com o foco do teclado) saem da moldura da arte, ficam POR
     TRÁS da frase de cima (ordem de pintura medida com elementsFromPoint) e são cortadas pela caixa (overflow hidden, canto arredondado);
     não pegam clique: o seletor de ordem e a outra história continuam sendo o que está embaixo do ponteiro (elementFromPoint); a 390 px a
     moldura volta a cortar; O Pêndulo e Cat-Crow-Thing (sem arte para a caixa) não aparecem em bloco nenhum; o bloco da página da obra.
 15. (T17m, com --previa) a CABEÇA dos personagens de toda arte do mesmo tamanho que a da Olivia e do Harry (Pederneira), antes e com o
     mouse, a 1100 e 390 px (média de cada obra a até 15%); no celular as asas do Giuseppe somem num degradê radial na borda da moldura.
 16. (T17o) na PÁGINA DA OBRA o bloco é uma caixa própria ABAIXO da folha da lista (pedido do autor de 27/10): fora do <main>, logo depois
     da div.layout (é um landmark "region" com nome), separada da folha pelo mesmo espaço das caixas do capítulo (1.5rem), com a mesma
     largura e a mesma sombra da caixa nos capítulos, a 1100 e 390 px (publicado e prévia).

Como usar (servidores sob timeout; nunca pkill):
  pnpm build                      # site publicado em dist/
  timeout 300 python3 -m http.server 8791 -d dist &
  NODE_ENV=development HC_OUT_DIR=<pasta> pnpm build     # (opcional) a prévia com rascunhos
  timeout 300 python3 -m http.server 8792 -d <pasta> &
  python3 tools/ordem_playwright.py --astro 8791 [--previa 8792] [--beira 8793]
  (para --beira: copie o projeto para uma pasta fora dele, sem node_modules/dist/.git, e ponha nela um link para o node_modules do projeto;
   crie content/works/roadside/01/pt.md e en.md com um front matter qualquer (ex.: "date: 2026-10-01"); dentro da cópia,
   NODE_ENV=development HC_OUT_DIR=<copia>/saida pnpm build (a saída tem de ficar DENTRO da cópia) e sirva <copia>/saida na porta 8793)

Sai com código 0 se tudo passar, 1 se algo falhar (e imprime o quê). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import re
import sys
import urllib.request

from playwright.sync_api import sync_playwright

CHAVE = "hc-ordem-de-leitura"
FALHAS: list[str] = []


def conferir(ok: bool, texto: str) -> None:
    print(("  ok    " if ok else "  FALHA ") + texto)
    if not ok:
        FALHAS.append(texto)


ESTADO = """() => {
  const b = document.querySelector('[data-story-order]');
  const vis = o => { const e = b.querySelector('.so-order[data-ordem="' + o + '"]'); return !e.hidden && getComputedStyle(e).display !== 'none'; };
  let guardado = null; try { guardado = localStorage.getItem('%s'); } catch (e) {}
  return { chrono: vis('chrono'), release: vis('release'), valor: b.querySelector('.so-valor').textContent,
           select: b.querySelector('select').value, desligado: b.querySelector('select').disabled, guardado,
           rolagem: document.documentElement.scrollWidth, largura: window.innerWidth };
}""" % CHAVE


def novo_contexto(browser, largura, **kw):
    ctx = browser.new_context(viewport={"width": largura, "height": 900}, **kw)
    ctx.route("**/fonts.g*/**", lambda r: r.abort())
    ctx.route("**/*.supabase.co/**", lambda r: r.abort())
    ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    return ctx


def abrir(pg, porta, caminho):
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    pg.locator("[data-story-order]").scroll_into_view_if_needed()
    pg.wait_for_timeout(300)


def roteiro(browser, porta, lang):
    ped = f"/{lang}/works/firestriker/01/"
    lb = f"/{lang}/works/light-and-blood/01/"
    print(f"\n== {lang}: Pederneira e Luz & Sangue (porta {porta})")

    # 1 e 2: padrão, troca, memória, outro capítulo
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, ped)
    e = pg.evaluate(ESTADO)
    conferir(e["chrono"] and not e["release"] and e["select"] == "chrono" and not e["desligado"] and e["guardado"] is None, "sem nada guardado: Cronológica visível, Lançamento escondida, seletor ligado")
    pg.select_option("[data-story-order] select", "release")
    e = pg.evaluate(ESTADO)
    conferir(e["release"] and not e["chrono"] and e["guardado"] == "release", "trocar para Lançamento mostra a outra lista e guarda a escolha")
    conferir(e["valor"] == pg.locator("[data-story-order] select option[value=release]").text_content(), f"o nome mostrado acompanha a escolha ({e['valor']!r})")
    pg.reload(wait_until="load")
    pg.locator("[data-story-order]").scroll_into_view_if_needed()
    conferir(pg.evaluate(ESTADO)["release"], "recarregar lembra a ordem")
    abrir(pg, porta, lb)
    conferir(pg.evaluate(ESTADO)["release"], "outro capítulo (Luz & Sangue 01) já abre na ordem escolhida")
    pg.select_option("[data-story-order] select", "chrono")
    conferir(pg.evaluate(ESTADO)["guardado"] == "chrono", "voltar para Cronológica também é guardado")
    ctx.close()

    # 3: teclado
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, ped)
    pg.focus("[data-story-order] select")
    pg.keyboard.press("ArrowDown")
    pg.wait_for_timeout(200)
    e = pg.evaluate(ESTADO)
    conferir(e["release"] and e["guardado"] == "release", "pelo teclado (foco no seletor + seta) a ordem muda")
    ctx.close()

    # 4: sem JavaScript
    ctx = novo_contexto(browser, 1100, java_script_enabled=False)
    pg = ctx.new_page()
    pg.goto(f"http://localhost:{porta}{ped}", wait_until="load")
    html = pg.content()
    conferir("data-story-order" in html and html.count('class="so-order"') == 2, "sem JavaScript o bloco está na página, com as duas ordens no HTML")
    conferir(pg.locator('.so-order[data-ordem="chrono"]').is_visible() and not pg.locator('.so-order[data-ordem="release"]').is_visible(), "sem JavaScript a Cronológica aparece e a outra fica escondida")
    conferir(pg.locator("[data-story-order] select").is_disabled(), "sem JavaScript o seletor fica desligado")
    ctx.close()

    # 5: localStorage com erro
    ctx = novo_contexto(browser, 1100)
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('bloqueado')}})")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda x: erros.append(str(x)))
    abrir(pg, porta, ped)
    pg.select_option("[data-story-order] select", "release")
    visivel = pg.evaluate("""() => { const e = document.querySelector('.so-order[data-ordem="release"]'); return !e.hidden; }""")
    conferir(visivel and not erros, "com o localStorage bloqueado o bloco funciona, sem erro na página")
    ctx.close()

    # 6: arte em camadas, mouse por cima / teclado / movimento reduzido
    camadas(browser, porta, lang)

    # 7: celular
    ctx = novo_contexto(browser, 390)
    pg = ctx.new_page()
    for caminho in (ped, lb):
        abrir(pg, porta, caminho)
        for ordem in ("chrono", "release"):
            pg.select_option("[data-story-order] select", ordem)
            e = pg.evaluate(ESTADO)
            conferir(e["rolagem"] <= e["largura"], f"390 px {caminho} ({ordem}): sem rolagem horizontal ({e['rolagem']} <= {e['largura']})")
            larguras = pg.evaluate("() => [...document.querySelectorAll('.so-order:not([hidden]) .so-art')].map(a => [a.getBoundingClientRect().left, a.getBoundingClientRect().right])")
            conferir(all(l >= 0 and r <= 390 for l, r in larguras), f"390 px {caminho} ({ordem}): a arte cabe na tela ({[[round(l), round(r)] for l, r in larguras]})")
    ctx.close()
    # 8: nada de "Em breve"
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    for caminho in (ped, lb):
        abrir(pg, porta, caminho)
        for ordem in ("chrono", "release"):
            pg.select_option("[data-story-order] select", ordem)
        conferir("Em breve" not in (pg.locator("[data-story-order]").text_content() or "") and "Coming soon" not in (pg.locator("[data-story-order]").text_content() or "") and pg.locator(".so-soon").count() == 0, f"{caminho}: nenhum \"Em breve\" no bloco")
    ctx.close()


LER_CAMADAS = """(seletor) => [...document.querySelectorAll(seletor + ' .so-layer')].map(i => {
  const c = getComputedStyle(i);
  return { arquivo: decodeURIComponent(i.getAttribute('src')).split('/').pop().replace(' Site Cronologia.png', ''),
           left: parseFloat(c.left), top: parseFloat(c.top), w: parseFloat(c.width), h: parseFloat(c.height), nat: i.naturalWidth || 1,
           rot: c.rotate === 'none' ? 0 : parseFloat(c.rotate), o: +c.opacity,
           dur: c.transitionDuration, curva: c.transitionTimingFunction, prop: c.transitionProperty };
})"""

# onde está cada arte: (página, ordem do seletor, lado)
ARTES = {
    "luz-e-sangue": ("/{lang}/works/firestriker/01/", "chrono", "prev"),
    "pederneira": ("/{lang}/works/light-and-blood/01/", "release", "prev"),
    "di-vario": ("/{lang}/works/firestriker/01/", "release", "prev"),
    # T17i (rascunhos): Ossos do Ofício só tem capítulo em inglês (desde a T17l aparece também em português, com o link para o inglês)
    "ossos": ("/{lang}/works/light-and-blood/01/", "chrono", "prev"),
    "beira": ("/{lang}/works/firestriker/01/", "chrono", "next"),
}


def medir(pg, porta, lang, arte, reduzir=False, teclado=False, meio=False):
    """Camadas de uma arte antes e depois de mouse/teclado: (antes, depois); com meio=True, também no meio da transição: (antes, depois, meio)."""
    caminho, ordem, lado = ARTES[arte]
    abrir(pg, porta, caminho.format(lang=lang))
    pg.evaluate("document.querySelectorAll('.so-layer').forEach(i => { i.loading = 'eager' })")
    pg.select_option("[data-story-order] select", ordem)
    seletor = f".so-order:not([hidden]) .so-side.{lado}"
    pg.mouse.move(2, 2)
    pg.wait_for_timeout(900)
    antes = pg.evaluate(LER_CAMADAS, seletor)
    if teclado:
        for _ in range(40):
            pg.keyboard.press("Tab")
            if pg.evaluate("(s) => document.activeElement && document.activeElement.matches(s)", seletor):
                break
    else:
        pg.hover(seletor)
    no_meio = None
    if meio:
        pg.wait_for_timeout(200)
        no_meio = {c["arquivo"]: c for c in pg.evaluate(LER_CAMADAS, seletor)}
    pg.wait_for_timeout(900)
    depois = pg.evaluate(LER_CAMADAS, seletor)
    if meio:
        return {c["arquivo"]: c for c in antes}, {c["arquivo"]: c for c in depois}, no_meio
    return {c["arquivo"]: c for c in antes}, {c["arquivo"]: c for c in depois}


def camadas(browser, porta, lang):
    for modo in ("mouse", "teclado"):
        ctx = novo_contexto(browser, 1100)
        pg = ctx.new_page()
        tec = modo == "teclado"
        print(f"  -- arte em camadas ({modo})")
        a, d = medir(pg, porta, lang, "luz-e-sangue", teclado=tec)
        conferir(list(a) == ["John", "Oliver", "Ellie"], f"Luz & Sangue: ordem das camadas, de trás para a frente ({list(a)})")
        conferir(all(d[n]["w"] > a[n]["w"] * 1.05 for n in a), "Luz & Sangue: os três crescem: " + ", ".join(f"{n} {a[n]['w']:.0f}→{d[n]['w']:.0f}px" for n in a))
        conferir(a["Oliver"]["rot"] == 0 and d["Oliver"]["rot"] > 3 and d["John"]["rot"] < -3, f"Luz & Sangue: Oliver gira para a direita ({d['Oliver']['rot']:.1f}°) e John para a esquerda ({d['John']['rot']:.1f}°)")
        conferir(d["Oliver"]["left"] > a["Oliver"]["left"] + 5 and d["John"]["left"] < a["John"]["left"] - 5, "Luz & Sangue: Oliver e John se afastam da Ellie (um para cada lado)")
        conferir(abs(d["Ellie"]["rot"]) < 0.01, "Luz & Sangue: a Ellie só cresce (não gira)")
        a, d = medir(pg, porta, lang, "pederneira", teclado=tec)
        conferir(list(a) == ["Thymorr", "Harry", "Olivia"], f"Pederneira: ordem das camadas ({list(a)})")
        conferir(a["Thymorr"]["o"] == 0 and d["Thymorr"]["o"] == 1, f"Pederneira: o Thymorr vai de 0 a 100% de opacidade ({a['Thymorr']['o']} → {d['Thymorr']['o']})")
        conferir(d["Thymorr"]["left"] > a["Thymorr"]["left"] + 5, f"Pederneira: o Thymorr se move para a direita ({a['Thymorr']['left']:.0f} → {d['Thymorr']['left']:.0f}px)")
        conferir(d["Harry"]["w"] > a["Harry"]["w"] and d["Olivia"]["w"] > a["Olivia"]["w"], "Pederneira: Olivia e Harry crescem")
        conferir(d["Harry"]["rot"] < -3 and abs(d["Harry"]["left"] - a["Harry"]["left"]) > 5 and abs(d["Olivia"]["rot"]) < 0.01, f"Pederneira: o Harry gira ({d['Harry']['rot']:.1f}°) e se move; a Olivia não gira")
        a, d = medir(pg, porta, lang, "di-vario", teclado=tec)
        conferir(list(a) == ["Lucas", "Wellersson"], f"Alô?: ordem das camadas ({list(a)})")
        conferir(d["Lucas"]["left"] < a["Lucas"]["left"] - 5 and d["Wellersson"]["left"] > a["Wellersson"]["left"] + 5, "Alô?: Lucas e Wellersson se afastam um do outro")
        conferir(d["Lucas"]["w"] > a["Lucas"]["w"] and d["Wellersson"]["w"] > a["Wellersson"]["w"], "Alô?: os dois crescem")
        todas = [c for arte in ("luz-e-sangue", "pederneira", "di-vario") for c in medir(pg, porta, lang, arte, teclado=tec)[0].values()]
        conferir(len({(c["dur"], c["curva"], c["prop"]) for c in todas}) == 1 and all(p in todas[0]["prop"] for p in ("left", "top", "width", "rotate", "opacity")), f"uma transição só para todas as camadas ({todas[0]['dur']}, {todas[0]['curva']})")
        ctx.close()
    # movimento reduzido: nada se mexe nem gira; só o Thymorr aparece, de uma vez, no lugar final
    ctx = novo_contexto(browser, 1100, reduced_motion="reduce")
    pg = ctx.new_page()
    print("  -- arte em camadas (movimento reduzido)")
    for arte in ("luz-e-sangue", "di-vario"):
        a, d = medir(pg, porta, lang, arte)
        parado = all(abs(d[n][k] - a[n][k]) < 0.01 for n in a for k in ("left", "top", "w", "rot", "o"))
        conferir(parado, f"movimento reduzido, {arte}: nada muda (posição, tamanho, giro)")
    # T17i: a arte em que algo SURGE troca de uma vez para o desenho final do autor (o do mouse), sem animar
    a, d = medir(pg, porta, lang, "pederneira")
    ctx.close()
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    _, final = medir(pg, porta, lang, "pederneira")
    ctx.close()
    conferir(all(abs(d[n][k] - final[n][k]) < 0.5 for n in ("Harry", "Olivia", "Thymorr") for k in ("left", "top", "w", "rot", "o")), "movimento reduzido, Pederneira: troca de uma vez para o desenho final (Olivia e Harry no lugar do mouse)")
    conferir(a["Thymorr"]["o"] == 0 and d["Thymorr"]["o"] == 1 and all(d[n]["dur"] in ("0s", "0.0s") for n in d), "movimento reduzido, Pederneira: o Thymorr aparece de uma vez (sem transição nenhuma)")
    conferir(d["Thymorr"]["left"] > a["Thymorr"]["left"], "movimento reduzido, Pederneira: o Thymorr já aparece no lugar final (à direita)")


def colados(a, b, tol=1.0):
    """Duas camadas sem giro com o mesmo canto de cima à esquerda (em px da tela) e a mesma escala: a e b são dicionários de LER_CAMADAS
    com a largura natural em 'nat'."""
    ca = (a["left"] - a["w"] / 2, a["top"] - a["h"] / 2)
    cb = (b["left"] - b["w"] / 2, b["top"] - b["h"] / 2)
    return abs(ca[0] - cb[0]) <= tol and abs(ca[1] - cb[1]) <= tol and abs(a["w"] / a["nat"] - b["w"] / b["nat"]) < 0.004


def iguais(a, b, chaves=("left", "top", "w", "rot", "o"), tol=0.5):
    return all(abs(a[k] - b[k]) <= tol for k in chaves)


def artes_novas(browser, porta, arte, lang):
    """T17i: Ossos do Ofício (prévia, em inglês) e Beira de Estrada (cópia com capítulo inventado)."""
    nomes = {"ossos": ["Giuseppe Asas", "Giuseppe", "Giuseppe Olhos"], "beira": ["Jean", "Cezar e Iris", "Iris Olhos"]}[arte]
    for modo in ("mouse", "teclado"):
        ctx = novo_contexto(browser, 1100)
        pg = ctx.new_page()
        a, d, m = medir(pg, porta, lang, arte, teclado=modo == "teclado", meio=True)
        print(f"  -- {arte} ({lang}, {modo}): " + "; ".join(f"{n} {a[n]['w']:.1f}→{d[n]['w']:.1f}px o {a[n]['o']}→{d[n]['o']} rot {a[n]['rot']:.2f}→{d[n]['rot']:.2f}" for n in nomes))
        conferir(list(a) == nomes, f"{arte}: ordem das camadas, de trás para a frente ({list(a)})")
        conferir(all(d[n]["w"] > a[n]["w"] * 1.05 for n in nomes), f"{arte} ({modo}): as três crescem juntas")
        conferir(len({(c["dur"], c["curva"]) for c in d.values()}) == 1, f"{arte} ({modo}): uma transição só para as três ({d[nomes[0]]['dur']})")
        if arte == "ossos":
            conferir(a["Giuseppe Asas"]["o"] == 0 and d["Giuseppe Asas"]["o"] == 1 and a["Giuseppe Olhos"]["o"] == 0 and d["Giuseppe Olhos"]["o"] == 1, f"ossos ({modo}): asas e olhos vão de 0 a 100% de opacidade")
            conferir(a["Giuseppe"]["o"] == 1 and abs(d["Giuseppe"]["rot"]) < 0.01, f"ossos ({modo}): o Giuseppe está sempre à vista e não gira")
            for estado, x in (("começo", a), ("meio", m), ("fim", d)):
                conferir(colados(x["Giuseppe"], x["Giuseppe Olhos"]), f"ossos ({modo}): os olhos colados no Giuseppe no {estado} (canto e escala)")
            conferir(0 < m["Giuseppe Olhos"]["o"] < 1 and a["Giuseppe"]["w"] < m["Giuseppe"]["w"] < d["Giuseppe"]["w"], f"ossos ({modo}): no meio da transição as três estão crescendo e as asas/olhos surgindo (o {m['Giuseppe Olhos']['o']:.2f})")
        else:
            for estado, x in (("começo", a), ("meio", m), ("fim", d)):
                conferir(iguais(x["Cezar e Iris"], x["Iris Olhos"], ("left", "top", "w", "rot")), f"beira ({modo}): os olhos da Iris com a mesma posição, tamanho e giro de Cezar e Iris no {estado}")
            conferir(a["Iris Olhos"]["o"] == 0 and d["Iris Olhos"]["o"] == 1, f"beira ({modo}): os olhos da Iris vão de 0 a 100%")
            conferir(d["Jean"]["left"] > a["Jean"]["left"] + 3 and d["Cezar e Iris"]["left"] < a["Cezar e Iris"]["left"] - 3, f"beira ({modo}): Jean e Cezar se afastam um do outro")
            conferir(d["Jean"]["rot"] > 3 and d["Cezar e Iris"]["rot"] < -3, f"beira ({modo}): Jean inclina para a direita ({d['Jean']['rot']:.2f}°) e Cezar e Iris para a esquerda ({d['Cezar e Iris']['rot']:.2f}°)")
        ctx.close()
    # movimento reduzido: troca de uma vez para o desenho final (o mesmo do mouse), sem transição, com os olhos no lugar
    ctx = novo_contexto(browser, 1100, reduced_motion="reduce")
    pg = ctx.new_page()
    a, d = medir(pg, porta, lang, arte)
    ctx.close()
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    _, final = medir(pg, porta, lang, arte)
    ctx.close()
    conferir(all(iguais(d[n], final[n]) for n in nomes) and all(d[n]["dur"] in ("0s", "0.0s") for n in nomes), f"{arte}, movimento reduzido: troca de uma vez para o desenho final, sem transição")
    olho, dono = ("Giuseppe Olhos", "Giuseppe") if arte == "ossos" else ("Iris Olhos", "Cezar e Iris")
    conferir(a[olho]["o"] == 0 and d[olho]["o"] == 1 and (colados(d[dono], d[olho]) if arte == "ossos" else iguais(d[dono], d[olho], ("left", "top", "w", "rot"))), f"{arte}, movimento reduzido: os olhos aparecem já em cima do rosto")
    # celular: a arte cabe na coluna e na tela, sem rolagem para o lado
    ctx = novo_contexto(browser, 390)
    pg = ctx.new_page()
    medir(pg, porta, lang, arte)
    caixa = pg.evaluate("() => { const r = document.querySelector('[data-story-order]').getBoundingClientRect(); return [r.left, r.right]; }")
    pedacos = pg.evaluate("() => [...document.querySelectorAll('.so-order:not([hidden]) .so-art')].map(a => { const r = a.getBoundingClientRect(); return [r.left, r.right]; })")
    rol = pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
    conferir(all(l >= caixa[0] - 0.5 and r <= caixa[1] + 0.5 for l, r in pedacos) and rol[0] <= rol[1], f"{arte}, 390 px: as molduras cabem na caixa ({[[round(l), round(r)] for l, r in pedacos]}) e não há rolagem para o lado")
    ctx.close()


ENDERECOS_DOS_CAPITULOS = re.compile(r'href="(/(?:en|pt)/works/[^/"]+/[^/"]+/)"')
EH_PAGINA_DA_OBRA = re.compile(r"^/(en|pt)/works/[^/]+/$")


def capitulos_do_site(porta):
    """Todas as páginas com o bloco: os capítulos (dos cartões de Histórias e das páginas das obras) e, desde a T17l, as páginas das obras."""
    def pegar(caminho):
        try:
            with urllib.request.urlopen(f"http://localhost:{porta}{caminho}", timeout=10) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            return ""
    achados = set()
    for lang in ("pt", "en"):
        html = pegar(f"/{lang}/works/")
        obras = set(re.findall(r'href="(/' + lang + r'/works/[^/"]+/)"', html))
        achados |= set(ENDERECOS_DOS_CAPITULOS.findall(html))
        achados |= obras
        for o in obras:
            achados |= set(ENDERECOS_DOS_CAPITULOS.findall(pegar(o)))
    return sorted(u for u in achados if pegar(u).find("data-story-order") >= 0)


MEDIR_CAIXA = """() => {
  const b = document.querySelector('[data-story-order]'), r = b.getBoundingClientRect();
  const lista = b.querySelector('.so-order:not([hidden])');
  const molduras = [...lista.querySelectorAll('.so-art')].map(a => { const q = a.getBoundingClientRect(); return [Math.round(q.width * 10) / 10, Math.round(q.height * 10) / 10]; });
  const rotulos = [...lista.querySelectorAll('a.so-side .so-label')].map(l => {
    const t = [...l.childNodes].find(n => n.nodeType === 3 && n.textContent.trim() !== '');
    const g = document.createRange(); g.selectNodeContents(t);
    const linhas = new Set([...g.getClientRects()].map(q => Math.round(q.top))).size;
    const q = g.getBoundingClientRect();
    return { texto: t.textContent, linhas, esq: q.left, dir: q.right, cima: q.top, baixo: q.bottom, letra: parseFloat(getComputedStyle(l).fontSize) };
  });
  return { w: r.width, h: r.height, esq: r.left, dir: r.right, molduras, rotulos };
}"""


def tamanho_da_caixa(browser, porta, nome):
    """T17i: em TODO capítulo, a caixa tem o mesmo tamanho nas duas ordens e com o mouse em cada lado; rótulo numa linha, dentro da caixa."""
    capitulos = capitulos_do_site(porta)
    print(f"\n== tamanho da caixa e rótulos ({nome}, porta {porta}): {len(capitulos)} capítulos")
    conferir(len(capitulos) > 0, f"{nome}: achou os capítulos ({capitulos})")
    molduras_do_site = {}
    caixas_do_site = {}
    for largura in (1100, 390, 320):
        ctx = novo_contexto(browser, largura)
        pg = ctx.new_page()
        for url in capitulos:
            abrir(pg, porta, url)
            medidas = []
            for ordem in ("chrono", "release"):
                pg.select_option("[data-story-order] select", ordem)
                pg.mouse.move(1, 1)
                pg.wait_for_timeout(150)
                medidas.append((ordem, "parado", pg.evaluate(MEDIR_CAIXA)))
                for lado in ("prev", "next"):
                    alvo = pg.locator(f".so-order:not([hidden]) a.so-side.{lado}")
                    if alvo.count():
                        alvo.hover()
                        pg.wait_for_timeout(700)
                        medidas.append((ordem, f"mouse em {lado}", pg.evaluate(MEDIR_CAIXA)))
                        pg.mouse.move(1, 1)
                        pg.wait_for_timeout(700)
            tamanhos = {(round(m["w"], 1), round(m["h"], 1)) for _, _, m in medidas}
            conferir(len(tamanhos) == 1, f"{largura} px {url}: a caixa tem o MESMO tamanho nas duas ordens e com o mouse ({sorted(tamanhos)}; {len(medidas)} medidas)")
            # (T17d) só com o mouse fora: a arte de imagem/capa (O Pêndulo, Cat-Crow-Thing) cresce 7% com o mouse por cima (o "crescimento leve"
            # da T17c, `transform: scale(1.07)`), e o getBoundingClientRect mede a moldura já crescida; a CAIXA não muda (conferido acima)
            # (T17o) a caixa da página da obra deixou de morar dentro da folha: é a mesma dos capítulos, então tudo é comparado junto
            tipo = "capítulos e páginas de obra"
            for _, estado, m in medidas:
                if estado != "parado":
                    continue
                for mo in m["molduras"]:
                    molduras_do_site.setdefault((largura, tipo), set()).add(tuple(mo))
                caixas_do_site.setdefault(largura, {}).setdefault((round(m["w"], 1), round(m["h"], 1)), []).append(url)
            letras = {r["letra"] for _, _, m in medidas for r in m["rotulos"]}
            conferir(len(letras) <= 1, f"{largura} px {url}: a mesma letra nos rótulos das duas ordens ({sorted(letras)})")
            for ordem, estado, m in medidas:
                rs = m["rotulos"]
                ok = all(r["linhas"] == 1 and r["esq"] >= m["esq"] - 0.5 and r["dir"] <= m["dir"] + 0.5 for r in rs)
                if len(rs) == 2:
                    a, b = rs
                    ok = ok and (a["dir"] <= b["esq"] or a["baixo"] <= b["cima"] + 0.5)  # sem encostar: lado a lado ou um embaixo do outro
                if estado == "parado":
                    conferir(ok, f"{largura} px {url} ({ordem}): rótulo(s) numa linha só, dentro da caixa, sem encostar ({[(r['texto'], r['linhas'], round(r['letra'], 1)) for r in rs]})")
        ctx.close()
    for (largura, tipo), ms in sorted(molduras_do_site.items()):
        conferir(len(ms) == 1, f"{largura} px ({tipo}): todas as molduras de arte, de todas as obras, do mesmo tamanho ({sorted(ms)})")
        conferir(all(abs(w - h) < 0.6 for w, h in ms), f"{largura} px ({tipo}): a moldura é quadrada (PROPORCAO_DA_MOLDURA = 1)")
    for largura, cs in sorted(caixas_do_site.items()):
        conferir(len(cs) == 1, f"{largura} px: a caixa tem o MESMO tamanho em toda página, capítulos e páginas de obra ({ {k: len(v) for k, v in cs.items()} })")


MEDIR_SEPARADA = """() => {
  const b = document.querySelector('[data-story-order]'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  const main = document.querySelector('main'), m = main.getBoundingClientRect();
  return { dentroDoMain: !!b.closest('main'), depoisDaLayout: !!(b.previousElementSibling && b.previousElementSibling.matches('div.layout')),
           paiBody: b.parentElement === document.body, nome: b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby')) ? document.getElementById(b.getAttribute('aria-labelledby')).textContent : null,
           espaco: r.top - m.bottom, w: r.width, esq: r.left, sombra: cs.boxShadow, fundo: cs.backgroundColor, raio: cs.borderTopLeftRadius,
           mainSheet: main.classList.contains('sheet'), z: cs.zIndex, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
}"""
MEDIR_NO_CAPITULO = """() => {
  const b = document.querySelector('[data-story-order]'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  const antes = b.previousElementSibling.getBoundingClientRect();
  return { w: r.width, esq: r.left, sombra: cs.boxShadow, fundo: cs.backgroundColor, raio: cs.borderTopLeftRadius, espaco: r.top - antes.bottom };
}"""


def caixa_separada(browser, porta, nome):
    """T17o: na página da obra, o bloco é uma caixa própria abaixo da folha da lista, como nos capítulos (fora do <main>)."""
    paginas = [u for u in capitulos_do_site(porta) if EH_PAGINA_DA_OBRA.match(u)]
    print(f"\n== T17o: a caixa separada na página da obra ({nome}, porta {porta}): {paginas}")
    conferir(len(paginas) > 0, f"{nome}: achou páginas de obra com o bloco")
    for largura in (1100, 390):
        ctx = novo_contexto(browser, largura)
        pg = ctx.new_page()
        for url in paginas:
            abrir(pg, porta, url)
            o = pg.evaluate(MEDIR_SEPARADA)
            primeiro = pg.evaluate("() => document.querySelector('ol.chapter-list a').getAttribute('href')")
            abrir(pg, porta, primeiro)
            c = pg.evaluate(MEDIR_NO_CAPITULO)
            conferir(o["mainSheet"] and not o["dentroDoMain"] and o["depoisDaLayout"] and o["paiBody"], f"{largura} px {url}: o bloco fica FORA da folha (<main class=sheet>), logo depois da div.layout")
            conferir(bool(o["nome"]), f"{largura} px {url}: o bloco é uma região com nome (aria-labelledby → {o['nome']!r})")
            conferir(abs(o["espaco"] - 1.5 * o["rem"]) < 0.6 and abs(c["espaco"] - 1.5 * o["rem"]) < 0.6, f"{largura} px {url}: separado da folha pelo mesmo espaço das caixas do capítulo ({o['espaco']:.1f} px; no capítulo {c['espaco']:.1f} px)")
            conferir(abs(o["w"] - c["w"]) < 0.6 and abs(o["esq"] - c["esq"]) < 0.6, f"{largura} px {url}: a mesma largura e o mesmo lugar da caixa no capítulo ({o['w']:.1f} × {c['w']:.1f} px; esquerda {o['esq']:.1f} × {c['esq']:.1f})")
            conferir(o["sombra"] == c["sombra"] and o["fundo"] == c["fundo"] and o["raio"] == c["raio"], f"{largura} px {url}: a mesma sombra, o mesmo papel e o mesmo canto da caixa no capítulo ({o['sombra']})")
            conferir(o["z"] == "1", f"{largura} px {url}: por cima das runas do fundo, como o <main> (z-index {o['z']})")
        ctx.close()


def links(browser, porta, nome):
    """T17l: obra com mais de um capítulo naquele idioma → a página da obra (a lista); com um só → o capítulo; externo continua externo,
    em outra aba; destino em outro idioma (a obra não tem capítulo no idioma da página) → hreflang com o idioma de destino."""
    print(f"\n== links do bloco ({nome}, porta {porta})")
    todos = capitulos_do_site(porta)
    capitulos = [u for u in todos if not EH_PAGINA_DA_OBRA.match(u)]
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    for url in todos:
        abrir(pg, porta, url)
        lados = pg.evaluate("() => [...document.querySelectorAll('[data-story-order] a.so-side')].map(a => [a.closest('.so-order').dataset.ordem, a.classList.contains('prev') ? 'prev' : 'next', a.getAttribute('href'), a.target, a.getAttribute('hreflang')])")
        idioma_da_pagina = url.split("/")[1]
        for ordem, lado, href, alvo, hreflang in lados:
            if href.startswith("http"):
                conferir(alvo == "_blank", f"{url} {ordem} {lado}: externo, em outra aba ({href})")
                continue
            idioma, obra = href.split("/")[1], href.split("/")[3]
            da_obra = sorted(u for u in capitulos if u.startswith(f"/{idioma}/works/{obra}/"))
            esperado = f"/{idioma}/works/{obra}/" if len(da_obra) > 1 else (da_obra[0] if da_obra else None)
            conferir(href == esperado, f"{url} {ordem} {lado}: {href} = {'a página da obra (' + str(len(da_obra)) + ' capítulos)' if len(da_obra) > 1 else 'o único capítulo'} ({esperado})")
            conferir(hreflang == (idioma if idioma != idioma_da_pagina else None), f"{url} {ordem} {lado}: hreflang {hreflang!r} (destino em {idioma})")
    ctx.close()


def previa(browser, porta):
    print(f"\n== prévia com rascunhos (porta {porta})")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, "/pt/works/firestriker/01/")
    # T17d/T17l: a Beira de Estrada (dois capítulos provisórios) vem depois da Pederneira, levando à lista de capítulos dela
    seguinte = pg.locator('.so-order[data-ordem="chrono"] a.so-side.next')
    conferir(seguinte.count() == 1 and seguinte.get_attribute("href") == "/pt/works/roadside/", "prévia: na Cronológica, depois da Pederneira vem a Beira de Estrada (a página da obra)")
    texto = pg.locator("[data-story-order]").text_content() or ""
    conferir("Em breve" not in texto, "prévia: o bloco não fala de \"Em breve\"")
    # T17n: Ossos do Ofício ganhou o capítulo em português; nas páginas em português leva a ele, sem hreflang (até a T17m, ao inglês)
    abrir(pg, porta, "/pt/works/light-and-blood/01/")
    ossos = pg.locator('.so-order[data-ordem="chrono"] a.so-side.prev')
    conferir(ossos.get_attribute("href") == "/pt/works/all-in-a-nights-work/01/" and ossos.get_attribute("hreflang") is None and "Ler Ossos do Ofício" in (ossos.text_content() or ""), "prévia, /pt/: \"Ler Ossos do Ofício\" leva ao capítulo em português (sem hreflang)")
    # T17l/T17o: o bloco também na página da obra, abaixo da folha da lista de capítulos (a caixa separada é medida em caixa_separada())
    for url in ("/pt/works/roadside/", "/en/works/light-and-blood/"):
        abrir(pg, porta, url)
        depois_da_lista = pg.evaluate("() => { const b = document.querySelector('[data-story-order]'); const p = b && b.previousElementSibling; return !!(p && p.matches('div.layout') && p.querySelector('main ol.chapter-list') && !b.closest('main')); }")
        conferir(depois_da_lista, f"prévia, {url}: o bloco vem logo depois da folha da lista de capítulos, fora do <main>")
    # T17l: O Pêndulo e Cat-Crow-Thing (sem order_art nem order_images) não aparecem em bloco nenhum
    for url in capitulos_do_site(porta):
        abrir(pg, porta, url)
        hrefs = pg.evaluate("() => [...document.querySelectorAll('[data-story-order] a.so-side')].map(a => a.getAttribute('href'))")
        conferir(not any(("the-pendulum" in h or "cat-crow-thing" in h) for h in hrefs), f"prévia, {url}: sem O Pêndulo nem Cat-Crow-Thing no bloco")
    ctx.close()


LER_ASAS = """() => {
  const caixa = document.querySelector('[data-story-order]');
  const lista = caixa.querySelector('.so-order:not([hidden])');
  const ossos = [...lista.querySelectorAll('a.so-side')].find(a => a.getAttribute('href').includes('all-in-a-nights-work'));
  const outro = [...lista.querySelectorAll('a.so-side')].find(a => a !== ossos);
  const asas = ossos.querySelector('img[src*="Asas"]');
  const moldura = ossos.querySelector('.so-art');
  const r = (e) => { const q = e.getBoundingClientRect(); return { esq: q.left, dir: q.right, cima: q.top, baixo: q.bottom }; };
  const cx = caixa.getBoundingClientRect();
  const sel = caixa.querySelector('.so-select').getBoundingClientRect();
  const noSeletor = document.elementFromPoint(sel.left + sel.width / 2, sel.top + sel.height / 2);
  let noOutro = null;
  if (outro) { const q = outro.querySelector('.so-art').getBoundingClientRect(); const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height * 0.8); noOutro = !!(e && outro.contains(e)); }
  // a ordem de PINTURA no ponto do título que fica em cima das asas: liga o clique das asas só para perguntar (elementsFromPoint ignora
  // quem tem pointer-events: none) e desliga em seguida
  const valor = caixa.querySelector('.so-valor').getBoundingClientRect();
  const ponto = [valor.right - 4, valor.top + valor.height / 2];
  asas.style.pointerEvents = 'auto';
  const pilha = document.elementsFromPoint(...ponto);
  asas.style.pointerEvents = '';
  const iAsas = pilha.indexOf(asas), iTexto = pilha.findIndex(e => e.closest && e.closest('.so-top'));
  const cs = getComputedStyle(caixa);
  return { asas: r(asas), moldura: r(moldura), caixa: { esq: cx.left, dir: cx.right, cima: cx.top, baixo: cx.bottom }, opacidade: +getComputedStyle(asas).opacity,
           corteDaMoldura: getComputedStyle(moldura).overflow, corteDaCaixa: cs.overflow, canto: parseFloat(cs.borderTopRightRadius),
           seletor: noSeletor && noSeletor.classList.contains('so-select'), outro: noOutro, asasNoPonto: iAsas, textoNoPonto: iTexto, valorBaixo: valor.bottom,
           mascara: getComputedStyle(moldura).maskImage || getComputedStyle(moldura).webkitMaskImage || 'none',
           asasPegamClique: getComputedStyle(asas).pointerEvents };
}"""


def asas(browser, porta):
    """T17l: as asas do Giuseppe saem da moldura, ficam por trás da frase de cima, são cortadas pela caixa e não pegam clique."""
    print(f"\n== as asas do Giuseppe (prévia, porta {porta})")
    # Ossos do Ofício do lado da direita (Beira de Estrada, Lançamento: desde a T17o Beira 4 → Ossos 5) e do lado da esquerda (Luz & Sangue,
    # Cronológica: Ossos 4 → Luz & Sangue 5)
    for lang in ("en", "pt"):
        for url, ordem, lado in ((f"/{lang}/works/roadside/01/", "release", "next"), (f"/{lang}/works/light-and-blood/01/", "chrono", "prev")):
            for modo in ("mouse", "teclado"):
                ctx = novo_contexto(browser, 1100)
                pg = ctx.new_page()
                abrir(pg, porta, url)
                pg.evaluate("document.querySelectorAll('.so-layer').forEach(i => { i.loading = 'eager' })")
                pg.select_option("[data-story-order] select", ordem)
                pg.mouse.move(1, 1)
                pg.wait_for_timeout(700)
                antes = pg.evaluate(LER_ASAS)
                caixa_antes = pg.evaluate("() => { const r = document.querySelector('[data-story-order]').getBoundingClientRect(); return [r.width, r.height]; }")
                alvo = f".so-order:not([hidden]) a.so-side.{lado}"
                if modo == "teclado":
                    for _ in range(40):
                        pg.keyboard.press("Tab")
                        if pg.evaluate("(s) => document.activeElement && document.activeElement.matches(s)", alvo):
                            break
                else:
                    pg.hover(alvo)
                pg.wait_for_timeout(900)
                d = pg.evaluate(LER_ASAS)
                caixa_depois = pg.evaluate("() => { const r = document.querySelector('[data-story-order]').getBoundingClientRect(); return [r.width, r.height]; }")
                tag = f"{url} ({lado}, {modo})"
                conferir(antes["opacidade"] == 0 and d["opacidade"] == 1, f"{tag}: as asas surgem (opacidade {antes['opacidade']} → {d['opacidade']})")
                # T17m: o Giuseppe (e as asas, na mesma escala) diminuiu para a cabeça ficar do tamanho da da Olivia e do Harry; as asas ainda saem
                # da moldura pelos lados, mas não chegam mais em cima (nem à frase) e só passam da borda da caixa com a Ossos do lado direito
                conferir(d["corteDaMoldura"] == "visible" and (d["asas"]["esq"] < d["moldura"]["esq"] - 5 or d["asas"]["dir"] > d["moldura"]["dir"] + 5), f"{tag}: as asas saem da moldura ({round(d['asas']['esq'])}–{round(d['asas']['dir'])} × {round(d['asas']['cima'])} contra a moldura {round(d['moldura']['esq'])}–{round(d['moldura']['dir'])} × {round(d['moldura']['cima'])})")
                passa = d["asas"]["cima"] < d["caixa"]["cima"] or d["asas"]["dir"] > d["caixa"]["dir"] or d["asas"]["esq"] < d["caixa"]["esq"]
                conferir(d["corteDaCaixa"] == "hidden" and d["canto"] > 10, f"{tag}: a caixa é a máscara das asas (overflow {d['corteDaCaixa']}, canto {d['canto']} px; as asas {'passam' if passa else 'não passam'} da borda)")
                conferir((d["asasNoPonto"] < 0 and d["asas"]["cima"] > d["valorBaixo"]) or (d["asasNoPonto"] >= 0 and 0 <= d["textoNoPonto"] < d["asasNoPonto"]), f"{tag}: as asas ficam POR TRÁS da frase de cima ou abaixo dela (pintura: texto {d['textoNoPonto']}, asas {d['asasNoPonto']}; topo das asas {round(d['asas']['cima'])}, fim da frase {round(d['valorBaixo'])})")
                conferir(d["asasPegamClique"] == "none" and d["seletor"], f"{tag}: o seletor de ordem continua clicável (as asas não pegam clique)")
                conferir(d["outro"] is not False, f"{tag}: a outra história continua clicável por cima/embaixo das asas")
                conferir(caixa_antes == caixa_depois, f"{tag}: a caixa não muda de tamanho com as asas ({caixa_antes} → {caixa_depois})")
                ctx.close()
    # celular: a moldura volta a cortar (a caixa é estreita e as duas artes ficam lado a lado)
    for largura in (390, 320):
        ctx = novo_contexto(browser, largura)
        pg = ctx.new_page()
        abrir(pg, porta, "/en/works/roadside/01/")  # T17o: Ossos à direita da Beira de Estrada, no Lançamento
        pg.select_option("[data-story-order] select", "release")
        pg.hover(".so-order:not([hidden]) a.so-side.next")
        pg.wait_for_timeout(900)
        d = pg.evaluate(LER_ASAS)
        rol = pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
        conferir(d["corteDaMoldura"] in ("clip", "hidden") and rol[0] <= rol[1], f"{largura} px: a moldura das asas volta a cortar ({d['corteDaMoldura']}) e não há rolagem para o lado")
        # T17m (pedido do autor): no celular, sem corte seco: as bordas da moldura desvanecem num degradê radial (máscara)
        conferir(d["mascara"].startswith("radial-gradient(farthest-side at 50% 100%"), f"{largura} px: as asas somem num degradê radial na borda da moldura ({d['mascara'][:60]})")
        conferir(d["outro"] is not False and d["seletor"], f"{largura} px: com as asas à vista, a outra história e o seletor continuam clicáveis")
        ctx.close()
    # no computador a máscara não existe (quem corta é a caixa)
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, "/en/works/roadside/01/")  # T17o: Ossos à direita da Beira de Estrada, no Lançamento
    pg.select_option("[data-story-order] select", "release")
    conferir(pg.evaluate(LER_ASAS)["mascara"] == "none", "1100 px: sem degradê na moldura (a caixa é a máscara, como o autor pediu na T17l)")
    ctx.close()


# T17m: a CABEÇA dos personagens de toda arte do bloco ~ do tamanho da da Olivia e do Harry (Pederneira), antes e com o mouse.
# Altura da cabeça em px do PNG (do alto do cabelo/chapéu ao queixo/barba; Thymorr não conta), medida nas grades dos PNGs de static/ordem/.
CABECA_NO_PNG = {"Olivia": [("Olivia", 287)], "Harry": [("Harry", 223)], "John": [("John", 153)], "Oliver": [("Oliver", 179)], "Ellie": [("Ellie", 235)],
                 "Lucas": [("Lucas", 333)], "Wellersson": [("Wellersson", 410)], "Jean": [("Jean", 392)], "Cezar e Iris": [("Cezar", 412), ("Iris", 306)],
                 "Giuseppe": [("Giuseppe", 450)]}
LARGURA_DO_PNG = {"Olivia": 926, "Harry": 1007, "John": 216, "Oliver": 526, "Ellie": 607, "Lucas": 1461, "Wellersson": 1009, "Jean": 779, "Cezar e Iris": 998, "Giuseppe": 828}


def cabecas(browser, porta):
    """T17m: a altura da cabeça de cada personagem (px na tela, a 1100 e 390 px), antes e com o mouse; a média de cada obra fica a até 15%
    da média da Olivia e do Harry (média geométrica dos dois estados, já que cada arte cresce do seu jeito no mouse)."""
    print(f"\n== cabeças do mesmo tamanho (prévia, porta {porta})")
    artes = {"pederneira": ("/en/works/light-and-blood/01/", "chrono", "next"), "luz-e-sangue": ("/pt/works/firestriker/01/", "chrono", "prev"),
             "beira": ("/pt/works/firestriker/01/", "chrono", "next"), "di-vario": ("/pt/works/firestriker/01/", "release", "prev"),
             "ossos": ("/en/works/light-and-blood/01/", "chrono", "prev")}
    for largura in (1100, 390):
        medias = {}
        for arte, (url, ordem, lado) in artes.items():
            ctx = novo_contexto(browser, largura)
            pg = ctx.new_page()
            abrir(pg, porta, url)
            pg.select_option("[data-story-order] select", ordem)
            pg.evaluate("document.querySelectorAll('.so-layer').forEach(i => { i.loading = 'eager' })")
            pg.mouse.move(1, 1)
            pg.wait_for_timeout(700)
            estados = []
            for estado in ("antes", "mouse"):
                if estado == "mouse":
                    pg.hover(f".so-order:not([hidden]) a.so-side.{lado} .so-art")
                    pg.wait_for_timeout(900)
                larguras = pg.evaluate("(l) => [...document.querySelectorAll('.so-order:not([hidden]) a.so-side.' + l + ' .so-layer')].map(i => [decodeURIComponent(i.getAttribute('src')).split('/').pop().replace(' Site Cronologia.png', ''), parseFloat(getComputedStyle(i).width)])", lado)
                cab = {n: w / LARGURA_DO_PNG[a] * px for a, w in larguras if a in CABECA_NO_PNG for n, px in CABECA_NO_PNG[a]}
                estados.append(cab)
            ctx.close()
            m = [sum(c.values()) / len(c) for c in estados]
            medias[arte] = (m[0] * m[1]) ** 0.5
            print("        " + f"{largura} px {arte:13s} " + "  ".join(f"{n} {estados[0][n]:.1f} → {estados[1][n]:.1f}" for n in estados[0]))
        ref = medias["pederneira"]
        for arte, v in medias.items():
            if arte != "pederneira":
                conferir(abs(v / ref - 1) <= 0.15, f"{largura} px: cabeça média de {arte} {v:.1f} px, Pederneira {ref:.1f} px ({(v / ref - 1) * 100:+.0f}%)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--astro", type=int, required=True, help="porta do site publicado")
    ap.add_argument("--previa", type=int, help="porta do site com rascunhos (opcional)")
    ap.add_argument("--beira", type=int, help="porta de uma prévia feita numa CÓPIA do projeto em que a Beira de Estrada tem capítulo (opcional; ver o topo)")
    a = ap.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in ("pt", "en"):
            roteiro(browser, a.astro, lang)
        links(browser, a.astro, "publicado")
        tamanho_da_caixa(browser, a.astro, "publicado")
        caixa_separada(browser, a.astro, "publicado")
        if a.previa:
            previa(browser, a.previa)
            for lang in ("en", "pt"):  # T17l: em português, com o link para o inglês
                print(f"\n== Ossos do Ofício (prévia, {lang})")
                artes_novas(browser, a.previa, "ossos", lang)
            asas(browser, a.previa)
            cabecas(browser, a.previa)
            for lang in ("pt", "en"):  # T17d: a Beira de Estrada tem capítulos na prévia de verdade (o --beira ficou opcional)
                print(f"\n== Beira de Estrada ({lang}, prévia)")
                artes_novas(browser, a.previa, "beira", lang)
            links(browser, a.previa, "prévia")
            tamanho_da_caixa(browser, a.previa, "prévia")
            caixa_separada(browser, a.previa, "prévia")
        if a.beira:
            for lang in ("pt", "en"):
                print(f"\n== Beira de Estrada ({lang}, cópia com capítulo inventado)")
                artes_novas(browser, a.beira, "beira", lang)
            print("\n== Ossos do Ofício (cópia, em português: lá ele ganhou um capítulo em pt também)")
            artes_novas(browser, a.beira, "ossos", "en")
            tamanho_da_caixa(browser, a.beira, "cópia com a Beira de Estrada")
        browser.close()
    print("\nTudo certo." if not FALHAS else f"\n{len(FALHAS)} falha(s).")
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(main())
