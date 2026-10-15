CSS do site Astro (T06).

- `tokens.css` — as variáveis da marca (cores, fontes, raios, sombras, larguras), com os mesmos valores do `:root` do `static/style.css`.
- `global.css` — reset, corpo da página, tipografia base, `.hc`, `.skip`, `.layout`, `.sheet`.
- Estilos de cada peça ficam **no próprio componente** (`src/components/*.astro`, bloco `<style>`), com escopo.

Os dois arquivos daqui são importados uma vez, no `src/layouts/BaseLayout.astro`.

**Tudo isto está dentro de `@layer site { … }`, e os `<style>` dos componentes também têm de estar.** Motivo: o Astro põe o CSS empacotado no fim do `<head>`, DEPOIS do `<link>` do `/custom.css` do autor, então sem camada o `custom.css` perderia a disputa (ex.: `:root { --logo-w: 160px; }` não funcionaria). CSS dentro de uma camada sempre perde para CSS fora de camada, então o `custom.css` (sem camada) continua ganhando de tudo. Explicação completa: `docs/aprendendo-astro/02-layout.md`.

Caminhos de arquivos de `static/` dentro do CSS começam na raiz do site (`url("/Backgrounds/…")`), porque o CSS empacotado mora em `/_astro/`.
