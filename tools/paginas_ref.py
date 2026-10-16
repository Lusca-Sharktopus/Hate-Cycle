#!/usr/bin/env python3
"""T11 — Referência das PÁGINAS do site, tirada do gerador Python, para os testes de paridade do Astro.

Uso (na raiz do repositório):
  python3 tools/paginas_ref.py            # regrava tests/fixtures/paginas-t11-python.json e componentes-python.json

O que grava (tudo saído do build.py de verdade, com BASE = "" como no Astro):
  1. tests/fixtures/paginas-t11-python.json — o HTML COMPLETO de cada página do grupo "t11" (home, Histórias, página de
     obra, em en e pt) do site de verdade, sem rascunhos. O tests/paginas.test.ts gera o site Astro (pnpm build) e compara,
     página a página, o <head>, o <main> (e o cabeçalho, o rodapé, as runas e a classe do <body>) com estes arquivos.
  2. tests/fixtures/componentes-python.json — o <main> final (depois do shell(): versalete e data-prev/data-next) das mesmas
     páginas e os três atalhos do SHORT ({{stories}}, {{other-stories}}, {{emissaries}}), para o conteúdo de verdade (com e
     sem rascunhos) e para os cenários inventados de tools/regras_ref.py (obra fora do universo, externa, sem capa, emissário
     com texto e sem foto, "Em breve"…). O tests/componentes.test.ts desenha os componentes do Astro com os mesmos dados e compara.

As próximas tarefas (T12–T14) acrescentam seus grupos em GRUPOS (um padrão de endereços cada) e rodam este script de novo.

Atenção: a referência é uma FOTO do conteúdo e do config.json. Mudou algo em content/ ou no config.json? Rode este script
de novo (junto com regras_ref.py) antes de `pnpm test`.

Só biblioteca padrão. Não cria public/ nem __pycache__. As chaves do Supabase do autor não são lidas nem gravadas (o config
usado nas capturas leva chaves de mentira, como em regras_ref.py).
"""
import contextlib, hashlib, io, json, re, shutil, sys
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import regras_ref as rr  # noqa: E402  (cenários inventados e o "ambiente" que aponta o build.py para outro content/)

# Cada tarefa de páginas acrescenta o seu grupo: nome → padrão dos endereços (url do page()).
GRUPOS = {
    "t11": re.compile(r"^/(en|pt)/(works/([^/]+/)?)?$"),     # home, Histórias, página de obra (NÃO os capítulos, que têm 4 níveis)
}
ESCOPO = re.compile("|".join(p.pattern for p in GRUPOS.values()))
SAIDA_PAGINAS = ROOT / "tests" / "fixtures" / "paginas-t11-python.json"
SAIDA_COMPONENTES = ROOT / "tests" / "fixtures" / "componentes-python.json"


def capturar(raiz, cfg_extra, rascunhos):
    """Roda o build() de verdade sobre a pasta content/ `raiz`. Devolve ({url: HTML completo}, {idioma: SHORT})
    só das páginas do ESCOPO. Nada é gravado em disco (write() só anota; static/ não é copiado)."""
    paginas = {}

    def anota(url, conteudo):
        if ESCOPO.match(url):
            paginas[url] = conteudo

    with rr.ambiente(raiz, cfg_extra, rascunhos):
        build.write, build.clean_out, build.OUT = anota, (lambda: None), Path("/nao-usado")
        shutil.copytree = lambda *a, **k: None
        with contextlib.redirect_stdout(io.StringIO()):
            build.build()
        short = {l: dict(build.SHORT[l]) for l in build.LANGS}
    return paginas, short


def main_final(html):
    """O miolo do <main> como o shell() o escreveu (já com versalete e data-prev/data-next)."""
    m = re.search(r'<main id="main"[^>]*>\n(.*)\n</main>', html, re.S)
    assert m, html[:300]
    return m.group(1)


def sha(arquivos):
    return hashlib.sha1(json.dumps(arquivos, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def main():
    ambientes = []
    paginas_reais = None
    for nome, raiz, cfg, arquivos in [("real", build.CONTENT, {}, None)] + [
            (n, None, c, f()) for n, f, c in rr.CENARIOS]:
        for rascunhos in (False, True):
            if arquivos is None:
                paginas, short = capturar(raiz, cfg, rascunhos)
                if not rascunhos:
                    paginas_reais = paginas
            else:
                import tempfile
                with tempfile.TemporaryDirectory(prefix="hc-paginas-") as tmp:
                    rr.gravar(tmp, arquivos)
                    paginas, short = capturar(tmp, cfg, rascunhos)
            ambientes.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                              "short": short, "mains": {u: main_final(h) for u, h in sorted(paginas.items())}})
    leia = ("Gerado por tools/paginas_ref.py a partir do build.py. Não edite à mão: rode `python3 tools/paginas_ref.py` de novo. "
            "Usado por tests/paginas.test.ts e tests/componentes.test.ts.")
    SAIDA_PAGINAS.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_PAGINAS.write_text(json.dumps({"_leia": leia, "python": sys.version.split()[0], "grupo": "t11", "escopo": GRUPOS["t11"].pattern,
                                         "paginas": dict(sorted(paginas_reais.items()))}, ensure_ascii=False, indent=1) + "\n", "utf-8")
    SAIDA_COMPONENTES.write_text(json.dumps({"_leia": leia, "python": sys.version.split()[0], "ambientes": ambientes}, ensure_ascii=False, indent=1) + "\n", "utf-8")
    n = sum(len(a["mains"]) for a in ambientes)
    print(f"✔ {len(paginas_reais)} páginas do grupo t11 → {SAIDA_PAGINAS.relative_to(ROOT)}; "
          f"{len(ambientes)} ambientes, {n} <main> → {SAIDA_COMPONENTES.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
