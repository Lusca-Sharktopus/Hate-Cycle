#!/usr/bin/env python3
"""T08 — Referência do conteúdo, tirada do gerador Python, para os testes das coleções do Astro.

Uso (na raiz do repositório):
  python3 tools/frontmatter_ref.py                       # regrava tests/fixtures/conteudo-python.json
  python3 tools/frontmatter_ref.py --ver content/news/2023-08-18-orcs/en.md
                                                         # só imprime o que parse() lê de um arquivo

O que grava (tudo saído das funções de verdade do build.py, importado SEM gerar o site):
  1. "arquivos": parse(caminho) de TODOS os .md de content/ → {fm, body}, exatamente como o
     gerador lê (front matter pelo parser mínimo scalar()/parse(), não por YAML).
  2. "obras": json.loads() de todos os content/works/<obra>/work.json.
  3. "sinteticos": parse() de casos inventados que exercitam os cantos do parser (BOM, CRLF,
     dois-pontos sem aspas, aspas desencontradas, listas, comentários, espaços Unicode…).
     Cada caso é gravado num arquivo temporário (fora do projeto) e lido pelo parse() real.
  4. "publicado": o que o build() publica, com e sem rascunhos (DRAFTS False/True):
     itens de load_items()/load_works() por idioma, o `has` do menu e a lista de endereços que
     o build() escreveria. Para isso o build() roda com write()/shell() trocados por funções que
     só anotam (nada é escrito, nem public/ é criado).
O teste (tests/conteudo.test.ts, `pnpm test`) compara isso com src/lib/frontmatter.ts e
src/lib/leitor.ts + src/lib/visibilidade.ts. Por que um arquivo e não chamar o Python na hora
do teste: depois da virada (T20) o build.py sai da branch principal (mesmo motivo de runas_ref.py).

Atenção: a referência é uma FOTO do conteúdo. Mudou algo em content/ (notícia nova, rascunho…)?
Rode este script de novo antes do `pnpm test`.

Só biblioteca padrão. Não cria public/ nem __pycache__.
"""
import argparse, base64, contextlib, io, json, shutil, sys, tempfile
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  (só importar não gera nada: o build() roda apenas em `python build.py`)

SAIDA = ROOT / "tests" / "fixtures" / "conteudo-python.json"
SECOES = ("news", "universe", "characters", "pages", "emissaries")

# ───────── casos inventados para o parser (texto exato do arquivo; "﻿" no início = BOM) ─────────
SINTETICOS = {
    "simples": "---\ntitle: Olá\ndate: 2024-01-02\n---\n\nCorpo.\n",
    "dois-pontos-sem-aspas": "---\ntitle: Official Artwork: Orcs\nurl: https://x.com/a:b\n---\ncorpo",
    "aspas-duplas": '---\ntitle: "Entre aspas: sim"\n---\n',
    "aspas-simples": "---\ntitle: 'simples'\n---\n",
    "aspas-desencontradas": "---\na: \"abre e não fecha\nb: 'abre\" troca\nc: \"We're lost!\", shouted Harry.\nd: \"\ne: ''\nf: \"\"\n---\n",
    "aspas-com-espacos": "---\na:   \"  dentro  \"   \n---\n",
    "booleanos": "---\na: true\nb: False\nc: TRUE\nd: yes\ne: \"true\"\nf: true \ng: 1\n---\n",
    "vazio-e-espacos": "---\na:\nb:    \nc: \t\n---\n",
    "lista-inline": "---\ntags: [a, b , \"c\", 'd', \"e', ,  ]\nvazia: []\nso-virgula: [,]\nespacos: [  x  ]\n---\n",
    "lista-inline-com-booleano": "---\nl: [true, false, 1]\n---\n",
    "lista-com-tracos": "---\ntags:\n  - Post\n  - \"Arte: oficial\"\n  - true\n  - [x, y]\n  -\n  - 'q'\n---\n",
    "traco-substitui-valor": "---\nk: valor\n  - um\n  - dois\nbool: true\n - b\n---\n",
    "traco-sem-chave": "---\n  - solto\ntitle: x\n---\n",
    "traco-sem-recuo": "---\n- a\n-b\n---\n",
    "traco-com-tab": "---\nl:\n\t- tab\n \t-\tmisto\n---\n",
    "comentarios": "---\n# comentário\n   # recuado\ntitle: a # não é comentário\n#draft: true\n---\n",
    "sem-dois-pontos": "---\nlinha solta\n: sem chave\n---\n",
    "chave-repetida": "---\ntitle: um\ntitle: dois\nl: [a]\nl:\n  - b\n---\n",
    "lista-depois-de-inline": "---\nl: [a]\n  - b\n---\n",
    "sem-front-matter": "Só corpo.\n---\nnão é front matter\n",
    "front-matter-vazio": "---\n---\ncorpo\n",
    "front-matter-linha-vazia": "---\n\n---\ncorpo\n",
    "nao-fecha": "---\ntitle: x\ncorpo sem fechamento\n",
    "fecha-sem-quebra": "---\ntitle: x\n---",
    "fecha-com-texto-colado": "---\ntitle: x\n---abc\ncorpo",
    "fecha-com-quatro-tracos": "---\ntitle: x\n----\ncorpo",
    "divisor-no-corpo": "---\ntitle: x\n---\n\nParte 1\n\n---\n\nParte 2\n",
    "comeca-com-espaco": " ---\ntitle: x\n---\n",
    "bom": "﻿title-falso\n",
    "bom-com-front-matter": "﻿---\ntitle: com BOM\n---\ncorpo",
    "dois-boms": "﻿﻿---\ntitle: x\n---\n",
    "crlf": "---\r\ntitle: Windows\r\ntags:\r\n  - a\r\n---\r\n\r\ncorpo\r\nlinha 2\r\n",
    "cr-sozinho": "---\rtitle: Mac antigo\r---\rcorpo\r",
    "cr-duplo": "---\ntitle: x\r\r\n---\n",
    "espacos-unicode": "---\na: nbsp \nb: 　ideográfico　\nc: \x1cseparador\x1f\nd: \x85nel\x85\ne: ﻿bom-no-meio﻿\nf:  [ x , y ] \n - item-nbsp\n---\n",
    "espacos-unicode-lista": "---\nl:\n　- ideo\n\x85- nel\n﻿- bom\n---\n",
    "astral": "---\na: \"𝒜\"\nb: 𐤉\nc: \"𐤉\nd: [🦈, \"😀\"]\n---\n",
    "valor-com-tracos": "---\na: ---\nb: - x\n---\n",
    "chave-com-espacos": "---\n  recuada: sim\nchave com espaço: v\n---\n",
    "stickers": "---\nstickers:\n  - news/stickers/a.png | l3 t2 w26 a-4\n  - b.png|r4\n---\n",
    "corpo-com-crlf-e-tab": "---\nt: x\n---\n\tcorpo\r\n",
    "maiusculas": "---\nTitle: X\nDRAFT: TRUE\n---\n",
}
INVALIDOS = {   # bytes que não são UTF-8: o Python pára com erro, o TypeScript também tem de parar
    "utf8-invalido": b"---\ntitle: \xff\n---\n",
}


def casos_sinteticos():
    out = []
    with tempfile.TemporaryDirectory(prefix="hc-frontmatter-") as tmp:
        for nome, texto in SINTETICOS.items():
            p = Path(tmp) / f"{nome}.md"
            with open(p, "w", encoding="utf-8", newline="") as f:   # newline="": grava \r e \r\n como estão
                f.write(texto)
            fm, body = build.parse(p)
            out.append({"nome": nome, "texto": texto, "fm": fm, "body": body})
        for nome, dados in INVALIDOS.items():
            p = Path(tmp) / f"{nome}.md"
            p.write_bytes(dados)
            try:
                build.parse(p)
                erro = None
            except UnicodeDecodeError as e:
                erro = type(e).__name__
            out.append({"nome": nome, "bytes_b64": base64.b64encode(dados).decode(), "erro": erro})
    return out


def rel(p):
    return p.relative_to(build.CONTENT).as_posix()


def publicado(drafts):
    """O que o build() publica com DRAFTS = drafts, sem escrever nada em disco."""
    build.DRAFTS = drafts
    build.INDEX.clear()
    itens = {s: build.load_items(s) for s in SECOES}
    works = build.load_works()
    langs = build.LANGS
    hide = build.CFG.get("emissaries", {}).get("hide", [])
    res = {
        "itens": {s: {l: [i["slug"] for i in itens[s][l]] for l in langs} for s in SECOES},
        "emissarios_visiveis": {l: [i["slug"] for i in itens["emissaries"][l] if i["slug"] not in hide] for l in langs},
        "obras": [w["slug"] for w in works],
        "obras_listadas": {l: [w["slug"] for w in works if build.wlisted(w, l)] for l in langs},
        "capitulos": {l: [f'{w["slug"]}/{c["slug"]}' for w in works for c in w["chapters"][l]] for l in langs},
        "capitulos_ocultos": {l: [f'{w["slug"]}/{c["slug"]}' for w in works for c in w["hidden"][l]] for l in langs},
        "numeros": {l: {f'{w["slug"]}/{c["slug"]}': str(c["num"]) for w in works for c in w["chapters"][l] + w["hidden"][l]} for l in langs},
    }

    # build() de verdade, com as saídas trocadas por anotações
    urls, has = [], {}
    orig = (build.write, build.shell, build.clean_out, build.OUT, build.BASE, shutil.copytree, dict(build.SHORT))

    def anota_write(url, content):
        urls.append(url)

    def anota_shell(lang, title, main, alt, has=None, seed=None, **kw):
        if seed is not None and not anota_shell.visto:   # o 404 passa um `has` falso e não tem seed
            anota_shell.visto = True
            anota_shell.has = has
        return ""
    anota_shell.visto, anota_shell.has = False, None

    with tempfile.TemporaryDirectory(prefix="hc-build-") as tmp:
        build.write, build.shell, build.clean_out = anota_write, anota_shell, (lambda: None)
        build.OUT, build.BASE = Path(tmp) / "public", ""
        shutil.copytree = lambda *a, **k: None          # não copiar static/ (135 MB) para lugar nenhum
        try:
            build.INDEX.clear()
            with contextlib.redirect_stdout(io.StringIO()):   # cala o "✔ site gerado em…" (aqui nada é gerado)
                build.build()
        finally:
            build.write, build.shell, build.clean_out, build.OUT, build.BASE, shutil.copytree = orig[:6]
            build.SHORT.clear(); build.SHORT.update(orig[6])
    for l, h in (anota_shell.has or {}).items():
        has[l] = {**h, "extras": [list(x) for x in h["extras"]]}
    res["has"] = has
    res["urls"] = sorted(urls)
    res["index"] = sorted(f"{l}:{k}" for (l, k) in build.INDEX)
    build.DRAFTS = False
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ver", help="só imprime parse(ARQUIVO) e sai")
    a = ap.parse_args()
    if a.ver:
        fm, body = build.parse(Path(a.ver))
        print(json.dumps(fm, ensure_ascii=False, indent=2))
        print(f"--- corpo: {len(body)} caracteres")
        return
    arquivos = {}
    for p in sorted(build.CONTENT.rglob("*.md")):
        fm, body = build.parse(p)
        arquivos[rel(p)] = {"fm": fm, "body": body}
    obras = {p.parent.name: json.loads(p.read_text("utf-8")) for p in sorted(build.CONTENT.glob("works/*/work.json"))}
    dados = {
        "_leia": "Gerado por tools/frontmatter_ref.py a partir do build.py (parse, json.loads, load_items, load_works, build). "
                 "Não edite à mão: rode `python3 tools/frontmatter_ref.py` de novo. Usado por tests/conteudo.test.ts.",
        "python": sys.version.split()[0],
        "langs": build.LANGS,
        "config": {"show_extras": build.CFG.get("show_extras", True), "emissaries_hide": build.CFG.get("emissaries", {}).get("hide", [])},
        "arquivos": arquivos,
        "obras": obras,
        "sinteticos": casos_sinteticos(),
        "publicado": {"build": publicado(False), "previa": publicado(True)},
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", "utf-8")
    pb, pp = dados["publicado"]["build"], dados["publicado"]["previa"]
    print(f"✔ {len(arquivos)} .md, {len(obras)} work.json, {len(dados['sinteticos'])} casos inventados; "
          f"{len(pb['urls'])} endereços no build, {len(pp['urls'])} na prévia → {SAIDA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
