---
paths:
  - "src/**/*.astro"
  - "src/**/*.css"
---

# Estilos no Astro (`src/`)

- **Três andares:** `src/styles/tokens.css` (cores, fontes, sombras, larguras — os mesmos valores do `:root` de `static/style.css`), `src/styles/global.css` (base que vale para o site todo) e `<style>` com escopo dentro de cada componente. Sem Tailwind (D9).
- **Todo CSS do site fica dentro de `@layer site { … }`** — tokens, global e o `<style>` de cada componente novo. Motivo: o Astro injeta o CSS empacotado *depois* do `<link>` do `/custom.css` do autor; CSS sem camada sempre vence CSS em camada, então é a camada que garante que os ajustes pessoais do autor (`custom.css`, fora de camada) continuem mandando, como no site atual. Testado na T06.
- Ao portar regras de `static/style.css`, copie os **mesmos valores** (cor, espaçamento, tamanho) e use os tokens; não "melhore" o visual. Confira com `hc-conferencia-visual` contra a baseline em 1100 e 390 px.
- Caminhos de imagem em CSS são absolutos a partir da raiz do site (`url("/Backgrounds/…")`), porque o CSS empacotado mora em `/_astro/`.
- Trocas de fonte e cor nos textos do autor são narrativas (ver CLAUDE.md, *Ossos do Ofício*): preserve.
