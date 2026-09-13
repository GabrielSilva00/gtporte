-- =====================================================================
-- GTPORTE — estudante de teste pronto para uso
--
-- NAO E UMA MIGRATION. E um script de apoio ao desenvolvimento: rode a
-- mao no SQL Editor quando quiser uma conta de estudante ja aprovada e
-- alocada, sem precisar percorrer o cadastro e esperar validacao.
--
-- O que ele deixa pronto:
--   . registro em `estudante` com prontuario, curso e periodo letivo
--   . os 4 documentos como 'aprovado' e status_documental = 'aprovado'
--   . alocacao ativa na primeira rota ativa encontrada
--   . grade horaria de segunda a sexta
--
-- COMO USAR
--   1. Troque a senha na linha marcada abaixo por uma de sua escolha.
--   2. Rode o script inteiro no SQL Editor do Supabase.
--   3. Entre no app com o e-mail e a senha definidos aqui.
--
-- AVISO: nao versione este arquivo com uma senha real dentro. O banco
-- e o mesmo que o grupo usa, e o repositorio e publico. Trate a conta
-- como descartavel e remova-a quando terminar os testes (ver o bloco
-- de remocao no fim do arquivo).
--
-- Idempotente: rodar de novo atualiza o que ja existe, sem duplicar.
-- =====================================================================

do $$
declare
  -- >>> CONFIGURACAO ------------------------------------------------
  v_email    text := 'estudante.teste@gtporte.local';
  v_senha    text := 'TROQUE_ESTA_SENHA';   -- <<< troque antes de rodar
  v_nome     text := 'Estudante de Teste';
  -- -----------------------------------------------------------------
  v_user_id       uuid;
  v_estudante_id  uuid;
  v_universidade  uuid;
  v_cidade        uuid;
  v_rota          uuid;
  v_tipo          text;
begin
  if v_senha = 'TROQUE_ESTA_SENHA' then
    raise exception 'Defina uma senha na variavel v_senha antes de rodar este script.';
  end if;

  -- 1. Conta de acesso -------------------------------------------------
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_nome, 'tipo', 'estudante')
    );
    -- o trigger on_auth_user_created cria o perfil correspondente
  else
    update auth.users
       set encrypted_password = crypt(v_senha, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user_id;
  end if;

  -- Garante o perfil mesmo que o trigger nao exista neste ambiente.
  insert into public.perfil (id, nome, email, tipo)
       values (v_user_id, v_nome, v_email, 'estudante')
  on conflict (id) do update set tipo = 'estudante', nome = excluded.nome;

  -- 2. Referencias de cadastro ----------------------------------------
  select id into v_universidade from public.universidade where ativa order by nome limit 1;
  select id into v_cidade       from public.cidade order by nome limit 1;

  if v_universidade is null or v_cidade is null then
    raise exception 'Rode antes o 0004_seed.sql: nao ha universidade ou cidade cadastrada.';
  end if;

  -- 3. Estudante -------------------------------------------------------
  select id into v_estudante_id from public.estudante where perfil_id = v_user_id;

  if v_estudante_id is null then
    insert into public.estudante (
      perfil_id, nome, cpf, data_nascimento, telefone, email,
      curso, endereco, universidade_id, cidade_id, ano_semestre,
      perfil_uso, status_documental, ativo
    ) values (
      v_user_id, v_nome, '000.000.000-00', '2003-03-15', '(18) 9 0000-0000', v_email,
      'Analise e Desenvolvimento de Sistemas', 'Rua de Teste, 100 - Centro',
      v_universidade, v_cidade, to_char(now(), 'YYYY') || '/1',
      'ida_volta', 'aprovado', true
    )
    returning id into v_estudante_id;
  else
    update public.estudante
       set status_documental = 'aprovado',
           ativo = true,
           universidade_id = coalesce(universidade_id, v_universidade),
           cidade_id = coalesce(cidade_id, v_cidade),
           atualizado_em = now()
     where id = v_estudante_id;
  end if;

  -- 4. Documentos aprovados -------------------------------------------
  foreach v_tipo in array array['rg', 'cpf', 'matricula', 'residencia'] loop
    insert into public.documento (
      estudante_id, tipo, nome_arquivo, storage_path, status, revisado_em
    ) values (
      v_estudante_id, v_tipo::tipo_documento,
      v_tipo || '-teste.pdf',
      v_estudante_id || '/' || v_tipo || '-teste.pdf',
      'aprovado', now()
    )
    on conflict (estudante_id, tipo) do update
      set status = 'aprovado', revisado_em = now(), observacao = null;
  end loop;

  -- 5. Grade horaria: segunda a sexta, 19h as 22h40 --------------------
  delete from public.grade_horaria where estudante_id = v_estudante_id;
  insert into public.grade_horaria (estudante_id, dia_semana, hora_inicio, hora_fim)
  select v_estudante_id, d, time '19:00', time '22:40' from generate_series(1, 5) d;

  -- 6. Alocacao em rota ------------------------------------------------
  select id into v_rota from public.rota where status <> 'inativa' order by codigo limit 1;

  if v_rota is null then
    raise notice 'Nenhuma rota ativa encontrada: o estudante fica sem alocacao.';
  else
    update public.alocacao_estudante
       set ativa = false, encerrado_em = now()
     where estudante_id = v_estudante_id and ativa;

    insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa)
         values (v_estudante_id, v_rota, 'alocado', 'manual', true);
  end if;

  raise notice 'Pronto. Entre no app com % (estudante %).', v_email, v_estudante_id;
end;
$$;

-- =====================================================================
-- REMOCAO — rode este bloco quando nao precisar mais da conta de teste.
-- O delete em auth.users leva junto perfil, estudante, documentos,
-- grade e alocacao, por conta dos "on delete cascade".
-- =====================================================================
-- delete from auth.users where email = 'estudante.teste@gtporte.local';
