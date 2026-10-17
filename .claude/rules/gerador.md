---
paths:
  - "build.py"
---

# Regras do gerador (`build.py`)

## Congelado até a virada

O `build.py` está **congelado para mudanças estruturais** até a virada para Astro (T20 do `docs/BACKLOG.md`): **só correções de bug** (e as pequenas exceções que o autor pedir, como um rótulo novo em `MEDIA_LABELS`). Funcionalidade nova vai para o Astro. Depois da virada, o gerador vive na branch `legado-python`.

## Restrições técnicas

- **Só biblioteca padrão do Python.** Nada de `pip install` (o autor roda sem instalar nada além do Python).
- **Versão mínima real: Python 3.12.** O cabeçalho do arquivo e o antigo LEIA-ME dizem "3.8+", mas o código usa f-strings com aspas iguais aninhadas e barra invertida dentro de `{}` (ex.: `comments()` e a chamada `comments(lang, f"works/{w["slug"]}/…")`), que só compilam a partir do 3.12 — conferido: `python3.11 -m py_compile build.py` falha, 3.12 passa. Não piore isso; ao corrigir essas linhas, prefira a forma compatível. Pergunta aberta ao autor em `docs/BACKLOG.md` (B8).
- Um arquivo só. Mensagens e comentários em português.
- Toda saída vai para `public/` (apagado e recriado a cada build por `clean_out()`).

## Como as funções se organizam (seções `# ── … ──`)

1. **Utilidades:** `esc`, `u` (prefixa `BASE`), `asset` (caminho de `static/` com `BASE` e `quote`), `smallcaps`/`_smallcaps` (letras Unicode → `<span class="hc">`) e `ipa_ok` (transcrições `/…/` → `<span class="ipa">`), `ver` (carimbo `?v=` por hash), `T`/`TK`/`tr` (textos de `config.json → ui` e campos `{"en","pt"}`), `natural`, `fmt_date`, `scalar`/`parse` (front matter YAML mínimo), `write`.
2. **Markdown mínimo:** `make_md(lang, divider)` — parágrafos, `[[links]]` (via `INDEX`), `@/` em HTML cru, `---` → divisor de cena, `{{atalhos}}` (via `SHORT`) e `{{embed:…}}`.
3. **Carregamento:** `load_items(section)`, `load_works()` (capítulos, `draft`/`unlisted`, `oneshot`), helpers `wtitle`, `wcover`, `wlogo`, `wlisted`, `wlink`, `wcta`.
4. **Componentes HTML:** `rune_fonts_links`/`rune_imprint` (runas no fundo, sorteio com semente = endereço da página; `RUNES`, `n=26`, `size`, `rot` ±45°, `lo`/`hi`/`dur`), barra lateral (`SIDEBAR_UI`, `AUTHOR_SOCIALS`, `PARTNERS`, `KOFI_URL`, `sidebar()`), `shell()` (página completa: `<head>`, fontes do Google, tela de abertura, cabeçalho, rodapé), cards (`card_work`, `card_emissary`), `sorter_html` + `MEDIA_LABELS`/`MEDIA_UI`, embeds (`url_embed`, `embed_html`), `comments()`, `draft_banner`, `pager`, `related_html`, `clean_out`.
5. **`build()`:** o loop principal (por idioma: home, Histórias, obras, capítulos, notícias, páginas, universo/personagens, RSS, 404, raiz, redirects).
6. **Scaffolding:** `SKEL` + `scaffold()` para `python build.py new …`.
7. `__main__`: `new`, `serve` (porta 8000, `DRAFTS=True`, `BASE=""`, sem cache) ou build.

## Chaves liga/desliga

| Onde | Chave | Efeito |
|---|---|---|
| `build.py` | `SIDEBAR_ON = False` | `True` mostra a barra lateral e tira as redes sociais do rodapé. |
| `build.py` | `KOFI_URL = ""` | Link do botão Tip Jar. |
| `build.py` | `DRAFTS = False` | `True` inclui rascunhos (o `serve` liga sozinho). |
| `build.py` | `BASE` | Vem de `config.json → base_url`; para prévia local use `BASE=''` (ver CLAUDE.md). |
| `config.json` | `show_extras` | Menu/páginas de Universo e Personagens e botão da home. |
| `config.json` | `intro.enabled`, `min_ms`, `max_ms` | Tela de abertura. |
| `config.json` | `emissaries.show_texts`, `emissaries.hide` | Textos dos emissários; emissários ocultos. |
| `config.json` | `comments.supabase_url`, `comments.supabase_anon_key` | Sem os dois, não há caixa de comentários (só aviso na prévia). |

O `config.json` é do autor: **não edite**; diga a ele qual chave mudar.

## Invariantes que o gerador garante (não quebre ao corrigir bug)

- URLs `/en/…` e `/pt/…`; raiz escolhe o idioma; redirects de `config.json → redirects`.
- `comments(lang, ident, …)` com `ident` = `works/<obra>/<capítulo>` ou `news/<slug>`, igual nos dois idiomas.
- Capítulos `unlisted` geram página com `noindex`, fora de listas.
- Ao terminar, rode `python3 build.py` e confira a última linha (`(192 páginas)` hoje); depois `rm -rf public __pycache__`.

## Bug conhecido (não corrigir sem o autor)

`config.json → base_url` está como URL completa; RSS e `og:image` saem com o endereço duplicado. Item B1 do `docs/BACKLOG.md`.
