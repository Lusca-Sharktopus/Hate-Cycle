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
| [05](05-markdown.md) | T09 | Como o Markdown vira HTML; por que o site tem um "Markdown próprio" e o Astro aprendeu esse jeito (porte fiel) em vez de usar o Markdown padrão dele; `rendered`, `render()` e `<Content />`; `[[links]]`, divisor de cena, embeds, atalhos e versalete; a prova por teste; a ferramenta da prévia `/dev/markdown/` | `make_md()`, `smallcaps()`, `url_embed()`, `embed_html()` |
| [06](06-regras.md) | T10 | Separar regras de apresentação: funções puras em `src/lib` (o que aparece, em que ordem, com que texto) e como o teste prova a igualdade com o Python, mesmo com a regra escondida dentro do `build()`; a fusão de 3 dias, a ordem das obras, a data em português | `build()` (ordenação, "Últimas atualizações", RSS), `fmt_date()`, `card_work()`, `sorter_html()` |
| [07](07-paginas.md) | T11 | Rotas dinâmicas (`[lang]`, `[obra]`) com `getStaticPaths()`; páginas que só desenham dados de `src/lib`; componentes com props e slots `atalho-*`; `<script>` só onde precisa (seletor e carrossel); versalete uma vez no `<main>`; a prova por comparação estrutural do HTML e por navegador | o loop principal de `build()` (home, Histórias, obra), `card_work()`, `sorter_html()`, `site.js` (blocos 1 e 2) |
| [08](08-leitor.md) | T12 | O leitor de capítulos: rota aninhada `[obra]/[capitulo]`; prosa, vídeo e quadrinho; os efeitos do texto (sonho, Giuseppe, carta que vira, tiras, degradê) continuam sendo HTML cru com classes, sem MDX (a D4 mudou na T09); anterior/próximo; por que os IDs de comentários são sagrados e como as chaves do Supabase ficam num arquivo só; no fim (T17c), a obra inteira em rascunho (`"draft": true`) e o bloco "estou lendo em ordem" no fim de cada capítulo | o laço dos capítulos do `build()`, `pager()`, `arrow()`, `draft_banner()`, `comments()`, `site.js` (bloco 4, a carta) |
| [09](09-endpoints.md) | T14 | Páginas avulsas, endpoints estáticos (RSS, sitemap, redirects do site antigo), a raiz e a página 404; por que à mão e não pelos pacotes do Astro; Extras (Universo e Personagens) provados mesmo desligados; dev × preview | `build()` (avulsas, Universo, Personagens, raiz, 404, redirects), RSS, `site.js` (bloco 3) |
| [10](10-comentarios.md) | T15 | Um script de verdade no navegador: `<script>` empacotado × `is:inline`; módulo TypeScript separado em regras e tela; pacote instalado com versão fixa × CDN; JavaScript só nas páginas com comentários; onde as chaves moram e por que a *anon* pode ser pública (RLS); texto do visitante nunca vira HTML; migrações do Supabase CLI; teste com um Supabase falso | `comments()` (os dois `<script src>`), `static/comments.js` (sai na T20) |
| [11](11-imagens-e-fontes.md) | T17 | O que pesa numa página e como medir; `srcset`/`sizes`; `astro:assets` e `getImage()` (por que não `<Image>`: as imagens estão em `static/` e no HTML do autor); WebP × AVIF; perfis por lugar; fontes do próprio site com `@fontsource` sem trocar nenhum nome de fonte; os recortes das runas; silhuetas para o `shape-outside`; como provar que o visual não mudou | `ver()`, cópia de `static/`, `<link>` do Google Fonts, `rune_fonts_links()` |
| 12 | T20–T21 | Testes de ponta a ponta e visuais (Playwright) e deploy automático com GitHub Actions | publicar `public/` à mão |

## Vocabulário mínimo

- **Build:** o momento em que o site é gerado (como rodar `python build.py`). No Astro: `pnpm build` → pasta `dist/`.
- **Componente `.astro`:** arquivo com duas partes. Entre as linhas `---` vai código TypeScript que roda só no build; abaixo vai o HTML, que pode usar as variáveis de cima com `{chaves}`.
- **Props:** os "parâmetros" de um componente (`<WorkCard work={w} lang="pt" />`), como os argumentos de `card_work(w, l)` hoje.
- **Coleção:** um tipo de conteúdo (notícias, capítulos…) com um schema que diz quais campos existem e de que tipo.
- **Ilha:** um pedaço de página que leva JavaScript para o navegador. O resto da página é HTML puro, como hoje.
