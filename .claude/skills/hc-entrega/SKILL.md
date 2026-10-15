---
name: hc-entrega
description: Entregar ao autor uma atualização do site Hᴀᴛᴇ Cʏᴄʟᴇ — gerar, conferir, commitar e enviar para a branch migracao-astro no GitHub, e também empacotar num zip só os arquivos alterados. Use ao terminar qualquer mudança no projeto.
---

# Entregar uma atualização

O repositório do GitHub (`Lusca-Sharktopus/Hate-Cycle`) está conectado: o trabalho vive na branch `migracao-astro`, com o pull request #1 em rascunho aberto contra a `main`. **Nunca faça push na `main` nem merge** até a virada (T20): a `main` é o site antigo no ar em hatecycle.com.

Enquanto o autor não usar `git pull` na máquina dele, ele **também** recebe as mudanças como um zip com **só os arquivos alterados**, mantendo os caminhos do projeto, e copia por cima da cópia dele.

## Passos

0. **Toda entrega agora é commit + `git push origin migracao-astro`** (o pull request se atualiza sozinho). Faça isso no passo 6, depois de gerar e conferir; o zip dos passos 4–5 continua sendo enviado ao autor além do push. Um envio de cada vez (o proxy do GitHub aceita só 2 operações simultâneas) e, se vier HTTP 413, divida em commits menores.

1. **Gerar o site** e confirmar que não há erro (na raiz do repositório, ex.: `/home/claude/hate-cycle`):
   ```bash
   python3 build.py
   ```
   A última linha deve ser `✔ site gerado em … (N páginas)`. Se N mudou sem motivo, investigue antes de seguir.

2. **Conferir o que mudou visualmente** com a skill `hc-conferencia-visual` sempre que a mudança afetar HTML, CSS, JS ou conteúdo. Mudança só em documentação não precisa.

2b. **Se o conteúdo mudou** (`content/`, `config.json`): durante a migração, rode `python3 tools/frontmatter_ref.py`, `python3 tools/markdown_ref.py` e `python3 tools/regras_ref.py` (atualizam as referências do Python em `tests/fixtures/`) e depois `pnpm test` — todos verdes. Se a mudança foi em Astro (`src/`), rode também `pnpm check` e `pnpm build`.

3. **Limpar** o que não é entregue:
   ```bash
   rm -rf public __pycache__
   ```

4. **Listar os arquivos alterados** desde a última entrega (o git local marca cada entrega com uma tag `entregue-*`):
   ```bash
   last=$(git tag -l 'entregue-*' --sort=-creatordate | head -1)
   git add -A && git status --short
   git diff --no-renames --name-only --diff-filter=ACMR "$last" -- . ':!config.json' ':!static/custom.css'
   git diff --no-renames --name-only --diff-filter=D "$last"      # apagados: listar na mensagem, o zip não apaga nada
   ```

5. **Empacotar** com o nome fixo `1-hatecycle-site-atualizacao.zip` (o "1-" faz o arquivo aparecer primeiro na pasta de downloads do autor):
   ```bash
   git diff --no-renames --name-only -z --diff-filter=ACMR "$last" -- . ':!config.json' ':!static/custom.css' \
     | xargs -0 zip -q 1-hatecycle-site-atualizacao.zip
   ls -la 1-hatecycle-site-atualizacao.zip
   ```
   - **Nunca** incluir `config.json` (tem as chaves do Supabase do autor) nem `static/custom.css` (ajustes pessoais dele).
   - Limite de envio ≈ 30 MB. Se passar, divida em dois zips (`1-…-parte1.zip`, `2-…-parte2.zip`) separando as imagens grandes.

6. **Registrar a entrega** no git e **enviar para o GitHub**:
   ```bash
   git commit -qm "<resumo em português>

   Co-Authored-By: <linha de atribuição da sessão>" && git tag "entregue-$(date +%Y%m%d-%H%M)"
   git push origin migracao-astro      # a tag entregue-* é local; não envie
   ```

7. **Enviar** o zip com `SendUserFile` e responder em português, curto:
   - o que mudou (em termos do site, não de código);
   - arquivos **apagados** que o autor precisa remover à mão;
   - o que não deu para verificar aqui (ex.: fontes do Google Fonts, que o sandbox não alcança);
   - decisões de interpretação que ele deve confirmar.

## Armadilhas já vistas

- O autor às vezes reenvia o mesmo arquivo. Compare por pixels/bytes antes de "atualizar"; se for idêntico, diga que nada mudou.
- O autor pode ter mexido nos arquivos dele desde a última entrega. Se ele mandar o site inteiro, use `hc-sincronizar-zip` antes de entregar por cima.
- Não use `pkill`. Servidores de teste rodam sob `timeout`.
