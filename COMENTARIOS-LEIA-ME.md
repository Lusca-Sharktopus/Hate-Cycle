# Comentários com contas (sem Disqus)

O site continua sendo só arquivos; contas e comentários ficam num serviço gratuito chamado **Supabase**.
Configuração (uma vez, ~10 minutos):

1. Crie uma conta em https://supabase.com e um **New project** (guarde a senha do banco; não vai precisar dela no site).
2. No menu do projeto: **SQL Editor → New query**. Abra o arquivo `supabase-setup.sql`, copie tudo, cole ali e clique **Run**.
3. **Project Settings → API**: copie a **Project URL** e a chave **anon public**.
4. Cole as duas em `config.json`, no bloco `"comments"`:
   ```
   "comments": { "supabase_url": "https://xxxx.supabase.co", "supabase_anon_key": "eyJ..." }
   ```
   (a chave *anon* é feita para ficar pública; **nunca** use a `service_role`).
5. **Authentication → URL Configuration**: em *Site URL* ponha o endereço do seu site (para os links de confirmação de e-mail funcionarem).
   Em *Redirect URLs* adicione o mesmo endereço com `/**` no final. Para testar no seu computador, adicione também `http://localhost:8000/**`.
6. Rode `python build.py` de novo. Crie a sua conta em qualquer capítulo, confirme o e-mail e rode o último bloco do `supabase-setup.sql`
   (o que começa com `update public.profiles ...`) para se tornar administrador — assim você apaga qualquer comentário.

Pronto: cada capítulo e cada notícia ganha comentários. A conversa é a mesma nos dois idiomas.
Enquanto `config.json` estiver em branco, nenhuma caixa de comentários aparece no site publicado (só um aviso na prévia local).


## Login com o Google

O botão "Continuar com o Google" só funciona depois que você ativa o Google no Supabase:

1. Em <https://console.cloud.google.com> crie um projeto → **APIs e serviços → Tela de consentimento OAuth** (tipo *Externo*, preencha nome do app e e-mail).
2. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo *Aplicativo da Web*.
   - Em **URIs de redirecionamento autorizados** cole: `https://SEU-PROJETO.supabase.co/auth/v1/callback` (o endereço da sua Project URL + `/auth/v1/callback`).
   - Em **Origens JavaScript autorizadas** ponha o endereço do seu site.
3. Copie o **ID do cliente** e a **chave secreta** que o Google mostrar.
4. No Supabase: **Authentication → Providers → Google** → ative e cole os dois valores → Save.
5. Confira em **Authentication → URL Configuration** se o *Site URL* e os *Redirect URLs* (com `/**`) são os do seu site.

6. **Se você já tinha rodado o `supabase-setup.sql` antes**, rode no SQL Editor só este trecho, para que contas do Google usem o nome da conta Google (e não `user-abc123`):

```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  n := trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''));
  if char_length(n) > 30 then n := left(n, 30); end if;
  if char_length(n) < 2 then n := 'user-' || substr(new.id::text, 1, 6); end if;
  insert into public.profiles (id, display_name) values (new.id, n);
  return new;
end $$;
```


## Editar comentários

Quem comentou vê um botão "Editar" nos próprios comentários; depois de editado aparece "(editado)" em cinza ao lado do nome.
**Se você já tinha rodado o `supabase-setup.sql` antes**, rode no SQL Editor só o bloco `-- 5) EDITAR COMENTÁRIOS` que está no final do arquivo
(ele usa `if not exists` / `or replace`, então não dá erro de "já existe"). Até rodar, os comentários continuam aparecendo normalmente, mas o botão Editar dará erro.

No campo de comentário (e nas respostas e edições): **Enter envia**, **Shift+Enter** pula linha.
