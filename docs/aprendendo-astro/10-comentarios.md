# Lição 10 — Comentários: um script de verdade no navegador, um pacote com versão fixa e o banco em migrações (T15)

Até aqui, quase tudo que o Astro faz acontece **no build**: ele lê `content/`, monta o HTML e pronto. A caixa de comentários é diferente: ela só existe **no navegador de quem visita** (entrar, comentar, responder, editar, apagar) e conversa com um serviço de fora, o Supabase. Com a T15, essa parte deixou de ser o `static/comments.js` solto + o supabase-js do jsDelivr e virou um módulo TypeScript do próprio projeto.

Para o visitante **nada muda**: a mesma caixa, os mesmos textos, os mesmos pedidos ao banco, as mesmas conversas. Um roteiro de 117 passos no navegador, rodado no site Python e no Astro contra o mesmo Supabase falso, deu **idêntico** em todos. Única diferença, de propósito: no celular o texto de exemplo da barra aparece inteiro (B23, seção 7).

## O que você vai entender

1. **`<script>` empacotado × `is:inline`**: quando o Astro mexe no script e quando o deixa como está.
2. **Um módulo TypeScript no navegador**, separado em regras (testáveis) e tela.
3. **Pacote instalado × CDN**: por que o `@supabase/supabase-js` agora tem versão fixa.
4. **Carregar o JavaScript só onde precisa** (e como se prova).
5. **Onde as chaves moram** e por que a chave *anon* pode ser pública.
6. **Texto do visitante nunca vira HTML.**
7. **B23**: o texto de exemplo cortado no celular.
8. **Migrações do Supabase**.
9. **Como se testa com um Supabase falso** (e o resto das provas).

## Abra lado a lado

1. `static/comments.js` (o de hoje, que o site Python continua usando) e `src/scripts/comentarios/caixa.ts` (o porte). O cabeçalho do `caixa.ts` lista cada comportamento com a linha correspondente do `comments.js`.
2. `src/scripts/comentarios/regras.ts` (as regras puras), `dom.ts` (o único jeito de criar elementos) e `index.ts` (a entrada).
3. `src/components/Comentarios.astro` (aviso × caixa, e o CSS) e `src/components/CaixaDeComentarios.astro` (o HTML e os dois `<script>`).
4. `src/lib/comentarios.ts` (o único arquivo que lê as chaves).
5. `supabase/migrations/20261016000000_inicial.sql` e `supabase-setup.sql`.
6. As provas: `tests/comentarios.test.ts`, `tests/supabase.test.ts`, o bloco "T15" de `tests/paginas.test.ts`, `tests/ajudantes/html.ts` (a exceção dos dois `<script src>`) e `tools/comentarios_playwright.py`.

## 1. `<script>` empacotado × `is:inline`

A `CaixaDeComentarios.astro` tem dois `<script>`, e eles são tratados de jeitos opostos:

```astro
<section class="hc-comments" data-page={idDaPagina}>…</section><script is:inline set:html={configuracao}></script>

<script>
  import "../scripts/comentarios/index";
</script>
```

- **`is:inline`**: o Astro escreve o script **exatamente como está, no lugar**. É o `window.HC = {url, key, lang, ui}` desta página (os textos do idioma, as chaves). Precisa ser assim porque cada página tem o seu (idioma), e porque o HTML tem de continuar igual ao do Python.
- **Sem atributo**: o Astro **processa** o script. Ele segue os `import`, junta tudo (o nosso TypeScript + o supabase-js de `node_modules/`), converte para JavaScript, encolhe, dá um nome com carimbo (`/_astro/CaixaDeComentarios.astro_astro_type_script_index_0_lang.<carimbo>.js`) e põe na página como `<script type="module" src="…">`. Um módulo só roda depois de a página inteira ser lida, então o `window.HC` (que vem antes) já existe.

É a mesma diferença da lição 03 (tela de abertura): `is:inline` quando o script tem de estar ali e daquele jeito; processado quando é código "de verdade", com imports.

O `src/lib/pagina.ts` (`finalizarMain`, lição 07) leva os scripts processados para o fim da página, fora do `<main>`: lá onde o site Python tem os seus.

## 2. Um módulo TypeScript no navegador

O `comments.js` era um arquivo de 297 linhas que misturava regra e tela. O porte separa:

| Arquivo | O que faz | Importa |
|---|---|---|
| `regras.ts` | decisões: mensagem de erro, "Enter envia?", texto vazio não envia, a árvore comentário → respostas, datas no formato do idioma, quem pode responder/editar/apagar | **nada** |
| `dom.ts` | `el()`: cria elementos com texto e atributos seguros (seção 6) | **nada** |
| `caixa.ts` | a caixa inteira: barra, janela de login, lista, formulários, sessão | `regras`, `dom` e só o **tipo** do supabase-js |
| `index.ts` | lê o `window.HC`, acha a `<section>`, cria o cliente do Supabase e chama `caixa.ts` | `@supabase/supabase-js`, `caixa` |

Por que "não importa nada"? Tudo que um script de navegador importa vai para o JavaScript público. Se `regras.ts` importasse algo de `src/lib/`, poderia arrastar o `config.json` inteiro junto. O teste `tests/comentarios.test.ts` confere essas regras de import.

O comportamento é o mesmo do `comments.js`, linha a linha (barra fixa, Enter/Shift+Enter, janela de login com Esc/clique fora/X/Tab preso, entrar, criar conta, esqueci a senha, nova senha pelo link do e-mail, Google, "Conectado como…", lista com respostas, ✦ do admin, "(editado)" com a data no `title`, responder, editar, apagar com confirmação, mensagens de erro, o recuo quando a coluna `edited_at` não existe). Até as manias ficaram: as mensagens de erro acima da barra se acumulam (não somem) e a lista é carregada duas vezes ao abrir a página logado. Estão no relatório da T15 como achados para decidir depois.

## 3. Pacote instalado × CDN

| | Site Python | Site Astro |
|---|---|---|
| De onde vem o supabase-js | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | `node_modules/` (instalado com `pnpm`) |
| Versão | "a mais nova 2.x" **no momento em que o visitante abre a página** | **2.117.2**, fixa no `package.json` (sem `^`) e no `pnpm-lock.yaml` (com a impressão digital do pacote) |
| Arquivos | 2 pedidos (CDN + `/comments.js`), 59,7 KB comprimidos | 1 pedido ao próprio site, **57,9 KB** comprimidos (225 KB sem comprimir) |

Com o CDN sem versão, uma versão nova (com mudança de comportamento, ou pior, adulterada) entra no site sem ninguém saber. Com o pacote fixo, a versão só muda quando alguém roda `pnpm add @supabase/supabase-js@<nova>`, roda os testes e confere. A escolha da 2.117.2 (25/09/2026) e não da 2.118.0 (15/10) foi de propósito: uma versão com algumas semanas de uso já teve tempo de ter problemas descobertos.

Dá para encolher mais? Sim: o supabase-js traz também `realtime`, `storage` e `functions`, que a caixa não usa. Usar só `@supabase/auth-js` + `@supabase/postgrest-js` reduziria o arquivo, mas mudaria o "como" (outra forma de criar o cliente). Fica como ideia para a T17 (desempenho).

## 4. JavaScript só onde há comentários

Duas peças garantem isso:

1. **Dois componentes.** `Comentarios.astro` decide: sem chaves na prévia → só o aviso (`c_not_configured`), **sem script**; com chaves → desenha a `CaixaDeComentarios`. O Astro só põe na página o `<script>` de um componente que foi desenhado nela.
2. **`comments: false`**: a página nem desenha `Comentarios`.

A prova (`tests/paginas.test.ts`, bloco "T15"): cada uma das 173 páginas com `<section class="hc-comments" data-page>` tem o script **uma vez**, depois do `</main>`; as outras 19 não têm, e nenhum arquivo JavaScript que elas carregam (nem os que eles importam) contém o supabase-js; nenhuma página do Astro aponta para o jsDelivr nem para `/comments.js`.

O `static/comments.js` **continua** em `static/` (o site Python usa até a virada) e por isso também é copiado para o `dist/`, mas nenhuma página do Astro o carrega. Sai na T20.

## 5. Onde as chaves moram

- Continuam no **seu** `config.json → "comments"`. No Astro, **só** `src/lib/comentarios.ts` lê esse bloco, e o devolve já dentro do texto do `window.HC` (o mesmo formato do Python: `{"url": …, "key": …, "lang": …, "ui": {…}}`).
- O script do navegador **não** importa `src/lib/`: ele lê o `window.HC` que a página traz. O teste confere que o arquivo `/_astro/CaixaDeComentarios…js` não contém a URL nem a chave.
- **Por que a chave anon pode ser pública?** Ela não é uma senha: só diz "sou um visitante deste projeto". Tudo que um visitante pode fazer é decidido **pelo banco**, com o RLS (*Row Level Security*, "segurança por linha"): ler comentários e perfis é livre; comentar só com conta, e só em nome próprio; editar só o próprio texto; apagar o próprio (ou qualquer um, se `is_admin`); ninguém se promove a admin. A chave que **nunca** pode aparecer é a `service_role`, que passa por cima do RLS.
- Nos testes, as chaves de verdade são trocadas por marcadores (`__SUPABASE_URL__`, `__CHAVE_FALSA__`) antes de qualquer comparação, e nunca impressas.

## 6. Texto do visitante nunca vira HTML

Comentário e nome de usuário são escritos por qualquer pessoa. Se um deles entrasse na página como HTML, alguém poderia publicar `<img src=x onerror="…">` e rodar código no navegador de todos os leitores (e roubar a sessão deles). Regras do `dom.ts`:

- texto só com `textContent` (o navegador mostra os sinais `<` e `>` como letras);
- atributos só com `setAttribute`, e **nome de atributo começando com `on` é recusado** (`onerror`, `onclick`…): evento só pela lista `ao` (`addEventListener` com uma função do próprio script);
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `eval`… não existem em `src/scripts/comentarios/` (o teste procura essas palavras e falha se achar).

O `comments.js` de hoje **já era seguro** nesse ponto (também usava `textContent`); o porte só acrescentou as travas e as provas. As capturas mostram `<img src=y onerror=window.__xss=3>` como nome e `<img …><script>…</script>` como comentário, escritos como texto.

## 7. B23: o texto de exemplo cortado no celular

Acontecia nas notícias **e nos capítulos**, e **também no site Python** (é o mesmo campo e o mesmo CSS): a 390 px, "Escreva um comentário…" quebra em duas linhas, mas a barra tem a altura de uma linha, e a segunda linha aparecia cortada ao meio.

Correção, só no CSS do Astro (`Comentarios.astro`): `.c-bar textarea { field-sizing: content; }`. A barra vazia passa a nascer com a altura do texto de exemplo (duas linhas no celular; uma no computador, como antes), e o script continua mandando na altura enquanto se digita. Navegador que ainda não conhece `field-sizing` ignora a linha e fica como hoje. O `static/style.css` (congelado) não mudou, então o site Python continua com o defeito até a virada. Outra opção testada, `white-space: nowrap` no texto de exemplo, deixava uma linha só, mas cortava a palavra na borda ("Escreva um comentári"), porque as reticências não funcionam ali.

## 8. Migrações do Supabase

O banco foi criado à mão, colando o `supabase-setup.sql` no SQL Editor. A partir da T15 ele também é uma **migração** do Supabase CLI: `supabase/migrations/20261016000000_inicial.sql` = um cabeçalho de comentários + o `supabase-setup.sql` byte a byte. Cada mudança futura vira um arquivo novo nessa pasta; o CLI guarda no próprio banco quais já rodaram (`supabase_migrations.schema_migrations`), então nada roda duas vezes.

- No projeto que já está no ar, a inicial **não é rodada**: é só marcada como aplicada (`supabase migration repair --status applied 20261016000000`). Passo a passo para você: `docs/comentarios-supabase.md`, seção 5.
- **Sem `config.toml`**, de propósito: o CLI não precisa dele para `link`/`repair`/`push`, e o arquivo padrão traz configurações de Auth de exemplo que poderiam sobrescrever as do seu projeto se alguém rodasse `supabase config push`.
- O CLI **não** foi instalado no projeto: são ~150 MB por sistema. Use `pnpm dlx supabase@2.118.0 …` quando precisar.

## 9. Como se prova

**No vitest** (`pnpm test`):
- `tests/comentarios.test.ts` — as regras (mensagens de erro, Enter/Shift+Enter/Ctrl/Alt/composição, texto vazio, árvore de respostas com pai que não veio, datas em pt e en, quem pode o quê, `window.HC` incompleto); o `el()` com um `document` falso que **explode** se alguém usar `innerHTML` (ataques `<img onerror>`, `<script>`, `<svg onload>` em texto e em atributo; nomes de atributo `onerror`, `ONload`… recusados); e a varredura do código.
- `tests/supabase.test.ts` — a migração inicial é o `supabase-setup.sql` byte a byte, os cinco blocos estão lá, o bloco 4 (virar admin) continua comentado, nenhum segredo nos arquivos.
- `tests/paginas.test.ts` — o `<main>` de todas as páginas continua igual ao do Python, com **uma exceção estreita** (`semScriptsAntigosDosComentarios()` em `tests/ajudantes/html.ts`): do HTML do Python sai exatamente o par `<script src="…jsdelivr…supabase-js@2">` + `<script src="/comments.js?v=…">` que vem colado no `window.HC`, e só ele; o `window.HC` continua sendo comparado. Mais o bloco "T15" da seção 4. Os IDs × `baseline/comentarios.json` continuam verdes. `tests/leitor.test.ts` e `tests/noticias.test.ts` usam a mesma exceção nos sites inventados e conferem que o script dos comentários aparece só quando há a caixa de verdade.

**No navegador** (`tools/comentarios_playwright.py`): um **Supabase falso** responde no nível da rede, como o de verdade (`/auth/v1/…` para entrar, criar conta, sair, nova senha, Google; `/rest/v1/…` para comentários e perfis, com as regras do banco). O script troca o `window.HC` por um endereço e uma chave de mentira antes de a página rodar e bloqueia qualquer outro endereço: nada sai da máquina. No site Python, o pedido ao jsDelivr é respondido com o arquivo da **mesma versão** 2.117.2, para os dois usarem a mesma biblioteca. São 10 roteiros (notícia e capítulo em pt, notícia em en, admin, nome com HTML, página sem comentários, banco sem `edited_at`, erro ao carregar, Google, nova senha), 117 passos; depois de cada passo, a caixa, a janela, o foco e os pedidos ao banco têm de ser **iguais** nos dois sites **e** o resultado tem de ser o esperado. Para conferir que o teste pega erro de verdade, o script do Astro foi quebrado de propósito duas vezes (texto via `innerHTML`; Enter enviando mesmo com Shift): o teste apontou a injeção em todos os passos e o Shift+Enter errado.

**O banco**, num Postgres 16 local com uma imitação mínima do Supabase (papéis `anon`/`authenticated`, `auth.users`, `auth.uid()`), sem rede: o Supabase CLI 2.118.0 aplicou a migração (`db push --db-url`); o esquema resultante é **idêntico** (pelo `pg_dump`) ao de rodar o `supabase-setup.sql` com o `psql`; 24 casos de RLS e gatilhos deram o resultado esperado; e num banco "como o do ar" (setup rodado à mão, sem histórico), `db push` sem o `repair` para no primeiro comando com "já existe", sem mudar nada, e com o `repair` diz "up to date".

**Capturas** (notícia e capítulo; deslogado, conectado com comentários e respostas, janela aberta; 1100 px e 390 px): idênticas pixel a pixel nas de 1100 px; nas de 390 px só muda a altura da barra (B23).

## Rode você mesmo

```bash
pnpm build
ls dist/_astro/CaixaDeComentarios*.js        # o script dos comentários (um só)
grep -c CaixaDeComentarios dist/pt/news/2023-08-18-orcs/index.html   # 1
grep -c CaixaDeComentarios dist/pt/index.html                        # 0 (a home não tem comentários)
pnpm test
```

O roteiro no navegador (servidores sob `timeout`; instruções no topo de `tools/comentarios_playwright.py`).

## Tente

1. Abra `dist/pt/news/2023-08-18-orcs/index.html` e procure `CaixaDeComentarios`: o script está depois do `</main>`. Agora procure `jsdelivr`: não há.
2. Em `src/scripts/comentarios/regras.ts`, apague o `!e.shiftKey` de `enterEnvia` e rode `pnpm vitest run comentarios`: o teste de Shift+Enter falha. Desfaça.
3. Em `src/scripts/comentarios/dom.ts`, troque `n.textContent = o.texto` por `n.innerHTML = o.texto` e rode o mesmo teste: falha ("innerHTML usado", e a varredura do código). Desfaça.
4. Num comentário de teste no seu site, escreva `<b>oi</b>`: aparece com os sinais, não em negrito.
