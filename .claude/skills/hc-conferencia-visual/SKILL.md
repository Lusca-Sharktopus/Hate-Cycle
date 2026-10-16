---
name: hc-conferencia-visual
description: Conferir visualmente páginas do site Hᴀᴛᴇ Cʏᴄʟᴇ com screenshots (Playwright) — prévia local sem base_url, fontes do Google bloqueadas, tela de abertura pulada e comentários simulados. Use depois de mexer em HTML, CSS, JS ou conteúdo, e para comparar com uma referência (PDF, imagem do autor, baseline).
---

# Conferência visual

Nunca diga que algo "ficou certo" sem ter olhado o screenshot. O autor manda capturas de tela e PDFs como referência; a conferência é comparar lado a lado.

## 1. Gerar a prévia local

O `config.json` do autor tem `base_url` absoluto (GitHub Pages), então o site gerado normalmente aponta CSS e imagens para fora do sandbox e aparece **sem estilo**. Para conferir, gere com `BASE` vazio (e, se quiser ver rascunhos, `DRAFTS=True`):

```bash
cd <raiz do repositório>   # ex.: /home/claude/hate-cycle
python3 -c "import build as b; b.BASE=''; b.build()"            # publicado
python3 -c "import build as b; b.BASE=''; b.DRAFTS=True; b.build()"   # com rascunhos
```

Depois de conferir, **gere de novo sem override** só se for entregar o `public/` (normalmente não é: a entrega leva só os fontes — ver `hc-entrega`).

## 2. Servir

```bash
(timeout 300 python3 -m http.server 8790 -d public >/dev/null 2>&1 &); sleep 1
```

Sempre com `timeout` (nunca `pkill`). Se a porta estiver ocupada ou o servidor tiver morrido, suba outro em outra porta (8791, 8792…) e passe `--port`.

## 3. Capturar

`scripts/shot.py` (nesta pasta) já bloqueia Google Fonts e jsDelivr, pula a tela de abertura (`sessionStorage hc-intro`) e remove a classe `intro`.

```bash
S=.claude/skills/hc-conferencia-visual/scripts/shot.py
python3 $S /pt/ out.png --width 390 --height 1200                       # celular
python3 $S /en/works/firestriker/01/ out.png --full                      # página inteira
python3 $S /en/works/all-in-a-nights-work/01/ out.png --selector .story --offset -80 --height 2400
python3 $S /en/news/<slug>/ out.png --selector .hc-comments --supabase   # comentários simulados
```

Salve os PNGs no diretório de rascunho da sessão (scratchpad), nunca dentro do projeto. Abra cada um com a ferramenta Read e olhe de verdade.

Larguras padrão: **1100** (desktop) e **390** (celular). Mudanças de layout pedem as duas.

## 4. Comparar com referência

- **PDF:** renderize com `pdftoppm -r 110 -png arquivo.pdf /tmp/.../pg` e compare página a página (ver `hc-fidelidade-pdf`).
- **Imagem do autor:** recorte a mesma região e compare proporções, quebras de linha, espaçamentos.
- **Mesmo arquivo reenviado:** compare pixels antes de "atualizar" (`PIL.ImageChops.difference(a, b).getbbox()` → `None` = idêntico).

## Limitações a declarar ao autor

- **Fontes do Google Fonts não carregam aqui** (Road Rage, PT Serif, Lexend, Oswald, Vollkorn SC, runas Noto). O screenshot mostra a fonte de reserva; diga isso e peça para ele conferir no navegador dele.
- Login real do Supabase e Google não é testável aqui; só a interface com o mock `--supabase` (**só no site Python**: o Astro empacota o supabase-js desde a T15). Para os comentários nos dois sites, use `python3 tools/comentarios_playwright.py --python <porta> --astro <porta> --fotos <pasta no scratchpad>`.
- A tela de abertura com vídeo (`static/intro/logo.webm`) é pulada de propósito; para testá-la, rode sem o init script.
