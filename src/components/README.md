Pedaços reutilizáveis de página. Desde a T06: `Header.astro` (logo, menu, seletor de idioma) e `Footer.astro` (redes, © e RSS). Desde a T07: `Runas.astro` (runas do fundo, sorteio em `src/lib/runas.ts`) e `Abertura.astro` (tela de abertura). Cards de obra etc. chegam nas próximas tarefas.

Regra de ouro dos estilos: o `<style>` de cada componente vai **dentro de `@layer site { … }`** (veja `src/styles/README.md`), senão o `static/custom.css` do autor deixa de ganhar deles.
