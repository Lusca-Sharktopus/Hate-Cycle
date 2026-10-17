# Site Hᴀᴛᴇ Cʏᴄʟᴇ — comece aqui

Site bilíngue (inglês e português) do universo Hᴀᴛᴇ Cʏᴄʟᴇ, de Lusca Sharktopus.
Você escreve em arquivos de texto (Markdown) dentro de `content/` e roda **um comando**; o `build.py` gera o site inteiro na pasta `public/`.
Precisa só do Python 3.12 ou mais novo (nada para instalar além dele).

## Os 3 comandos principais

```bash
python build.py serve                 # prévia em http://localhost:8000 (mostra os rascunhos)
python build.py                       # gera o site final em public/ (sem rascunhos)
python build.py new news nome-do-post # cria algo novo (também: chapter, work, page, character, universe)
```

## Onde está cada coisa

- **Como usar o site** (publicar, esconder, notícias, ordem das histórias, aparência…): [`docs/guia-do-autor.md`](docs/guia-do-autor.md)
- **Comentários** (ligar o Supabase, login com Google, edição): [`docs/comentarios-supabase.md`](docs/comentarios-supabase.md)
- **O que falta fazer** (migração e pendências que aguardam você): [`docs/BACKLOG.md`](docs/BACKLOG.md)
- **Por que o site vai para Astro** (decisões aprovadas): [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
- **Aprender Astro com o próprio site**: [`docs/aprendendo-astro/00-mapa.md`](docs/aprendendo-astro/00-mapa.md)
- O que mudou em cada versão: [`docs/HISTORICO.md`](docs/HISTORICO.md)

Seus arquivos pessoais — `config.json` (chaves do Supabase) e `static/custom.css` (seus ajustes de aparência) — nunca vêm nas atualizações.
