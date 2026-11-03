#!/usr/bin/env python3
"""Prova as migrações do banco dos comentários num Postgres LOCAL, sem rede e sem o Supabase de verdade.

Sobe um Postgres temporário (pasta temporária, só socket, nada na porta de rede), cria uma imitação mínima do Supabase
(papéis anon/authenticated/service_role, esquema auth com auth.users e auth.uid() lendo request.jwt.claim.sub, as permissões
padrão que o Supabase dá em public), aplica TODAS as migrações de supabase/migrations/ em ordem (a última duas vezes, para provar
que é idempotente) e roda os casos abaixo como os papéis do site. Cada caso diz o que se espera; no fim, um resumo.

Uso:  python3 tools/banco_local.py            (precisa de Postgres 16 instalado: initdb/pg_ctl/psql; roda como root ou como o
                                               usuário postgres — como root, os comandos do servidor rodam como "postgres")
Fora do `pnpm test` de propósito (precisa do Postgres). Origem: B25 / pedido do autor de 02/11/2026 (opção b).
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRACOES = sorted(glob.glob(os.path.join(RAIZ, "supabase", "migrations", "*.sql")))
BIN = next((p for p in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True)), "")
COMO_POSTGRES = ["runuser", "-u", "postgres", "--"] if os.geteuid() == 0 else []

# papéis (valem para o servidor inteiro; criados uma vez) e o resto da imitação (por banco)
PAPEIS = "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
IMITACAO = r"""
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
"""

A, B, C, D = (f"00000000-0000-0000-0000-00000000000{i}" for i in "abcd")
NOTICIA = "news/2023-08-18-orcs"
CAPITULO = "works/firestriker/01"


def main() -> int:
    if not BIN:
        print("✗ Postgres não encontrado (/usr/lib/postgresql/*/bin)")
        return 2
    pasta = tempfile.mkdtemp(prefix="hc-banco-")
    dados, sock = os.path.join(pasta, "dados"), os.path.join(pasta, "sock")
    os.makedirs(sock)
    if COMO_POSTGRES:
        shutil.chown(pasta, "postgres")
        shutil.chown(sock, "postgres")
    run = lambda *a, **k: subprocess.run(COMO_POSTGRES + list(a), capture_output=True, text=True, **k)
    r = run(f"{BIN}/initdb", "-D", dados, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8")
    if r.returncode:
        print(r.stderr)
        return 2
    r = run(f"{BIN}/pg_ctl", "-D", dados, "-l", os.path.join(pasta, "log"), "-w", "-o", f"-c listen_addresses='' -k {sock} -p 55432", "start")
    if r.returncode:
        print(r.stderr, open(os.path.join(pasta, "log")).read())
        return 2
    try:
        ok, _, err = psql(run, sock, PAPEIS, None, None)
        if not ok:
            print("✗ papéis do Supabase:", err)
            return 1
        antigo = banco_antigo(lambda sql, papel=None, sub=None, db="antigo": psql(run, sock, sql, papel, sub, db))
        return casos(lambda sql, papel=None, sub=None: psql(run, sock, sql, papel, sub), lambda pedidos: juntos(sock, pedidos)) or antigo
    finally:
        run(f"{BIN}/pg_ctl", "-D", dados, "-m", "immediate", "stop")
        shutil.rmtree(pasta, ignore_errors=True)


def psql(run, sock, sql: str, papel: str | None, sub: str | None, db: str = "postgres"):
    """Roda `sql` (como o papel e o usuário do site, se dados) numa transação; devolve (ok, saída, erro)."""
    pre = ""
    if papel:
        pre = f"set local role {papel};\n"
        if sub:
            pre += f"set local request.jwt.claim.sub = '{sub}';\n"
    r = run(f"{BIN}/psql", "-h", sock, "-p", "55432", "-U", "postgres", "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
            "-c", sql if sql.lower().startswith("create database") else "begin;\n" + pre + sql.rstrip().rstrip(";") + ";\ncommit;")
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()


def juntos(sock, pedidos):
    """Roda vários (sql, papel, sub) AO MESMO TEMPO, cada um na sua conexão e transação; devolve [(ok, erro)]."""
    procs = []
    for sql, papel, sub in pedidos:
        pre = f"set local role {papel};\nset local request.jwt.claim.sub = '{sub}';\n"
        procs.append(subprocess.Popen(COMO_POSTGRES + [f"{BIN}/psql", "-h", sock, "-p", "55432", "-U", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
                                                       "-c", "begin;\n" + pre + sql + ";\nselect pg_sleep(0.5);\ncommit;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
    return [(p.wait() == 0, p.stderr.read().strip()) for p in procs]


def banco_antigo(q) -> int:
    """Projeto criado com um setup ANTIGO, sem o bloco 5 (editar comentários) — como o do autor (03/11/2026: "trigger comments_edit_check
    does not exist"). A migração nova tem de rodar nele e deixar tudo como num projeto completo."""
    q("create database antigo", db="postgres")
    inicial = open(MIGRACOES[0], encoding="utf8").read()
    sem_bloco5 = inicial[: inicial.index("-- 5) EDITAR COMENTÁRIOS")]
    passos = [("imitação do Supabase", IMITACAO), ("setup antigo (sem o bloco 5)", sem_bloco5)] + [(os.path.basename(m), open(m, encoding="utf8").read()) for m in MIGRACOES[1:]]
    for nome, sql in passos:
        ok, _, err = q(sql)
        if not ok:
            print(f"✗ banco antigo: {nome} ({err})")
            return 1
    ok, saida, err = q("select (select count(*) from pg_trigger where tgname in ('comments_check','comments_edit_check','comments_soft_delete','comments_cleanup') and not tgisinternal)"
                       " || '|' || (select count(*) from pg_policies where policyname = 'editar o proprio comentario')"
                       " || '|' || (select count(*) from information_schema.columns where table_name = 'comments' and column_name in ('edited_at','deleted_at'))")
    certo = ok and saida == "4|1|2"
    print(("✔ " if certo else "✗ ") + "banco antigo (sem o bloco 5): a migração roda e cria gatilhos, policy de edição e colunas" + ("" if certo else f" (veio {saida or err!r})"))
    return 0 if certo else 1


def casos(q, paralelo=None) -> int:
    resultados: list[tuple[bool, str]] = []

    def caso(nome: str, sql: str, *, papel=None, sub=None, erro: str | None = None, depois: str | None = None, espera: str | None = None):
        ok, saida, err = q(sql, papel, sub)
        if erro is not None:
            passou = (not ok) and erro in err
            detalhe = "" if passou else f"(esperava erro com '{erro}'; veio {'sucesso' if ok else err!r})"
        else:
            passou = ok
            detalhe = "" if ok else f"(erro inesperado: {err})"
        if passou and depois is not None:
            ok2, saida2, err2 = q(depois)
            passou = ok2 and saida2 == espera
            if not passou:
                detalhe = f"(conferência: esperava {espera!r}, veio {saida2 if ok2 else err2!r})"
        resultados.append((passou, nome))
        print(("✔ " if passou else "✗ ") + nome + (" " + detalhe if detalhe else ""))

    # ── migrações: todas em ordem; a última de novo (idempotente) ──
    ok, _, err = q(IMITACAO)
    if not ok:
        print("✗ imitação do Supabase:", err)
        return 1
    for m in MIGRACOES + MIGRACOES[-1:]:
        ok, _, err = q(open(m, encoding="utf8").read())
        resultados.append((ok, f"migração {os.path.basename(m)}"))
        print(("✔ " if ok else "✗ ") + f"aplica {os.path.basename(m)}" + ("" if ok else f" ({err})"))
        if not ok:
            return 1

    def envelhecer():
        q("set local session_replication_role = replica; "
          "update public.comments set created_at = created_at - interval '1 minute', edited_at = edited_at - interval '1 minute'")

    # ── contas: A (admin), B, C, D ──
    q("insert into auth.users (id, email, raw_user_meta_data) values "
      f"('{A}','a@x','{{\"display_name\":\"Admin\"}}'),('{B}','b@x','{{\"display_name\":\"Bia\"}}'),"
      f"('{C}','c@x','{{\"full_name\":\"Caio\"}}'),('{D}','d@x','{{}}');"
      f"update public.profiles set is_admin = true where id = '{A}';")
    caso("perfis criados pelo gatilho (nome dos metadados ou user-xxxxxx)", "select 1",
         depois="select string_agg(display_name, ',' order by id) from public.profiles", espera="Admin,Bia,Caio,user-000000")

    ins = lambda corpo, page=NOTICIA, pai="null", extra="": (
        f"insert into public.comments (page_id, body, parent_id{', ' + extra.split('=')[0] if extra else ''}) "
        f"values ('{page}', '{corpo}', {pai}{', ' + extra.split('=', 1)[1] if extra else ''})")

    # 1) data falsa ignorada; limite de 10 s
    caso("data inventada ao criar é trocada pela do servidor", ins("primeiro", extra="created_at='2020-01-01'"), papel="authenticated", sub=B,
         depois="select extract(year from created_at) = extract(year from now()) from public.comments where body = 'primeiro'", espera="t")
    caso("(editado) falso ao criar é ignorado", "select 1", depois="select edited_at is null from public.comments where body = 'primeiro'", espera="t")
    caso("segundo comentário em menos de 10 s é recusado", ins("segundo"), papel="authenticated", sub=B, erro="rate limit")
    caso("…mesmo dizendo que o primeiro é antigo (data falsa não burla mais)", ins("segundo", extra="created_at='2000-01-01'"), papel="authenticated", sub=B, erro="rate limit")
    # 2) formato e conteúdo
    caso("page_id fora do formato é recusado", ins("x", page="qualquer/coisa"), papel="authenticated", sub=C, erro="comments_page_id_formato")
    caso("page_id de capítulo é aceito", ins("no capítulo", page=CAPITULO), papel="authenticated", sub=C)
    envelhecer()
    caso("page_id de post do blog é aceito", ins("no blog", page="blog/2026-11-03-primeiro-post"), papel="authenticated", sub=C)
    q("set local session_replication_role = replica; delete from public.comments where body = 'no blog'")
    envelhecer()
    caso("corpo só com espaços e quebras de linha é recusado", ins("   \\n  ".replace("\\n", "\n")), papel="authenticated", sub=C, erro="check")
    caso("visitante sem conta não comenta", ins("anônimo"), papel="anon", erro="permission denied")
    envelhecer()
    caso("ninguém comenta em nome de outra pessoa", ins("falso", extra=f"user_id='{B}'"), papel="authenticated", sub=C, erro="not allowed")
    # 3) respostas
    caso("resposta de outra pessoa", ins("resposta da Caio", pai=f"(select id from public.comments where body = 'primeiro')"), papel="authenticated", sub=C)
    # 4) edição
    caso("editar o próprio comentário marca (editado)", "update public.comments set body = 'primeiro (corrigido)' where body = 'primeiro'", papel="authenticated", sub=B,
         depois="select edited_at is not null from public.comments where body = 'primeiro (corrigido)'", espera="t")
    caso("segunda edição em menos de 10 s é recusada", "update public.comments set body = 'de novo' where body = 'primeiro (corrigido)'", papel="authenticated", sub=B, erro="rate limit")
    envelhecer()
    caso("edição não muda página, dono nem data (o banco devolve os valores antigos)",
         f"update public.comments set body = 'primeiro (corrigido 2)', page_id = '{CAPITULO}', created_at = '2001-01-01', user_id = '{C}' where body = 'primeiro (corrigido)'",
         papel="authenticated", sub=B,
         depois=f"select page_id || '|' || (user_id = '{B}') || '|' || (extract(year from created_at) > 2001) from public.comments where body = 'primeiro (corrigido 2)'",
         espera=f"{NOTICIA}|true|true")
    q("set local session_replication_role = replica; update public.comments set body = 'primeiro (corrigido)' where body = 'primeiro (corrigido 2)'")
    caso("…e trocar só a página continua sem efeito", f"update public.comments set page_id = '{CAPITULO}' where body = 'primeiro (corrigido)'", papel="authenticated", sub=B,
         depois="select page_id from public.comments where body = 'primeiro (corrigido)'", espera=NOTICIA)
    caso("editar comentário de outra pessoa não muda nada", "update public.comments set body = 'invadido' where body = 'resposta da Caio'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'invadido'", espera="0")
    # 5) apagar com respostas → "[comentário apagado]"
    caso("apagar comentário que tem resposta: vira [apagado], sem dono, e a resposta fica",
         "delete from public.comments where body = 'primeiro (corrigido)'", papel="authenticated", sub=B,
         depois="select p.body || '|' || coalesce(p.user_id::text, 'sem dono') || '|' || (p.deleted_at is not null) || '|' || "
                "(select count(*) from public.comments r where r.parent_id = p.id) from public.comments p where p.parent_id is null and p.page_id = 'news/2023-08-18-orcs'",
         espera="[apagado]|sem dono|true|1")
    caso("ninguém responde a comentário apagado", ins("resposta tardia", pai="(select id from public.comments where body = '[apagado]')"), papel="authenticated", sub=A, erro="invalid parent")
    caso("comentário apagado não pode ser editado nem por quem o escreveu", "update public.comments set body = 'voltei' where body = '[apagado]'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'voltei'", espera="0")
    caso("comentário apagado não pode ser 'desapagado' (nem pelo banco)", "update public.comments set deleted_at = null, body = 'voltei' where body = '[apagado]'",
         erro="deleted comment cannot be edited")
    caso("quem não é dono nem admin não apaga (nada muda)", "delete from public.comments where body = 'resposta da Caio'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'resposta da Caio'", espera="1")
    caso("apagada a última resposta, o comentário apagado some junto", "delete from public.comments where body = 'resposta da Caio'", papel="authenticated", sub=C,
         depois=f"select count(*) from public.comments where page_id = '{NOTICIA}'", espera="0")
    # 6) apagar sem resposta → some; admin apaga de qualquer um
    caso("apagar comentário sem resposta apaga de vez", "delete from public.comments where body = 'no capítulo'", papel="authenticated", sub=C,
         depois="select count(*) from public.comments where body = 'no capítulo'", espera="0")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("raiz da Caio") + ";")
    envelhecer()
    caso("admin apaga comentário de qualquer pessoa", "delete from public.comments where body = 'raiz da Caio'", papel="authenticated", sub=A,
         depois="select count(*) from public.comments where body = 'raiz da Caio'", espera="0")
    # 7) conta apagada
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("raiz da Caio 2") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("raiz do D com resposta") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("resposta da Caio ao D", pai="(select id from public.comments where body = 'raiz do D com resposta')") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("raiz do D sem resposta", page=CAPITULO) + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("resposta do D", pai="(select id from public.comments where body = 'raiz da Caio 2')") + ";")
    caso("conta apagada: o que tem resposta de outra pessoa vira [apagado]; o resto dela some; o resto das outras fica",
         f"delete from auth.users where id = '{D}'",
         depois="select string_agg(body || ':' || coalesce((select display_name from public.profiles p where p.id = c.user_id), '-'), ',' order by c.id) from public.comments c",
         espera="raiz da Caio 2:Caio,[apagado]:-,resposta da Caio ao D:Caio")
    # 8) permissões
    caso("ninguém vira admin pelo site", f"update public.profiles set is_admin = true where id = '{B}'", papel="authenticated", sub=B, erro="permission denied")
    caso("ninguém troca o próprio nome pelo site (por enquanto)", f"update public.profiles set display_name = 'Outro' where id = '{B}'", papel="authenticated", sub=B, erro="permission denied")
    caso("ninguém esvazia a tabela", "truncate public.comments", papel="authenticated", sub=B, erro="permission denied")
    caso("visitante lê comentários e nomes", "select count(*) from public.comments; select count(*) from public.profiles;", papel="anon")
    caso("funções internas não podem ser chamadas pelo site", "select public.soft_delete_comment()", papel="authenticated", sub=B, erro="permission denied")
    caso("as funções têm search_path fixo", "select 1",
         depois="select count(*) from pg_proc where proname in ('check_new_comment','check_edit_comment','soft_delete_comment','cleanup_deleted_parent','before_delete_profile','handle_new_user','check_bookmark','change_my_name','delete_my_account') "
                "and proconfig is not null and 'search_path=\"\"' = any(proconfig)",
         espera="9")

    # 9) marca-páginas (migração 20261103020000)
    mp = lambda pag, par, fr="0.5", extra="": f"insert into public.bookmarks (page_id, paragrafo, fracao{', user_id' if extra else ''}) values ('{pag}', {par}, {fr}{', ' + extra if extra else ''})"
    caso("marca-página: quem tem conta guarda o seu", mp("works/firestriker/01", 12), papel="authenticated", sub=B,
         depois=f"select paragrafo || ':' || fracao from public.bookmarks where user_id = '{B}'", espera="12:0.5")
    caso("marca-página: guardar de novo no mesmo capítulo atualiza (upsert)",
         "insert into public.bookmarks (page_id, paragrafo, fracao) values ('works/firestriker/01', 30, 0.25) "
         "on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo, fracao = excluded.fracao", papel="authenticated", sub=B,
         depois=f"select paragrafo || ':' || fracao from public.bookmarks where user_id = '{B}'", espera="30:0.25")
    ok_, saida_, _ = q("select count(*) from public.bookmarks", "authenticated", C)
    resultados.append((ok_ and saida_ == "0", "marca-página: a Caio não vê o da Bia"))
    print(("✔ " if ok_ and saida_ == "0" else "✗ ") + "marca-página: a Caio não vê o da Bia")
    ok_, saida_, _ = q("select count(*) from public.bookmarks", "anon")
    resultados.append((not ok_, "marca-página: visitante sem conta não lê a tabela"))
    print(("✔ " if not ok_ else "✗ ") + "marca-página: visitante sem conta não lê a tabela")
    # o gatilho recusa antes do RLS ("not allowed"; revisão de 03/11), também quando a linha da outra pessoa já existe (upsert)
    caso("marca-página: ninguém grava em nome de outra pessoa", mp("works/firestriker/01", 1, extra=f"'{B}'"), papel="authenticated", sub=C, erro="not allowed")
    caso("marca-página: nem por upsert sobre o da outra pessoa",
         mp("works/firestriker/01", 1, extra=f"'{B}'") + " on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo",
         papel="authenticated", sub=C, erro="not allowed")
    caso("marca-página: ninguém muda o de outra pessoa", "update public.bookmarks set paragrafo = 0", papel="authenticated", sub=C,
         depois=f"select paragrafo from public.bookmarks where user_id = '{B}'", espera="30")
    caso("marca-página: ninguém apaga o de outra pessoa", "delete from public.bookmarks", papel="authenticated", sub=C,
         depois="select count(*) from public.bookmarks", espera="1")
    caso("marca-página: só em capítulo (page_id de capítulo)", mp("news/2023-08-18-orcs", 1), papel="authenticated", sub=C, erro="check")
    caso("marca-página: fração fora de 0–1 é recusada", mp("works/firestriker/01", 1, "1.5"), papel="authenticated", sub=C, erro="check")
    caso("marca-página: trocar de capítulo ou de dono não pega", f"update public.bookmarks set page_id = 'works/light-and-blood/01', user_id = '{C}'", papel="authenticated", sub=B,
         depois=f"select page_id || '|' || (user_id = '{B}') from public.bookmarks", espera="works/firestriker/01|true")
    caso("marca-página: apagar o próprio", "delete from public.bookmarks where page_id = 'works/firestriker/01'", papel="authenticated", sub=B,
         depois="select count(*) from public.bookmarks", espera="0")
    # revisão de 03/11: capítulo com nome gigante; limite de 1000 (com 1000, mover um que já existe pelo upsert do site continua valendo);
    # pedidos simultâneos não passam do limite
    caso("marca-página: capítulo com mais de 120 caracteres é recusado", mp("works/" + "a" * 200 + "/01", 1), papel="authenticated", sub=B, erro="check")
    q(f"insert into public.bookmarks (user_id, page_id, paragrafo) select '{B}', 'works/o' || g || '/01', 1 from generate_series(1, 1000) g")
    caso("marca-página: com 1000, o upsert de um capítulo que já tem continua valendo",
         "insert into public.bookmarks (page_id, paragrafo, fracao) values ('works/o5/01', 7, 0.1) "
         "on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo, fracao = excluded.fracao", papel="authenticated", sub=B,
         depois=f"select paragrafo from public.bookmarks where user_id = '{B}' and page_id = 'works/o5/01'", espera="7")
    caso("marca-página: com 1000, um capítulo novo é recusado", mp("works/novo/01", 1), papel="authenticated", sub=B, erro="too many bookmarks")
    q(f"delete from public.bookmarks where user_id = '{B}'")
    if paralelo:
        lotes = [(f"insert into public.bookmarks (page_id, paragrafo) select 'works/l{k}-' || g || '/01', 1 from generate_series(1, 1000) g", "authenticated", C) for k in range(3)]
        res = paralelo(lotes)
        ok_, saida_, _ = q(f"select count(*) from public.bookmarks where user_id = '{C}'")
        certo = ok_ and saida_ == "1000" and sum(1 for o, _ in res if o) == 1 and all("too many bookmarks" in e for o, e in res if not o)
        resultados.append((certo, "marca-página: 3 lotes de 1000 ao mesmo tempo param em 1000"))
        print(("✔ " if certo else "✗ ") + f"marca-página: 3 lotes de 1000 ao mesmo tempo param em 1000 (ficaram {saida_})")
        q(f"delete from public.bookmarks where user_id = '{C}'")
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + mp("works/firestriker/01", 3) + ";")
    caso("marca-página: some junto com a conta", f"delete from auth.users where id = '{C}'", depois="select count(*) from public.bookmarks", espera="0")

    # 10) a janela da conta (migração 20261103040000): trocar o próprio nome, apagar a própria conta
    caso("conta: trocar o próprio nome (limpa espaços)", "select public.change_my_name('  Bia   Nova  ')", papel="authenticated", sub=B,
         depois=f"select display_name from public.profiles where id = '{B}'", espera="Bia Nova")
    caso("conta: nome com 1 caractere é recusado", "select public.change_my_name(' x ')", papel="authenticated", sub=B, erro="name length")
    caso("conta: nome com mais de 30 é recusado", "select public.change_my_name(repeat('a', 31))", papel="authenticated", sub=B, erro="name length")
    caso("conta: nome com caractere de controle é recusado", "select public.change_my_name('Bia' || chr(7) || 'x')", papel="authenticated", sub=B, erro="invalid name")
    caso("conta: visitante sem conta não troca nome", "select public.change_my_name('Fulano')", papel="anon", erro="permission denied")
    caso("conta: ninguém troca o nome direto na tabela (nem vira admin)", "update public.profiles set display_name = 'Hacker', is_admin = true", papel="authenticated", sub=B,
         erro="permission denied")
    caso("conta: trocar o nome não mexe no de outra pessoa", "select public.change_my_name('Outra')", papel="authenticated", sub=B,
         depois=f"select display_name from public.profiles where id = '{A}'", espera="Admin")
    E = "00000000-0000-0000-0000-00000000000e"
    q(f"insert into auth.users (id, email, raw_user_meta_data) values ('{E}', 'e@x', '{{\"display_name\":\"Eva\"}}')")
    pagina_e = "works/firestriker/01"
    # Eva: um comentário com resposta da Bia, um sem resposta e uma resposta dela a um comentário da Bia; um marca-página
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + ins("da Eva com resposta", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{B}'; " +
      ins("resposta da Bia", pagina_e, f"(select id from public.comments where body = 'da Eva com resposta')"))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + ins("da Eva sem resposta", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{B}'; " + ins("raiz da Bia", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " +
      ins("resposta da Eva", pagina_e, f"(select id from public.comments where body = 'raiz da Bia')"))
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + mp("works/firestriker/01", 5))
    caso("conta: visitante sem conta não apaga conta nenhuma", "select public.delete_my_account()", papel="anon", erro="permission denied",
         depois="select count(*) from auth.users", espera="3")
    caso("conta: apagar a própria conta leva o usuário, o perfil e os marca-páginas", "select public.delete_my_account()", papel="authenticated", sub=E,
         depois=f"select (select count(*) from auth.users where id = '{E}') || '|' || (select count(*) from public.profiles where id = '{E}') || '|' || "
                f"(select count(*) from public.bookmarks where user_id = '{E}') || '|' || (select count(*) from auth.users)",
         espera="0|0|0|2")
    caso("conta: comentários da conta apagada (com resposta vira [apagado]; o resto some; os da Bia ficam)", "select 1",
         depois=f"select string_agg(case when deleted_at is null then body else '[apagado]' end, ',' order by id) from public.comments where page_id = '{pagina_e}'",
         espera="[apagado],resposta da Bia,raiz da Bia")

    falhas = [n for ok, n in resultados if not ok]
    print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} casos certos" + (f"; FALHARAM: {falhas}" if falhas else ""))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
