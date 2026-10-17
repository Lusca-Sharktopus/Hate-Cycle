#!/usr/bin/env python3
"""Teste da lista de Notícias (busca e páginas) e dos posts alternados (A | B), Astro × Python, no navegador.

Roda o MESMO roteiro em /pt/news/ e /en/news/ do site Python (static/site.js, bloco 6) e do site Astro (<script> de
src/components/ListaDeNoticias.astro) e compara, depois de cada passo:
  - quais notícias estão visíveis (títulos, na ordem do DOM) e quantas existem;
  - a mensagem "nenhuma notícia" (visível ou não);
  - a barra de páginas inteira: tag, classes, texto, href e aria-current de cada botão;
  - o texto da caixa de busca, o ?p= do endereço e o caminho (replaceState);
  - até onde a página rolou depois de um clique na barra (scrollIntoView).
O roteiro cobre: clicar em cada número, em "próximo ›" e "‹ anterior", ir até a última página (os "…"), buscas reais
(título, pedaço, acento e caixa diferentes, duas palavras, espaços sobrando, etiqueta, data, "nenhum resultado", letras de
versalete), busca depois de estar na página 3 (volta à 1), apagar a busca, abrir o endereço já com ?p= (3, 99, 0, abc, -2),
recarregar numa página e a lista com JavaScript DESLIGADO (o <noscript> mostra todas as notícias).
Depois testa os posts alternados: em TODA notícia que tem .embed-alt (a lista é descoberta no site Python e conferida no
Astro) clica em cada botão de cada caixa, e também aperta Enter no botão focado, e compara o estado (is-on, aria-pressed).

Como usar (cada servidor sob timeout; nunca pkill):
  python3 -c "import build as b; from pathlib import Path; b.BASE=''; b.OUT=Path('<pasta do site Python>'); b.build()"
  timeout 600 python3 -m http.server 8791 -d <pasta do site Python> &
  pnpm build && timeout 600 python3 -m http.server 8792 -d dist &
  python3 tools/noticias_playwright.py --python 8791 --astro 8792

Sai com código 0 se tudo for idêntico, 1 se houver qualquer diferença (e imprime qual).
Só a biblioteca Playwright do Python (já instalada no sandbox; não rode `playwright install`). Só localhost: qualquer outro
endereço (fontes do Google, supabase-js, scripts dos posts do X/Instagram/Reddit) é bloqueado.
"""
import argparse
import json
import re
import sys
import urllib.request

from playwright.sync_api import sync_playwright

PAGINAS = ["/pt/news/", "/en/news/"]

# O que se lê da lista depois de cada passo. Roda dentro do navegador.
LER_LISTA = """() => {
  const itens = Array.from(document.querySelectorAll('.news-item'));
  const barra = document.querySelector('.pagination');
  const campo = document.querySelector('.news-search');
  return {
    total: itens.length,
    visiveis: itens.filter(i => !i.hidden).map(i => i.querySelector('h2').textContent),
    nenhuma: !document.querySelector('.news-none').hidden,
    barra: Array.from(barra.children).map(c => ({tag: c.tagName, classe: c.className, texto: c.textContent, href: c.getAttribute('href'), atual: c.getAttribute('aria-current')})),
    busca: campo.value, search: location.search, caminho: location.pathname, rolou: Math.round(window.scrollY), topoDaLista: Math.round(document.querySelector('.news-list').getBoundingClientRect().top),
  };
}"""

# O estado dos posts alternados: o de cada caixa .embed-alt.
LER_POSTS = """() => Array.from(document.querySelectorAll('.embed-alt')).map(caixa => ({
  botoes: Array.from(caixa.querySelectorAll('.embed-btn')).map(b => ({classe: b.className, pressionado: b.getAttribute('aria-pressed'), rotulo: b.getAttribute('aria-label')})),
  paineis: Array.from(caixa.querySelectorAll('.embed-panel')).map(p => ({classe: p.className, visivel: getComputedStyle(p).display !== 'none'})),
}))"""


def diferencas(a, b):
    """Só o que difere entre dois estados (dicionários): campo → (python, astro), cortado para caber numa linha."""
    corta = lambda v: (json.dumps(v, ensure_ascii=False)[:300] + "…") if len(json.dumps(v, ensure_ascii=False)) > 300 else json.dumps(v, ensure_ascii=False)
    if not (isinstance(a, dict) and isinstance(b, dict)):
        return f"python: {corta(a)}\n    astro : {corta(b)}"
    return "\n".join(f"    {k}: python {corta(a.get(k))} | astro {corta(b.get(k))}" for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k))


def so_localhost(rota):
    """Bloqueia tudo o que não é do próprio servidor local (fontes, supabase-js, scripts de redes sociais)."""
    if rota.request.url.startswith("http://localhost"):
        rota.continue_()
    else:
        rota.abort()


def nova_pagina(browser, porta, caminho, js=True):
    ctx = browser.new_context(viewport={"width": 1100, "height": 900}, reduced_motion="reduce", java_script_enabled=js)
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/*", so_localhost)
    pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="load")
    pg.wait_for_timeout(300)
    return ctx, pg, erros


def esperar_rolagem(pg):
    """A rolagem de scrollIntoView({behavior: 'smooth'}) leva um tempo: espera até a posição parar (duas leituras iguais)."""
    antes = None
    for _ in range(60):
        agora = pg.evaluate("window.scrollY")
        if agora == antes:
            return
        antes = agora
        pg.wait_for_timeout(120)


def passos_da_lista(pg, estado0):
    """(nome, ação) do roteiro. Os rótulos dos botões são lidos do próprio HTML (funciona em pt e en)."""
    total = estado0["total"]
    paginas = max(1, -(-total // 10))
    pg_next = pg.evaluate("document.querySelector('.pagination').dataset.next")
    pg_prev = pg.evaluate("document.querySelector('.pagination').dataset.prev")
    clique = lambda texto: (lambda: pg.click(f".pagination a:text-is({json.dumps(texto, ensure_ascii=False)})"))
    passos = []
    for n in range(2, paginas + 1):
        passos.append((f"clica na página {n}", clique(str(n))))
    passos.append(("clica em '‹ anterior'", clique("‹ " + pg_prev)))
    passos.append(("clica na página 1", clique("1")))
    passos.append(("clica em 'próximo ›'", clique(pg_next + " ›")))
    passos.append(("clica em 'próximo ›' de novo", clique(pg_next + " ›")))
    passos.append((f"clica na última ({paginas})", clique(str(paginas))))
    passos.append(("clica na página 1 (volta)", clique("1")))
    # buscas com palavras REAIS do site: título, pedaço, acento e caixa diferentes
    titulos = estado0["titulos"]
    buscas = ["luz", "LUZ E SANGUE", "pederneira", "  pederneira   ", "cafeina", "cafeína", "residencia", "RESIDÊNCIA", "dragao", "dragões",
              "nova obra", "2024", "orcs", "hate", "Hᴀᴛᴇ", "qqqqq", "a", "e", "o"]
    for t in titulos[:6]:
        buscas += [t.upper(), t[:4]]
    for q in buscas:
        passos.append((f"busca {q!r}", lambda q=q: pg.fill(".news-search", q)))
    # buscar estando numa página adiante: volta para a 1
    passos.append(("busca vazia", lambda: pg.fill(".news-search", "")))
    passos.append(("vai à página 3", clique("3")))
    passos.append(("busca 'a' estando na página 3", lambda: pg.fill(".news-search", "a")))
    passos.append(("na busca 'a', vai à página 2", clique("2")))
    passos.append(("busca sem resultado estando na página 2", lambda: pg.fill(".news-search", "qqqqq")))
    passos.append(("apaga a busca", lambda: pg.fill(".news-search", "")))
    return passos


def rodar_lista(browser, porta, caminho, relatorio):
    ctx, pg, erros = nova_pagina(browser, porta, caminho)
    pg.wait_for_selector(".news-item")
    titulos = pg.evaluate("Array.from(document.querySelectorAll('.news-item h2')).map(h => h.textContent)")
    estado0 = {"total": pg.evaluate("document.querySelectorAll('.news-item').length"), "titulos": titulos}
    fotos = [("inicial", pg.evaluate(LER_LISTA))]
    for nome, acao in passos_da_lista(pg, estado0):
        acao()
        pg.wait_for_timeout(100)
        esperar_rolagem(pg)
        fotos.append((nome, pg.evaluate(LER_LISTA)))
    # recarregar numa página que não é a 1 (o endereço guarda o ?p= depois do replaceState)
    pg.click(".pagination a:text-is('3')")
    pg.wait_for_timeout(100)
    esperar_rolagem(pg)
    pg.reload(wait_until="load")
    pg.wait_for_timeout(300)
    esperar_rolagem(pg)
    fotos.append(("recarrega na página 3", pg.evaluate(LER_LISTA)))
    ctx.close()
    # abrir o endereço já com ?p=
    for pedido in ["?p=3", "?p=99", "?p=0", "?p=abc", "?p=-2", "?p=2x", "?outro=1", "?p="]:
        ctx, pg2, erros2 = nova_pagina(browser, porta, caminho + pedido)
        fotos.append((f"abre {pedido}", pg2.evaluate(LER_LISTA)))
        erros += erros2
        ctx.close()
    # sem JavaScript: o <noscript> mostra todas as notícias (sem barra, sem busca funcionando)
    ctx, pg3, _ = nova_pagina(browser, porta, caminho, js=False)
    fotos.append(("sem JavaScript", pg3.evaluate("""() => ({
      visiveis: Array.from(document.querySelectorAll('.news-item')).filter(i => getComputedStyle(i).display !== 'none').length,
      barra: document.querySelector('.pagination').children.length,
      nenhuma: getComputedStyle(document.querySelector('.news-none')).display !== 'none',
    })""")))
    ctx.close()
    if erros:
        relatorio.append(f"  ERRO de JavaScript em :{porta}{caminho}: {erros}")
    return fotos, titulos


def noticias_com_posts(porta):
    """Os endereços de notícia que têm .embed-alt: lidos do HTML servido (sem navegador)."""
    achadas = []
    for lista in PAGINAS:
        html = urllib.request.urlopen(f"http://localhost:{porta}{lista}").read().decode("utf-8")
        for href in re.findall(r'<a class="more" href="([^"]+)"', html):
            pagina = urllib.request.urlopen(f"http://localhost:{porta}{href}").read().decode("utf-8")
            if 'class="embed-alt"' in pagina:
                achadas.append(href)
    return achadas


def rodar_posts(browser, porta, caminho, relatorio):
    ctx, pg, erros = nova_pagina(browser, porta, caminho)
    fotos = [("inicial", pg.evaluate(LER_POSTS))]
    caixas = pg.evaluate("document.querySelectorAll('.embed-alt').length")
    for i in range(caixas):
        botoes = pg.evaluate(f"document.querySelectorAll('.embed-alt')[{i}].querySelectorAll('.embed-btn').length")
        for j in range(botoes):
            sel = f".embed-alt >> nth={i} >> .embed-btn >> nth={j}"
            pg.click(sel)
            fotos.append((f"caixa {i} clica no botão {j}", pg.evaluate(LER_POSTS)))
        pg.click(f".embed-alt >> nth={i} >> .embed-btn >> nth=0")
        pg.focus(f".embed-alt >> nth={i} >> .embed-btn >> nth={botoes - 1}")
        pg.keyboard.press("Enter")
        fotos.append((f"caixa {i} Enter no último botão", pg.evaluate(LER_POSTS)))
        pg.click(f".embed-alt >> nth={i} >> .embed-btn >> nth={botoes - 1}")  # clicar no que já está ligado não muda nada
        fotos.append((f"caixa {i} clica de novo no último", pg.evaluate(LER_POSTS)))
    if erros:
        relatorio.append(f"  ERRO de JavaScript em :{porta}{caminho}: {erros}")
    ctx.close()
    return fotos, caixas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", type=int, default=8791, help="porta do site gerado pelo Python")
    ap.add_argument("--astro", type=int, default=8792, help="porta do site Astro (dist/)")
    ap.add_argument("--detalhes", action="store_true", help="imprime o que cada passo mostrou")
    a = ap.parse_args()

    problemas, passos_lista, passos_posts = [], 0, 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for caminho in PAGINAS:
            fotos_py, tit_py = rodar_lista(browser, a.python, caminho, problemas)
            fotos_as, tit_as = rodar_lista(browser, a.astro, caminho, problemas)
            if tit_py != tit_as:
                problemas.append(f"{caminho}: os títulos da lista são diferentes nos dois sites")
            if len(fotos_py) != len(fotos_as):
                problemas.append(f"{caminho}: roteiros de tamanhos diferentes ({len(fotos_py)} × {len(fotos_as)})")
                continue
            # sanidade: o roteiro precisa mesmo ter exercitado a lista
            vistos = {len(f["visiveis"]) for _, f in fotos_py if "visiveis" in f and isinstance(f["visiveis"], list)}
            if len(vistos) < 4:
                problemas.append(f"{caminho}: roteiro pouco exigente (só viu {sorted(vistos)} notícias visíveis de cada vez)")
            if not any(f.get("nenhuma") for _, f in fotos_py):
                problemas.append(f"{caminho}: o roteiro nunca chegou a 'nenhuma notícia'")
            if not any(any(b["classe"] == "pg-gap" for b in f.get("barra", [])) for _, f in fotos_py if isinstance(f.get("barra"), list)):
                problemas.append(f"{caminho}: o roteiro nunca viu as reticências '…' da barra")
            for (nome, fp), (_, fa) in zip(fotos_py, fotos_as):
                passos_lista += 1
                if a.detalhes:
                    resumo = fp if "visiveis" not in fp or not isinstance(fp["visiveis"], list) else {"visiveis": len(fp["visiveis"]), "primeira": (fp["visiveis"] or [None])[0], "search": fp["search"], "busca": fp["busca"],
                                                                                                           "barra": " ".join(b["texto"] for b in fp["barra"]), "nenhuma": fp["nenhuma"]}
                    print(f"{caminho} [{nome}] {json.dumps(resumo, ensure_ascii=False)}")
                if fp != fa:
                    problemas.append(f"{caminho} [{nome}]\n{diferencas(fp, fa)}")

        com_posts_py, com_posts_as = noticias_com_posts(a.python), noticias_com_posts(a.astro)
        if com_posts_py != com_posts_as:
            problemas.append(f"notícias com .embed-alt diferentes: python {len(com_posts_py)}, astro {len(com_posts_as)}")
        if not com_posts_py:
            problemas.append("nenhuma notícia com .embed-alt: o roteiro dos posts não exercitou nada")
        caixas_total = 0
        for caminho in com_posts_py:
            fotos_py, caixas = rodar_posts(browser, a.python, caminho, problemas)
            fotos_as, _ = rodar_posts(browser, a.astro, caminho, problemas)
            caixas_total += caixas
            if len(fotos_py) != len(fotos_as):
                problemas.append(f"{caminho}: roteiros de tamanhos diferentes ({len(fotos_py)} × {len(fotos_as)})")
                continue
            if len({json.dumps(f) for _, f in fotos_py}) < 2:
                problemas.append(f"{caminho}: os cliques nunca mudaram nada")
            for (nome, fp), (_, fa) in zip(fotos_py, fotos_as):
                passos_posts += 1
                if fp != fa:
                    problemas.append(f"{caminho} [{nome}]\n{diferencas(fp, fa)}")
        browser.close()

    if problemas:
        print("DIFERENÇAS ENCONTRADAS:")
        print("\n".join(problemas))
        return 1
    print(f"OK: lista — {passos_lista} passos em {len(PAGINAS)} páginas (visíveis, barra, busca, ?p= e rolagem idênticos); "
          f"posts alternados — {passos_posts} passos em {len(com_posts_py)} notícias ({caixas_total} caixas). Astro × Python idênticos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
