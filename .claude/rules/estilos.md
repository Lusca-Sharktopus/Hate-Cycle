---
paths:
  - "static/**/*.css"
  - "static/**/*.js"
---

# Regras de estilos e scripts (`static/`)

## Arquivos

- `static/style.css` — todo o visual do site, dividido em seções `/* ── nome ── */` (cabeçalho, folha de papel, hero, botões, cards, leitor, rodapé, comentários, notícias, runas, barra lateral, Ossos cena 1…). Procure a seção certa antes de acrescentar regra nova; acrescente perto dela.
- `static/custom.css` — **arquivo pessoal do autor.** Carregado **depois** do `style.css` (ganha dele). **Nunca edite, crie, sobrescreva nem entregue.** Ele não é versionado aqui (`.gitignore`); o `build.py` funciona sem ele. Se uma mudança sua puder conflitar com algo que ele costuma ajustar (ex.: tamanho da logo), avise.
- `static/site.js` — scripts do site em blocos independentes `hcSafe(...)` (se um falha, os outros continuam): ordenação das histórias, carrossel, GIFs da página Histórias, carta que vira, imagem ausente, tela de abertura, notícias (paginação e busca). Mantenha esse padrão.
- `static/comments.js` — comentários (ver `.claude/rules/supabase.md`).
- CSS e JS recebem carimbo `?v=<hash>` automático (`ver()` no `build.py`): não precisa versionar nome de arquivo.

## Paleta e fontes (topo do `style.css`, em `:root`)

- Cores da marca: `--green` (#135c48, títulos e botões), `--mint` (#2ee0b0), `--teal` (#25737a), `--cyan` (#00e9fd, brilhos e hover), `--night` (#271b39, texto, hero, leitor de HQ). Também `--top` (topo do degradê), `--sheet`, `--muted`, `--paper` (textura), `--radius`, `--sheet-radius`.
- Fontes: `--font-text` = **Lexend**, `--font-head` = **Oswald**. Outras do Google Fonts carregadas no `<link>` do `shell()` em `build.py`: Vollkorn SC (fichas de feitiço), Noto Emoji, **PT Serif** e **Road Rage** (Ossos do Ofício); Times New Roman via `reading_font: "times"` (`.story.font-times`). Fontes Noto das runas vêm restritas aos glifos usados.
- Use as variáveis; não espalhe hex novos se a cor já existe na paleta. Exceção: cores narrativas dos textos do autor (ex.: `#111012` do sonho em Ossos), que são exatas e não devem ser "normalizadas".
- `--logo-w` controla a largura da logo do cabeçalho (o autor ajusta em `custom.css`: `:root { --logo-w: 160px; }`).

## Classes especiais em uso (não renomear: o conteúdo depende delas)

- `.hc` (versalete real gerado a partir das letras Unicode) e `.ipa` (transcrição fonética em Arial).
- `.apollo-gif`, `.anfibio-gif`, `.autor-foto` — imagens com texto contornando o desenho (`float` + `shape-outside`) nas páginas Sobre/O Projeto.
- `.jusep` — Giuseppe em Ossos do Ofício, texto contornando o desenho (PNG com fundo transparente).
- `.strip`, `.strip-row` — tiras do quadrinho dentro da prosa (710 px, centralizadas; de borda a borda em telas estreitas). `.lead-in` — frase de abertura grande.
- Ossos do Ofício, cena 1 (seção no fim do arquivo): `.s1` (Times), `.ps` (PT Serif #111012 = sonho), `.indent`, `.rr` (Road Rage), `.mid`, `.gap`, `.dashes`, `.zalgo`, `.sc`, `.s1-gif`, `.s1-art`. Conversão do PDF: 1 pt ≈ 0.0982 rem (ver skill `hc-fidelidade-pdf`). Classes novas de outras cenas: prefixo da cena.
- `.spellcard` (ficha de feitiço, em `content/embeds/spell-*.html`), `.news-collage` / `.news-stk` / `.news-paper` (notícia colagem), `.news-hero-in` (backdrop), `.runes`, `.intro-screen`, `.c-modal`, classes `sb-*` da barra lateral (desligada).
- Trocas de fonte e cor nos textos do autor são narrativas: nunca unifique nem "simplifique" essas regras.

## Especificidade (armadilhas conhecidas)

- `.prose figure img` (bordas arredondadas, `max-width: min(100%, 26rem)`) costuma ganhar de uma classe simples na imagem. Use um seletor mais específico (`.prose .minha-classe img`) — é o que `.s1-gif`, `.s1-art` e `.strip` fazem. `!important` só como último recurso (já existe em `max-width` dessas três).
- `.story figure img` centraliza imagens no leitor.

## Camadas (z-index)

`.runes` 0 (fundo, `position: fixed`) → `main` e `.site-footer` 1 → `.site-header` 5 (o menu suspenso precisa ficar por cima do conteúdo) → `.dd-menu` 10 → `.skip` 20 → `.c-modal` 1000 (login dos comentários) → `.intro-screen` 9999 (tela de abertura). Elementos novos posicionados devem caber nessa escala sem cobrir o cabeçalho.

## Acessibilidade e movimento

- Respeite `prefers-reduced-motion`: runas paradas e tela de abertura desligada para quem pede "reduzir movimento".
- Carrossel e carta que vira funcionam com teclado (Tab, setas, Enter); mantenha.

## Congelamento

Durante a migração para Astro, mudanças estruturais no CSS/JS ficam congeladas até a virada (T20): só correções de bug e ajustes pedidos pelo autor. Depois de mexer, confira com `hc-conferencia-visual` em 1100 px e 390 px.
