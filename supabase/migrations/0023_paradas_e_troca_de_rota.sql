-- ---------------------------------------------------------------------
-- Pontos de parada, motivos de cancelamento e troca de onibus
--
-- Tres coisas que o aplicativo do estudante precisa e o banco ainda nao
-- tinha:
--
--  1. As paradas da rota. Havia apenas localizacao_rota, com latitude e
--     longitude cruas do veiculo — nada que diga onde o onibus para,
--     em que ordem, nem a qual universidade a parada pertence. Sem isso
--     o mapa nao tem o que desenhar alem do ponto do veiculo.
--  2. Motivos de cancelamento padronizados. O motivo era texto livre,
--     entao nao dava para tratar "troquei de onibus" como um caso a
--     parte.
--  3. Troca de onibus na volta: o estudante avisa que volta em outra
--     rota, e o motorista de destino aceita ou recusa.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. PONTOS DE PARADA
-- =====================================================================
create table if not exists public.parada_rota (
  id              uuid primary key default gen_random_uuid(),
  rota_id         uuid not null references public.rota(id) on delete cascade,
  ordem           smallint not null,
  nome            text not null check (length(trim(nome)) > 0),
  endereco        text,
  latitude        double precision,
  longitude       double precision,
  -- Uma rota atende mais de uma universidade; a parada diz qual delas.
  universidade_id uuid references public.universidade(id) on delete set null,
  -- Minutos previstos desde a partida, para estimar a passagem.
  minutos_partida smallint,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  unique (rota_id, ordem)
);

create index if not exists idx_parada_rota on public.parada_rota (rota_id, ordem) where ativo;

alter table public.parada_rota enable row level security;

drop policy if exists parada_staff on public.parada_rota;
create policy parada_staff on public.parada_rota
  for all using (public.eh_staff()) with check (public.eh_staff());

-- Estudante e motorista precisam ver o trajeto; e informacao publica da rota.
drop policy if exists parada_select on public.parada_rota;
create policy parada_select on public.parada_rota
  for select using (auth.uid() is not null);


/** Paradas da rota, com a posicao mais recente do veiculo quando em rota. */
create or replace function public.paradas_da_rota(p_rota_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'ordem', p.ordem, 'nome', p.nome, 'endereco', p.endereco,
               'latitude', p.latitude, 'longitude', p.longitude,
               'universidade', u.nome, 'minutos_partida', p.minutos_partida
             ) order by p.ordem)
        from public.parada_rota p
        left join public.universidade u on u.id = p.universidade_id
       where p.rota_id = p_rota_id and p.ativo
    ), '[]'::jsonb),
    'veiculo', (
      select jsonb_build_object(
               'latitude', l.latitude, 'longitude', l.longitude,
               'registrado_em', l.registrado_em
             )
        from public.localizacao_rota l
       where l.rota_id = p_rota_id
       order by l.registrado_em desc
       limit 1
    ),
    'situacao', (select r.situacao_operacional from public.rota r where r.id = p_rota_id)
  );
$$;

revoke all on function public.paradas_da_rota(uuid) from public;
grant execute on function public.paradas_da_rota(uuid) to authenticated;


-- =====================================================================
-- 2. MOTIVOS DE CANCELAMENTO
-- =====================================================================
do $$
begin
  create type motivo_cancelamento as enum (
    'troquei_de_onibus', 'aula_cancelada', 'saida_antecipada',
    'problema_saude', 'compromisso_pessoal', 'outro'
  );
exception when duplicate_object then null;
end;
$$;

-- O texto livre ja e separado por trecho (motivo_cancelamento_ida e
-- _volta); o motivo padronizado acompanha a mesma divisao.
alter table public.presenca add column if not exists motivo_tipo_ida   motivo_cancelamento;
alter table public.presenca add column if not exists motivo_tipo_volta motivo_cancelamento;

comment on column public.presenca.motivo_tipo_ida is
  'Motivo padronizado do cancelamento da ida. O texto livre fica em motivo_cancelamento_ida.';
comment on column public.presenca.motivo_tipo_volta is
  'Motivo padronizado do cancelamento da volta. O texto livre fica em motivo_cancelamento_volta.';


-- =====================================================================
-- 3. TROCA DE ONIBUS NA VOLTA
--
-- O estudante cancelou a volta na rota dele porque vai voltar em outra.
-- O motorista da rota de destino precisa aceitar: e ele quem responde
-- pela lotacao do veiculo.
-- =====================================================================
create table if not exists public.troca_rota (
  id             uuid primary key default gen_random_uuid(),
  estudante_id   uuid not null references public.estudante(id) on delete cascade,
  rota_origem_id uuid references public.rota(id) on delete set null,
  rota_destino_id uuid not null references public.rota(id) on delete cascade,
  data           date not null default current_date,
  trecho         text not null default 'volta' check (trecho in ('ida', 'volta')),
  status         solicitacao_status not null default 'pendente',
  justificativa  text,
  motivo_recusa  text,
  decidido_por   uuid references public.perfil(id) on delete set null,
  decidido_em    timestamptz,
  criado_em      timestamptz not null default now(),
  unique (estudante_id, data, trecho)
);

create index if not exists idx_troca_destino
  on public.troca_rota (rota_destino_id, data, status);

alter table public.troca_rota enable row level security;

drop policy if exists troca_staff on public.troca_rota;
create policy troca_staff on public.troca_rota
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists troca_propria on public.troca_rota;
create policy troca_propria on public.troca_rota
  for select using (estudante_id = public.meu_estudante_id());

drop policy if exists troca_propria_insert on public.troca_rota;
create policy troca_propria_insert on public.troca_rota
  for insert with check (estudante_id = public.meu_estudante_id());

-- O motorista da rota de destino le e decide.
drop policy if exists troca_motorista_select on public.troca_rota;
create policy troca_motorista_select on public.troca_rota
  for select using (
    exists (
      select 1 from public.rota r
       where r.id = troca_rota.rota_destino_id
         and r.motorista_id = public.meu_motorista_id()
    )
  );


/**
 * Pede para voltar em outra rota. Registra a troca e cancela a volta na
 * rota de origem, para a vaga nao ficar reservada nos dois lugares.
 */
create or replace function public.solicitar_troca_rota(
  p_rota_destino_id uuid,
  p_justificativa   text default null,
  p_data            date default current_date
)
returns public.troca_rota
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_dia       smallint := extract(dow from p_data)::smallint;
  v_origem    uuid;
  v_linha     public.troca_rota;
begin
  if v_estudante is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;

  select a.rota_id into v_origem
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado'
     and (a.dia_semana = v_dia or a.dia_semana is null)
   order by a.dia_semana nulls last
   limit 1;

  if v_origem = p_rota_destino_id then
    raise exception 'A rota escolhida e a mesma em que voce ja esta alocado.';
  end if;

  if not exists (select 1 from public.rota where id = p_rota_destino_id and status <> 'inativa') then
    raise exception 'Rota de destino indisponivel.';
  end if;

  delete from public.troca_rota
   where estudante_id = v_estudante and data = p_data and trecho = 'volta'
     and status = 'pendente';

  insert into public.troca_rota
         (estudante_id, rota_origem_id, rota_destino_id, data, trecho, justificativa)
  values (v_estudante, v_origem, p_rota_destino_id, p_data, 'volta', nullif(trim(coalesce(p_justificativa, '')), ''))
  returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.solicitar_troca_rota(uuid, text, date) from public;
grant execute on function public.solicitar_troca_rota(uuid, text, date) to authenticated;


/** Trocas aguardando decisao do motorista logado. */
create or replace function public.trocas_pendentes_motorista(p_data date default current_date)
returns table (
  id            uuid,
  estudante_id  uuid,
  estudante     text,
  prontuario    text,
  rota_origem   text,
  justificativa text,
  criado_em     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, e.id, e.nome, e.prontuario, ro.codigo, t.justificativa, t.criado_em
    from public.troca_rota t
    join public.estudante e on e.id = t.estudante_id
    join public.rota rd on rd.id = t.rota_destino_id
    left join public.rota ro on ro.id = t.rota_origem_id
   where t.data = p_data
     and t.status = 'pendente'
     and rd.motorista_id = public.meu_motorista_id()
   order by t.criado_em;
$$;

revoke all on function public.trocas_pendentes_motorista(date) from public;
grant execute on function public.trocas_pendentes_motorista(date) to authenticated;


/**
 * Decisao do motorista da rota de destino. Aprovar confere vaga
 * remanescente, do mesmo modo que a solicitacao de volta avulsa (RN).
 */
create or replace function public.decidir_troca_rota(
  p_id            uuid,
  p_aprovar       boolean,
  p_motivo_recusa text default null
)
returns public.troca_rota
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha       public.troca_rota;
  v_motorista   uuid := public.meu_motorista_id();
  v_capacidade  int;
  v_confirmados int;
begin
  select * into v_linha from public.troca_rota where id = p_id for update;
  if not found then
    raise exception 'Solicitacao nao encontrada.';
  end if;
  if v_linha.status <> 'pendente' then
    raise exception 'Esta solicitacao ja foi decidida.';
  end if;

  if not public.eh_staff() then
    if v_motorista is null or not exists (
      select 1 from public.rota r
       where r.id = v_linha.rota_destino_id and r.motorista_id = v_motorista
    ) then
      raise exception 'Apenas o motorista da rota de destino decide esta solicitacao.';
    end if;
  end if;

  if p_aprovar then
    select v.capacidade_maxima into v_capacidade
      from public.rota r join public.veiculo v on v.id = r.veiculo_id
     where r.id = v_linha.rota_destino_id;

    select count(*) into v_confirmados
      from public.presenca p
      join public.alocacao_estudante a on a.id = p.alocacao_id
     where a.rota_id = v_linha.rota_destino_id and a.ativa
       and p.data = v_linha.data and p.confirmou_volta;

    if v_confirmados >= coalesce(v_capacidade, 0) then
      raise exception 'Sem vaga remanescente nesta rota para a volta.';
    end if;
  end if;

  update public.troca_rota
     set status        = case when p_aprovar then 'aprovada' else 'recusada' end::solicitacao_status,
         motivo_recusa = case when p_aprovar then null else p_motivo_recusa end,
         decidido_por  = auth.uid(),
         decidido_em   = now()
   where id = p_id
   returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.decidir_troca_rota(uuid, boolean, text) from public;
grant execute on function public.decidir_troca_rota(uuid, boolean, text) to authenticated;


/** Rotas que o estudante pode escolher para a volta, no dia. */
create or replace function public.rotas_para_troca(p_data date default current_date)
returns table (
  rota_id         uuid,
  codigo          text,
  nome            text,
  horario_retorno time,
  motorista       text,
  origem          text,
  destino         text,
  vagas_volta     int
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select public.meu_estudante_id() as id),
  minha as (
    select a.rota_id
      from public.alocacao_estudante a, eu
     where a.estudante_id = eu.id and a.ativa and a.situacao = 'alocado'
       and (a.dia_semana = extract(dow from p_data)::smallint or a.dia_semana is null)
     order by a.dia_semana nulls last
     limit 1
  )
  select r.id, r.codigo, r.nome, r.horario_retorno, m.nome, co.nome, cd.nome,
         greatest(v.capacidade_maxima - (
           select count(*)::int from public.presenca p
             join public.alocacao_estudante a2 on a2.id = p.alocacao_id
            where a2.rota_id = r.id and a2.ativa and p.data = p_data and p.confirmou_volta
         ), 0)
    from public.rota r
    join public.veiculo v    on v.id = r.veiculo_id
    join public.motorista m  on m.id = r.motorista_id
    left join public.cidade co on co.id = r.cidade_origem_id
    left join public.cidade cd on cd.id = r.cidade_destino_id
   where r.status <> 'inativa'
     and r.id is distinct from (select rota_id from minha)
     and public.rota_atende_universidade(
           r.id, (select e.universidade_id from public.estudante e, eu where e.id = eu.id))
   order by r.horario_retorno;
$$;

revoke all on function public.rotas_para_troca(date) from public;
grant execute on function public.rotas_para_troca(date) to authenticated;


-- ---------------------------------------------------------------------
-- cancelar_presenca passa a registrar tambem o motivo padronizado.
-- Recriada a partir da versao de 0022 (que ja considera o dia), com o
-- parametro novo opcional para nao quebrar chamadas existentes.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_presenca(
  p_estudante_id uuid,
  p_trecho text,
  p_motivo text,
  p_data date default current_date,
  p_motivo_tipo motivo_cancelamento default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estudante     uuid;
  v_alocacao      uuid;
  v_meu_motorista uuid;
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
    if v_estudante is null then
      raise exception 'Cadastro de estudante nao encontrado para este usuario';
    end if;
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    v_meu_motorista := public.meu_motorista_id();
    if v_meu_motorista is null then
      raise exception 'Perfil sem permissao para cancelar presenca';
    end if;
    if public.motorista_da_alocacao(p_estudante_id) is distinct from v_meu_motorista then
      raise exception 'Este estudante nao viaja em uma rota sob sua responsabilidade';
    end if;
    v_estudante := p_estudante_id;
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado'
     -- alocacao por dia (0022): a do dia tem prioridade sobre a generica
     and (a.dia_semana = extract(dow from p_data)::smallint or a.dia_semana is null)
   order by a.dia_semana nulls last
   limit 1;

  if v_alocacao is null then
    raise exception 'Estudante nao possui alocacao ativa em uma rota';
  end if;

  insert into public.presenca (alocacao_id, data)
  values (v_alocacao, p_data)
  on conflict (alocacao_id, data) do nothing;

  if p_trecho = 'ida' then
    update public.presenca
       set confirmou_ida = false, hora_ida = null,
           cancelou_ida = true,
           motivo_cancelamento_ida = trim(p_motivo),
           motivo_tipo_ida = p_motivo_tipo,
           cancelado_ida_em = now()
     where alocacao_id = v_alocacao and data = p_data;
  else
    update public.presenca
       set confirmou_volta = false, hora_volta = null,
           cancelou_volta = true,
           motivo_cancelamento_volta = trim(p_motivo),
           motivo_tipo_volta = p_motivo_tipo,
           cancelado_volta_em = now()
     where alocacao_id = v_alocacao and data = p_data;

    update public.solicitacao_volta
       set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
     where alocacao_id = v_alocacao and data = p_data and status = 'pendente';
  end if;

  perform public.registrar_log('cancelar_presenca', 'presenca', v_alocacao,
                               jsonb_build_object('trecho', p_trecho, 'motivo', p_motivo,
                                                  'data', p_data));

  return jsonb_build_object('mensagem', 'Presenca cancelada');
end;
$fn$;

grant execute on function public.cancelar_presenca(uuid, text, text, date, motivo_cancelamento) to authenticated;

-- ---------------------------------------------------------------------
-- Pagina de cadastro das paradas no painel administrativo.
-- Espelha src/lib/paginas.ts (chave 'paradas').
-- ---------------------------------------------------------------------
create or replace function public.paginas_do_sistema()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'alocacao', 'presenca', 'rotas', 'paradas',
    'estudantes', 'veiculos', 'motoristas', 'universidades',
    'documentos', 'alteracoes', 'relatorios', 'funcionarios',
    'solicitacoes', 'mensagens', 'comunicados', 'configuracoes'
  ];
$$;

insert into public.permissao_pagina (perfil_id, pagina)
select pp.perfil_id, 'paradas'
  from public.permissao_pagina pp
 where pp.pagina = 'rotas'
on conflict do nothing;
