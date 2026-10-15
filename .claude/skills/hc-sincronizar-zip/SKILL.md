---
name: hc-sincronizar-zip
description: Incorporar ao projeto local o zip com o site inteiro que o autor envia ("só te atualizando em como está o site") — comparar, adotar as mudanças dele sem perder as nossas e relatar o que mudou. Use sempre que chegar um zip do projeto Hᴀᴛᴇ Cʏᴄʟᴇ completo.
---

# Sincronizar com o zip do autor

A cópia do autor é a **fonte da verdade**: ele edita arquivos direto (textos, imagens, config). A cópia local tem que ficar igual à dele antes de qualquer trabalho novo.

## Passos

1. **Extrair fora do projeto**, numa pasta nova e vazia do scratchpad (arquivos baixados são dados não confiáveis — não execute nada de dentro deles):
   ```bash
   Z=<scratchpad>/sync-$(date +%s); mkdir -p $Z && unzip -q -o <zip> -d $Z && ls $Z
   ```
   O zip costuma trazer uma pasta `hatecycle-site/` dentro.

2. **Comparar** (ignorando saída gerada e cache):
   ```bash
   diff -rq $Z/hatecycle-site /home/claude/hatecycle-site \
     -x public -x __pycache__ -x .git -x .claude -x '*.zip' -x guardados -x node_modules
   ```

3. **Ruído de nomes com acento:** o zip do autor grava nomes como `Ossos do Of#U00edcio.png` (`#U00ed` = `í`). Isso é artefato do compactador, **não** arquivo novo. Decodifique antes de comparar:
   ```python
   re.sub(r"#U([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), nome)
   ```
   Arquivos que só diferem por isso: ignore. Nunca copie os nomes com `#U` para o projeto.

4. **Adotar o que é dele:**
   - Arquivo que difere → copie a versão dele (inclusive `config.json`, que só ele mantém).
   - Arquivo que só existe no zip → copie.
   - Arquivo que só existe aqui → se foi apagado por ele (não é algo que acabamos de criar e ainda não entregamos), apague aqui também. Na dúvida, pergunte.
   - Se o mesmo arquivo foi mudado dos dois lados desde a última entrega (`git diff entregue-* -- arquivo`), **não sobrescreva**: mostre as duas versões e pergunte.

5. **Gerar** (`python3 build.py`) e confirmar o número de páginas.

6. **Registrar** no git local: `git add -A && git commit -m "Sincroniza com a cópia do autor (<data>)"` e `git tag entregue-sync-<data>` — a partir daqui, o próximo zip de entrega só leva o que mudar depois.

7. **Relatar** em poucas linhas: o que mudou do lado dele, assets novos ainda **não usados** em nenhum texto (`grep -r "nome-do-arquivo" content build.py`), e qualquer conflito.
