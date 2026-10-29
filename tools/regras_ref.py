#!/usr/bin/env python3
"""T10 — Referência das REGRAS do site (dados, ordem, datas, resumos), tirada do gerador Python, para os testes do Astro.

Uso (na raiz do repositório):
  python3 tools/regras_ref.py            # regrava tests/fixtures/regras-python.json

O que grava (tudo saído do build.py de verdade, importado SEM gerar o site, com BASE = "" como no Astro):
  1. "tabelas": chamadas diretas às funções do Python — tr(), fmt_date(), _near() (a função de dentro do build(), pega pelo
     código dela, sem reescrever), a data do RSS, excerpt()/plain() — e os dados MEDIA_LABELS/MEDIA_UI/NETWORKS.
     Entradas: casos inventados para cada canto da regra + todos os corpos de content/.
  2. "real": o conteúdo de verdade, com e sem rascunhos (build e prévia). Roda o build() DE VERDADE, com write()/shell()
     trocados por funções que só anotam. Quando o shell() é chamado para a home, olha dentro do build() (sys._getframe) e
     copia o estado que ele tem naquele instante — listas de obras, "últimas atualizações" já fundidas, notícias, emissários…
     (é assim que se captura uma regra que está no meio do build(), em vez de reescrevê-la). Cada página que o build()
     escreveria também é anotada: título, descrição, imagem, noindex, links de idioma (alt) e o que dá para ler do HTML
     (anterior/próximo, datas, lista de capítulos, ID dos comentários…). Cartões, seletor e emissários vêm de card_work(),
     sorter_html() e card_emissary() chamados de verdade.
  3. "cenarios": o mesmo, para conteúdo INVENTADO (gravado aqui e recriado pelo teste numa pasta temporária) que exercita o
     que o conteúdo de hoje não exercita: obra fora do universo, obra externa, notícia e capítulo a 0/3/4 dias (para os dois
     lados), virada de ano e ano bissexto, empates de data, notícia sem data, emissário escondido, título vazio…
O teste (tests/regras.test.ts, `pnpm test`) compara tudo com src/lib/{datas,resumos,obras,capitulos,noticias,atualizacoes,
emissarios,extras,alternativas,home}.ts, sem normalização. Por que um arquivo e não chamar o Python na hora do teste: depois
da virada (T20) o build.py sai da branch principal (mesmo motivo de runas_ref.py, frontmatter_ref.py e markdown_ref.py).

Atenção: a referência é uma FOTO do conteúdo. Mudou algo em content/ (notícia, capítulo, work.json, config.json)?
Rode este script de novo antes do `pnpm test` (junto com frontmatter_ref.py e markdown_ref.py).

Determinismo: nenhuma regra daqui depende de "hoje" (o único uso do relógio no build.py é o ano do rodapé e a data dos
arquivos criados por `python build.py new`, e nenhum dos dois entra nesta referência). Rodar duas vezes dá o mesmo arquivo.
As chaves do Supabase do autor NÃO são lidas nem gravadas: o config usado nos capturas leva chaves de mentira.

Só biblioteca padrão. Não cria public/ nem __pycache__.
"""
import contextlib, copy, hashlib, html, io, json, re, shutil, sys, tempfile, types
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  (só importar não gera nada: o build() roda apenas em `python build.py`)

SAIDA = ROOT / "tests" / "fixtures" / "regras-python.json"
build.BASE = ""      # o Astro fica na raiz do domínio, sem base_url (hoje o do config.json ainda tem o bug B1)
U = html.unescape
LANGS = build.LANGS

CHAVES_DE_MENTIRA = {"supabase_url": "https://exemplo.supabase.co", "supabase_anon_key": "chave-de-mentira"}


# ═════════════════════════════ 1. funções chamadas direto ═════════════════════════════

def pegar_near():
    """_near() é uma função DENTRO do build(). Pega o código dela (a constante de código do build) e cria a função com os
    mesmos globais: é o código de verdade, sem reescrever."""
    codigo = next(c for c in build.build.__code__.co_consts if isinstance(c, types.CodeType) and c.co_name == "_near")
    return types.FunctionType(codigo, vars(build))


def data_do_rss(d):
    """As linhas do RSS (build.py, linha ~929), tais como estão:
        dt = format_datetime(datetime.datetime.strptime(i["date"][:10], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc))
    com `except ValueError: continue` em volta. Devolve a data, ou None quando o Python pula o item."""
    try:
        return build.format_datetime(build.datetime.datetime.strptime(d[:10], "%Y-%m-%d").replace(tzinfo=build.datetime.timezone.utc))
    except ValueError:
        return None


TR_VALORES = [
    "texto", "", None, {}, {"en": "Inglês", "pt": "Português"}, {"en": "Só EN"}, {"pt": "Só PT"}, {"pt": "Só PT", "en": ""},
    {"en": "", "pt": "Só PT"}, {"en": "", "pt": ""}, {"pt": "", "en": ""}, {"pt": "", "en": "EN"}, {"en": "EN", "pt": ""},
    {"pt": "A", "en": "B"}, {"en": "x"}, {"pt": "x", "en": "y", "es": "z"}, {"es": "z"}, {"es": ""},
]
TR_PADROES = ["", "padrão"]

DATAS_FMT = [
    "2025-12-25", "2026-01-01", "2024-02-29", "2023-12-31", "2024-01-31", "2024-03-05", "2024-04-30", "2024-05-09", "2024-06-13",
    "2024-07-25", "2024-08-18", "2024-09-01", "2024-10-28", "2024-11-04", "2024-12-01", "2024-1-5", "2024-01-05", "2024-12-9",
    "2024-00-10", "2024-13-01", "2024-13-45", "2024-02-30", "", "abc", "2024", "2024-05", "2024-05-09-extra", "2024-05-09T10:00",
    "2024-05-xx", " 2024 - 05 - 09 ", "2024-+5-09", "2024--5-09", "-05-09", "2024-05-", "2024-5-9", "20240509", "0000-01-01",
    "2024-01-01 ", "x-y-z", "2024-0-5", "2024-12-0", "10000-01-01",
]

DATAS_PERTO = [
    ("2026-01-05", "2026-01-05"), ("2026-01-05", "2026-01-08"), ("2026-01-05", "2026-01-09"), ("2026-01-08", "2026-01-05"),
    ("2026-01-09", "2026-01-05"), ("2025-12-31", "2026-01-02"), ("2025-12-29", "2026-01-01"), ("2025-12-28", "2026-01-01"),
    ("2024-02-28", "2024-03-02"), ("2024-02-28", "2024-03-03"), ("2023-02-28", "2023-03-03"), ("2023-02-28", "2023-03-04"),
    ("2024-03-02", "2024-02-28"), ("2024-12-30", "2025-01-02"), ("2024-12-30", "2025-01-03"), ("", ""), ("", "2026-01-05"),
    ("2026-01-05", ""), ("2026-02-30", "2026-03-01"), ("2026-13-01", "2026-12-31"), ("abc", "abc"), ("2026-1-5", "2026-1-6"),
    ("2026-01-05T10:00", "2026-01-06"), ("2026-01-05 10:00", "2026-01-06"), ("2026-01-05extra", "2026-01-06"),
    ("0001-01-01", "0001-01-02"), ("9999-12-30", "9999-12-31"), ("2000-02-29", "2000-03-03"), ("1900-02-28", "1900-03-03"),
    ("1900-02-28", "1900-03-04"), ("2100-02-28", "2100-03-03"),
]

DATAS_RSS = [
    "2025-12-25", "2024-02-29", "2026-01-01", "2023-12-31", "2024-1-5", "2024-01- 5", "2024-1-5x", "20240105", "", "2024-13-01",
    "2024-02-30", "2024-05-09T10:00", "0100-01-01", "0001-01-01", "0000-01-01", "9999-12-31", "2024-05-09 extra", "abc", "2024-05-0",
    "2024-5-32", "2024-05-31", "2024-04-31", "2000-02-29", "1900-02-29",
]

# Textos para excerpt()/plain(): (nome, texto). Um ou mais por expressão regular e por ramo do corte.
LONGO = "palavra " * 40
EXCERPT_CASOS = [
    ("vazio", ""), ("so-espacos", " \n\t  "), ("curto", "Um texto curto."), ("exato-130", "a" * 130), ("131-sem-espaco", "a" * 131),
    ("130-com-espaco-no-fim", ("abcd " * 26).strip()), ("longo", LONGO), ("longo-corta-no-meio-de-palavra", ("abcdefghi " * 14) + "jklmnopq"),
    ("corta-no-espaco", "x" * 129 + " yyyy"), ("corta-depois-de-virgula", ("palavra, " * 14) + "outra, coisa, mais"),
    ("pontuacao-no-fim-do-corte", ("palavra " * 15).strip() + " ... ,;:.- depois do corte longo longo longo longo"),
    ("so-pontuacao-antes-do-corte", "a " + "." * 150), ("tracos-no-corte", "palavra-" * 20),
    ("astral-na-fronteira", "😀" * 129 + " fim do texto aqui"), ("astral-130", "😀" * 130), ("astral-131", "😀" * 131),
    ("astral-e-espaco", ("😀 " * 70).strip()), ("acentos", ("ação " * 40)), ("nbsp-e-unicode", "um dois três　quatro\x85cinco"),
    ("embed-simples", "{{embed:https://x.com/a/status/1}} Texto depois."), ("embed-nome", "Antes {{embed:post-x}} depois {{stories}} fim"),
    ("embed-multilinha", "{{embed:a\nb}} resto"), ("chave-aberta", "{{ sem fechar e {{outra}} fim"),
    ("html-script", "Antes <script>var x = 1;</script> depois"), ("html-blockquote", "<blockquote class=\"x\"><a href=\"u\">dentro</a></blockquote>Fora"),
    ("html-iframe", "<iframe src=\"u\"></iframe>texto"), ("html-div-aninhado", "<div><div>interno</div> resto do externo</div> fim"),
    ("html-figure", "<figure><img src=\"a.png\"></figure>Legenda"), ("html-style", "<style>p {color: red}</style>Texto"),
    ("html-sem-fechar", "<div>sem fechar mas texto"), ("html-script-sem-fechar", "<script>sem fechar"), ("html-maiusculo", "<DIV>caixa alta</DIV> fim"),
    ("html-divx", "<divx>não é div</divx> fim"), ("html-div-acentuado", "<divé>x</divé> fim"), ("html-div-underscore", "<div_x>y</div_x>"),
    ("html-div-com-atributo", "<div class=\"a\">dentro</div> fora"), ("html-outras-tags", "um <b>negrito</b> e <i>itálico</i> e <br> fim"),
    ("html-img", "texto <img src=\"a.png\" alt=\"x\"> fim"), ("html-comentario", "a <!-- comentário --> b"), ("html-menor-que", "1 < 2 e 3 > 2"),
    ("link-wiki", "Veja [[works/firestriker]] e [[universe/hidden-magic]] agora"), ("link-wiki-rotulo", "Veja [[works/firestriker|o conto]] agora"),
    ("link-wiki-rotulo-vazio", "Veja [[a|]] [[|b]] [[]] fim"), ("link-wiki-barra-no-fim", "[[works/x/]] fim"),
    ("link-wiki-duplo", "[[a/b/c]] [[d]] [[e|f|g]]"), ("md-link", "Leia [o conto](https://x.com/a) hoje"), ("md-imagem", "Olhe ![a imagem](a.png) aqui"),
    ("md-imagem-vazia", "![](a.png) e [](b) fim"), ("md-link-parenteses", "[a](b(c)) fim"), ("md-sinais", "# Título\n\n> citação *com* _ênfase_ e **negrito**"),
    ("md-lista", "- um\n- dois\n* três"), ("md-sublinhados", "snake_case_name e a*b*c"), ("md-hashtag", "#tag e ##outra"),
    ("tudo-junto", "{{embed:x}}<div>a</div>[[works/o|obra]] **negrito** [l](u) ![i](p) # t\n\n> q"), ("quebras-crlf", "linha1\r\nlinha2\rlinha3\n\nlinha4"),
    ("tabs", "a\tb\t\tc"), ("versalete", "O mundo de Hᴀᴛᴇ Cʏᴄʟᴇ é um mundo"), ("so-html", "<div>nada</div>"), ("so-embed", "{{embed:https://x.com}}"),
    ("zalgo", "t̷e̷x̷t̷o̷ ̷g̷l̷i̷t̷c̷h̷"), ("emoji-zwj", "👨‍👩‍👧‍👦 família " * 12), ("bom-no-meio", "a﻿b"), ("ls-ps", "a b c"),
]
EXCERPT_LIMITES = [130, 10, 1, 0, 50, 131, 100000]

# Textos para clip_title() (corte dos títulos das laterais do pager, pedido do autor de 16/10/2026): cada canto da regra.
CORTE_CASOS = [
    ("vazio", ""), ("curto", "Curto"), ("exato-40", "a" * 40), ("40-com-palavras", "um dois tres quatro cinco seis sete oit"),
    ("41-uma-palavra", "a" * 41), ("39-mais-1", "a" * 39 + " b"), ("40-mais-1", "a" * 40 + " b"), ("corta-no-espaco", "x" * 39 + " yyyy"),
    ("corta-no-meio-da-palavra", "Dia 28 desenhando uma criatura de Especulação"), ("virgula-no-corte", "Primeiro vídeo da HDVR, um teste de verdade mesmo"),
    ("pontuacao-solta", "abcdefghi jklmnopq rstuvwxyz abcdef -- ghijkl mnop"), ("travessao", "Primeiro vídeo da HDVR — um teste, de verdade, mesmo"),
    ("dois-pontos", "Capítulo um: o começo de tudo que importa aqui"), ("reticencias-no-corte", "Esperando por você... e por mais um dia inteiro aqui"),
    ("parenteses", "Resultado (parcial) do sorteio de ontem à noite aqui"), ("aspas-curvas", "Ele disse “não vou” e saiu sem olhar para trás nunca"),
    ("exclamacao", "Saiu o capítulo novo, venham ler agora mesmo pessoal!"), ("interrogacao", "Será que alguém vai ler essa história inteira aqui?"),
    ("so-pontuacao", "." * 60), ("espaco-e-pontuacao", ". " * 40), ("espacos-nbsp", "palavra\xa0palavra\xa0palavra\xa0palavra\xa0palavra\xa0palavra"),
    ("tabs-e-quebras", "um\tdois\ttres\nquatro cinco seis sete oito nove dez"), ("espacos-unicode", "um\u2003dois\u3000tres quatro cinco seis sete oito nove"),
    ("versalete", "Dia 28 desenhando uma criatura de Hᴀᴛᴇ Cʏᴄʟᴇ todos os dias"), ("versalete-no-corte", "Dia 28 de criaturas em Hᴀᴛᴇ Cʏᴄʟᴇ todos os dias seguidos"),
    ("versalete-40", "Hᴀᴛᴇ Cʏᴄʟᴇ " * 3 + "Hᴀᴛᴇ"), ("versalete-41", "Hᴀᴛᴇ Cʏᴄʟᴇ " * 3 + "Hᴀᴛᴇ!"),
    ("astral-40", "😀" * 40), ("astral-41", "😀" * 41), ("astral-com-espaco", "😀 " * 30), ("astral-matematico", "𝓗𝓪𝓽𝓮 " * 12),
    ("emoji-zwj", "👨‍👩‍👧‍👦 família " * 5), ("acentos", "ação ação ação ação ação ação ação ação ação ação"), ("zalgo", "t̷e̷x̷t̷o̷ ̷g̷l̷i̷t̷c̷h̷ ̷d̷e̷m̷a̷i̷s̷"),
    ("ingles-longo", "Day 28 of Drawing a Spec Evo creature from Hᴀᴛᴇ Cʏᴄʟᴇ every day because i bought a new sketchbook"),
    ("portugues-longo", "Dia 28 desenhando uma criatura de Especulação Evolutiva de Hᴀᴛᴇ Cʏᴄʟᴇ todos os dias por que eu comprei um caderno novo"),
]
CORTE_LIMITES = [40, 1, 2, 3, 10, 20, 39, 41, 100]


def titulos_reais():
    """O `title:` de cada .md de content/ (notícias e capítulos), como o build.py o lê."""
    r = {}
    for p in sorted(build.CONTENT.rglob("*.md")):
        fm, _ = build.parse(p)
        if fm.get("title"):
            r[p.relative_to(build.CONTENT).as_posix()] = str(fm["title"])
    return r


def tabelas():
    near = pegar_near()
    plain_real, exc_real = {}, {}
    for p in sorted(build.CONTENT.rglob("*.md")):
        fm, body = build.parse(p)
        rel = p.relative_to(build.CONTENT).as_posix()
        exc_real[rel] = build.excerpt(body)
        plain_real[rel] = {"sha1": hashlib.sha1(build.plain(body).encode("utf-8")).hexdigest(), "tamanho": len(build.plain(body))}
    return {
        "tr": [{"v": v, "lang": l, "padrao": d, "saida": build.tr(v, l, d)} for v in TR_VALORES for l in LANGS for d in TR_PADROES],
        "fmt_date": [{"lang": l, "d": d, "saida": build.fmt_date(l, d)} for l in LANGS for d in DATAS_FMT],
        "near": [{"a": a, "b": b, "saida": near(a, b)} for a, b in DATAS_PERTO],
        "rss_data": [{"d": d, "saida": data_do_rss(d)} for d in DATAS_RSS],
        "excerpt": [{"nome": n, "texto": t, "limite": lim, "saida": build.excerpt(t, lim)} for n, t in EXCERPT_CASOS for lim in EXCERPT_LIMITES],
        "plain": [{"nome": n, "texto": t, "saida": build.plain(t)} for n, t in EXCERPT_CASOS],
        "corte_do_titulo": {
            "limite_padrao": build.PAGER_TITLE_MAX,
            "inventados": [{"nome": n, "texto": t, "limite": lim, "saida": build.clip_title(t, lim)} for n, t in CORTE_CASOS for lim in CORTE_LIMITES],
            "padrao": [{"nome": n, "texto": t, "saida": build.clip_title(t)} for n, t in CORTE_CASOS],
            # todos os títulos de verdade (notícias e capítulos, nos dois idiomas), com o limite do site
            "reais": {rel: build.clip_title(titulo) for rel, titulo in titulos_reais().items()},
        },
        "excerpt_real": exc_real,
        "plain_real": plain_real,
        "midias": {"rotulos": build.MEDIA_LABELS, "ui": {k: list(v) for k, v in build.MEDIA_UI.items()}},
        "redes": [list(x) for x in build.NETWORKS.items()],
    }


# ═════════════════════════════ 2. capturar o build() de verdade ═════════════════════════════

@contextlib.contextmanager
def ambiente(raiz, cfg_extra, rascunhos):
    """Aponta o build.py para uma pasta content/ (a de verdade ou uma inventada), com um config (cópia, com chaves de
    mentira nos comentários) e DRAFTS dados. Tudo é restaurado depois."""
    salvo = {k: getattr(build, k) for k in ("CONTENT", "CFG", "DRAFTS", "BASE", "write", "shell", "clean_out", "OUT")}
    salvo_copytree, salvo_short = shutil.copytree, dict(build.SHORT)
    cfg = copy.deepcopy(build.CFG)
    cfg["comments"] = dict(CHAVES_DE_MENTIRA)
    cfg.update(copy.deepcopy(cfg_extra))
    build.CONTENT, build.CFG, build.DRAFTS, build.BASE = Path(raiz), cfg, rascunhos, ""
    build.INDEX.clear(); build.SHORT.clear()
    try:
        yield cfg
    finally:
        for k, v in salvo.items():
            setattr(build, k, v)
        shutil.copytree = salvo_copytree
        build.INDEX.clear(); build.SHORT.clear(); build.SHORT.update(salvo_short)


def quadro_do_build():
    """O quadro (frame) do build() em andamento: de dentro dele se lê o estado (listas locais) que a função tem."""
    f = sys._getframe(1)
    while f is not None and f.f_code is not build.build.__code__:
        f = f.f_back
    if f is None:
        raise SystemExit("✘ o shell() foi chamado fora do build()")
    return f


# ───────── ler o HTML que o build() produz (os formatos são os conhecidos; se mudarem, o assert avisa) ─────────

def achar(padrao, texto, flags=re.S):
    m = re.search(padrao, texto, flags)
    return m


def cartao_da_obra(h):
    """card_work() → os dados que ele mostra."""
    m = re.fullmatch(r'<article class="work-card"((?: data-[\w-]+="[^"]*")*)>(<img src="([^"]*)" alt="([^"]*)" loading="lazy">|<div class="nocover"></div>)<h3>(.*?)</h3><p>(.*?)</p>(.*)</article>', h, re.S)
    assert m, h[:300]
    attrs = {k: U(v) for k, v in re.findall(r' data-([\w-]+)="([^"]*)"', m.group(1))}
    resto = m.group(7)
    previa = None
    p = re.search(r'<a class="preview-link" href="([^"]*)">👁 (.*?)</a>$', resto, re.S)
    if p:
        previa = {"href": U(p.group(1)), "rotulo": U(p.group(2))}
        resto = resto[:p.start()]
    b = re.fullmatch(r'<a class="button" href="([^"]*)"( target="_blank" rel="noopener noreferrer")?>(.*?)</a>', resto, re.S)
    if b:
        botao = {"tipo": "link", "href": U(b.group(1)), "externo": b.group(2) is not None, "rotulo": U(b.group(3))}
    else:
        s = re.fullmatch(r'<span class="button disabled">(.*?)</span>', resto, re.S)
        assert s, resto
        botao = {"tipo": "em-breve", "rotulo": U(s.group(1))}
    ordem = {k: attrs[k] for k in ("chrono", "release") if k in attrs}
    return {"titulo": U(m.group(5)), "titulo_dado": attrs.get("title"), "resumo": U(m.group(6)), "imagem": U(m.group(3)) if m.group(3) is not None else None,
            "botao": botao, "previa": previa, "ordem": ordem, "midia": attrs.get("media")}


def seletor(h):
    """sorter_html() → as opções que oferece."""
    m = re.fullmatch(r'<div class="sorter" data-grid="([^"]*)" data-lang="([^"]*)" data-labels="([^"]*)"><input type="search" class="story-search" placeholder="([^"]*)" aria-label="([^"]*)" autocomplete="off">(.*?)<label><span class="sr-only">(.*?)</span><select>(.*?)</select></label><button .*?</button></div>', h, re.S)
    assert m, h[:400]
    opcoes = lambda t: [{"valor": U(v), "rotulo": U(r)} for v, r in re.findall(r'<option value="([^"]*)">(.*?)</option>', t)]
    filtro = None
    if m.group(6):
        f = re.fullmatch(r'<label class="media-filter"><span class="sr-only">(.*?)</span><select class="media-select" aria-label="(.*?)"><option value="">(.*?)</option>(.*)</select></label>', m.group(6), re.S)
        assert f, m.group(6)
        filtro = {"rotulo": U(f.group(1)), "todos": U(f.group(3)), "midias": opcoes(f.group(4))}
    return {"direcoes": json.loads(U(m.group(3))), "placeholder": U(m.group(4)), "rotulo_da_ordem": U(m.group(7)), "ordens": opcoes(m.group(8)), "filtro": filtro}


def cartao_do_emissario(h):
    """card_emissary() → os dados que ele mostra."""
    m = re.fullmatch(r'<article class="emi-card"><div class="emi-photo">(?:<img src="([^"]*)" alt="([^"]*)" loading="lazy">|<div class="emi-ph" aria-hidden="true">(.*?)</div>)</div>'
                     r'<h3>(.*?)</h3><p class="emi-role">(.*?)</p>(.*)</article>', h, re.S)
    assert m, h[:300]
    por_rotulo = {rot: chave for chave, rot in build.NETWORKS.items()}
    redes = [{"chave": por_rotulo[U(r)], "rotulo": U(r), "url": U(u)} for u, r in re.findall(r'<a href="([^"]*)" target="_blank" rel="noopener" aria-label="([^"]*)" title="[^"]*">', m.group(6))]
    return {"titulo": U(m.group(4)), "papel": U(m.group(5)), "foto": U(m.group(1)) if m.group(1) is not None else None,
            "inicial": U(m.group(3)) if m.group(3) is not None else None, "redes": redes, "mostra_texto": "<div class=emi-text>" in m.group(6)}


def cards_da_home(main):
    """Os cartões de "Últimas atualizações" que a home mostra (os 4 primeiros)."""
    out = []
    for a in re.findall(r'<a class="update" href="[^"]*">.*?</a>', main, re.S):
        m = re.fullmatch(r'<a class="update" href="([^"]*)">(<img src="([^"]*)" alt="" loading="lazy">)?<span class="tag">(.*?)</span><time>(.*?)</time><h3>(.*?)</h3><p>(.*?)</p></a>', a, re.S)
        assert m, a[:300]
        out.append({"url": U(m.group(1)), "imagem": U(m.group(3)) if m.group(3) else None, "rotulo": U(m.group(4)), "data": U(m.group(5)), "titulo": U(m.group(6)), "texto": U(m.group(7))})
    return out


def sobre_da_home(main):
    m = re.search(r'<section class="wrap block about-teaser"><h2>(.*?)</h2><p>(.*?)</p><a class="button ghost" href="([^"]*)">', main, re.S)
    return {"titulo": U(m.group(1)), "resumo": U(m.group(2)), "url": U(m.group(3))} if m else None


def vizinhos(main, lang):
    """anterior/próximo/voltar de uma página (o pager, ou os botões laterais do vídeo)."""
    prefixo = {d: build.T(lang, d) + ": " for d in ("prev", "next")}
    def um(d):
        # título longo vem CORTADO no <small> (pedido do autor, 16/10/2026) e inteiro no title do link: a regra é sobre o título inteiro
        m = re.search(r'<a class="pg %s" rel="%s" href="([^"]*)"(?: title="([^"]*)" aria-label="[^"]*")?>.*?<small>(.*?)</small>' % (d, d), main, re.S)
        if m:
            return {"url": U(m.group(1)), "titulo": U(m.group(2) if m.group(2) is not None else m.group(3))}
        m = re.search(r'<a class="side-btn %s" rel="%s" href="([^"]*)" title="([^"]*)"' % (d, d), main, re.S)
        if m:
            t = U(m.group(2))
            assert t.startswith(prefixo[d]), t
            return {"url": U(m.group(1)), "titulo": t[len(prefixo[d]):]}
        return None
    mid = re.search(r'<a class="mid" href="([^"]*)">(.*?)</a>', main, re.S)
    return {"anterior": um("prev"), "proximo": um("next"), "voltar": {"url": U(mid.group(1)), "rotulo": U(mid.group(2))} if mid else None}


def comentarios(main):
    m = re.search(r'<section class="hc-comments" data-page="([^"]*)"', main)
    return U(m.group(1)) if m else None


def pagina_de_capitulo(main, lang):
    h1 = re.search(r'<h1 class="(?:chapter-title|sr-only)">(.*?)</h1>', main, re.S)
    d = re.search(r'<p class="chapter-date"><time datetime="([^"]*)">(.*?)</time></p>', main, re.S)
    formato = "comic" if 'class="comic"' in main else ("video" if ('class="video-wrapper"' in main or 'class="player-row"' in main) else "prose")
    return {"h1": U(h1.group(1)), "data": {"iso": U(d.group(1)), "texto": U(d.group(2))} if d else None, "comentarios": comentarios(main), "formato": formato, **vizinhos(main, lang)}


def pagina_de_obra(main):
    m = re.fullmatch(r'<div class="wrap block work-head">\n(?:<img class="cover" src="([^"]*)" alt="">)?\n<div><h1>(.*?)</h1><p>(.*?)</p>\n<div class="hero-actions"><a class="button" href="([^"]*)">(.*?)</a>\n<a class="button ghost" href="([^"]*)">(.*?)</a></div></div></div>\n'
                     r'<section class="wrap block"><h2>(.*?)</h2><ol class="chapter-list">(.*)</ol></section>', main, re.S)
    assert m, main[:300]
    linhas = [{"url": U(u), "numero": U(n), "titulo": U(t), "data": U(d)} for u, n, t, d in re.findall(r'<li><a href="([^"]*)"><span class="n">(.*?)</span><span class="t">(.*?)</span><time>(.*?)</time></a></li>', m.group(9), re.S)]
    return {"capa": U(m.group(1)) if m.group(1) else None, "titulo": U(m.group(2)), "resumo": U(m.group(3)), "primeiro": {"url": U(m.group(4)), "rotulo": U(m.group(5))},
            "ultimo": {"url": U(m.group(6)), "rotulo": U(m.group(7))}, "titulo_da_lista": U(m.group(8)), "capitulos": linhas}


def linhas_da_lista_de_noticias(main):
    rows = []
    for a in re.findall(r'<article class="news-item".*?</article>', main, re.S):
        m = re.fullmatch(r'<article class="news-item"( hidden)? data-search="([^"]*)"><time>(.*?)</time><h2>(.*?)</h2><div class="news-body">(?:<a class="news-thumb" href="[^"]*" tabindex="-1" aria-hidden="true"><img src="([^"]*)" alt="" loading="lazy"></a>)?'
                         r'<div class="news-text">(?:<div class=chips>(.*?)</div>)?<p>(.*?) <a class="more" href="([^"]*)">(.*?)</a></p></div></div></article>', a, re.S)
        assert m, a[:400]
        rows.append({"escondida": m.group(1) is not None, "busca": U(m.group(2)), "data": U(m.group(3)), "titulo": U(m.group(4)), "miniatura": U(m.group(5)) if m.group(5) else None,
                     "tags": [U(t) for t in re.findall(r'<span class="tag">(.*?)</span>', m.group(6) or "")], "resumo": U(m.group(7)), "url": U(m.group(8))})
    return rows


def pagina_de_noticia(main, lang):
    antes = main.split('<div class="prose">')[0]
    t = re.search(r"<time>(.*?)</time>", main, re.S)
    h1 = re.search(r"<h1>(.*?)</h1>", main, re.S)
    return {"data": U(t.group(1)), "h1": U(h1.group(1)), "tags": [U(x) for x in re.findall(r'<span class="tag">(.*?)</span>', antes)], "comentarios": comentarios(main), **vizinhos(main, lang)}


def grupos_do_universo(main):
    """A página Universo: seções por categoria, com os endereços dos itens, na ordem em que aparecem."""
    return [{"categoria": U(cat), "urls": [U(u) for u in re.findall(r'<li><a href="([^"]*)"><strong>', lis)]}
            for cat, lis in re.findall(r'<section><h2>(.*?)</h2><ul class="wiki-list">(.*?)</ul></section>', main, re.S)]


def aparece_em(main, lang):
    """"Aparece em:" da página de um personagem."""
    m = re.search(r'<p class="related"><strong>%s:</strong> (.*?)</p>' % re.escape(U(build.T(lang, "appears_in"))), main, re.S)
    return [{"titulo": U(t), "href": U(h)} for h, t in re.findall(r'<a href="([^"]*)">(.*?)</a>', m.group(1), re.S)] if m else []


def itens_do_rss(xml):
    out = []
    for it in re.findall(r"<item>.*?</item>", xml, re.S):
        m = re.fullmatch(r"<item><title>(.*?)</title><link>(.*?)</link><guid>(.*?)</guid><pubDate>(.*?)</pubDate><description>(.*?)</description></item>", it, re.S)
        assert m and m.group(2) == m.group(3), it[:300]
        out.append({"titulo": U(m.group(1)), "link": U(m.group(2)), "data": U(m.group(4)), "descricao": U(m.group(5))})
    return out


# ───────── o que o shell() recebe (uma vez por página) ─────────

def capturar(raiz, cfg_extra, rascunhos):
    """Roda o build() de verdade sobre a pasta content/ `raiz` e devolve {"estado": {idioma: …}, "paginas": {url: …}, "rss": {idioma: […]}}."""
    paginas, estado, rss = {}, {}, {}

    def anota_write(url, content):
        if url.endswith("/feed.xml"):
            rss[url.split("/")[1]] = itens_do_rss(content)

    def anota_shell(lang, title, main, alt=None, cls="", desc="", image="", has=None, noindex=False, seed=None):
        if seed is None:        # a página 404 não tem semente
            return ""
        reg = {"lang": lang, "titulo": title, "cls": cls, "desc": desc, "imagem": image, "noindex": noindex,
               "alt": {k: v for k, v in (alt or {}).items() if k != "_self" and v}}
        if cls.startswith("reader"):
            reg["capitulo"] = pagina_de_capitulo(main, lang)
        elif main.startswith('<div class="wrap block work-head">'):
            reg["obra"] = pagina_de_obra(main)
        elif seed == f"/{lang}/news/":
            reg["noticias"] = linhas_da_lista_de_noticias(main)
        elif re.fullmatch(rf"/{lang}/news/[^/]+/", seed):
            reg["noticia"] = pagina_de_noticia(main, lang)
        elif seed == f"/{lang}/universe/":
            reg["universo"] = grupos_do_universo(main)
        elif 'class="wrap block char-page"' in main:
            reg["personagem"] = {"aparece_em": aparece_em(main, lang)}
        paginas[seed] = reg
        if seed == f"/{lang}/":
            estado[lang] = estado_da_home(quadro_do_build().f_locals, lang, main)
        return ""

    with ambiente(raiz, cfg_extra, rascunhos) as cfg:
        build.write, build.shell, build.clean_out, build.OUT = anota_write, anota_shell, (lambda: None), Path(tempfile.gettempdir()) / "hc-regras-nao-usado"
        shutil.copytree = lambda *a, **k: None          # não copiar static/ (135 MB) para lugar nenhum
        with contextlib.redirect_stdout(io.StringIO()):  # cala o "✔ site gerado em…" (aqui nada é gerado)
            build.build()
        config = {"show_extras": cfg.get("show_extras", True), "emissaries_hide": cfg.get("emissaries", {}).get("hide", []),
                  "emissaries_show_texts": cfg.get("emissaries", {}).get("show_texts", True), "site_url": cfg.get("site_url", "")}
    return {"config": config, "estado": estado, "paginas": paginas, "rss": rss}


def estado_da_home(L, lang, main):
    """Copia do estado que o build() tem no instante em que escreve a home de `lang` (L = variáveis locais dele)."""
    slugs = lambda xs: [x["slug"] for x in xs]
    feed = [{k: i.get(k) for k in ("date", "url", "title", "kind", "text", "image", "work")} for i in L["feed_items"]]
    related = {}
    for secao, lista in (("news", L["news"][lang]), ("universe", L["universe"][lang]), ("characters", L["chars"][lang])):
        for it in lista:
            if it["fm"].get("related"):
                links = re.findall(r'<a href="([^"]*)">(.*?)</a>', build.related_html(lang, it["fm"]), re.S)
                related[f"{secao}/{it['slug']}"] = [{"titulo": U(t), "url": U(u)} for u, t in links]
    return {
        "listadas": slugs(L["listed"]), "universo": slugs(L["hate"]), "outras": slugs(L["other"]), "destaques": slugs(L["recent"]),
        "cartoes": {w["slug"]: cartao_da_obra(build.card_work(w, lang)) for w in L["works"]},
        "seletor": seletor(build.sorter_html(lang, "hate-grid", L["hate"])),
        "atualizacoes": feed,
        "home_cartoes": cards_da_home(main),
        "sobre": sobre_da_home(main),
        "noticias": slugs(L["news"][lang]),
        "universo_extra": slugs(L["universe"][lang]),
        "personagens": slugs(L["chars"][lang]),
        "emissarios": slugs(L["emis"][lang]),
        "emissarios_cartoes": {e["slug"]: cartao_do_emissario(build.card_emissary(e, lang)) for e in L["emis"][lang]},
        "relacionados": related,
    }


# ═════════════════════════════ 3. conteúdo inventado ═════════════════════════════

def md(fm, corpo=""):
    """Um .md: front matter (dict, na ordem dada; lista vira `- item`) + corpo."""
    linhas = ["---"]
    for k, v in fm.items():
        if isinstance(v, list):
            linhas.append(f"{k}:")
            linhas += [f"  - {x}" for x in v]
        elif v is True or v is False:
            linhas.append(f"{k}: {'true' if v else 'false'}")
        else:
            linhas.append(f"{k}: {v}")
    linhas.append("---")
    return "\n".join(linhas) + "\n\n" + corpo + "\n"


def wj(**kw):
    return json.dumps(kw, ensure_ascii=False, indent=2) + "\n"


def cap(obra, pasta, en=None, pt=None):
    """Capítulo nos dois idiomas: en/pt = dict de front matter (None = não existe naquele idioma)."""
    out = {}
    if en is not None: out[f"works/{obra}/{pasta}/en.md"] = md(en, "Texto do capítulo em inglês.")
    if pt is not None: out[f"works/{obra}/{pasta}/pt.md"] = md(pt, "Texto do capítulo em português.")
    return out


def cap2(obra, pasta, **fm):
    return cap(obra, pasta, dict(fm), dict(fm))


def item(secao, pasta, en=None, pt=None, corpo_en="Corpo em inglês.", corpo_pt="Corpo em português."):
    out = {}
    if en is not None: out[f"{secao}/{pasta}/en.md"] = md(en, corpo_en)
    if pt is not None: out[f"{secao}/{pasta}/pt.md"] = md(pt, corpo_pt)
    return out


def cenario_variado():
    """Conteúdo inventado com TODOS os cantos das regras. Datas pensadas: 0, 3 e 4 dias (antes e depois), virada de ano, ano bissexto."""
    a = {}
    # ── obras ──
    a["works/a-oneshot/work.json"] = wj(kind="prose", universe=True, oneshot=True, title={"en": "A One", "pt": "Uma Só"}, blurb={"en": "One.", "pt": "Uma."},
                                         cover={"en": "covers/EN/a.png", "pt": "covers/PT/a.png"}, logo={"en": "logos/a.png", "pt": "logos/a.png"}, order={"release": 3, "chrono": 1}, media="short-story")
    a.update(cap2("a-oneshot", "01", date="2025-12-31", summary=""))
    a["works/b-serial/work.json"] = wj(kind="prose", title={"en": "B Serial", "pt": "B Seriado"}, blurb={"en": "Serial."}, cover="covers/b.png", order={"release": 2, "chrono": False},
                                        media="webcomic", cta={"en": "Start", "pt": "Começar"}, reading_font="times")
    a.update(cap("b-serial", "01", dict(date="2026-01-02", title="Início"), dict(date="2026-01-02", title="Começo")))
    a.update(cap2("b-serial", "02", date="2026-01-05", summary="Resumo do capítulo 2"))
    a.update(cap2("b-serial", "03", date="2026-01-20", chapter="3A"))
    a.update(cap2("b-serial", "10", date="2026-01-30", title="Décimo"))
    a.update(cap2("b-serial", "04", date="2026-01-21", unlisted=True, title="Escondido"))
    a.update(cap2("b-serial", "05", date="2026-02-01", draft=True, title="Rascunho"))
    a.update(cap("b-serial", "06", None, dict(date="2026-02-02", title="Só em português")))
    a["works/c-video/work.json"] = wj(kind="video", oneshot=False, title="C Vídeo", order={"release": 4}, media="live-ttrpg", logo={"en": "logos/c.png"})
    a.update(cap2("c-video", "01", date="2026-02-10", summary=""))
    a.update(cap("c-video", "02", dict(date="2026-02-20", youtube="J2j6xoIz0LE", comments=False), dict(date="2026-02-20", youtube="J2j6xoIz0LE", comments=False)))
    a["works/d-tres/work.json"] = wj(kind="prose", title={"en": "D Three", "pt": "D Três"}, order={"release": 5}, media="short-story")
    a.update(cap2("d-tres", "01", date="2024-02-28", summary=""))
    a["works/e-quatro/work.json"] = wj(kind="prose", title="E Quatro", order={"release": 6})
    a.update(cap2("e-quatro", "01", date="2023-02-28", summary=""))
    a["works/f-antes/work.json"] = wj(kind="prose", title="F Antes", order={"release": 7})
    a.update(cap2("f-antes", "01", date="2026-01-01", summary=""))
    a["works/g-mesmo-dia/work.json"] = wj(kind="video", title="G Mesmo Dia", order={"release": 8})
    a.update(cap2("g-mesmo-dia", "01", date="2026-03-01", summary=""))
    a["works/h-fora/work.json"] = wj(kind="prose", universe=False, title={"en": "H Outside", "pt": "H Fora"}, order={"release": 1, "chrono": 9}, media="misc")
    a.update(cap2("h-fora", "01", date="2026-04-01"))
    a["works/i-externa/work.json"] = wj(kind="video", title="I Externa", external={"en": "https://exemplo.com/en", "pt": "https://exemplo.com/pt"}, order={"release": 9, "chrono": 2}, media="misc",
                                         cover={"pt": "covers/i.png"})
    a["works/j-externa-com-cap/work.json"] = wj(kind="prose", title="J Externa Com Capítulo", external="https://exemplo.com/j", order={"release": 10}, cta={"pt": "Ler lá"})
    a.update(cap2("j-externa-com-cap", "01", date="2026-04-05"))
    a["works/k-escondida/work.json"] = wj(kind="prose", listed=False, title="K Escondida", order={"release": 11})
    a.update(cap2("k-escondida", "01", date="2026-04-10"))
    a["works/l-so-pt/work.json"] = wj(kind="prose", langs=["pt"], title={"en": "L Only PT", "pt": "L Só PT"}, order={"release": 12})
    a.update(cap2("l-so-pt", "01", date="2026-04-12"))
    a["works/m-sem-ordem/work.json"] = wj(kind="film", title={"pt": "M Sem Ordem"}, logo="logos/m.png")
    a.update(cap("m-sem-ordem", "01", dict(unlisted=True, title="Prévia"), dict(unlisted=True, title="Prévia")))
    a["works/n-atualizada/work.json"] = wj(kind="prose", title={"en": "", "pt": ""}, blurb={"pt": "Só PT", "en": ""}, order={"release": 2, "chrono": 3}, updated="2026-06-01", media="short-film")
    a["works/o-par1/work.json"] = wj(kind="prose", title="O Par 1", order={"release": 7})
    a.update(cap2("o-par1", "01", date="2026-06-01"))
    a["works/p-par2/work.json"] = wj(kind="prose", title="P Par 2", order={"release": 8})
    a.update(cap2("p-par2", "01", date="2026-06-01"))
    a["works/q-par3/work.json"] = wj(kind="prose", title="Q Par 3", order={"release": 9})
    a.update(cap2("q-par3", "01", date="2026-06-01"))
    a["works/r-par4/work.json"] = wj(kind="prose", title="R Par 4", order={"release": 9, "chrono": 9})
    a.update(cap2("r-par4", "01", date="2026-06-01"))
    a["works/s-titulo-vazio/work.json"] = wj(kind="prose", title={"en": "", "pt": ""}, order={"release": 20}, media="videogame")
    a.update(cap2("s-titulo-vazio", "01", date="2026-05-20"))
    a.update(cap2("s-titulo-vazio", "02", date="2026-05-21", title="Segundo"))
    a["works/t-sem-nada/work.json"] = wj()
    # T17c: obra INTEIRA em rascunho (work.json → draft: true): some de tudo no build; na prévia aparece como as outras
    a["works/u-obra-rascunho/work.json"] = wj(kind="prose", draft=True, title={"en": "U Draft Work", "pt": "U Obra Rascunho"}, blurb={"en": "Draft.", "pt": "Rascunho."},
                                               cover="covers/u.png", order={"release": 13, "chrono": 4}, media="short-story")
    a.update(cap2("u-obra-rascunho", "01", date="2026-04-20", summary=""))
    a["works/v-rascunho-externa/work.json"] = wj(kind="video", draft=True, title="V Rascunho Externa", external="https://exemplo.com/v", order={"release": 14}, media="misc")
    a["works/w-rascunho-falso/work.json"] = wj(kind="prose", draft=False, title="W Rascunho Falso", order={"release": 15})
    a.update(cap2("w-rascunho-falso", "01", date="2026-04-22", summary=""))
    a["works/x-rascunho-escondida/work.json"] = wj(kind="prose", draft=True, listed=False, title="X Rascunho Escondida", order={"release": 16})
    a.update(cap2("x-rascunho-escondida", "01", date="2026-04-23", summary=""))
    # ── notícias ──
    def n(nome, en, pt=None, corpo_en="", corpo_pt=None):    # notícia nos dois idiomas, com o mesmo texto (salvo se corpo_pt for dado)
        return item("news", nome, en, pt if pt is not None else en, corpo_en=corpo_en, corpo_pt=corpo_en if corpo_pt is None else corpo_pt)
    a.update(n("2025-12-30-alfa", dict(title="News Alpha", date="2025-12-30", summary="Resumo da notícia alfa", thumb="news/a.png", tags=["Post", "Arte: oficial"]), corpo_en="Veja [[works/a-oneshot]] agora.", corpo_pt="Veja a obra agora, sem link."))
    a.update(n("2026-01-05-beta", dict(title="News Beta", date="2026-01-05", image="news/b.png"), corpo_en="Texto da notícia beta que cita [[works/b-serial/02]] e também [[works/nao-existe]], sem resumo escrito: **negrito** e _ênfase_ e mais palavras para passar de cento e trinta caracteres e cortar no meio."))
    a.update(n("2026-01-05-beta-gemea", dict(title="News Beta Twin", date="2026-01-05"), corpo_en="Outra no mesmo dia, sem citar obra."))
    a.update(n("2026-01-06-beta-outra", dict(title="News Beta Other", date="2026-01-06", thumb="news/c.png", image="news/d.png", comments=False), corpo_en="Cita [[works/b-serial|a obra]] de novo."))
    a.update(n("2026-01-09-beta-longe", dict(title="News Beta Far", date="2026-01-09"), corpo_en="Cita [[works/b-serial]], mas longe de 02 (4 dias) e de 01."))
    a.update(n("2024-03-02-tres-dias", dict(title="Three Days", date="2024-03-02"), corpo_en="Cita [[works/d-tres]]."))
    a.update(n("2023-03-03-tres-dias-b", dict(title="Three Days B", date="2023-03-03", summary="Resumo emprestado"), corpo_en="Cita [[works/e-quatro]]."))
    a.update(n("2023-03-04-quatro-dias", dict(title="Four Days", date="2023-03-04"), corpo_en="Cita [[works/e-quatro]] mas a 4 dias."))
    a.update(n("2025-12-29-antes", dict(title="Before", date="2025-12-29"), corpo_en="Cita [[works/f-antes]] 3 dias antes."))
    a.update(n("2025-12-28-antes-4", dict(title="Before 4", date="2025-12-28"), corpo_en="Cita [[works/f-antes]] 4 dias antes."))
    a.update(n("2026-03-01-mesmo-dia", dict(title="Same Day", date="2026-03-01", summary="Notícia no mesmo dia"), corpo_en="Cita [[works/g-mesmo-dia]]."))
    a.update(n("2026-03-02-duas-obras", dict(title="Two Works", date="2026-03-02"), corpo_en="Cita [[works/g-mesmo-dia]] e [[works/c-video]] e [[works/nao-existe]]."))
    a.update(n("2026-02-12-video", dict(title="Video news", date="2026-02-12", summary="Resumo do vídeo"), corpo_en="Cita [[works/c-video]]."))
    a.update(n("2026-04-10-escondida", dict(title="Hidden Work News", date="2026-04-10"), corpo_en="Cita [[works/k-escondida]]."))
    a.update(n("2026-05-01-sem-resumo", dict(title="Rich", date="2026-05-01", tags=[]), corpo_en="<div class=\"x\">caixa</div>\n\n{{embed:https://x.com/a/status/1}}\n\nUm [link](https://x.com), uma ![imagem](a.png), e [[universe/magia|a magia]] e [[characters/harry]] ocupam a abertura deste texto longo."))
    a.update(item("news", "2026-05-02-so-pt", None, dict(title="Só em português", date="2026-05-02", related=["works/a-oneshot", "universe/magia", "characters/harry", "news/2025-12-30-alfa", "emissaries/ana"]), corpo_pt="Só PT."))
    a.update(n("2026-04-21-obra-rascunho", dict(title="Draft Work News", date="2026-04-21"), corpo_en="Cita [[works/u-obra-rascunho]] e [[works/v-rascunho-externa]], que são obras inteiras em rascunho."))
    a.update(n("2026-05-03-sem-data", dict(title="No date"), corpo_en="Sem data nenhuma, cita [[works/a-oneshot]]."))
    a.update(n("2026-05-04-rascunho", dict(title="Draft news", date="2026-05-04", draft=True), corpo_en="Rascunho."))
    a.update(n("2026-05-05-relacionados", dict(title="Related", date="2026-05-05", related=["works/a-oneshot", "works/m-sem-ordem", "works/i-externa", "works/t-sem-nada", "works/u-obra-rascunho", "works/v-rascunho-externa", "universe/magia", "news/2026-05-04-rascunho", "pages/about"]), corpo_en="Tem relacionados."))
    for dia in range(1, 6):    # mais notícias: passam das 10 da primeira página
        a.update(n(f"2026-05-1{dia}-enchimento", dict(title=f"Filler {dia}", date=f"2026-05-1{dia}"), corpo_en=f"Texto de enchimento número {dia}."))
    # ── emissários ──
    e = lambda nome, en, pt=None, **k: item("emissaries", nome, en, pt if pt is not None else en, **k)
    a.update(e("ana", dict(title="Ana", role="Role A", image="emissaries/a.png", order=2, instagram="https://i.com/ana", email="ana@exemplo.com"), corpo_en="Texto da Ana.", corpo_pt="Texto da Ana."))
    a.update(e("bruno", dict(title="Bruno", role="Role B", order=10, email="mailto:bruno@exemplo.com", website="https://b.com", x="https://x.com/b", youtube="https://y.com/b", bluesky="https://bsky.app/b", tiktok="https://t.com/b"), corpo_en=""))
    a.update(e("caio", dict(title="Caio", order="", role="Vazio"), corpo_en="Texto."))
    a.update(e("dani", dict(title="Dani"), corpo_en="Sem order."))
    a.update(e("eva", dict(title="Eva", order=99, email="sem-arroba"), corpo_en="Order 99 explícito."))
    a.update(e("escondido", dict(title="Escondido", order=1)))
    a.update(e("rascunho", dict(title="Rascunho", order=1, draft=True)))
    a.update(e("zeca", dict(role="Sem título"), corpo_en="Folder name."))
    a.update(e("b-minusculo", dict(title="b minúsculo", order=5)))
    a.update(e("b-maiusculo", dict(title="B Maiúsculo", order=5)))
    a.update(e("sharp", dict(title="ßeta", order=5)))
    a.update(e("emoji", dict(title="😀 Emoji", order=5)))
    a.update(e("fullwidth", dict(title="Ｚ largo", order=5)))
    a.update(item("emissaries", "so-en", dict(title="Only EN", order=3), None))
    # ── universo, personagens, páginas ──
    u_ = lambda nome, en, pt=None, **k: item("universe", nome, en, pt if pt is not None else en, **k)
    a.update(u_("magia", dict(title="Magia", category="Magia", order=2, summary="S")))
    a.update(u_("runas", dict(title="Runas", category="Magia", order=10)))
    a.update(u_("bestiario", dict(title="Bestiário", category="Bestas")))
    a.update(u_("sem-categoria", dict(title="Sem categoria")))
    a.update(u_("dup-b", dict(title="Zeta", category="Bestas", order=7)))
    a.update(u_("dup-a", dict(title="Alfa", category="Bestas", order=7)))
    c_ = lambda nome, en, pt=None, **k: item("characters", nome, en, pt if pt is not None else en, **k)
    a.update(c_("harry", dict(title="Harry", role="Assistente", order=2, appears_in=["b-serial", "a-oneshot", "k-escondida", "i-externa", "m-sem-ordem", "c-video", "u-obra-rascunho", "v-rascunho-externa"], related=["works/a-oneshot", "universe/magia"])))
    a.update(c_("olivia", dict(title="Olivia", order=1, appears_in=["a-oneshot"])))
    a.update(c_("sem-ordem", dict(title="Sem Ordem")))
    a.update(item("pages", "about", dict(title="About", summary="S"), dict(title="Sobre", summary="S")))
    a.update(item("pages", "project", dict(title="The project", route=False, summary="Resumo do projeto"), dict(title="O projeto", route=False, summary="Resumo do projeto em PT")))
    a.update(item("pages", "support", dict(title="Support"), dict(title="Apoio")))
    a.update(item("pages", "extra-pagina", dict(title="Extra page", menu="extras"), None))
    return a


def cenario_enxuto():
    """Quase vazio: uma obra sem capítulos ("Em breve"), nada mais. Sem notícias, sem emissários, sem páginas."""
    a = {}
    a["works/unica/work.json"] = wj(kind="prose", title="Única", blurb="Em breve.")
    a["works/unica/01/en.md"] = md(dict(title="Só rascunho", draft=True, date="2026-01-01"), "x")
    a["works/unica/01/pt.md"] = md(dict(title="Só rascunho", draft=True, date="2026-01-01"), "x")
    return a


CENARIOS = [
    # (nome, função que cria os arquivos, config extra)
    ("variado", cenario_variado, {"show_extras": True, "emissaries": {"show_texts": True, "hide": ["escondido", "nao-existe"]}}),
    ("variado-sem-extras", cenario_variado, {"show_extras": False, "emissaries": {"show_texts": False, "hide": []}}),
    ("enxuto", cenario_enxuto, {"show_extras": False, "emissaries": {"show_texts": True, "hide": []}}),
]


def gravar(raiz, arquivos):
    for caminho, texto in arquivos.items():
        p = Path(raiz) / caminho
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(texto)


def cenarios():
    out = []
    for nome, criar, cfg in CENARIOS:
        arquivos = criar()
        with tempfile.TemporaryDirectory(prefix="hc-regras-") as tmp:
            gravar(tmp, arquivos)
            out.append({"nome": nome, "arquivos": arquivos, "config": cfg,
                        "build": capturar(tmp, cfg, False), "previa": capturar(tmp, cfg, True)})
    return out


# ═════════════════════════════ 4. tudo junto ═════════════════════════════

def main():
    dados = {
        "_leia": "Gerado por tools/regras_ref.py a partir do build.py (build() de verdade, com o estado copiado de dentro dele). "
                 "Não edite à mão: rode `python3 tools/regras_ref.py` de novo. Usado por tests/regras.test.ts.",
        "python": sys.version.split()[0],
        "langs": LANGS,
        "tabelas": tabelas(),
        "real": {"build": capturar(build.CONTENT, {}, False), "previa": capturar(build.CONTENT, {}, True)},
        "cenarios": cenarios(),
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=1, sort_keys=False) + "\n", "utf-8")
    t = dados["tabelas"]
    print(f"✔ tabelas: tr {len(t['tr'])}, fmt_date {len(t['fmt_date'])}, near {len(t['near'])}, rss {len(t['rss_data'])}, excerpt {len(t['excerpt'])}, "
          f"plain {len(t['plain'])}, corpos reais {len(t['excerpt_real'])}; real: {len(dados['real']['build']['paginas'])} páginas no build, "
          f"{len(dados['real']['previa']['paginas'])} na prévia; {len(dados['cenarios'])} cenários → {SAIDA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
