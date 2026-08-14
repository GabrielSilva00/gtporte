-- =====================================================================
-- GTPORTE - 0007_ajustes_ui.sql
-- Segunda rodada de ajustes solicitados:
--   1. codigo da rota gerado pelo banco e imutavel
--   2. cancelamento de presenca de ida/volta com motivo
--   3. permissao de acesso por pagina para cada usuario
--   4. login proprio no perfil (acesso criado pelo administrador)
--   5. canal unico de mensagens (mensagens e solicitacoes)
--   6. chaves de configuracao global do site e dos alertas
-- Idempotente: pode ser reexecutada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Codigo da rota
-- Antes o front sugeria "R07" contando as rotas existentes, o que gera
-- colisao quando duas telas cadastram ao mesmo tempo. Agora quem numera
-- e a sequence, e o codigo deixa de ser editavel.
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_rota_codigo start with 1;

-- Alinha a sequence ao maior numero ja usado, para nao repetir codigo
do $$
declare
  v_maior bigint;
begin
  select coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::bigint), 0)
    into v_maior
  from public.rota;

  perform setval('public.seq_rota_codigo', greatest(v_maior, 1), v_maior > 0);
end;
$$;

alter table public.rota
  alter column codigo set default 'R' || lpad(nextval('public.seq_rota_codigo')::text, 2, '0');

create or replace function public.trg_rota_codigo_imutavel()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'O codigo da rota e gerado pelo sistema e nao pode ser alterado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rota_codigo on public.rota;
create trigger trg_rota_codigo before update on public.rota
  for each row execute function public.trg_rota_codigo_imutavel();

-- ---------------------------------------------------------------------
-- 2. Cancelamento de presenca (ida e volta independentes, RN04)
-- O registro do cancelamento fica na propria linha de presenca: zera a
-- confirmacao e guarda o motivo, que e obrigatorio.
-- ---------------------------------------------------------------------
alter table public.presenca
  add column if not exists cancelou_ida             boolean not null default false,
  add column if not exists motivo_cancelamento_ida  text,
  add column if not exists cancelado_ida_em         timestamptz,
  add column if not exists cancelou_volta            boolean not null default false,
  add column if not exists motivo_cancelamento_volta text,
  add column if not exists cancelado_volta_em        timestamptz;

create or replace function public.cancelar_presenca(
  p_estudante_id uuid,
  p_trecho text,                -- 'ida' | 'volta'
  p_motivo text,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alocacao  uuid;
  v_estudante uuid;
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  -- Mesma guarda de confirmar_presenca(): o estudante so mexe no proprio
  -- registro, o staff pode cancelar em nome de qualquer um (RN09).
  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
    if v_estudante is null then
      raise exception 'Cadastro de estudante nao encontrado para este usuario';
    end if;
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    raise exception 'Perfil sem permissao para cancelar presenca';
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante
     and a.ativa and a.situacao = 'alocado';

  if v_alocacao is null then
    raise exception 'Estudante nao possui alocacao ativa em uma rota';
  end if;

  insert into public.presenca (alocacao_id, data)
  values (v_alocacao, p_data)
  on conflict (alocacao_id, data) do nothing;

  if p_trecho = 'ida' then
    update public.presenca
       set confirmou_ida = false,
           hora_ida = null,
           cancelou_ida = true,
           motivo_cancelamento_ida = trim(p_motivo),
           cancelado_ida_em = now()
     where alocacao_id = v_alocacao and data = p_data;
  else
    update public.presenca
       set confirmou_volta = false,
           hora_volta = null,
           cancelou_volta = true,
           motivo_cancelamento_volta = trim(p_motivo),
           cancelado_volta_em = now()
     where alocacao_id = v_alocacao and data = p_data;
  end if;

  perform public.registrar_log('cancelar_presenca', 'presenca', v_alocacao,
    jsonb_build_object('trecho', p_trecho, 'data', p_data, 'motivo', trim(p_motivo)));

  return jsonb_build_object(
    'mensagem', 'Presenca de ' || p_trecho || ' cancelada',
    'trecho', p_trecho
  );
end;
$$;

grant execute on function public.cancelar_presenca(uuid, text, text, date) to authenticated;

-- Confirmar de novo limpa a marca de cancelamento: o cancelamento vale
-- para o dia, nao e um bloqueio permanente.
create or replace function public.confirmar_presenca(
  p_estudante_id uuid,
  p_trecho text,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alocacao      uuid;
  v_rota          uuid;
  v_perfil_uso    perfil_uso;
  v_confirmou_ida boolean;
  v_retorno       time;
  v_antecedencia  int;
  v_capacidade    int;
  v_confirmados   int;
  v_estudante     uuid;
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  -- RN09: o estudante so confirma a propria presenca
  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
    if v_estudante is null then
      raise exception 'Cadastro de estudante nao encontrado para este usuario';
    end if;
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    raise exception 'Perfil sem permissao para registrar presenca';
  end if;

  select a.id, a.rota_id, e.perfil_uso
    into v_alocacao, v_rota, v_perfil_uso
    from public.alocacao_estudante a
    join public.estudante e on e.id = a.estudante_id
   where a.estudante_id = v_estudante
     and a.ativa and a.situacao = 'alocado';

  if v_alocacao is null then
    raise exception 'Estudante nao possui alocacao ativa em uma rota';
  end if;

  insert into public.presenca (alocacao_id, data)
  values (v_alocacao, p_data)
  on conflict (alocacao_id, data) do nothing;

  if p_trecho = 'ida' then
    if v_perfil_uso = 'somente_volta' then
      raise exception 'Estudante com perfil somente volta nao confirma ida';
    end if;
    update public.presenca
       set confirmou_ida = true,
           hora_ida = now(),
           cancelou_ida = false,
           motivo_cancelamento_ida = null,
           cancelado_ida_em = null
     where alocacao_id = v_alocacao and data = p_data;
    return jsonb_build_object('mensagem', 'Presenca de ida confirmada');
  end if;

  -- Trecho = volta
  if v_perfil_uso = 'somente_ida' then
    raise exception 'Estudante com perfil somente ida nao confirma volta';
  end if;

  select confirmou_ida into v_confirmou_ida
    from public.presenca where alocacao_id = v_alocacao and data = p_data;

  -- RN16: a dependencia da ida so vale para o perfil ida_volta
  if v_perfil_uso = 'ida_volta' and not coalesce(v_confirmou_ida, false) then
    select r.horario_retorno, v.capacidade_maxima
      into v_retorno, v_capacidade
      from public.rota r join public.veiculo v on v.id = r.veiculo_id
     where r.id = v_rota;

    select coalesce(valor::int, 2) into v_antecedencia
      from public.configuracao_sistema where chave = 'rn05_antecedencia_horas';

    -- RN05: antecedencia minima antes da partida da volta
    if now() > (p_data + v_retorno) - make_interval(hours => coalesce(v_antecedencia, 2)) then
      raise exception 'Prazo para confirmacao encerrado';
    end if;

    -- RN17: so ha vaga se sobrarem assentos apos os estudantes regulares
    select count(*) into v_confirmados
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
     where a.rota_id = v_rota and a.ativa and p.data = p_data and p.confirmou_volta;

    if v_confirmados >= v_capacidade then
      raise exception 'Volta disponivel apenas se houver vaga remanescente';
    end if;
  end if;

  update public.presenca
     set confirmou_volta = true,
         hora_volta = now(),
         cancelou_volta = false,
         motivo_cancelamento_volta = null,
         cancelado_volta_em = null
   where alocacao_id = v_alocacao and data = p_data;

  return jsonb_build_object('mensagem', 'Presenca de volta confirmada');
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Permissao de acesso por pagina (RF20)
-- A presenca da linha libera a pagina. Administrador nao depende da
-- tabela: enxerga tudo por definicao.
-- ---------------------------------------------------------------------
create table if not exists public.permissao_pagina (
  perfil_id uuid not null references public.perfil(id) on delete cascade,
  pagina    text not null,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, pagina)
);

create index if not exists idx_permissao_perfil on public.permissao_pagina(perfil_id);

alter table public.permissao_pagina enable row level security;

drop policy if exists permissao_select on public.permissao_pagina;
create policy permissao_select on public.permissao_pagina
  for select using (perfil_id = auth.uid() or public.eh_staff());

drop policy if exists permissao_write_admin on public.permissao_pagina;
create policy permissao_write_admin on public.permissao_pagina
  for all using (public.eh_admin()) with check (public.eh_admin());

-- Catalogo das paginas do painel administrativo. Mantido no banco para
-- que o admin sempre receba a lista completa mesmo sem linhas gravadas.
create or replace function public.paginas_do_sistema()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'alocacao', 'presenca', 'rotas',
    'estudantes', 'veiculos', 'motoristas', 'universidades',
    'documentos', 'relatorios', 'funcionarios',
    'solicitacoes', 'mensagens', 'configuracoes'
  ];
$$;

create or replace function public.minhas_paginas()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo tipo_perfil;
begin
  v_tipo := public.meu_tipo();

  if v_tipo is null then
    return '{}'::text[];
  end if;

  -- Administrador tem acesso total (RF20)
  if v_tipo = 'admin' then
    return public.paginas_do_sistema();
  end if;

  if v_tipo <> 'operador' then
    return '{}'::text[];
  end if;

  return coalesce(
    (select array_agg(pagina) from public.permissao_pagina where perfil_id = auth.uid()),
    '{}'::text[]
  );
end;
$$;

grant execute on function public.paginas_do_sistema() to authenticated;
grant execute on function public.minhas_paginas()    to authenticated;

-- Operadores que ja existiam continuam enxergando o que enxergavam antes
-- da tela de permissoes: sem esse seed eles ficariam sem menu nenhum.
insert into public.permissao_pagina (perfil_id, pagina)
select p.id, x.pagina
  from public.perfil p
  cross join unnest(array[
    'dashboard', 'alocacao', 'presenca', 'rotas',
    'estudantes', 'veiculos', 'motoristas', 'universidades',
    'documentos', 'relatorios', 'solicitacoes', 'mensagens'
  ]) as x(pagina)
 where p.tipo = 'operador'
   and not exists (select 1 from public.permissao_pagina pp where pp.perfil_id = p.id)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Login proprio
-- O administrador cria o acesso definindo login e senha; o e-mail e
-- opcional. Sem e-mail real o Auth recebe um endereco sintetico
-- <login>@gtporte.local, que so serve como identificador.
-- ---------------------------------------------------------------------
alter table public.perfil add column if not exists login text;

do $$
begin
  alter table public.perfil add constraint perfil_login_key unique (login);
exception when duplicate_table or duplicate_object then null;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfil (id, nome, email, telefone, tipo, login)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'telefone',
    coalesce((new.raw_user_meta_data->>'tipo')::tipo_perfil, 'estudante'),
    nullif(lower(trim(new.raw_user_meta_data->>'login')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Resolve login -> e-mail para a tela de login. Roda antes da
-- autenticacao, por isso precisa estar disponivel para o papel anon.
create or replace function public.email_do_login(p_login text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.perfil
   where login = lower(trim(p_login))
   limit 1;
$$;

grant execute on function public.email_do_login(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Canal de mensagens (RF16 ampliado)
-- Uma unica tabela atende a caixa de entrada e as solicitacoes: o que
-- muda entre as duas telas e apenas o filtro por tipo.
-- ---------------------------------------------------------------------
do $$ begin
  create type mensagem_tipo as enum ('mensagem', 'solicitacao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mensagem_status as enum ('aberta', 'respondida', 'encerrada');
exception when duplicate_object then null; end $$;

create table if not exists public.mensagem (
  id              uuid primary key default gen_random_uuid(),
  remetente_id    uuid references public.perfil(id) on delete set null,
  destinatario_id uuid references public.perfil(id) on delete set null,
  responde_a      uuid references public.mensagem(id) on delete cascade,
  tipo            mensagem_tipo   not null default 'mensagem',
  status          mensagem_status not null default 'aberta',
  assunto         text not null check (length(trim(assunto)) > 0),
  corpo           text not null check (length(trim(corpo)) > 0),
  lida_em         timestamptz,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_mensagem_criado on public.mensagem(criado_em desc);
create index if not exists idx_mensagem_thread on public.mensagem(responde_a);
create index if not exists idx_mensagem_tipo   on public.mensagem(tipo, status);

alter table public.mensagem enable row level security;

-- destinatario_id nulo significa "para o setor de transporte": qualquer
-- membro do staff atende.
drop policy if exists mensagem_select on public.mensagem;
create policy mensagem_select on public.mensagem
  for select using (
    public.eh_staff()
    or remetente_id = auth.uid()
    or destinatario_id = auth.uid()
  );

drop policy if exists mensagem_insert on public.mensagem;
create policy mensagem_insert on public.mensagem
  for insert with check (remetente_id = auth.uid());

drop policy if exists mensagem_update on public.mensagem;
create policy mensagem_update on public.mensagem
  for update using (public.eh_staff() or destinatario_id = auth.uid())
  with check (public.eh_staff() or destinatario_id = auth.uid());

drop policy if exists mensagem_delete_admin on public.mensagem;
create policy mensagem_delete_admin on public.mensagem
  for delete using (public.eh_admin());

-- Mensagens prontas / automaticas configuradas pelo administrador
create table if not exists public.mensagem_modelo (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  assunto    text not null,
  corpo      text not null,
  automatica boolean not null default false,
  evento     text,
  criado_em  timestamptz not null default now()
);

alter table public.mensagem_modelo enable row level security;

drop policy if exists modelo_select on public.mensagem_modelo;
create policy modelo_select on public.mensagem_modelo
  for select using (auth.uid() is not null);

drop policy if exists modelo_write_admin on public.mensagem_modelo;
create policy modelo_write_admin on public.mensagem_modelo
  for all using (public.eh_admin()) with check (public.eh_admin());

insert into public.mensagem_modelo (titulo, assunto, corpo, automatica, evento)
select * from (values
  ('Documento aprovado', 'Documentacao aprovada',
   'Ola! Sua documentacao foi aprovada e voce ja entra na proxima distribuicao de rotas.',
   false, 'documento_aprovado'),
  ('Documento pendente', 'Documentacao pendente',
   'Identificamos pendencia na sua documentacao. Reenvie os arquivos pelo painel do estudante.',
   false, 'documento_pendente'),
  ('Alocado em rota', 'Voce foi alocado em uma rota',
   'Voce foi alocado em uma rota do transporte academico. Confira os horarios em Minha Rota.',
   false, 'alocacao_definida')
) as m(titulo, assunto, corpo, automatica, evento)
where not exists (select 1 from public.mensagem_modelo);

-- ---------------------------------------------------------------------
-- 6. Configuracao global do site e dos alertas
-- ---------------------------------------------------------------------
insert into public.configuracao_sistema (chave, valor, descricao) values
  ('site_nome',              'GTPORTE',            'Nome exibido no cabecalho e no menu'),
  ('site_subtitulo',         'Painel de Controle', 'Linha de apoio abaixo do nome no menu'),
  ('contato_email',          '',                   'E-mail de contato do setor de transporte'),
  ('contato_telefone',       '',                   'Telefone de contato do setor de transporte'),
  ('alerta_docs_pendentes',  '1',   'Alerta na visao geral a partir de N documentos pendentes'),
  ('alerta_fila_espera',     '1',   'Alerta na visao geral a partir de N estudantes na fila'),
  ('alerta_ocupacao_critica','95',  'Percentual de ocupacao que dispara alerta de rota lotada')
on conflict (chave) do nothing;
