# A virada: segunda-feira 26/10/2026, 12:00 (Brasília)

> Remarcada pelo autor em 21/10/2026 (antes: sábado 24/10), "para termos mais tempo".

Neste dia o site novo (feito com Astro) entra no ar em **hatecycle.com**, no lugar do site antigo. Este roteiro diz o que você faz no **domingo à noite**, o que acontece na **segunda**, como **voltar atrás em poucos minutos** se algo der errado e como fica o **dia a dia** depois.

Você não precisa saber programar para nada disto. Tudo que você faz é clicar em telas do GitHub e do Supabase.

## O que muda, em uma frase

Hoje o site no ar é uma pasta de arquivos prontos, publicada pelo GitHub como está. A partir de segunda, **o GitHub constrói o site sozinho** (uma "linha de montagem" chamada GitHub Actions, descrita no arquivo `.github/workflows/deploy.yml`) toda vez que alguém envia uma mudança para a branch `main`, e publica o resultado.

## 1. Domingo à noite (25/10): o que você faz

Reserve uns 15 minutos. O endereço do repositório é `github.com/Lusca-Sharktopus/Hate-Cycle`. Você precisa estar logado no GitHub com a sua conta.

### 1.1. Ligar a publicação automática (Settings → Pages)

1. No repositório, clique em **Settings** (Configurações), no menu de cima.
2. No menu da esquerda, clique em **Pages**.
3. Em **Build and deployment**, no campo **Source**, escolha **GitHub Actions** (hoje está "Deploy from a branch").
   - Não precisa clicar em mais nada: a mudança grava sozinha.

### 1.2. Conferir o endereço e o HTTPS (na mesma tela)

Ainda em **Settings → Pages**, role a tela até **Custom domain**:

- O campo tem de mostrar **`hatecycle.com`**. Se estiver vazio, escreva `hatecycle.com` e clique em **Save**. O GitHub confere o endereço e pode levar alguns minutos.
- **Enforce HTTPS** tem de estar **marcado** (o cadeado). Se estiver cinza, espere o GitHub terminar de conferir o domínio e marque.

Por que isto importa: com a publicação automática, o arquivo `CNAME` que está dentro do site **deixa de valer**. Quem manda no endereço passa a ser este campo da tela.

### 1.3. Abrir hatecycle.com e ver o site antigo

Abra **https://hatecycle.com** (de preferência numa janela anônima). Tem de aparecer o **site antigo**, como hoje. Ele continua no ar até segunda ao meio-dia.

> **Se o site tiver caído** (página de erro do GitHub, "404", ou nada): volte em Settings → Pages, ponha **Source = Deploy from a branch**, **Branch = `main`** e **/ (root)**, clique em **Save**, e **me avise**. Em uns 2 minutos o site antigo volta.

### 1.4. Supabase (para os comentários e o login)

1. Entre no seu projeto em supabase.com.
2. Menu da esquerda: **Authentication** → **URL Configuration**.
3. Em **Site URL**, escreva `https://hatecycle.com`.
4. Em **Redirect URLs**, clique em **Add URL** e acrescente `https://hatecycle.com/**` (com os dois asteriscos no fim). Deixe as que já estão aí.
5. **Save**.

Sem isto, o e-mail de confirmação da conta, o "esqueci a senha" e o login com Google mandariam a pessoa para o endereço errado. (Mais detalhes no passo 5 de `docs/comentarios-supabase.md`.)

### 1.5. Disqus (só se você quiser guardar os comentários antigos)

O site antigo usa o Disqus nas páginas `firestriker.html`, `pederneira.html` e `night.html`. O site novo tem comentários próprios (Supabase), então **as conversas do Disqus deixam de aparecer** e **não dá para levá-las para o Supabase**. Se existe algum comentário lá que você queira guardar, exporte pelo painel do Disqus (procure por **Export**, "Exportar", nas configurações da comunidade `hatecycle-com`; o Disqus manda o arquivo por e-mail; o nome exato do menu pode estar diferente). Se não havia comentários, ignore.

### 1.6. O que eu já deixei pronto

- A **cópia de segurança do site antigo** já existe no GitHub: é a branch **`site-antigo`**. Ela é o seu "botão de voltar" (ver a seção 3). Não apague.
- O **pull request nº 1** (que traz o site novo) mostra se a "linha de montagem" funciona: antes de segunda ele tem de aparecer com **"All checks have passed"** (tudo verde). Não clique em "Merge" você mesmo: o merge é feito por mim, no horário combinado.

## 2. Segunda ao meio-dia: o que acontece

| Hora (Brasília) | O que acontece | Você precisa fazer algo? |
|---|---|---|
| 12:00 | Eu faço o **merge** do pull request nº 1 na `main`. | Não. |
| 12:00–12:05 | O GitHub liga a **linha de montagem** ("Site"): instala as peças, confere o código, constrói o site e publica. Leva **de 2 a 5 minutos**. Dá para acompanhar em **Actions**, no menu do repositório: bolinha amarela = trabalhando, verde = pronto, vermelha = deu erro. | Não. |
| ~12:05 | Eu rodo a conferência dos endereços-chave (`tools/conferir_no_ar.py`) e te aviso o resultado. | Não. |
| 12:05–12:15 | O site novo já está publicado, mas o GitHub guarda cópias das páginas em servidores espalhados (o "cache"), por até **10 minutos**. Nesse tempo, quem abrir o site pode ainda ver o antigo. | Se você ainda vir o antigo: abra numa janela anônima, ou aperte **Ctrl+F5** (no Mac, Cmd+Shift+R). |

Depois de 15 minutos, todo mundo vê o site novo. Se não, é hora de olhar a seção 3.

## 3. Se algo der errado: voltar atrás em minutos

Se o site novo estiver quebrado, ou você simplesmente não gostar, é só pôr o **site antigo** de volta. Ele está guardado inteiro na branch `site-antigo`.

1. **Settings → Pages**, em **Build and deployment**.
2. Em **Source**, troque **GitHub Actions** por **Deploy from a branch**.
3. Aparecem dois campos novos: em **Branch**, escolha **`site-antigo`**; ao lado, escolha **/ (root)**.
4. Clique em **Save**.

O que você vai ver: na aba **Actions**, uma tarefa chamada "pages build and deployment" que fica amarela por **1 a 3 minutos** e depois verde (a tela de Pages também mostra o endereço do site). Em **Custom domain** continua `hatecycle.com` (confira). Mais até **10 minutos** de cache, como na virada.

Os comentários do Supabase **não se perdem**: continuam guardados; o site antigo só não os mostra.

**Para voltar ao site novo depois** (quando o problema estiver resolvido): em Settings → Pages, ponha **Source = GitHub Actions** de novo. Depois vá em **Actions** → **Site** → **Run workflow** (botão à direita) → branch `main` → **Run workflow**. Em alguns minutos o site novo reaparece.

Enquanto o site antigo estiver de volta no ar, a linha de montagem pode aparecer vermelha em Actions se alguém enviar mudanças para a `main`. É esperado e não estraga nada.

## 4. Depois da virada: como uma notícia ou um capítulo novo chega ao site

Não muda o jeito de **escrever**: as mesmas pastas em `content/` (`en.md` e `pt.md`), os mesmos campos no topo, as mesmas imagens em `static/`. Só muda **como o site é publicado**: não existe mais subir uma pasta `public/` à mão. Quem publica é a linha de montagem.

### Caminho 1 (o de hoje): você me manda, eu publico

1. Você me manda o que mudou (o zip, como hoje, ou os arquivos soltos).
2. Eu coloco no projeto, construo o site no meu lado para ver se está tudo certo e te mostro como ficou.
3. Eu envio para a `main` no GitHub.
4. O GitHub constrói e publica sozinho, em **2 a 5 minutos**. Mais até 10 minutos de cache.
5. Eu confiro no ar e te aviso.

### Caminho 2 (pelo site do GitHub, sem mim)

Funciona para notícias e capítulos novos:

1. No repositório, abra a pasta onde o arquivo vai (por exemplo `content/news/`) e clique em **Add file → Upload files**.
2. Arraste a pasta nova (`2026-10-30-nome-da-noticia`, com `en.md` e `pt.md`). As imagens vão para as pastas de `static/` (por exemplo `static/news/`), do mesmo modo.
3. Embaixo, deixe marcado **Commit directly to the `main` branch** e clique em **Commit changes**.
4. Vá em **Actions** e espere a bolinha ficar verde (2 a 5 minutos). Pronto: está no ar.

Cuidados:

- O navegador aceita até **100 arquivos por envio** e **25 MB por arquivo**. Imagem maior que isso, me mande.
- **Nunca renomeie** a pasta de uma notícia, obra ou capítulo que já está no ar (os comentários dela somem).
- Se você escrever um campo errado no topo de um arquivo (por exemplo `dat:` em vez de `date:`), a construção **para com um aviso** e a bolinha fica **vermelha**. **Nesse caso o site no ar não muda**: continua a versão anterior. Clique na bolinha vermelha para ler a mensagem (ela diz o arquivo e o campo) e corrija. O GitHub também te manda um e-mail.
- A linha de montagem **não confere o conteúdo do texto**: se você publicar uma notícia só em um idioma, ou com uma gralha, ela vai ao ar assim mesmo. Quem confere é você (ou eu, no Caminho 1).
- Os **rascunhos** continuam funcionando: `draft: true` no topo do arquivo (ou `"draft": true` no `work.json`) esconde do site publicado.

### Ver como vai ficar antes de publicar

No seu computador, `pnpm dev` mostra o site novo com os rascunhos em `http://localhost:4321/pt/` (veja `docs/aprendendo-astro/01-anatomia.md`). Isto não muda nada no site no ar.
