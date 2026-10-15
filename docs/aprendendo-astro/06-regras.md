# Lição 06 — As regras do site viram funções (T10)

Até a T09, o Astro sabia **ler** o `content/` e **transformar o texto em HTML**. Faltava uma coisa: **decidir**. Qual obra vem primeiro na grade? Esta notícia aparece em "Últimas atualizações" ou some porque já existe o capítulo que ela anuncia? A data sai como "18 de ago. de 2026" ou "Aug 18, 2026"? O botão diz "Ler" ou "Em breve"? Hoje essas decisões estão **espalhadas dentro do `build()`** do `build.py`, misturadas com a montagem do HTML.

Na T10 cada uma dessas decisões virou uma **função pequena em `src/lib/`**, que recebe dados e devolve dados (não HTML). As páginas das próximas tarefas (T11–T14) só vão **desenhar** o que as funções devolvem.

O site no ar **não muda nada**. O que a T10 entrega é a certeza de que, quando as páginas existirem, elas vão mostrar **as mesmas coisas, na mesma ordem, com o mesmo texto**.

> **Conferido por máquina:** 891 testes e 4799 comparações, texto contra texto, sem nenhuma normalização, entre as funções do Astro e o que o `build.py` de verdade produz: com o seu conteúdo real nos dois idiomas, com e sem rascunhos, e com três "sites inventados" que forçam os cantos que o seu conteúdo ainda não tem.

## O que você vai entender

1. Por que **separar a regra** do desenho.
2. O que é uma **função pura** (e por que ela é fácil de testar).
3. Três regras reais: a **fusão de 3 dias**, a **ordem das obras** e a **data em português**.
4. Como o teste **prova** que é igual, mesmo quando a regra do Python está escondida dentro do `build()`.
5. Como **quebrar de propósito** para ver o teste reclamar.

## Abra lado a lado (nesta ordem)

1. No `build.py`: `fmt_date()` (~87), o começo do loop de idiomas no `build()` (~670–741: ordenação, "Últimas atualizações"), `card_work()` e `sorter_html()` (~456–520).
2. `src/lib/datas.ts`, `src/lib/atualizacoes.ts`, `src/lib/obras.ts`, `src/lib/noticias.ts`: um arquivo por assunto, cada um com um comentário no alto dizendo **de qual linha do `build.py` cada função veio**.
3. `src/lib/idioma.ts`: `dadosDoIdioma()`, a função que junta todas as regras e entrega, para um idioma, tudo o que a home e as listas precisam.
4. `tools/regras_ref.py` e `tests/regras.test.ts`: a prova.

## 1. Por que separar a regra do desenho

No `build.py`, a decisão "esta notícia some da lista" está no meio de código que também monta `<div class="...">`. Para conferir a decisão, você teria de gerar o site inteiro e olhar o HTML. E, na migração, cada página nova do Astro teria de **reescrever** a decisão, com risco de errar um canto (uma data limite, uma obra sem capa) sem que ninguém percebesse.

Com a regra separada:

- ela existe **uma vez só**, e a home, a página Notícias e o RSS usam a mesma;
- ela pode ser testada **sozinha**, rápido, sem montar página;
- a página fica "burra" de propósito: recebe uma lista pronta e desenha.

## 2. O que é uma função pura

É uma função que, **para a mesma entrada, sempre devolve a mesma saída**, e que **não faz mais nada**: não lê arquivo, não olha o relógio, não muda os dados que recebeu. Exemplo, de `src/lib/datas.ts`:

```ts
datasProximas("2026-08-18", "2026-08-20")   // true  (2 dias)
datasProximas("2026-08-18", "2026-08-25")   // false (7 dias)
```

Não importa quando, nem em qual máquina: o resultado é esse. Por isso testar é só uma lista de "entrada → saída esperada". O que **não** é puro (ler o `content/`, por exemplo) fica em outro lugar (`src/lib/conteudo.ts` e `leitor.ts`); `dadosDoIdioma()` em `idioma.ts` recebe o conteúdo já lido e só aplica as regras.

Detalhe de engenharia: "a data de hoje" nunca entra nessas funções. O `build.py` também não usa (as datas vêm sempre do que você escreveu), então o resultado não muda de um dia para o outro.

## 3. Três regras reais

### 3.1 Fusão de 3 dias (`datasProximas` + `atualizacoes`)

Quando você publica o capítulo 2 de Luz e Sangue e, no mesmo dia, uma notícia anunciando-o, a home não deve mostrar **os dois** em "Últimas atualizações". A regra do `build.py` (linhas ~705–734): a notícia que cita `[[works/<obra>]]` e tem um capítulo daquela obra com data a **até 3 dias** de distância **some da lista da home**, e o cartão do capítulo herda o resumo dela. A notícia continua na página Notícias.

Casos reais do seu conteúdo (em português):

| Notícia | Capítulo | Diferença |
|---|---|---|
| `2025-04-18-saiu-pederneira` | `firestriker/01` (2025-04-18) | 0 dias, funde |
| `2026-06-06-bem-vindos-luz-e-sangue` | `light-and-blood/01` | 0 dias, funde |
| `2026-08-18-novo-episodio-luz-e-sangue` | `light-and-blood/02` | 0 dias, funde |

O seu conteúdo real **não tem** nenhum par a 4 dias, então só o teste dos casos inventados vigia o limite: o número 3 mora numa constante, `JANELA_DE_FUSAO_EM_DIAS`, em `datas.ts`.

### 3.2 Ordem das obras (`separarObras` + `organizarCartoes`)

A grade de Histórias tem três ordens (`MODOS_DE_ORDEM`: lançamento, cronológica, alfabética). Cada obra declara o seu lugar em `order` no `work.json`, e `chrono: false` tira a obra daquela ordem. Duas pegadinhas que o Python tem e foram **reproduzidas de propósito**:

- a obra **sem** valor de lançamento vai para o fim na grade (999), mas, no feed de atualizações, o padrão é 0;
- a ordem é feita por **pontos de código** do texto, como o Python, não pela ordem "de dicionário" do navegador.

A ordenação que acontece no navegador, quando o visitante troca a ordem (`static/site.js`), também é provada: o teste **executa o trecho real do `site.js`** com elementos de mentira e compara.

### 3.3 Data em português (`formatarData`)

`"2026-08-18"` vira `"18 de ago. de 2026"` em português e `"Aug 18, 2026"` em inglês. O modelo da frase (`date_fmt`) e os nomes dos meses vêm do `config.json`; a função só encaixa. Qualquer coisa que não seja uma data (vazio, texto) volta como veio, sem erro: igual ao Python. Um detalhe do Python é mantido de propósito: mês "00" cai em dezembro (o `-1` do Python). O schema já barra datas assim, então isso nunca acontece no seu conteúdo; o teste só prova que o porte é fiel até no canto.

## 4. Como o teste prova que é igual

Mesmo esquema da T08 e da T09: um script Python gera a "resposta certa", o teste do Astro compara.

1. **`python3 tools/regras_ref.py`** importa o `build.py` e escreve `tests/fixtures/regras-python.json` (≈2 MB). Rodar duas vezes gera o mesmo arquivo.
2. Muitas regras estão **dentro do `build()`** e não existem como função. Para não copiá-las (e correr o risco de "provar" a minha cópia), o script **chama o `build()` de verdade** e espia o que ele tem em mãos quando monta a home (os `f_locals` do quadro do `build()`); o que o `build()` escreveria em disco é só anotado. As funções que existem (`card_work`, `sorter_html`, `related_html`…) são chamadas de verdade, e o HTML delas é lido de volta.
3. Além do conteúdo real (com e sem rascunhos, em `en` e `pt`), o script cria **sites inventados** com os casos que o seu conteúdo ainda não tem: obra externa, `oneshot`, capítulo `unlisted`, datas coladas, virada de ano, notícia sem data, mais de 10 notícias para a paginação…
4. **`tests/regras.test.ts`** monta o mesmo estado com as funções do Astro (via `dadosDoIdioma()`) e compara com `toStrictEqual`, sem normalizar nada. Para o conteúdo inventado, os mesmos arquivos são recriados numa pasta temporária e lidos pelo **mesmo leitor e pelos mesmos schemas** que o site usa.

Para ter certeza de que o teste **não passa sempre**, a T10 fez um **teste de mutação**: quebrou de propósito 4 regras e viu o teste falhar em cada uma (janela de fusão 3→4: 23 falhas; ordem de lançamento invertida: 24; mês errado na data: 93; notícias da mais antiga para a mais nova: 34), restaurando depois.

### Uma decisão herdada da T09: `tr()` com texto vazio

`tr()` escolhe o texto do idioma. O Python usa o texto do idioma **se não for vazio**; senão o inglês; senão o primeiro que existir. O `tr()` do Astro agora faz **exatamente isso** (um `""` cai no próximo da fila), em vez de proibir texto vazio no schema: assim, um campo que você deixar vazio no `pt` continua mostrando o inglês, como hoje, em vez de dar erro de build. Também deixou de reordenar as chaves de `{ "en": …, "pt": … }`: o "primeiro valor" é o primeiro que **você escreveu**.

## Rode você mesmo

```bash
pnpm test regras                       # só os testes desta lição
pnpm vitest run regras --silent=false  # idem, com a tabela de casos por regra no fim
python3 tools/regras_ref.py            # refaz as respostas do Python (depois de mudar o content/)
```

## Tente

1. Em `src/lib/datas.ts`, troque `JANELA_DE_FUSAO_EM_DIAS = 3` por `4` e rode `pnpm test regras`. Deve falhar (dezenas de casos). Leia a mensagem: ela diz qual caso, o que o Python devolveu e o que o Astro devolveu.
2. Desfaça a troca e rode de novo: tudo verde.
3. Abra `src/lib/noticias.ts` e inverta a comparação em `ordenarNoticias`. Quantos testes quebram? Em quais idiomas?
4. Pergunta para pensar: se amanhã você decidir que a fusão deve ser de **5 dias**, quantos arquivos você precisa mudar? (Resposta: o número em `datas.ts`, e a referência do Python precisa mudar junto, para a prova continuar valendo. Depois da virada, o `build.py` deixa de existir e o teste passa a vigiar só o Astro.)
