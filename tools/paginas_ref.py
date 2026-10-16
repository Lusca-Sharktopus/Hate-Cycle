#!/usr/bin/env python3
"""T11/T12 — Referência das PÁGINAS do site, tirada do gerador Python, para os testes de paridade do Astro.

Uso (na raiz do repositório):
  python3 tools/paginas_ref.py            # regrava tests/fixtures/paginas-<grupo>-python.json e componentes-python.json

O que grava (tudo saído do build.py de verdade, com BASE = "" como no Astro):
  1. tests/fixtures/paginas-t11-python.json — o HTML COMPLETO de cada página do grupo "t11" (home, Histórias, página de
     obra, em en e pt) do site de verdade, sem rascunhos. O tests/paginas.test.ts gera o site Astro (pnpm build) e compara,
     página a página, o <head>, o <main> (e o cabeçalho, o rodapé, as runas e a classe do <body>) com estes arquivos.
  2. tests/fixtures/componentes-python.json — o <main> final (depois do shell(): versalete e data-prev/data-next) das mesmas
     páginas e os três atalhos do SHORT ({{stories}}, {{other-stories}}, {{emissaries}}), para o conteúdo de verdade (com e
     sem rascunhos) e para os cenários inventados de tools/regras_ref.py (obra fora do universo, externa, sem capa, emissário
     com texto e sem foto, "Em breve"…). O tests/componentes.test.ts desenha os componentes do Astro com os mesmos dados e compara.

  3. tests/fixtures/paginas-t12-python.json (T12, leitor de capítulos) — além das páginas reais do grupo (como o item 1),
     "ambientes": os capítulos dos sites INVENTADOS (os cenários de tools/regras_ref.py e os do leitor, abaixo: quadrinhos
     com pages/pages_glob, vídeo, prosa com fonte e divisor, oneshot com e sem logo, obra externa e escondida, rascunho,
     unlisted, comments: false, comentários sem chaves ou com chaves "sujas"), cada um em build e em prévia. De cada página:
     os argumentos que o build() passou ao shell() (título, links de idioma, classe do <body>, descrição, imagem, noindex)
     e o <main> final. O tests/leitor.test.ts recria cada site numa pasta temporária e compara.

As próximas tarefas (T13–T14) acrescentam seus grupos em GRUPOS (um padrão de endereços cada) e rodam este script de novo.

Chaves do Supabase: as capturas usam as chaves de mentira de regras_ref.py; nas páginas reais gravadas, os valores de
mentira são trocados por marcadores (MARCADORES, abaixo) — o teste troca as chaves de verdade do dist/ pelos mesmos
marcadores antes de comparar, sem nunca gravá-las.

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
    "t12": re.compile(r"^/(en|pt)/works/[^/]+/[^/]+/$"),     # capítulos (o leitor)
}
ESCOPO = re.compile("|".join(p.pattern for p in GRUPOS.values()))
FIXTURES = ROOT / "tests" / "fixtures"
SAIDA_COMPONENTES = FIXTURES / "componentes-python.json"
# as chaves de mentira de regras_ref.py, como aparecem no window.HC, → marcadores (o teste faz o mesmo com as de verdade)
MARCADORES = {f'"url": {json.dumps(rr.CHAVES_DE_MENTIRA["supabase_url"])}': '"url": "__SUPABASE_URL__"',
              f'"key": {json.dumps(rr.CHAVES_DE_MENTIRA["supabase_anon_key"])}': '"key": "__SUPABASE_ANON_KEY__"'}


@contextlib.contextmanager
def pasta_static(pasta):
    """Aponta o STATIC do build.py para outra pasta (os quadrinhos de mentira dos cenários do leitor), e volta."""
    salvo = build.STATIC
    if pasta is not None:
        build.STATIC = Path(pasta)
    try:
        yield
    finally:
        build.STATIC = salvo


def capturar(raiz, cfg_extra, rascunhos, static=None):
    """Roda o build() de verdade sobre a pasta content/ `raiz`. Devolve ({url: HTML completo}, {idioma: SHORT},
    {url: argumentos do shell()}) só das páginas do ESCOPO. Nada é gravado em disco (write() só anota; static/ não é copiado)."""
    paginas, shells = {}, {}

    def anota(url, conteudo):
        if ESCOPO.match(url):
            paginas[url] = conteudo

    with rr.ambiente(raiz, cfg_extra, rascunhos), pasta_static(static):
        shell_de_verdade = build.shell

        def anota_shell(lang, title, main, alt=None, cls="", desc="", image="", has=None, noindex=False, seed=""):
            shells[seed] = {"titulo": title, "alt": {k: v for k, v in (alt or {}).items() if k != "_self" and v},
                            "cls": cls, "desc": desc, "imagem": image, "noindex": noindex}
            return shell_de_verdade(lang, title, main, alt, cls, desc, image, has, noindex, seed)

        build.write, build.shell, build.clean_out, build.OUT = anota, anota_shell, (lambda: None), Path("/nao-usado")
        shutil.copytree = lambda *a, **k: None
        with contextlib.redirect_stdout(io.StringIO()):
            build.build()
        short = {l: dict(build.SHORT[l]) for l in build.LANGS}
    return paginas, short, {u: a for u, a in shells.items() if ESCOPO.match(u)}


def com_marcadores(html):
    for de, para in MARCADORES.items():
        html = html.replace(de, para)
    return html


# ═════════════════════════════ T12: sites inventados para o leitor ═════════════════════════════

def cenario_leitor():
    """Capítulos que o conteúdo de hoje não tem: quadrinhos (pages + pages_glob, ordem natural, pastas, ocultos, **),
    vídeo com e sem setas, prosa com fonte/divisor/logo e efeitos (sonho, carta, Giuseppe), oneshot com e sem logo,
    obra externa, escondida, só-pt, rascunho, unlisted, comments: false, títulos com & e < >, texto só com espaços."""
    md, wj, a = rr.md, rr.wj, {}
    def cap(obra, pasta, en=None, pt=None, corpo_en="", corpo_pt=None):
        if en is not None: a[f"works/{obra}/{pasta}/en.md"] = md(en, corpo_en)
        if pt is not None: a[f"works/{obra}/{pasta}/pt.md"] = md(pt, corpo_en if corpo_pt is None else corpo_pt)
    # ── quadrinho em capítulos, com logo (a 1ª folha fica escura; a logo é invertida) ──
    a["works/hq/work.json"] = wj(kind="comic", title={"en": "Comic Hᴀᴛᴇ Cʏᴄʟᴇ", "pt": "HQ Hᴀᴛᴇ Cʏᴄʟᴇ"}, logo={"en": "logos/hq en.png", "pt": "logos/hq.png"},
                                  cover="covers/hq.png", order={"release": 1}, media="webcomic")
    cap("hq", "01", dict(date="2026-01-01", title="Start & <end>", pages_glob="comics/hq/01/*.png"), dict(date="2026-01-01", pages_glob="comics/hq/01/*"),
        corpo_en="Author note with **bold** and Hᴀᴛᴇ Cʏᴄʟᴇ.\n\n---\n\nSecond part /ˈwɪθ/.", corpo_pt="Nota do autor.")
    cap("hq", "02", dict(date="2026-01-08", pages=["comics/hq/02/04.png", "https://exemplo.com/p.png"], pages_glob="comics/hq/02/[0-9].png"),
        dict(date="2026-01-08", pages=["comics/hq/02/04.png"]), corpo_en="   \n  ")
    cap("hq", "03", dict(date="2026-01-15", draft=True, pages_glob="comics/hq/**/*.png", comments=False), dict(date="2026-01-15", draft=True, pages_glob="comics/hq/0?/1*.png"))
    cap("hq", "04", dict(unlisted=True, title="Bonus", pages_glob="comics/hq/0[!1]/*"), dict(unlisted=True, title="Bônus", pages_glob="comics/hq/01/"))
    cap("hq", "05", dict(chapter="Extra", date="2026-02-01", pages_glob="comics/nao-existe/*.png"), dict(chapter="Extra", date="2026-02-01", pages_glob="comics/hq/01/?.png"), corpo_en="Last words.")
    # ── quadrinho de capítulo único, sem logo ──
    a["works/hq-unica/work.json"] = wj(kind="comic", oneshot=True, title="HQ Única", order={"release": 2})
    cap("hq-unica", "01", dict(date="2026-03-01", pages_glob="comics/u/**"), dict(date="2026-03-01", pages_glob="comics/u/*/*.png"), corpo_en="Nota.")
    # ── prosa com fonte de leitura, divisor e logo; efeitos do texto ──
    a["works/prosa/work.json"] = wj(kind="prose", reading_font="times", divider="other images/div.png", title={"en": "Prose Hᴀᴛᴇ Cʏᴄʟᴇ", "pt": "Prosa"},
                                     logo={"en": "logos/prosa.png"}, cover={"en": "covers/prosa en.png", "pt": "covers/prosa.png"}, order={"release": 3})
    efeitos = ("First paragraph, Hᴀᴛᴇ Cʏᴄʟᴇ.\nSecond line of the *same* paragraph.\n\n---\n\n"
               '<div class="s1 indent">Awake.</div>\n\n<div class="s1 mid gap">He closes his eyes<span class="ps"> and dreams…</span></div>\n\n'
               '<div class="s1 ps">The dream, Hᴀᴛᴇ Cʏᴄʟᴇ /ˈwɪθ/.</div>\n\n<img class="jusep" src="@/other images/Giuseppe.png" alt="Giuseppe">\n\n'
               '<div class="s1">Giuseppe opened his eyes.</div>\n\n'
               '<div class="flip-card"><div class="flip-card-inner"><div class="flip-card-front"><img src="/other images/letter-front.png" alt="letter"></div>'
               '<div class="flip-card-back"><img src="/other images/letter-back.png" alt="letter"></div></div></div>\n\n'
               '<div class="strip"><img src="@/other images/x.png" alt="x"><div class="strip-row"><img src="@/other images/y.png" alt="y"><p>Text</p></div></div>\n\n'
               "Fade: <span style=\"opacity:1.0\">a</span><span style=\"opacity:0.5\">b</span>\n\n![A figure](other images/fig.png)\n\nSee [[works/hq]] and [[works/nao-existe|nothing]].")
    cap("prosa", "01", dict(date="2026-04-01", title="One"), dict(date="2026-04-01", title="Um"), corpo_en=efeitos, corpo_pt="Texto em português.\n\n***\n\nFim.")
    cap("prosa", "02", dict(date="2026-04-02", chapter="2A", summary='"Quotes" & <tags>'), dict(date="2026-04-02", chapter="2A"), corpo_en="Two.")
    cap("prosa", "03", None, dict(date="2026-04-03", title="Só em português"), corpo_en="Três.")
    cap("prosa", "04", dict(date="2026-04-04", comments=False), dict(date="2026-04-04", comments=False), corpo_en="Sem comentários.")
    cap("prosa", "05", dict(date="2026-04-05", youtube="J2j6xoIz0LE"), dict(date="2026-04-05", youtube="J2j6xoIz0LE"), corpo_en="Prose work, video chapter.")
    # ── prosa de capítulo único, sem fonte, sem divisor, sem logo; posts incorporados com alternância ──
    a["works/conto/work.json"] = wj(kind="prose", oneshot=True, title={"en": "Short", "pt": "Conto"}, order={"release": 4})
    cap("conto", "01", dict(date="2026-05-01", summary="Resumo"), dict(date="2026-05-01"),
        corpo_en="Text.\n\n---\n\n{{embed:https://x.com/a/status/1 | https://www.instagram.com/p/abc/}}\n\nEnd.")
    # ── vídeo em episódios ──
    a["works/serie/work.json"] = wj(kind="video", title={"en": "Series", "pt": "Série"}, logo="logos/serie.png", cover="covers/serie.png", order={"release": 5})
    cap("serie", "01", dict(date="2026-06-01", youtube="AAAAAAAAAAA"), dict(date="2026-06-01", youtube="AAAAAAAAAAA"), corpo_en="Episode note with a [link](https://exemplo.com).")
    cap("serie", "02", dict(date="2026-06-08", youtube="BBBBBBBBBBB", title="The <second>"), dict(date="2026-06-08", youtube="BBBBBBBBBBB"))
    cap("serie", "03", dict(date="2026-06-15"), dict(date="2026-06-15"))
    cap("serie", "04", dict(date="2026-06-22", youtube="DDDDDDDDDDD", unlisted=True), dict(date="2026-06-22", youtube="DDDDDDDDDDD", unlisted=True))
    cap("serie", "05", dict(date="2026-06-29", youtube="EEEEEEEEEEE", draft=True), dict(date="2026-06-29", youtube="EEEEEEEEEEE", draft=True))
    # ── filme (kind "film", tratado como prosa, mas com youtube → vídeo) de capítulo único com logo: <h1> só para leitor de tela ──
    a["works/filme/work.json"] = wj(kind="film", oneshot=True, title="Filme", logo={"en": "logos/filme.png", "pt": "logos/filme.png"}, order={"release": 6})
    cap("filme", "01", dict(youtube="FFFFFFFFFFF", date="2026-07-01"), dict(youtube="FFFFFFFFFFF", date="2026-07-01"), corpo_en="Credits.")
    # ── obra com link para fora (o capítulo existe; o "voltar" aponta para a página da obra, que não existe) ──
    a["works/externa/work.json"] = wj(kind="prose", title="Externa", external="https://exemplo.com/x", logo="logos/externa.png", order={"release": 7})
    cap("externa", "01", dict(date="2026-08-01"), dict(date="2026-08-01"), corpo_en="Externa.")
    # ── obra escondida (listed: false) e obra só em português (langs) ──
    a["works/escondida/work.json"] = wj(kind="prose", listed=False, title="Escondida", order={"release": 8})
    cap("escondida", "01", dict(date="2026-09-01"), dict(date="2026-09-01"), corpo_en="Um.")
    cap("escondida", "02", dict(date="2026-09-02"), dict(date="2026-09-02"), corpo_en="Dois.")
    a["works/so-pt/work.json"] = wj(kind="prose", langs=["pt"], title="Só PT", order={"release": 9})
    cap("so-pt", "01", dict(date="2026-10-01"), dict(date="2026-10-01"), corpo_en="Texto.")
    return a


# os arquivos de static/ que os quadrinhos inventados usam (vazios: só o nome importa) — sem empates de nome entre pastas,
# porque nesse caso a ordem do Python depende do sistema de arquivos (ver src/lib/quadrinhos.ts)
ESTATICOS_DO_LEITOR = ["comics/hq/01/1.png", "comics/hq/01/2.png", "comics/hq/01/10.png", "comics/hq/01/.oculta.png", "comics/hq/01/A.PNG",
                       "comics/hq/01/b 3.png", "comics/hq/01/extra/9.png", "comics/hq/02/04.png", "comics/hq/02/5.png", "comics/hq/02/12.png",
                       "comics/u/x/7.png", "comics/u/y/8.png"]


def ui_dos_comentarios(cfg_ui, mexer):
    """Uma cópia do config.json → ui com só os textos c_* mexidos (os outros textos são os do site, que o Astro lê do config.json)."""
    import copy
    ui = copy.deepcopy(cfg_ui)
    mexer(ui)
    return ui


def mexer_textos(ui):
    ui["pt"]["c_title"] = ""                                  # vazio → o build.py usa o do inglês (T())
    ui["pt"].pop("c_login", None)                             # falta no pt → fica o do inglês
    ui["pt"]["c_so_pt"] = "Só em português"                   # chave só no pt → entra depois das do inglês
    ui["en"].pop("c_google", None)                            # falta no inglês → o padrão (COMMENT_UI_DEFAULTS) entra no fim
    ui["en"]["c_none"] = 'Nothing yet </script> "quoted" \\ \t tab'   # "</" vira "<\/" (não fecha o <script>)


def mexer_aviso(ui):
    ui["pt"]["c_not_configured"] = ""                         # vazio → o aviso sai em inglês


def ambientes_do_leitor():
    """(nome, arquivos, config extra, estáticos) dos sites inventados do leitor."""
    ui = build.CFG["ui"]
    arquivos = cenario_leitor()
    return [
        ("leitor", arquivos, {"comments": {"supabase_url": "  https://exemplo.supabase.co/rest/v1/  ", "supabase_anon_key": "  chave-de-mentira \n"},
                              "ui": ui_dos_comentarios(ui, mexer_textos)}),
        ("leitor-sem-chaves", arquivos, {"comments": {}}),
        ("leitor-so-url", arquivos, {"comments": {"supabase_url": "https://exemplo.supabase.co", "supabase_anon_key": ""}, "ui": ui_dos_comentarios(ui, mexer_aviso)}),
    ]


def main_final(html):
    """O miolo do <main> como o shell() o escreveu (já com versalete e data-prev/data-next)."""
    m = re.search(r'<main id="main"[^>]*>\n(.*)\n</main>', html, re.S)
    assert m, html[:300]
    return m.group(1)


def sha(arquivos):
    return hashlib.sha1(json.dumps(arquivos, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def capitulos_do_ambiente(paginas, shells):
    """Do que o build() escreveu: os capítulos (grupo t12), com os argumentos do shell() e o <main> final."""
    t12 = GRUPOS["t12"]
    return {u: {"shell": shells[u], "main": main_final(h)} for u, h in sorted(paginas.items()) if t12.match(u)}


def config_do_ambiente(cfg):
    """O que o teste precisa saber do config de um ambiente (o build.py junta o config.json com o cfg_extra, como em rr.ambiente)."""
    efetivo = dict(build.CFG, comments=dict(rr.CHAVES_DE_MENTIRA))
    efetivo.update(cfg)
    return {"show_extras": efetivo.get("show_extras", True), "comments": efetivo.get("comments", {}),
            "ui_c": {l: {k: v for k, v in efetivo["ui"].get(l, {}).items() if k.startswith("c_")} for l in efetivo["ui"]}}


def main():
    import tempfile
    ambientes, leitor = [], []
    paginas_reais = None
    t11 = GRUPOS["t11"]
    for nome, raiz, cfg, arquivos in [("real", build.CONTENT, {}, None)] + [
            (n, None, c, f()) for n, f, c in rr.CENARIOS]:
        for rascunhos in (False, True):
            if arquivos is None:
                paginas, short, shells = capturar(raiz, cfg, rascunhos)
                if not rascunhos:
                    paginas_reais = paginas
            else:
                with tempfile.TemporaryDirectory(prefix="hc-paginas-") as tmp:
                    rr.gravar(tmp, arquivos)
                    paginas, short, shells = capturar(tmp, cfg, rascunhos)
            ambientes.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                              "short": short, "mains": {u: main_final(h) for u, h in sorted(paginas.items()) if t11.match(u)}})
            leitor.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                           "config": config_do_ambiente(cfg), "capitulos": capitulos_do_ambiente(paginas, shells)})
    # os sites inventados do leitor: content/ e static/ de mentira (static/ com uma cópia do comments.js de verdade, para o carimbo ?v=)
    for nome, arquivos, cfg in ambientes_do_leitor():
        for rascunhos in (False, True):
            with tempfile.TemporaryDirectory(prefix="hc-leitor-") as tmp, tempfile.TemporaryDirectory(prefix="hc-leitor-static-") as st:
                rr.gravar(tmp, arquivos)
                for rel in ESTATICOS_DO_LEITOR:
                    (Path(st) / rel).parent.mkdir(parents=True, exist_ok=True)
                    (Path(st) / rel).write_bytes(b"")
                shutil.copyfile(build.STATIC / "comments.js", Path(st) / "comments.js")
                paginas, _short, shells = capturar(tmp, cfg, rascunhos, static=st)
            leitor.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos), "config": config_do_ambiente(cfg),
                           "capitulos": capitulos_do_ambiente(paginas, shells)})
    leia = ("Gerado por tools/paginas_ref.py a partir do build.py. Não edite à mão: rode `python3 tools/paginas_ref.py` de novo. "
            "Usado por tests/paginas.test.ts, tests/componentes.test.ts e tests/leitor.test.ts.")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    resumo = []
    for grupo, padrao in GRUPOS.items():
        doGrupo = {u: (com_marcadores(h) if grupo == "t12" else h) for u, h in sorted(paginas_reais.items()) if padrao.match(u)}
        dados = {"_leia": leia, "python": sys.version.split()[0], "grupo": grupo, "escopo": padrao.pattern, "paginas": doGrupo}
        if grupo == "t12":
            assert all("chave-de-mentira" not in h and "exemplo.supabase.co" not in h for h in doGrupo.values()), "sobrou chave de mentira"
            dados["marcadores"] = {"url": "__SUPABASE_URL__", "key": "__SUPABASE_ANON_KEY__"}
            dados["arquivos_do_leitor"] = cenario_leitor()
            dados["estaticos_do_leitor"] = ESTATICOS_DO_LEITOR
            dados["ambientes"] = leitor
        saida = FIXTURES / f"paginas-{grupo}-python.json"
        saida.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", "utf-8")
        resumo.append(f"{len(doGrupo)} páginas do grupo {grupo} → {saida.relative_to(ROOT)}")
    SAIDA_COMPONENTES.write_text(json.dumps({"_leia": leia, "python": sys.version.split()[0], "ambientes": ambientes}, ensure_ascii=False, indent=1) + "\n", "utf-8")
    n = sum(len(a["mains"]) for a in ambientes)
    caps = sum(len(a["capitulos"]) for a in leitor)
    print("✔ " + "; ".join(resumo) + f"; {len(ambientes)} ambientes, {n} <main> → {SAIDA_COMPONENTES.relative_to(ROOT)}; "
          f"leitor: {len(leitor)} ambientes, {caps} capítulos → tests/fixtures/paginas-t12-python.json")


if __name__ == "__main__":
    main()
