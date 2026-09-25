-- ---------------------------------------------------------------------
-- Conversas sem chatbot, motivos de contato, notificacoes, raio das
-- universidades e acesso limitado ate a validacao do cadastro
--
--  1. Acesso limitado. Enquanto a secretaria nao aprova a documentacao,
--     o estudante entra no aplicativo mas nao recebe dado externo
--     nenhum: rota, motorista, veiculo, paradas, posicao do onibus e
--     grupo da rota ficam fechados no banco, nao so escondidos na tela.
--  2. Motivos de contato. O chatbot sai. Toda conversa direta com a
--     secretaria ou com o motorista comeca com um motivo, e a lista de
--     motivos e mantida pela secretaria.
--  3. Notificacoes persistentes (tabela `notificacao`), alimentadas por
--     gatilhos: cadastro validado ou recusado, resposta em conversa,
--     recado do motorista no grupo e aproximacao do onibus. A tabela
--     entra na publicacao do Realtime, e cada linha nova pode virar um
--     push (Edge Function `enviar-push`, ver supabase/functions).
--  4. Raio das universidades. A secretaria define latitude, longitude e
--     raio de cada campus. Cada posicao de GPS gravada pelo motorista e
--     comparada com esses raios: ao entrar, os alunos daquela
--     universidade sao avisados de que o onibus esta proximo; ao sair,
--     os alunos da proxima universidade sao avisados de que o onibus
--     esta a caminho. O raio so e exposto ao motorista e a secretaria.
--  5. Historico de atividade do estudante, numa funcao so.
--  6. Realtime nas conversas, notificacoes e posicao do onibus.
--
-- Idempotente: pode ser reexecutada.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. ACESSO LIMITADO ATE A VALIDACAO
-- =====================================================================

/** O estudante logado tem o cadastro validado pela secretaria? */
create or replace function public.estudante_validado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.status_documental = 'aprovado'
       from public.estudante e
      where e.id = public.meu_estudante_id()),
    false
  );
$$;

revoke all on function public.estudante_validado() from public;
grant execute on function public.estudante_validado() to authenticated;


-- minha_rota continua sendo a mesma consulta; ela so passa a ser chamada
-- por um invólucro que retira rota, alocacao e presenca de quem ainda
-- nao foi validado. O nome antigo fica com o invólucro para o app nao
-- precisar mudar.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'minha_rota_completa'
               and pronamespace = 'public'::regnamespace) then
    return;
  end if;
  alter function public.minha_rota(date) rename to minha_rota_completa;
end;
$$;

revoke all on function public.minha_rota_completa(date) from public, authenticated, anon;

create or replace function public.minha_rota(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := public.minha_rota_completa(p_data);
begin
  if v is null or public.estudante_validado() then
    return v;
  end if;
  return v || jsonb_build_object(
    'alocacao', null, 'rota', null, 'presenca_hoje', null, 'solicitacao_volta', null
  );
end;
$$;

revoke all on function public.minha_rota(date) from public;
grant execute on function public.minha_rota(date) to authenticated;


-- Mesma estrategia para a lista da semana.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'minhas_rotas_semana_completa'
               and pronamespace = 'public'::regnamespace) then
    return;
  end if;
  alter function public.minhas_rotas_semana() rename to minhas_rotas_semana_completa;
end;
$$;

revoke all on function public.minhas_rotas_semana_completa() from public, authenticated, anon;

do $$
declare
  v_tipo text;
begin
  -- O invólucro devolve exatamente o mesmo tipo da funcao original.
  select pg_get_function_result(p.oid) into v_tipo
    from pg_proc p
   where p.proname = 'minhas_rotas_semana_completa'
     and p.pronamespace = 'public'::regnamespace;

  execute format($f$
    create or replace function public.minhas_rotas_semana()
    returns %s
    language plpgsql
    stable
    security definer
    set search_path = public
    as $b$
    begin
      if not public.estudante_validado() then
        return;
      end if;
      return query select * from public.minhas_rotas_semana_completa();
    end;
    $b$;
  $f$, v_tipo);
end;
$$;

revoke all on function public.minhas_rotas_semana() from public;
grant execute on function public.minhas_rotas_semana() to authenticated;


-- Paradas e posicao do veiculo: estudante so ve com cadastro validado e
-- na rota em que esta alocado. Motorista ve as proprias rotas; a
-- secretaria ve tudo.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'paradas_da_rota_completa'
               and pronamespace = 'public'::regnamespace) then
    return;
  end if;
  alter function public.paradas_da_rota(uuid) rename to paradas_da_rota_completa;
end;
$$;

revoke all on function public.paradas_da_rota_completa(uuid) from public, authenticated, anon;

/** Quem pode ver o trajeto e a posicao desta rota. */
create or replace function public.pode_ver_rota(p_rota_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_staff()
      or exists (select 1 from public.rota r
                  where r.id = p_rota_id and r.motorista_id = public.meu_motorista_id())
      or (public.estudante_validado() and exists (
            select 1 from public.alocacao_estudante a
             where a.rota_id = p_rota_id and a.ativa
               and a.estudante_id = public.meu_estudante_id()
          ))
      -- troca de onibus aceita: o aluno volta nesta rota hoje
      or (public.estudante_validado() and exists (
            select 1 from public.troca_rota t
             where t.rota_destino_id = p_rota_id and t.status = 'aprovada'
               and t.data = current_date
               and t.estudante_id = public.meu_estudante_id()
          ));
$$;

revoke all on function public.pode_ver_rota(uuid) from public;
grant execute on function public.pode_ver_rota(uuid) to authenticated;

create or replace function public.paradas_da_rota(p_rota_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pode_ver_rota(p_rota_id) then
    return jsonb_build_object('paradas', '[]'::jsonb, 'veiculo', null, 'situacao', null);
  end if;
  return public.paradas_da_rota_completa(p_rota_id);
end;
$$;

revoke all on function public.paradas_da_rota(uuid) from public;
grant execute on function public.paradas_da_rota(uuid) to authenticated;

-- A posicao do onibus era legivel por qualquer usuario logado.
drop policy if exists localizacao_select on public.localizacao_rota;
create policy localizacao_select on public.localizacao_rota
  for select using (public.pode_ver_rota(rota_id));


-- =====================================================================
-- 2. MOTIVOS DE CONTATO E CONVERSAS SEM CHATBOT
-- =====================================================================
create table if not exists public.motivo_conversa (
  id        uuid primary key default gen_random_uuid(),
  destino   conversa_destino not null,
  titulo    text not null check (length(trim(titulo)) > 0),
  descricao text,
  ordem     smallint not null default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (destino, titulo)
);

alter table public.motivo_conversa enable row level security;

drop policy if exists motivo_conversa_select on public.motivo_conversa;
create policy motivo_conversa_select on public.motivo_conversa
  for select using (auth.uid() is not null and (ativo or public.eh_staff()));

drop policy if exists motivo_conversa_staff on public.motivo_conversa;
create policy motivo_conversa_staff on public.motivo_conversa
  for all using (public.eh_staff()) with check (public.eh_staff());

-- Ponto de partida; a secretaria edita pela tela Conversas do painel.
insert into public.motivo_conversa (destino, titulo, descricao, ordem) values
  ('secretaria', 'Documentos',              'Envio, recusa ou dúvida sobre documentos', 1),
  ('secretaria', 'Cadastro e dados',        'Correção de dados pessoais ou acadêmicos', 2),
  ('secretaria', 'Rota e horários',         'Alocação, troca de rota ou horário',        3),
  ('secretaria', 'Outro assunto',           null,                                        9),
  ('motorista',  'Atraso',                  'Vou me atrasar ou o ônibus atrasou',        1),
  ('motorista',  'Ponto de embarque',       'Dúvida sobre onde embarcar',                2),
  ('motorista',  'Não vou hoje',            'Aviso de ausência na viagem',               3),
  ('motorista',  'Objeto esquecido',        'Esqueci algo no ônibus',                    4)
on conflict (destino, titulo) do nothing;

alter table public.conversa
  add column if not exists motivo_id uuid references public.motivo_conversa(id) on delete set null;

-- Uma conversa por motivo: o indice antigo (uma por destino) impediria
-- abrir um segundo assunto com a secretaria.
drop index if exists public.uq_conversa_direta;
create index if not exists idx_conversa_direta
  on public.conversa (estudante_id, destino) where tipo = 'direta';

-- Sem chatbot: tudo que estava com o bot passa a ser atendimento humano.
update public.conversa set situacao = 'humano' where situacao = 'bot';
alter table public.conversa alter column situacao set default 'humano';

drop function if exists public.escalar_conversa(uuid);
drop function if exists public.abrir_conversa_direta(conversa_destino, text);


/**
 * Participacao revista: o grupo da rota so e visivel ao estudante com
 * cadastro validado — e dado externo (nomes dos colegas e do motorista).
 */
create or replace function public.participa_da_conversa(p_conversa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversa c
     where c.id = p_conversa_id
       and (
         public.eh_staff()
         or c.estudante_id = public.meu_estudante_id()
         or exists (
              select 1 from public.rota r
               where r.id = c.rota_id and r.motorista_id = public.meu_motorista_id()
            )
         or (c.tipo = 'grupo' and public.estudante_validado() and exists (
              select 1 from public.alocacao_estudante a
               where a.rota_id = c.rota_id and a.ativa
                 and a.estudante_id = public.meu_estudante_id()
            ))
       )
  );
$$;


/**
 * Abre uma conversa direta com um motivo e ja grava a primeira mensagem.
 * Se existir conversa aberta com o mesmo destino e motivo, a mensagem
 * entra nela em vez de criar outra.
 */
create or replace function public.abrir_conversa_direta(
  p_destino   conversa_destino,
  p_motivo_id uuid,
  p_mensagem  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_motivo    public.motivo_conversa;
  v_rota      uuid;
  v_id        uuid;
begin
  if v_estudante is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;
  if length(trim(coalesce(p_mensagem, ''))) = 0 then
    raise exception 'Escreva a mensagem.';
  end if;

  select * into v_motivo from public.motivo_conversa
   where id = p_motivo_id and destino = p_destino and ativo;
  if not found then
    raise exception 'Escolha o motivo da conversa.';
  end if;

  if p_destino = 'motorista' then
    if not public.estudante_validado() then
      raise exception 'O contato com o motorista e liberado depois que a secretaria validar seu cadastro.';
    end if;

    select a.rota_id into v_rota
      from public.alocacao_estudante a
     where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado'
       and (a.dia_semana = extract(dow from current_date)::smallint or a.dia_semana is null)
     order by a.dia_semana nulls last
     limit 1;

    if v_rota is null then
      raise exception 'Voce nao esta alocado em uma rota hoje.';
    end if;
  end if;

  select c.id into v_id
    from public.conversa c
   where c.tipo = 'direta' and c.estudante_id = v_estudante
     and c.destino = p_destino
     and c.motivo_id = p_motivo_id
     and c.rota_id is not distinct from v_rota
     and c.situacao <> 'encerrada'
   order by c.ultima_em desc
   limit 1;

  if v_id is null then
    insert into public.conversa (tipo, estudante_id, destino, rota_id, motivo_id, assunto, situacao)
         values ('direta', v_estudante, p_destino, v_rota, p_motivo_id, v_motivo.titulo, 'humano')
      returning id into v_id;
  end if;

  insert into public.conversa_mensagem (conversa_id, autor_id, corpo)
       values (v_id, auth.uid(), trim(p_mensagem));

  return v_id;
end;
$$;

revoke all on function public.abrir_conversa_direta(conversa_destino, uuid, text) from public;
grant execute on function public.abrir_conversa_direta(conversa_destino, uuid, text) to authenticated;


/** Encerra a conversa direta: o estudante dono, o motorista ou a secretaria. */
create or replace function public.encerrar_conversa(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.participa_da_conversa(p_conversa_id) then
    raise exception 'Sem acesso a esta conversa.';
  end if;
  update public.conversa set situacao = 'encerrada'
   where id = p_conversa_id and tipo = 'direta';
end;
$$;

revoke all on function public.encerrar_conversa(uuid) from public;
grant execute on function public.encerrar_conversa(uuid) to authenticated;


-- Grupo: so para quem ja foi validado.
create or replace function public.garantir_grupos_das_rotas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_motorista uuid := public.meu_motorista_id();
  v_criados int := 0;
begin
  if v_motorista is not null then
    insert into public.conversa (tipo, rota_id)
    select 'grupo'::conversa_tipo, r.id
      from public.rota r
     where r.motorista_id = v_motorista
    on conflict do nothing;
    get diagnostics v_criados = row_count;
    return v_criados;
  end if;

  if v_estudante is null or not public.estudante_validado() then
    return 0;
  end if;

  insert into public.conversa (tipo, rota_id)
  select distinct 'grupo'::conversa_tipo, a.rota_id
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.rota_id is not null
  on conflict do nothing;

  get diagnostics v_criados = row_count;
  return v_criados;
end;
$$;


-- A lista ganha o motivo (assunto) e o motorista; o tipo de retorno muda,
-- entao a funcao e recriada.
drop function if exists public.minhas_conversas();
create function public.minhas_conversas()
returns table (
  id            uuid,
  tipo          conversa_tipo,
  destino       conversa_destino,
  situacao      conversa_situacao,
  titulo        text,
  subtitulo     text,
  assunto       text,
  rota_id       uuid,
  ultima_em     timestamptz,
  ultima_msg    text,
  participantes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_validado  boolean := public.estudante_validado();
begin
  if v_estudante is null then
    return;
  end if;

  return query
  select c.id,
         c.tipo,
         c.destino,
         c.situacao,
         case
           when c.tipo = 'grupo' then coalesce(r.codigo || ' — ' || r.nome, 'Grupo da rota')
           when c.destino = 'secretaria' then 'Secretaria'
           else coalesce(m.nome, 'Motorista')
         end,
         case
           when c.tipo = 'grupo' then coalesce(m.nome, 'Motorista') || ' e os estudantes da rota'
           when c.destino = 'secretaria' then 'Setor de transporte'
           else coalesce('Motorista · ' || r.codigo, 'Motorista')
         end,
         c.assunto,
         c.rota_id,
         c.ultima_em,
         (select cm.corpo from public.conversa_mensagem cm
           where cm.conversa_id = c.id order by cm.criado_em desc limit 1),
         case when c.tipo = 'grupo' then (
           select count(distinct a.estudante_id)::int + 1
             from public.alocacao_estudante a
            where a.rota_id = c.rota_id and a.ativa and a.situacao = 'alocado'
         ) else 2 end
    from public.conversa c
    left join public.rota r      on r.id = c.rota_id
    left join public.motorista m on m.id = r.motorista_id
   where (c.tipo = 'direta' and c.estudante_id = v_estudante
          and (c.destino = 'secretaria' or v_validado))
      or (c.tipo = 'grupo' and v_validado and exists (
            select 1 from public.alocacao_estudante a
             where a.rota_id = c.rota_id and a.ativa and a.estudante_id = v_estudante
          ))
   order by c.ultima_em desc;
end;
$$;

revoke all on function public.minhas_conversas() from public;
grant execute on function public.minhas_conversas() to authenticated;


-- Mensagens: sem "Assistente"; as antigas do bot aparecem como Sistema.
create or replace function public.mensagens_da_conversa(
  p_conversa_id uuid,
  p_limite int default 200
)
returns table (
  id         uuid,
  autor_id   uuid,
  autor_nome text,
  autor_tipo text,
  eh_bot     boolean,
  corpo      text,
  criado_em  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.participa_da_conversa(p_conversa_id) then
    raise exception 'Sem acesso a esta conversa.';
  end if;

  return query
  select m.id,
         m.autor_id,
         case when m.eh_bot then 'Sistema'
              when p.tipo in ('admin', 'operador') then coalesce(p.nome, 'Secretaria') || ' (Secretaria)'
              else coalesce(p.nome, 'Participante') end,
         coalesce(p.tipo::text, 'sistema'),
         m.eh_bot,
         m.corpo,
         m.criado_em
    from (
      select * from public.conversa_mensagem x
       where x.conversa_id = p_conversa_id
       order by x.criado_em desc
       limit p_limite
    ) m
    left join public.perfil p on p.id = m.autor_id
   order by m.criado_em;
end;
$$;


-- Enviar em conversa encerrada reabre o atendimento.
create or replace function public.enviar_mensagem_conversa(
  p_conversa_id uuid,
  p_corpo       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.participa_da_conversa(p_conversa_id) then
    raise exception 'Sem acesso a esta conversa.';
  end if;
  if length(trim(coalesce(p_corpo, ''))) = 0 then
    raise exception 'Mensagem vazia.';
  end if;

  insert into public.conversa_mensagem (conversa_id, autor_id, corpo)
       values (p_conversa_id, auth.uid(), trim(p_corpo))
    returning id into v_id;

  update public.conversa set situacao = 'humano'
   where id = p_conversa_id and situacao = 'encerrada';

  return v_id;
end;
$$;


/**
 * Caixa de atendimento da secretaria: conversas diretas com a secretaria
 * e, para acompanhamento, as conversas com motoristas e os grupos.
 */
create or replace function public.conversas_atendimento(
  p_destino conversa_destino default 'secretaria'
)
returns table (
  id              uuid,
  tipo            conversa_tipo,
  destino         conversa_destino,
  situacao        conversa_situacao,
  assunto         text,
  estudante_id    uuid,
  estudante_nome  text,
  prontuario      text,
  rota            text,
  motorista       text,
  criado_em       timestamptz,
  ultima_em       timestamptz,
  ultima_msg      text,
  aguardando      boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_staff() then
    raise exception 'Sem permissao.';
  end if;

  return query
  select c.id, c.tipo, c.destino, c.situacao, c.assunto,
         e.id, e.nome, e.prontuario,
         case when r.id is null then null else r.codigo || ' — ' || r.nome end,
         m.nome,
         c.criado_em, c.ultima_em,
         ult.corpo,
         -- a ultima fala e do estudante: esta esperando resposta
         coalesce(ult.autor_id = e.perfil_id, false)
    from public.conversa c
    left join public.estudante e on e.id = c.estudante_id
    left join public.rota r      on r.id = c.rota_id
    left join public.motorista m on m.id = r.motorista_id
    left join lateral (
      select cm.corpo, cm.autor_id from public.conversa_mensagem cm
       where cm.conversa_id = c.id order by cm.criado_em desc limit 1
    ) ult on true
   where (p_destino is null and c.tipo = 'grupo')
      or (c.tipo = 'direta' and c.destino = p_destino)
   order by c.ultima_em desc
   limit 500;
end;
$$;

revoke all on function public.conversas_atendimento(conversa_destino) from public;
grant execute on function public.conversas_atendimento(conversa_destino) to authenticated;


/** Conversas do motorista: diretas enderecadas a ele e os grupos das rotas dele. */
create or replace function public.conversas_do_motorista()
returns table (
  id              uuid,
  tipo            conversa_tipo,
  situacao        conversa_situacao,
  titulo          text,
  assunto         text,
  rota_id         uuid,
  rota            text,
  ultima_em       timestamptz,
  ultima_msg      text,
  aguardando      boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_motorista uuid := public.meu_motorista_id();
begin
  if v_motorista is null then
    return;
  end if;

  return query
  select c.id, c.tipo, c.situacao,
         case when c.tipo = 'grupo' then 'Grupo ' || r.codigo else coalesce(e.nome, 'Estudante') end,
         c.assunto,
         c.rota_id,
         r.codigo || ' — ' || r.nome,
         c.ultima_em,
         ult.corpo,
         coalesce(ult.autor_id is distinct from auth.uid() and ult.autor_id is not null, false)
    from public.conversa c
    join public.rota r on r.id = c.rota_id and r.motorista_id = v_motorista
    left join public.estudante e on e.id = c.estudante_id
    left join lateral (
      select cm.corpo, cm.autor_id from public.conversa_mensagem cm
       where cm.conversa_id = c.id order by cm.criado_em desc limit 1
    ) ult on true
   where c.tipo = 'grupo' or c.destino = 'motorista'
   order by c.ultima_em desc;
end;
$$;

revoke all on function public.conversas_do_motorista() from public;
grant execute on function public.conversas_do_motorista() to authenticated;


-- =====================================================================
-- 3. NOTIFICACOES
-- =====================================================================
create table if not exists public.notificacao (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfil(id) on delete cascade,
  -- cadastro | mensagem | onibus | documento | comunicado
  tipo      text not null,
  titulo    text not null,
  corpo     text not null,
  -- aba do app que resolve o assunto (inicio, rota, feedback, perfil...)
  destino   text,
  urgente   boolean not null default false,
  lida_em   timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_notificacao_perfil
  on public.notificacao (perfil_id, criado_em desc);

alter table public.notificacao enable row level security;

drop policy if exists notificacao_propria_select on public.notificacao;
create policy notificacao_propria_select on public.notificacao
  for select using (perfil_id = auth.uid() or public.eh_staff());

-- O dono so marca como lida; o conteudo vem dos gatilhos.
drop policy if exists notificacao_propria_update on public.notificacao;
create policy notificacao_propria_update on public.notificacao
  for update using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists notificacao_staff on public.notificacao;
create policy notificacao_staff on public.notificacao
  for all using (public.eh_staff()) with check (public.eh_staff());


/** Grava uma notificacao para um perfil; uso interno dos gatilhos. */
create or replace function public.notificar(
  p_perfil_id uuid,
  p_tipo      text,
  p_titulo    text,
  p_corpo     text,
  p_destino   text default null,
  p_urgente   boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notificacao (perfil_id, tipo, titulo, corpo, destino, urgente)
  select p_perfil_id, p_tipo, p_titulo, p_corpo, p_destino, p_urgente
   where p_perfil_id is not null;
$$;

revoke all on function public.notificar(uuid, text, text, text, text, boolean) from public, authenticated, anon;


-- Cadastro validado ou recusado pela secretaria.
create or replace function public.tg_notifica_validacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_documental = 'rejeitado' then
    perform public.notificar(new.perfil_id, 'cadastro',
      'Cadastro não validado',
      'A secretaria encontrou pendências no seu cadastro. Acesse o aplicativo e revise seus dados e documentos.',
      'documentos', true);
  elsif new.status_documental = 'aprovado' then
    perform public.notificar(new.perfil_id, 'cadastro',
      'Cadastro validado',
      'Seu cadastro foi aprovado. Rota, motorista e grupo da rota já estão liberados no aplicativo.',
      'inicio', false);
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_validacao on public.estudante;
create trigger notifica_validacao
  after update of status_documental on public.estudante
  for each row
  when (old.status_documental is distinct from new.status_documental)
  execute function public.tg_notifica_validacao();


-- Mensagem nova em conversa: avisa quem precisa responder.
create or replace function public.tg_notifica_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.conversa;
  v_autor  public.perfil;
  v_aluno  uuid;
  v_mot    uuid;
  v_trecho text := left(new.corpo, 140);
begin
  if new.eh_bot or new.autor_id is null then
    return new;
  end if;

  select * into c from public.conversa where id = new.conversa_id;
  select * into v_autor from public.perfil where id = new.autor_id;
  select e.perfil_id into v_aluno from public.estudante e where e.id = c.estudante_id;
  select m.perfil_id into v_mot
    from public.rota r join public.motorista m on m.id = r.motorista_id
   where r.id = c.rota_id;

  if c.tipo = 'direta' then
    if new.autor_id is distinct from v_aluno then
      -- resposta da secretaria ou do motorista para o aluno
      perform public.notificar(v_aluno, 'mensagem',
        case when c.destino = 'secretaria' then 'Resposta da secretaria' else 'Mensagem do motorista' end
          || coalesce(' · ' || c.assunto, ''),
        v_trecho, 'feedback', false);
    elsif c.destino = 'motorista' then
      perform public.notificar(v_mot, 'mensagem',
        'Mensagem de ' || coalesce(v_autor.nome, 'estudante') || coalesce(' · ' || c.assunto, ''),
        v_trecho, 'mensagens', false);
    end if;
  elsif c.tipo = 'grupo' and v_autor.tipo = 'motorista' then
    -- recado do motorista no grupo chega a todos os alunos da rota
    insert into public.notificacao (perfil_id, tipo, titulo, corpo, destino)
    select distinct e.perfil_id, 'mensagem', 'Motorista no grupo da rota', v_trecho, 'feedback'
      from public.alocacao_estudante a
      join public.estudante e on e.id = a.estudante_id
     where a.rota_id = c.rota_id and a.ativa and a.situacao = 'alocado'
       and e.perfil_id is not null and e.status_documental = 'aprovado';
  end if;

  return new;
end;
$$;

drop trigger if exists notifica_mensagem on public.conversa_mensagem;
create trigger notifica_mensagem
  after insert on public.conversa_mensagem
  for each row execute function public.tg_notifica_mensagem();


-- Inscricoes de push (Web Push). Uma por aparelho.
create table if not exists public.push_inscricao (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfil(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);

alter table public.push_inscricao enable row level security;

drop policy if exists push_propria on public.push_inscricao;
create policy push_propria on public.push_inscricao
  for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

/** Registra (ou transfere para este usuario) a inscricao de push do aparelho. */
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado.';
  end if;
  insert into public.push_inscricao (perfil_id, endpoint, p256dh, auth)
       values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke all on function public.registrar_push(text, text, text) from public;
grant execute on function public.registrar_push(text, text, text) to authenticated;


-- =====================================================================
-- 4. RAIO DAS UNIVERSIDADES (GEOFENCE)
-- =====================================================================
alter table public.universidade
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision,
  add column if not exists raio_aviso_m integer not null default 500;

do $$
begin
  alter table public.universidade
    add constraint universidade_raio_aviso_valido check (raio_aviso_m between 50 and 10000);
exception when duplicate_object then null;
end;
$$;

comment on column public.universidade.raio_aviso_m is
  'Raio, em metros, em volta do campus. Quando o onibus entra nele, os alunos desta universidade sao avisados. Visivel so para motorista e secretaria.';


/** Distancia em metros entre dois pontos (haversine). */
create or replace function public.distancia_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;


/**
 * Universidades atendidas pela rota, na ordem do trajeto de ida. A
 * posicao vem do cadastro da universidade; sem ela, da parada ligada a
 * universidade. Universidade sem parada entra depois das demais.
 */
create or replace function public.universidades_da_rota(p_rota_id uuid)
returns table (
  universidade_id uuid,
  nome            text,
  latitude        double precision,
  longitude       double precision,
  raio_m          integer,
  ordem           integer
)
language sql
stable
security definer
set search_path = public
as $$
  with pelas_paradas as (
    select p.universidade_id, min(p.ordem)::int as ordem,
           (array_agg(p.latitude order by p.ordem))[1]  as lat,
           (array_agg(p.longitude order by p.ordem))[1] as lng
      from public.parada_rota p
     where p.rota_id = p_rota_id and p.ativo and p.universidade_id is not null
     group by p.universidade_id
  ),
  pelos_alunos as (
    select distinct e.universidade_id
      from public.alocacao_estudante a
      join public.estudante e on e.id = a.estudante_id
     where a.rota_id = p_rota_id and a.ativa and a.situacao = 'alocado'
  ),
  todas as (
    select universidade_id from pelas_paradas
    union
    select universidade_id from pelos_alunos
  )
  select u.id, u.nome,
         coalesce(u.latitude, pp.lat),
         coalesce(u.longitude, pp.lng),
         u.raio_aviso_m,
         coalesce(pp.ordem, 1000)
    from todas t
    join public.universidade u on u.id = t.universidade_id
    left join pelas_paradas pp on pp.universidade_id = u.id
   order by coalesce(pp.ordem, 1000), u.nome;
$$;

revoke all on function public.universidades_da_rota(uuid) from public, authenticated, anon;


-- Estado de cada passagem: entrou e saiu do raio, por dia e trecho.
create table if not exists public.passagem_universidade (
  id              uuid primary key default gen_random_uuid(),
  rota_id         uuid not null references public.rota(id) on delete cascade,
  universidade_id uuid not null references public.universidade(id) on delete cascade,
  data            date not null default current_date,
  trecho          text not null check (trecho in ('ida', 'volta')),
  entrou_em       timestamptz,
  saiu_em         timestamptz,
  -- a proxima universidade ja foi avisada de que o onibus esta a caminho
  avisou_a_caminho boolean not null default false,
  unique (rota_id, universidade_id, data, trecho)
);

alter table public.passagem_universidade enable row level security;

drop policy if exists passagem_select on public.passagem_universidade;
create policy passagem_select on public.passagem_universidade
  for select using (
    public.eh_staff()
    or exists (select 1 from public.rota r
                where r.id = rota_id and r.motorista_id = public.meu_motorista_id())
  );


/** Avisa os alunos de uma universidade que viajam nesta rota hoje. */
create or replace function public.notificar_alunos_universidade(
  p_rota_id uuid,
  p_universidade_id uuid,
  p_trecho text,
  p_titulo text,
  p_corpo  text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia smallint := extract(dow from current_date)::smallint;
  v_n   int;
begin
  insert into public.notificacao (perfil_id, tipo, titulo, corpo, destino, urgente)
  select distinct e.perfil_id, 'onibus', p_titulo, p_corpo, 'rota', true
    from public.alocacao_estudante a
    join public.estudante e on e.id = a.estudante_id
    left join public.presenca pr on pr.alocacao_id = a.id and pr.data = current_date
   where a.rota_id = p_rota_id and a.ativa and a.situacao = 'alocado'
     and (a.dia_semana = v_dia or a.dia_semana is null)
     and e.universidade_id = p_universidade_id
     and e.status_documental = 'aprovado'
     and e.perfil_id is not null
     and (p_trecho = 'ida'   and e.perfil_uso in ('ida_volta', 'somente_ida')
       or p_trecho = 'volta' and e.perfil_uso in ('ida_volta', 'somente_volta'))
     -- quem cancelou este trecho hoje nao precisa do aviso
     and not coalesce(case when p_trecho = 'ida' then pr.cancelou_ida else pr.cancelou_volta end, false);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.notificar_alunos_universidade(uuid, uuid, text, text, text) from public, authenticated, anon;


/**
 * Cada posicao de GPS e comparada com o raio das universidades da rota.
 *
 *  . entrou no raio  -> alunos daquela universidade: "o motorista esta proximo"
 *  . saiu do raio    -> alunos da proxima universidade: "o onibus esta a caminho"
 *
 * Na ida a ordem e a das paradas; na volta, a inversa. A saida usa 10% de
 * folga no raio para o GPS oscilando na borda nao gerar aviso duplicado.
 */
create or replace function public.tg_geofence_universidade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.rota;
  u        record;
  prox     record;
  pas      public.passagem_universidade;
  v_trecho text;
  v_dist   double precision;
begin
  select * into r from public.rota where id = new.rota_id;
  if not found then
    return new;
  end if;

  -- Ate meia hora antes do retorno e ida; dali em diante, volta.
  v_trecho := case
    when r.horario_retorno is not null
     and (new.registrado_em at time zone 'America/Sao_Paulo')::time
         >= r.horario_retorno - interval '30 minutes'
    then 'volta' else 'ida' end;

  for u in
    select * from public.universidades_da_rota(new.rota_id)
     where latitude is not null and longitude is not null
  loop
    v_dist := public.distancia_m(new.latitude, new.longitude, u.latitude, u.longitude);

    select * into pas from public.passagem_universidade
     where rota_id = new.rota_id and universidade_id = u.universidade_id
       and data = current_date and trecho = v_trecho;

    if v_dist <= u.raio_m and (pas.id is null or pas.entrou_em is null) then
      insert into public.passagem_universidade (rota_id, universidade_id, data, trecho, entrou_em)
           values (new.rota_id, u.universidade_id, current_date, v_trecho, now())
      on conflict (rota_id, universidade_id, data, trecho)
        do update set entrou_em = coalesce(passagem_universidade.entrou_em, now());

      perform public.notificar_alunos_universidade(new.rota_id, u.universidade_id, v_trecho,
        'O motorista está próximo',
        'O ônibus da rota ' || r.codigo || ' está chegando em ' || u.nome || '.');

    elsif v_dist > u.raio_m * 1.1 and pas.entrou_em is not null and pas.saiu_em is null then
      update public.passagem_universidade set saiu_em = now() where id = pas.id;

      -- proxima universidade no sentido do trecho que ainda nao recebeu o onibus
      select * into prox
        from public.universidades_da_rota(new.rota_id) nx
       where nx.universidade_id <> u.universidade_id
         and (case when v_trecho = 'ida' then nx.ordem > u.ordem else nx.ordem < u.ordem end)
         and not exists (
           select 1 from public.passagem_universidade p2
            where p2.rota_id = new.rota_id and p2.universidade_id = nx.universidade_id
              and p2.data = current_date and p2.trecho = v_trecho
              and (p2.entrou_em is not null or p2.avisou_a_caminho)
         )
       order by case when v_trecho = 'ida' then nx.ordem else -nx.ordem end
       limit 1;

      if prox.universidade_id is not null then
        insert into public.passagem_universidade (rota_id, universidade_id, data, trecho, avisou_a_caminho)
             values (new.rota_id, prox.universidade_id, current_date, v_trecho, true)
        on conflict (rota_id, universidade_id, data, trecho)
          do update set avisou_a_caminho = true;

        perform public.notificar_alunos_universidade(new.rota_id, prox.universidade_id, v_trecho,
          'O ônibus já está a caminho',
          'O ônibus da rota ' || r.codigo || ' saiu de ' || u.nome || ' e segue para ' || prox.nome || '.');
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists geofence_universidade on public.localizacao_rota;
create trigger geofence_universidade
  after insert on public.localizacao_rota
  for each row execute function public.tg_geofence_universidade();


/**
 * Mapa do motorista: paradas, universidades com o raio e o que ja
 * aconteceu hoje. O raio nao aparece em nenhuma funcao do estudante.
 */
create or replace function public.mapa_motorista(p_rota_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.eh_staff() or exists (
      select 1 from public.rota r
       where r.id = p_rota_id and r.motorista_id = public.meu_motorista_id())) then
    raise exception 'Sem acesso a esta rota.';
  end if;

  return public.paradas_da_rota_completa(p_rota_id) || jsonb_build_object(
    'universidades', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.universidade_id, 'nome', u.nome,
               'latitude', u.latitude, 'longitude', u.longitude,
               'raio_m', u.raio_m, 'ordem', u.ordem,
               'entrou_em', (select max(p.entrou_em) from public.passagem_universidade p
                              where p.rota_id = p_rota_id and p.universidade_id = u.universidade_id
                                and p.data = current_date),
               'alunos', (select count(distinct a.estudante_id)
                            from public.alocacao_estudante a
                            join public.estudante e on e.id = a.estudante_id
                           where a.rota_id = p_rota_id and a.ativa and a.situacao = 'alocado'
                             and e.universidade_id = u.universidade_id)
             ) order by u.ordem)
        from public.universidades_da_rota(p_rota_id) u
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.mapa_motorista(uuid) from public;
grant execute on function public.mapa_motorista(uuid) to authenticated;


-- =====================================================================
-- 5. HISTORICO DE ATIVIDADE
-- =====================================================================
/**
 * Tudo que o estudante fez pelo aplicativo, do mais recente para o mais
 * antigo. Serve ao proprio estudante e a secretaria (conferencia).
 */
create or replace function public.atividade_estudante(
  p_estudante_id uuid,
  p_dias int default 30
)
returns table (
  quando   timestamptz,
  tipo     text,
  titulo   text,
  detalhe  text,
  situacao text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(p_dias, 1));
begin
  if not (public.eh_staff() or p_estudante_id = public.meu_estudante_id()) then
    raise exception 'Sem permissao.';
  end if;

  return query
  select * from (
    -- presenca confirmada
    select p.hora_ida, 'presenca', 'Presença confirmada · ida', r.codigo || ' — ' || r.nome, 'confirmada'
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
      left join public.rota r on r.id = a.rota_id
     where a.estudante_id = p_estudante_id and p.confirmou_ida and p.hora_ida >= v_desde
    union all
    select p.hora_volta, 'presenca', 'Presença confirmada · volta', r.codigo || ' — ' || r.nome, 'confirmada'
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
      left join public.rota r on r.id = a.rota_id
     where a.estudante_id = p_estudante_id and p.confirmou_volta and p.hora_volta >= v_desde
    -- presenca cancelada
    union all
    select p.cancelado_ida_em, 'cancelamento', 'Ida cancelada', p.motivo_cancelamento_ida, 'cancelada'
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
     where a.estudante_id = p_estudante_id and p.cancelou_ida and p.cancelado_ida_em >= v_desde
    union all
    select p.cancelado_volta_em, 'cancelamento', 'Volta cancelada', p.motivo_cancelamento_volta, 'cancelada'
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
     where a.estudante_id = p_estudante_id and p.cancelou_volta and p.cancelado_volta_em >= v_desde
    -- documentos
    union all
    select d.criado_em, 'documento', 'Documento enviado', d.nome_arquivo, d.status::text
      from public.documento d
     where d.estudante_id = p_estudante_id and d.criado_em >= v_desde
    -- alteracoes de cadastro e de grade
    union all
    select c.criado_em, 'cadastro', 'Alteração de cadastro', c.campo, c.status::text
      from public.alteracao_cadastral c
     where c.estudante_id = p_estudante_id and c.criado_em >= v_desde
    union all
    select g.criado_em, 'grade', 'Alteração da grade de aulas',
           jsonb_array_length(g.grade) || ' dia(s) de aula', g.status::text
      from public.alteracao_grade g
     where g.estudante_id = p_estudante_id and g.criado_em >= v_desde
    -- pedidos de volta e trocas de onibus
    union all
    select s.criado_em, 'solicitacao', 'Pedido de volta', s.justificativa, s.status::text
      from public.solicitacao_volta s
      join public.alocacao_estudante a on a.id = s.alocacao_id
     where a.estudante_id = p_estudante_id and s.criado_em >= v_desde
    union all
    select t.criado_em, 'troca', 'Troca de ônibus', t.justificativa, t.status::text
      from public.troca_rota t
     where t.estudante_id = p_estudante_id and t.criado_em >= v_desde
    -- conversas abertas
    union all
    select c.criado_em, 'conversa',
           'Conversa com ' || case when c.destino = 'secretaria' then 'a secretaria' else 'o motorista' end,
           c.assunto, c.situacao::text
      from public.conversa c
     where c.estudante_id = p_estudante_id and c.tipo = 'direta' and c.criado_em >= v_desde
  ) x (quando, tipo, titulo, detalhe, situacao)
  where x.quando is not null
  order by x.quando desc
  limit 300;
end;
$$;

revoke all on function public.atividade_estudante(uuid, int) from public;
grant execute on function public.atividade_estudante(uuid, int) to authenticated;


-- =====================================================================
-- 6. REALTIME
-- =====================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publicacao supabase_realtime inexistente: Realtime nao configurado.';
    return;
  end if;
  foreach t in array array['conversa_mensagem', 'notificacao', 'localizacao_rota'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- =====================================================================
-- 7. PAGINA NOVA NO PAINEL: conversas (espelha src/lib/paginas.ts)
-- =====================================================================
create or replace function public.paginas_do_sistema()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'alocacao', 'presenca', 'rotas', 'paradas',
    'estudantes', 'veiculos', 'motoristas', 'universidades',
    'documentos', 'alteracoes', 'relatorios', 'funcionarios',
    'solicitacoes', 'mensagens', 'conversas', 'comunicados', 'configuracoes'
  ];
$$;

-- Quem ja atendia mensagens passa a atender as conversas.
insert into public.permissao_pagina (perfil_id, pagina)
select pp.perfil_id, 'conversas'
  from public.permissao_pagina pp
 where pp.pagina = 'mensagens'
on conflict do nothing;
