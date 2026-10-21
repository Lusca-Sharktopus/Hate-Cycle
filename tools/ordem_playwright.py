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
     com "reduzir movimento" nada se mexe nem gira (só o Thymorr aparece, de uma vez);
  7. no celular (390 px) a página não ganha rolagem horizontal e a arte em camadas cabe na coluna;
  8. nada de "Em breve" (T17h): em nenhuma ordem, nem na prévia; com --previa: Beira de Estrada e O Pêndulo (rascunhos sem capítulo)
     são puladas, e a Pederneira não tem história depois dela na Cronológica.

Como usar (servidores sob timeout; nunca pkill):
  pnpm build                      # site publicado em dist/
  timeout 300 python3 -m http.server 8791 -d dist &
  NODE_ENV=development HC_OUT_DIR=<pasta> pnpm build     # (opcional) a prévia com rascunhos
  timeout 300 python3 -m http.server 8792 -d <pasta> &
  python3 tools/ordem_playwright.py --astro 8791 [--previa 8792]

Sai com código 0 se tudo passar, 1 se algo falhar (e imprime o quê). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import sys

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
           left: parseFloat(c.left), top: parseFloat(c.top), w: parseFloat(c.width), rot: c.rotate === 'none' ? 0 : parseFloat(c.rotate), o: +c.opacity,
           dur: c.transitionDuration, curva: c.transitionTimingFunction, prop: c.transitionProperty };
})"""

# onde está cada arte: (página, ordem do seletor, lado)
ARTES = {
    "luz-e-sangue": ("/{lang}/works/firestriker/01/", "chrono", "prev"),
    "pederneira": ("/{lang}/works/light-and-blood/01/", "release", "prev"),
    "di-vario": ("/{lang}/works/firestriker/01/", "release", "prev"),
}


def medir(pg, porta, lang, arte, reduzir=False, teclado=False):
    """Camadas de uma arte antes e depois de mouse/teclado: (antes, depois)."""
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
    pg.wait_for_timeout(900)
    depois = pg.evaluate(LER_CAMADAS, seletor)
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
    a, d = medir(pg, porta, lang, "pederneira")
    conferir(all(abs(d[n][k] - a[n][k]) < 0.01 for n in ("Harry", "Olivia") for k in ("left", "top", "w", "rot", "o")), "movimento reduzido, Pederneira: Olivia e Harry ficam parados")
    conferir(a["Thymorr"]["o"] == 0 and d["Thymorr"]["o"] == 1 and d["Thymorr"]["dur"] in ("0s", "0.0s"), "movimento reduzido, Pederneira: o Thymorr aparece de uma vez (sem transição)")
    conferir(d["Thymorr"]["left"] > a["Thymorr"]["left"], "movimento reduzido, Pederneira: o Thymorr já aparece no lugar final (à direita)")
    ctx.close()


def previa(browser, porta):
    print(f"\n== prévia com rascunhos (porta {porta})")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, "/pt/works/firestriker/01/")
    conferir(pg.locator('.so-order[data-ordem="chrono"] .so-side.next').count() == 0, "prévia: na Cronológica, depois da Pederneira NÃO vem ninguém (Beira de Estrada e O Pêndulo, sem capítulo, são puladas)")
    texto = pg.locator("[data-story-order]").text_content() or ""
    conferir(all(x not in texto for x in ("Beira de Estrada", "Pêndulo", "Em breve")), "prévia: o bloco não fala de Beira de Estrada, de O Pêndulo nem de \"Em breve\"")
    ctx.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--astro", type=int, required=True, help="porta do site publicado")
    ap.add_argument("--previa", type=int, help="porta do site com rascunhos (opcional)")
    a = ap.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in ("pt", "en"):
            roteiro(browser, a.astro, lang)
        if a.previa:
            previa(browser, a.previa)
        browser.close()
    print("\nTudo certo." if not FALHAS else f"\n{len(FALHAS)} falha(s).")
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(main())
