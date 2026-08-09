-- =====================================================================
-- GTPORTE - 0005_paineis.sql
-- Suporte aos painéis do ESTUDANTE e do MOTORISTA.
--
-- RF11 visualizacao de rotas pelo estudante
-- RF12 visualizacao de passageiros pelo motorista
-- RF15 acompanhamento em tempo real
-- RF16 comunicacao motorista -> estudantes
-- RF01/RF02 auto-cadastro e envio de documentos pelo proprio estudante
-- RF23 feedback do transporte
-- =====================================================================

-- ---------------------------------------------------------------------
-- Situacao operacional da rota (RF15)
--
-- Separada de rota.status de proposito: `status` e cadastral e so o
-- administrador altera (RN06); `situacao_operacional` e do dia a dia e
-- quem atualiza e o motorista da rota.
-- ---------------------------------------------------------------------
do $$ begin
  create type situacao_operacional as enum ('aguardando', 'em_rota', 'concluida');
exception when duplicate_object then null; end $$;

alter table public.rota
  add column if not exists situacao_operacional situacao_operacional not null default 'aguardando';

alter table public.rota
  add column if not exists situacao_atualizada_em timestamptz;

-- ---------------------------------------------------------------------
-- aviso_rota (RF16) - comunicacao do motorista com os passageiros
-- ---------------------------------------------------------------------
create table if not exists public.aviso_rota (
  id        uuid primary key default gen_random_uuid(),
  rota_id   uuid not null references public.rota(id) on delete cascade,
  autor_id  uuid references public.perfil(id) on delete set null,
  mensagem  text not null check (length(trim(mensagem)) > 0),
  criado_em timestamptz not null default now()
);

create index if not exists idx_aviso_rota on public.aviso_rota(rota_id, criado_em desc);

alter table public.aviso_rota enable row level security;

-- Staff le tudo; motorista le os avisos da sua rota; estudante le os
-- avisos da rota em que esta alocado (RN08 / RN09).
drop policy if exists aviso_select on public.aviso_rota;
create policy aviso_select on public.aviso_rota
  for select using (
    public.eh_staff()
    or exists (
      select 1 from public.rota r
      where r.id = aviso_rota.rota_id and r.motorista_id = public.meu_motorista_id()
    )
    or exists (
      select 1 from public.alocacao_estudante a
      where a.rota_id = aviso_rota.rota_id
        and a.ativa
        and a.estudante_id = public.meu_estudante_id()
    )
  );

-- Somente o motorista responsavel pela rota (ou o staff) publica avisos
drop policy if exists aviso_insert on public.aviso_rota;
create policy aviso_insert on public.aviso_rota
  for insert with check (
    public.eh_staff()
    or exists (
      select 1 from public.rota r
      where r.id = rota_id and r.motorista_id = public.meu_motorista_id()
    )
  );

drop policy if exists aviso_delete on public.aviso_rota;
create policy aviso_delete on public.aviso_rota
  for delete using (
    public.eh_staff()
    or autor_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- RF01 - auto-cadastro do estudante
-- O estudante cria apenas o proprio registro; o indice unico em
-- perfil_id impede duplicidade. A aprovacao documental continua sendo
-- do administrador (RN01/RN07).
-- ---------------------------------------------------------------------
drop policy if exists estudante_insert_proprio on public.estudante;
create policy estudante_insert_proprio on public.estudante
  for insert with check (perfil_id = auth.uid());

-- ---------------------------------------------------------------------
-- RF15 - registro de localizacao pelo motorista
-- (a policy de insert ja existe em 0002_rls.sql; aqui apenas a leitura
--  agregada usada pelo painel do estudante)
-- ---------------------------------------------------------------------
create or replace function public.ultima_localizacao(p_rota_id uuid)
returns table (latitude double precision, longitude double precision, registrado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.latitude, l.longitude, l.registrado_em
  from public.localizacao_rota l
  where l.rota_id = p_rota_id
  order by l.registrado_em desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- RF15 - atualizacao da situacao operacional pelo motorista
-- Nao passa por update direto na tabela rota justamente para nao abrir
-- brecha na RN06 (que restringe alteracoes cadastrais ao administrador).
-- ---------------------------------------------------------------------
create or replace function public.atualizar_situacao_rota(
  p_rota_id uuid,
  p_situacao situacao_operacional
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motorista uuid;
begin
  select motorista_id into v_motorista from public.rota where id = p_rota_id;

  if v_motorista is null then
    raise exception 'Rota nao encontrada';
  end if;

  if not (public.eh_staff() or v_motorista = public.meu_motorista_id()) then
    raise exception 'RN08: apenas o motorista responsavel pela rota pode atualizar a situacao';
  end if;

  update public.rota
     set situacao_operacional = p_situacao,
         situacao_atualizada_em = now()
   where id = p_rota_id;

  perform public.registrar_log('situacao_operacional', 'rota', p_rota_id,
    jsonb_build_object('situacao', p_situacao));

  return jsonb_build_object('rota_id', p_rota_id, 'situacao', p_situacao);
end;
$$;

-- ---------------------------------------------------------------------
-- RF13 / RF14 - confirmacao de presenca pelo proprio estudante
--
-- confirmar_presenca() e security definer, portanto ignora a RLS. Sem
-- uma guarda explicita um estudante autenticado poderia confirmar a
-- presenca de outro. Esta versao ignora o parametro recebido quando quem
-- chama e um estudante e usa sempre o proprio vinculo (RN09).
-- ---------------------------------------------------------------------
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
       set confirmou_ida = true, hora_ida = now()
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
     set confirmou_volta = true, hora_volta = now()
   where alocacao_id = v_alocacao and data = p_data;

  return jsonb_build_object('mensagem', 'Presenca de volta confirmada');
end;
$$;

-- ---------------------------------------------------------------------
-- RF11 - visao consolidada da rota do estudante
-- Uma unica consulta para a tela "Minha Rota", evitando varios round-trips.
-- ---------------------------------------------------------------------
create or replace function public.minha_rota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estudante uuid;
  v_resultado jsonb;
begin
  v_estudante := public.meu_estudante_id();
  if v_estudante is null then
    return null;
  end if;

  select jsonb_build_object(
    'estudante', jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'ra', e.ra, 'curso', e.curso,
      'perfil_uso', e.perfil_uso, 'status_documental', e.status_documental,
      'universidade', u.nome
    ),
    'alocacao', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'situacao', a.situacao, 'origem', a.origem, 'motivo', a.motivo
    ) end,
    'rota', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'codigo', r.codigo, 'nome', r.nome,
      'horario_partida', r.horario_partida, 'horario_retorno', r.horario_retorno,
      'status', r.status, 'situacao_operacional', r.situacao_operacional,
      'situacao_atualizada_em', r.situacao_atualizada_em,
      'origem', co.nome, 'destino', cd.nome,
      'motorista', m.nome, 'motorista_telefone', m.telefone,
      'veiculo', v.placa, 'veiculo_modelo', v.modelo, 'capacidade', v.capacidade_maxima
    ) end,
    'presenca_hoje', case when p.id is null then null else jsonb_build_object(
      'confirmou_ida', p.confirmou_ida, 'hora_ida', p.hora_ida,
      'confirmou_volta', p.confirmou_volta, 'hora_volta', p.hora_volta
    ) end
  )
  into v_resultado
  from public.estudante e
  left join public.universidade u on u.id = e.universidade_id
  left join public.alocacao_estudante a on a.estudante_id = e.id and a.ativa
  left join public.rota r      on r.id = a.rota_id
  left join public.cidade co   on co.id = r.cidade_origem_id
  left join public.cidade cd   on cd.id = r.cidade_destino_id
  left join public.motorista m on m.id = r.motorista_id
  left join public.veiculo v   on v.id = r.veiculo_id
  left join public.presenca p  on p.alocacao_id = a.id and p.data = current_date
  where e.id = v_estudante;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------
-- RF12 - rota(s) sob responsabilidade do motorista logado
-- ---------------------------------------------------------------------
create or replace view public.vw_minhas_rotas_motorista
with (security_invoker = true) as
select r.id            as rota_id,
       r.codigo,
       r.nome,
       r.horario_partida,
       r.horario_retorno,
       r.status,
       r.situacao_operacional,
       r.situacao_atualizada_em,
       r.motorista_id,
       co.nome         as origem,
       cd.nome         as destino,
       v.placa,
       v.modelo,
       v.capacidade_maxima,
       (select count(*) from public.alocacao_estudante a
         where a.rota_id = r.id and a.ativa and a.situacao = 'alocado')::int as passageiros
from public.rota r
join public.veiculo v  on v.id = r.veiculo_id
left join public.cidade co on co.id = r.cidade_origem_id
left join public.cidade cd on cd.id = r.cidade_destino_id;

-- ---------------------------------------------------------------------
-- vw_ocupacao_rota ganha a situacao operacional, para que o painel
-- administrativo mostre "EM ROTA / AGUARDANDO" com dado real.
-- (colunas novas sao anexadas ao final, o que create or replace permite)
-- ---------------------------------------------------------------------
create or replace view public.vw_ocupacao_rota
with (security_invoker = true) as
select r.id            as rota_id,
       r.codigo,
       r.nome,
       r.status,
       r.horario_partida,
       r.horario_retorno,
       v.placa,
       v.modelo,
       v.capacidade_maxima,
       m.nome           as motorista,
       count(a.id) filter (where a.ativa and a.situacao = 'alocado')::int as ocupacao,
       round(
         100.0 * count(a.id) filter (where a.ativa and a.situacao = 'alocado')
         / nullif(v.capacidade_maxima, 0)
       )::int as percentual,
       r.situacao_operacional,
       r.situacao_atualizada_em
from public.rota r
join public.veiculo v   on v.id = r.veiculo_id
join public.motorista m on m.id = r.motorista_id
left join public.alocacao_estudante a on a.rota_id = r.id
group by r.id, r.codigo, r.nome, r.status, r.horario_partida, r.horario_retorno,
         v.placa, v.modelo, v.capacidade_maxima, m.nome,
         r.situacao_operacional, r.situacao_atualizada_em;

-- ---------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------
grant execute on function public.atualizar_situacao_rota(uuid, situacao_operacional) to authenticated;
grant execute on function public.ultima_localizacao(uuid) to authenticated;
grant execute on function public.minha_rota() to authenticated;
