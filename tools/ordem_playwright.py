#!/usr/bin/env python3
"""Teste, no navegador, do bloco "estou lendo em ordem…" (T17c) no fim dos capítulos do site Astro.

O que confere (em /pt/ e /en/, 1100 px e 390 px):
  1. sem nada guardado: abre na Cronológica, a lista de Lançamento está escondida, o seletor funciona;
  2. trocar no seletor mostra a outra lista, troca o nome e GUARDA a escolha (localStorage, chave hc-ordem-de-leitura);
     recarregar e abrir OUTRO capítulo já abre na ordem escolhida;
  3. pelo teclado (Tab até o seletor, setas) a troca também acontece;
  4. sem JavaScript: o bloco aparece, na Cronológica, e o seletor fica desligado (as duas listas estão no HTML);
  5. localStorage que dá erro (janela privada): o bloco funciona do mesmo jeito, só não lembra;
  6. mouse por cima: a 2ª imagem aparece e a arte cresce; com "reduzir movimento" a imagem troca mas não cresce;
  7. no celular (390 px) a página não ganha rolagem horizontal;
  8. com --previa: na prévia (rascunhos) a Beira de Estrada aparece depois da Pederneira na Cronológica.

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

    # 6: mouse por cima (Luz & Sangue tem as duas imagens; é o lado anterior na Cronológica da Pederneira)
    for reduzir in (False, True):
        ctx = novo_contexto(browser, 1100, reduced_motion="reduce" if reduzir else "no-preference")
        pg = ctx.new_page()
        abrir(pg, porta, ped)
        pg.evaluate("document.querySelectorAll('.so-img').forEach(i => { i.loading = 'eager' })")
        antes = pg.evaluate("""() => { const a = document.querySelector('.so-order:not([hidden]) .so-side.prev'); return { o2: +getComputedStyle(a.querySelector('.so-img-2')).opacity, t: getComputedStyle(a.querySelector('.so-art')).transform }; }""")
        pg.hover(".so-order:not([hidden]) .so-side.prev")
        pg.wait_for_timeout(700)
        depois = pg.evaluate("""() => { const a = document.querySelector('.so-order:not([hidden]) .so-side.prev'); return { o1: +getComputedStyle(a.querySelector('.so-img-1')).opacity, o2: +getComputedStyle(a.querySelector('.so-img-2')).opacity, t: getComputedStyle(a.querySelector('.so-art')).transform }; }""")
        nome = "movimento reduzido" if reduzir else "movimento normal"
        conferir(antes["o2"] == 0 and depois["o2"] == 1 and depois["o1"] == 0, f"{nome}: a 2ª imagem aparece e a 1ª some com o mouse por cima")
        cresceu = depois["t"] not in ("none", antes["t"])
        conferir(cresceu != reduzir, f"{nome}: a arte {'não cresce' if reduzir else 'cresce'} ({depois['t']})")
        ctx.close()

    # 7: celular
    ctx = novo_contexto(browser, 390)
    pg = ctx.new_page()
    for caminho in (ped, lb):
        abrir(pg, porta, caminho)
        e = pg.evaluate(ESTADO)
        conferir(e["rolagem"] <= e["largura"], f"390 px {caminho}: sem rolagem horizontal ({e['rolagem']} <= {e['largura']})")
    ctx.close()


def previa(browser, porta):
    print(f"\n== prévia com rascunhos (porta {porta})")
    ctx = novo_contexto(browser, 1100)
    pg = ctx.new_page()
    abrir(pg, porta, "/pt/works/firestriker/01/")
    texto = pg.locator('.so-order[data-ordem="chrono"] .so-side.next').text_content() or ""
    conferir("Beira de Estrada" in texto, f"prévia: na Cronológica, depois da Pederneira vem a Beira de Estrada ({texto.strip()!r})")
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
