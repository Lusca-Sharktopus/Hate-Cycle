# Aprendendo Astro com o próprio site — mapa

Cada tarefa de migração do `docs/BACKLOG.md` que constrói uma parte do Astro vem com uma lição nesta pasta. A lição é escrita **depois** que o código existe, apontando para os arquivos reais, para você abrir o arquivo e ler junto. Nada aqui é exemplo genérico: é o código do Hᴀᴛᴇ Cʏᴄʟᴇ.

Como usar cada lição:
1. Leia a seção "O que você vai entender".
2. Abra os arquivos listados em "Abra lado a lado", na ordem.
3. Rode os comandos de "Rode você mesmo" e mexa no que a seção "Tente" sugere.
4. Compare com o gerador antigo (cada lição diz qual pedaço do `build.py` aquela parte substitui).

## Parte 0 — Preparar a sua máquina (faça antes da T05)

1. **Node.js 24 (LTS)** — em nodejs.org, escolha a versão **24** (o Astro 7 pede 22.12 ou mais novo; o pnpm 10 suporta oficialmente até o Node 24, então evite o 25 e o 26 por enquanto). Instale com as opções padrão e confira num terminal novo com `node -v` (deve mostrar `v24.…`).
2. **pnpm 10** (gerenciador de pacotes, mais rápido e econômico que o npm; o projeto foi montado com o 10.28.0, registrado em `package.json → packageManager`): `npm install -g pnpm@10` e confira com `pnpm -v` (deve mostrar `10.…`). Não instale sem o `@10`: o padrão hoje é uma versão mais nova.
   - **Windows, se o PowerShell disser que "a execução de scripts foi desabilitada"** ao rodar `pnpm`: rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, responda `S`, e abra um terminal novo.
3. **Editor:** VS Code com a extensão oficial **Astro** (realce, autocompletar e erros de tipo nos arquivos `.astro`).
4. Desde a T05: na pasta do projeto, `pnpm install` uma vez e depois `pnpm dev` (prévia com recarregamento instantâneo em `http://localhost:4321/pt/`). Passo a passo na lição 01.

O gerador em Python continua funcionando em paralelo até a virada (T20): `python build.py serve` segue valendo.

## As partes

| Lição | Tarefa | O que você vai entender | Substitui no `build.py` |
|---|---|---|---|
| [01](01-anatomia.md) | T05 | Anatomia de um projeto Astro: `package.json`, `astro.config.mjs`, roteamento por arquivo em `src/pages/`, o que é um componente `.astro` (o bloco `---` roda no build, o resto é HTML), i18n com `/en/` e `/pt/`, `site` × `base` (o site fica na raiz do domínio, sem `base`) | `shell()` (só o esqueleto), `write()`, `BASE` |
| [02](02-layout.md) | T06 | Layouts e componentes com *props*; slots; CSS com escopo × CSS global; tokens da marca; camadas de CSS (`@layer`) para o `custom.css` do autor continuar mandando; `<script>` em componente; textos da interface com chaves tipadas; `<head>` com hreflang e Open Graph | `shell()`, `T()`/`TK()`/`tr()` |
| [03](03-runas.md) | T07 | Lógica em TypeScript que roda no build; gerador aleatório com semente; como portar um algoritmo e provar que é igual com um teste (`pnpm test`); `is:inline` × script processado (tela de abertura) | `rune_imprint()`, `rune_fonts_links()`, intro do `shell()` e do `site.js` |
| [04](04-colecoes.md) | T08 | Coleções de conteúdo: carregador próprio (o `---` do site não é YAML), schemas Zod, `getCollection()`/`getEntry()`, referências entre itens, rascunhos, erros de build que apontam o arquivo, o campo e o valor | `parse()`, `scalar()`, `load_items()`, `load_works()`, `wlisted()`, `has` |
| 05 | T09 | Como o Markdown vira HTML (árvores remark/rehype) e como escrever um plugin pequeno (versalete, `[[links]]`, divisor de cena) | `make_md()`, `smallcaps()` |
| 06 | T10 | Separar regras de apresentação: funções puras em `src/lib` e testes com Vitest | ordenação, "Últimas atualizações", visibilidade |
| 07 | T11 | Rotas dinâmicas (`[lang]`, `[work]`) com `getStaticPaths()`; JavaScript no navegador só onde precisa (`<script>` em componente) | o loop principal de `build()`, `site.js` |
| 08 | T12 | Componentes dentro do texto (MDX) para os efeitos de história: tiras, carta, sonho, zalgo | HTML cru no Markdown |
| 09 | T14 | Endpoints estáticos: RSS, sitemap, redirects; página 404 | RSS manual, `redirects` |
| 10 | T15 | Ilhas e serviços externos: carregar o Supabase só na página que tem comentários; variáveis de ambiente públicas; migrações de banco | `comments()`, `comments.js` |
| 11 | T17 | Imagens otimizadas (`<Image>`, `<Picture>`, WebP/AVIF) e fontes servidas pelo próprio site | `ver()`, cópia de `static/`, `<link>` do Google Fonts |
| 12 | T20–T21 | Testes de ponta a ponta e visuais (Playwright) e deploy automático com GitHub Actions | publicar `public/` à mão |

## Vocabulário mínimo

- **Build:** o momento em que o site é gerado (como rodar `python build.py`). No Astro: `pnpm build` → pasta `dist/`.
- **Componente `.astro`:** arquivo com duas partes. Entre as linhas `---` vai código TypeScript que roda só no build; abaixo vai o HTML, que pode usar as variáveis de cima com `{chaves}`.
- **Props:** os "parâmetros" de um componente (`<WorkCard work={w} lang="pt" />`), como os argumentos de `card_work(w, l)` hoje.
- **Coleção:** um tipo de conteúdo (notícias, capítulos…) com um schema que diz quais campos existem e de que tipo.
- **Ilha:** um pedaço de página que leva JavaScript para o navegador. O resto da página é HTML puro, como hoje.
