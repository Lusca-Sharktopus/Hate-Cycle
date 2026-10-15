---
name: hc-delegar
description: Tocar o backlog do projeto Hᴀᴛᴇ Cʏᴄʟᴇ uma tarefa por vez — escolher a próxima tarefa do docs/BACKLOG.md, abrir uma thread (subagente) com o modelo e o esforço definidos, revisar o resultado de forma independente, entregar e registrar a lição de Astro. Use quando o autor pedir para seguir com a próxima tarefa, delegar uma tarefa ou continuar a migração.
---

# Delegar tarefas do backlog

Regras do autor: **uma thread por tarefa, em sequência** — a próxima só é criada depois que a atual foi revisada e entregue. Modelo e esforço vêm da tabela do `docs/BACKLOG.md` (escolhidos pela dificuldade). Depois de cada tarefa, pare e relate ao autor; só emende a seguinte se ele tiver dito para seguir sem parar.

## 1. Escolher

Abra `docs/BACKLOG.md`. A próxima tarefa é a primeira com status `pendente` cujas dependências estão `feita` e que não está `bloqueada`. Marque-a `em andamento`.

## 2. Preparar o terreno

- `git status` limpo (commit do que estiver pendente antes).
- Anote o commit de partida: `git rev-parse --short HEAD`.

## 3. Abrir a thread

Ferramenta Agent, `subagent_type: general-purpose`, com `model` e `effort` da tabela. O subagente começa do zero: o briefing tem que se bastar. Modelo de briefing:

```
Você vai executar a tarefa <ID> — <título> do projeto Hᴀᴛᴇ Cʏᴄʟᴇ (site bilíngue PT/EN do autor Lusca Sharktopus),
em /home/claude/hatecycle-site. Responda e escreva documentação em português.

Leia primeiro: CLAUDE.md (ou LEIA-ME.md se ainda não existir), docs/BACKLOG.md (linha <ID>),
<arquivos específicos>, e as skills relevantes em .claude/skills/<...>/SKILL.md.

Objetivo: <1–3 frases>
Escopo: <lista>
Fora do escopo: <lista> — não mexa nisso mesmo que pareça errado; anote no relatório.
Critérios de aceite: <da tabela, verificáveis>

Restrições:
- Não altere config.json nem static/custom.css. Não use pkill; servidores de teste sob timeout.
- Não faça commit, zip nem entrega: só deixe os arquivos prontos na árvore de trabalho.
- Arquivos temporários no scratchpad, nunca dentro do projeto.
- Não invente fatos sobre o projeto: se faltar informação, registre como pergunta para o autor.

Relatório final (é tudo que eu vou ver):
1. O que foi feito, em tópicos curtos.
2. Arquivos criados/alterados/apagados.
3. Como verificou cada critério de aceite (comandos e resultado).
4. Decisões tomadas e perguntas para o autor.
5. (Tarefas de Astro) rascunho da lição em docs/aprendendo-astro/NN-<tema>.md.
```

Espere o resultado (primeiro plano, não em segundo plano).

## 4. Revisar sem confiar no relatório

- `git status` e `git diff <commit de partida>` — leia o diff de verdade.
- Refaça as verificações dos critérios de aceite você mesmo (build, testes, screenshots com `hc-conferencia-visual`).
- Tarefas marcadas como **alto risco** no backlog (paridade, comentários/Supabase, virada) recebem uma segunda thread só de revisão, com um subagente que não participou da construção.
- Problema encontrado → mande o mesmo subagente corrigir (SendMessage com o id dele) em vez de abrir outro.

## 5. Fechar

- Commit com mensagem em português descrevendo a tarefa (`T05: …`) + linhas de atribuição da sessão.
- `docs/BACKLOG.md`: status `feita`, data, link para a lição (se houver), novas tarefas descobertas.
- Lição de Astro: revise o rascunho para que um iniciante consiga acompanhar abrindo os arquivos citados; caminhos e trechos têm que bater com o código real.
- Entregue com `hc-entrega` e relate ao autor: o que mudou, o que ele precisa fazer, a lição da vez, e qual é a próxima tarefa (modelo/esforço) aguardando o OK dele.
