#!/usr/bin/env python3
"""Teste do seletor de Histórias (busca, tipo, ordem, sentido), Astro × Python, no navegador.

Roda o MESMO roteiro em /pt/works/ e /en/works/ do site Python (site.js) e do site Astro
(<script> de SeletorDeHistorias.astro) e compara, depois de cada passo:
  - a ORDEM dos cartões (data-title, na ordem do DOM);
  - a VISIBILIDADE de cada um (atributo hidden e style.display);
  - a mensagem "nenhum resultado" (visível ou não);
  - o botão de sentido (data-dir, title, aria-label) e o valor dos <select>;
  - o que ficou guardado no localStorage (chave hc-sort).
No fim de cada roteiro recarrega a página para provar que a escolha é lembrada.

Como usar (cada servidor sob timeout; nunca pkill):
  python3 -c "import build as b; b.BASE=''; b.OUT=...; b.build()"      # gera o site Python numa pasta
  timeout 300 python3 -m http.server 8791 -d <pasta do site Python> &
  pnpm build && timeout 300 python3 -m http.server 8792 -d dist &
  python3 tools/seletor_playwright.py --python 8791 --astro 8792

Sai com código 0 se tudo for idêntico, 1 se houver qualquer diferença (e imprime qual).
Só a biblioteca Playwright do Python (já instalada no sandbox; não rode `playwright install`).
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright

# O que se lê da página depois de cada passo. Roda dentro do navegador.
LER = """() => {
  const box = document.querySelector('.sorter');
  const grid = document.getElementById(box.dataset.grid);
  const none = grid.closest('.stories-block').querySelector('.no-results');
  const btn = box.querySelector('.sort-dir');
  const sel = box.querySelector('label:not(.media-filter) select');
  const media = box.querySelector('.media-select');
  const busca = box.querySelector('.story-search');
  let guardado = null;
  try { guardado = localStorage.getItem('hc-sort'); } catch (e) {}
  return {
    cartoes: Array.from(grid.children).map(c => ({
      titulo: c.dataset.title, hidden: c.hidden, display: c.style.display,
    })),
    nenhumResultado: none ? !none.hidden : null,
    botao: {dir: btn.dataset.dir, title: btn.title, aria: btn.getAttribute('aria-label')},
    ordem: sel.value, tipo: media ? media.value : null, busca: busca ? busca.value : null,
    guardado,
  };
}"""

PAGINAS = ["/pt/works/", "/en/works/"]


def roteiro(pg, estado0):
    """Lista de (nome do passo, função que executa o passo). Valores lidos do próprio HTML."""
    ordens = [o for o in estado0["ordens"]]
    tipos = [t for t in estado0["tipos"] if t]
    passos = []
    for o in ordens:  # cada ordem, crescente e depois decrescente
        passos.append((f"ordem={o} (crescente)", lambda o=o: pg.select_option(".sorter label:not(.media-filter) select", o)))
        passos.append((f"ordem={o} (decrescente)", lambda: pg.click(".sort-dir")))
        passos.append((f"ordem={o} (volta a crescente)", lambda: pg.click(".sort-dir")))
    for t in tipos:  # filtro de mídia, um por vez, e de volta a "todos"
        passos.append((f"tipo={t}", lambda t=t: pg.select_option(".media-select", t)))
    passos.append(("tipo=todos", lambda: pg.select_option(".media-select", "")))
    for q in estado0["buscas"]:
        passos.append((f"busca={q!r}", lambda q=q: pg.fill(".story-search", q)))
    passos.append(("busca vazia", lambda: pg.fill(".story-search", "")))
    # combinações: busca + tipo + ordem alfabética decrescente
    passos.append(("alfabética", lambda: pg.select_option(".sorter label:not(.media-filter) select", "alpha")))
    passos.append(("alfabética decrescente", lambda: pg.click(".sort-dir")))
    if tipos:
        passos.append((f"combinado: tipo={tipos[0]}", lambda: pg.select_option(".media-select", tipos[0])))
    passos.append(("combinado: busca 'a'", lambda: pg.fill(".story-search", "a")))
    passos.append(("combinado: busca sem resultado", lambda: pg.fill(".story-search", "qqqqq")))
    return passos


def rodar(browser, porta, caminho, relatorio):
    """Executa o roteiro numa página nova (localStorage limpo) e devolve a lista de fotos."""
    ctx = browser.new_context(viewport={"width": 1100, "height": 900}, reduced_motion="reduce")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="load")
    pg.wait_for_selector(".sorter")
    pg.wait_for_timeout(300)
    # busca com palavras REAIS: título inteiro, pedaço, acento e caixa diferentes
    titulos = pg.evaluate("() => Array.from(document.querySelectorAll('.work-card')).map(c => c.dataset.title)")
    buscas = []
    for t in titulos:
        buscas.append(t.upper())
        buscas.append(t[:3])
    buscas += ["residencia", "RESIDÊNCIA", "  luz  ", "qqqqq"]
    estado0 = pg.evaluate("""() => {
      const box = document.querySelector('.sorter');
      return {
        ordens: Array.from(box.querySelectorAll('label:not(.media-filter) select option')).map(o => o.value),
        tipos: Array.from(box.querySelectorAll('.media-select option')).map(o => o.value),
      };
    }""")
    estado0["buscas"] = buscas
    fotos = [("inicial", pg.evaluate(LER))]
    for nome, acao in roteiro(pg, estado0):
        acao()
        pg.wait_for_timeout(40)
        fotos.append((nome, pg.evaluate(LER)))
    # lembrar a escolha: recarrega (a busca e o tipo voltam ao padrão; a ordem e o sentido ficam)
    pg.reload(wait_until="load")
    pg.wait_for_selector(".sorter")
    pg.wait_for_timeout(300)
    fotos.append(("após recarregar", pg.evaluate(LER)))
    if erros:
        relatorio.append(f"  ERRO de JavaScript em :{porta}{caminho}: {erros}")
    ctx.close()
    return fotos, titulos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", type=int, default=8791, help="porta do site gerado pelo Python")
    ap.add_argument("--astro", type=int, default=8792, help="porta do site Astro (dist/)")
    ap.add_argument("--detalhes", action="store_true", help="imprime a ordem de cada passo")
    a = ap.parse_args()

    problemas, total_passos = [], 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for caminho in PAGINAS:
            lixo = []
            fotos_py, titulos_py = rodar(browser, a.python, caminho, lixo)
            fotos_as, titulos_as = rodar(browser, a.astro, caminho, lixo)
            problemas += lixo
            if len(fotos_py) != len(fotos_as):
                problemas.append(f"{caminho}: roteiros de tamanhos diferentes ({len(fotos_py)} × {len(fotos_as)})")
                continue
            # sanidade: o roteiro precisa mesmo ter exercitado algo
            visiveis = {len([c for c in f["cartoes"] if not c["hidden"]]) for _, f in fotos_py}
            if len(visiveis) < 3:
                problemas.append(f"{caminho}: roteiro pouco exigente (só viu {sorted(visiveis)} cartões visíveis)")
            if not any(f["nenhumResultado"] for _, f in fotos_py):
                problemas.append(f"{caminho}: o roteiro nunca chegou a 'nenhum resultado'")
            for (nome, fp), (_, fa) in zip(fotos_py, fotos_as):
                total_passos += 1
                if a.detalhes:
                    ordem = [c["titulo"] + ("" if not c["hidden"] else "(oculto)") for c in fp["cartoes"]]
                    print(f"{caminho} [{nome}] {ordem}")
                if fp != fa:
                    problemas.append(f"{caminho} [{nome}]\n    python: {json.dumps(fp, ensure_ascii=False)}\n    astro : {json.dumps(fa, ensure_ascii=False)}")
        browser.close()

    if problemas:
        print("DIFERENÇAS ENCONTRADAS:")
        print("\n".join(problemas))
        return 1
    print(f"OK: {total_passos} passos em {len(PAGINAS)} páginas, ordem e visibilidade idênticas (Astro × Python).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
