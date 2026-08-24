-- =====================================================================
-- GTPORTE - 0012_solicitacao_volta.sql
-- Volta avulsa com justificativa e aprovacao do motorista.
--
-- Regra de negocio: o estudante de perfil ida_volta que quiser embarcar
-- so na volta precisa justificar. A justificativa vira uma solicitacao
-- para o motorista da rota, que aceita ou recusa - e a recusa tambem
-- exige motivo. O estudante ve o desfecho e pode reenviar.
--
-- Por que uma tabela dedicada e nao reuso de 'mensagem': mensagem nao
-- tem vinculo com presenca/alocacao/data, e o limite de uma solicitacao
-- por dia e a regra central aqui; mensagem_status
-- (aberta | respondida | encerrada) nao expressa aprovada/recusada; e
-- destinatario_id aponta para perfil, mas motorista.perfil_id e
-- opcional, entao metade dos motoristas nao receberia nada.
--
-- ATENCAO: este arquivo recria confirmar_presenca, cancelar_presenca e
-- minha_rota. As versoes anteriores estao em 0007 e 0005.
-- Idempotente: pode ser reexecutada.
-- =====================================================================

do $enum$ begin
  create type solicitacao_status as enum ('pendente', 'aprovada', 'recusada', 'cancelada');
exception when duplicate_object then null; end $enum$;

create table if not exists public.solicitacao_volta (
  id            uuid primary key default gen_random_uuid(),
  alocacao_id   uuid not null references public.alocacao_estudante(id) on delete cascade,
  -- rota_id e desnormalizado de proposito: deixa a policy do motorista
  -- ser um join simples em vez de subir por alocacao a cada leitura.
  rota_id       uuid not null references public.rota(id) on delete cascade,
  data          date not null default current_date,
  justificativa text not null check (length(trim(justificativa)) >= 10),
  status        solicitacao_status not null default 'pendente',
  motivo_recusa text,
  decidido_por  uuid references public.perfil(id) on delete set null,
  decidido_em   timestamptz,
  criado_em     timestamptz not null default now(),
  unique (alocacao_id, data),
  constraint recusa_exige_motivo
    check (status <> 'recusada' or coalesce(trim(motivo_recusa), '') <> '')
);

create index if not exists idx_solvolta_rota on public.solicitacao_volta(rota_id, data, status);
create index if not exists idx_solvolta_aloc on public.solicitacao_volta(alocacao_id, data);

alter table public.solicitacao_volta enable row level security;

drop policy if exists solvolta_select on public.solicitacao_volta;
create policy solvolta_select on public.solicitacao_volta
  for select using (
    public.eh_staff()
    or exists (
      select 1 from public.alocacao_estudante a
       where a.id = solicitacao_volta.alocacao_id
         and a.estudante_id = public.meu_estudante_id()
    )
    or exists (
      select 1 from public.rota r
       where r.id = solicitacao_volta.rota_id
         and r.motorista_id = public.meu_motorista_id()
    )
  );

-- A escrita passa pelas RPCs abaixo; a policy de staff e a rede de
-- seguranca para correcoes manuais, nao o caminho normal.
drop policy if exists solvolta_write_staff on public.solicitacao_volta;
create policy solvolta_write_staff on public.solicitacao_volta
  for all using (public.eh_staff()) with check (public.eh_staff());

-- ---------------------------------------------------------------------
-- Solicitar a volta avulsa
-- Reaplica as mesmas checagens de confirmar_presenca (RN05 antecedencia
-- e RN17 vaga remanescente) antes de abrir a solicitacao: nao adianta
-- ocupar o motorista com um pedido que ja nasceria invalido.
-- ---------------------------------------------------------------------
create or replace function public.solicitar_volta_avulsa(
  p_justificativa text,
  p_data          date default current_date,
  p_estudante_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estudante    uuid;
  v_alocacao     uuid;
  v_rota         uuid;
  v_perfil_uso   perfil_uso;
  v_confirmou_ida boolean;
  v_retorno      time;
  v_antecedencia int;
  v_capacidade   int;
  v_confirmados  int;
  v_id           uuid;
  v_status       solicitacao_status;
begin
  -- RN09: o estudante so abre solicitacao para si mesmo
  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
    if v_estudante is null then
      raise exception 'Cadastro de estudante nao encontrado para este usuario';
    end if;
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    raise exception 'Perfil sem permissao para solicitar volta avulsa';
  end if;

  if length(trim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Descreva em pelo menos 10 caracteres o motivo de embarcar so na volta';
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

  if v_perfil_uso = 'somente_ida' then
    raise exception 'Estudante com perfil somente ida nao embarca na volta';
  end if;

  if v_perfil_uso = 'somente_volta' then
    raise exception 'Seu perfil ja e somente volta: confirme direto, sem justificativa';
  end if;

  insert into public.presenca (alocacao_id, data)
  values (v_alocacao, p_data)
  on conflict (alocacao_id, data) do nothing;

  select confirmou_ida into v_confirmou_ida
    from public.presenca where alocacao_id = v_alocacao and data = p_data;

  if coalesce(v_confirmou_ida, false) then
    raise exception 'A ida ja esta confirmada: a volta nao precisa de justificativa';
  end if;

  select r.horario_retorno, v.capacidade_maxima
    into v_retorno, v_capacidade
    from public.rota r join public.veiculo v on v.id = r.veiculo_id
   where r.id = v_rota;

  select coalesce(valor::int, 2) into v_antecedencia
    from public.configuracao_sistema where chave = 'rn05_antecedencia_horas';

  -- RN05
  if now() > (p_data + v_retorno) - make_interval(hours => coalesce(v_antecedencia, 2)) then
    raise exception 'Prazo para solicitar a volta encerrado';
  end if;

  -- RN17
  select count(*) into v_confirmados
    from public.presenca p
    join public.alocacao_estudante a on a.id = p.alocacao_id
   where a.rota_id = v_rota and a.ativa and p.data = p_data and p.confirmou_volta;

  if v_confirmados >= v_capacidade then
    raise exception 'Volta disponivel apenas se houver vaga remanescente';
  end if;

  select status into v_status
    from public.solicitacao_volta
   where alocacao_id = v_alocacao and data = p_data;

  if v_status in ('pendente', 'aprovada') then
    raise exception 'Ja existe uma solicitacao % para hoje', v_status;
  end if;

  -- Upsert: reenviar depois de uma recusa reaproveita a linha do dia, o
  -- que evita colidir com o unique (alocacao_id, data).
  insert into public.solicitacao_volta (alocacao_id, rota_id, data, justificativa)
  values (v_alocacao, v_rota, p_data, trim(p_justificativa))
  on conflict (alocacao_id, data) do update
    set justificativa = excluded.justificativa,
        status        = 'pendente',
        motivo_recusa = null,
        decidido_por  = null,
        decidido_em   = null,
        criado_em     = now()
  returning id into v_id;

  perform public.registrar_log('solicitar_volta_avulsa', 'solicitacao_volta', v_id,
                               jsonb_build_object('rota_id', v_rota, 'data', p_data));

  return jsonb_build_object(
    'id', v_id,
    'status', 'pendente',
    'mensagem', 'Solicitacao enviada ao motorista da rota'
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- Decidir a solicitacao (motorista da rota ou staff)
-- ---------------------------------------------------------------------
create or replace function public.decidir_solicitacao_volta(
  p_solicitacao_id uuid,
  p_aprovar        boolean,
  p_motivo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rota        uuid;
  v_alocacao    uuid;
  v_data        date;
  v_status      solicitacao_status;
  v_motorista   uuid;
  v_capacidade  int;
  v_confirmados int;
begin
  select s.rota_id, s.alocacao_id, s.data, s.status, r.motorista_id
    into v_rota, v_alocacao, v_data, v_status, v_motorista
    from public.solicitacao_volta s
    join public.rota r on r.id = s.rota_id
   where s.id = p_solicitacao_id;

  if v_rota is null then
    raise exception 'Solicitacao nao encontrada';
  end if;

  if not (public.eh_staff() or v_motorista = public.meu_motorista_id()) then
    raise exception 'Apenas o motorista da rota ou o setor pode decidir esta solicitacao';
  end if;

  if v_status <> 'pendente' then
    raise exception 'Esta solicitacao ja foi %', v_status;
  end if;

  if not p_aprovar then
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'Informe o motivo da recusa';
    end if;

    update public.solicitacao_volta
       set status = 'recusada', motivo_recusa = trim(p_motivo),
           decidido_por = auth.uid(), decidido_em = now()
     where id = p_solicitacao_id;

    perform public.registrar_log('recusar_volta_avulsa', 'solicitacao_volta',
                                 p_solicitacao_id, jsonb_build_object('motivo', p_motivo));
    return jsonb_build_object('status', 'recusada', 'mensagem', 'Solicitacao recusada');
  end if;

  -- RN17 revalidada: a vaga pode ter sido ocupada entre o pedido e a decisao.
  select v.capacidade_maxima into v_capacidade
    from public.rota r join public.veiculo v on v.id = r.veiculo_id
   where r.id = v_rota;

  select count(*) into v_confirmados
    from public.presenca p
    join public.alocacao_estudante a on a.id = p.alocacao_id
   where a.rota_id = v_rota and a.ativa and p.data = v_data and p.confirmou_volta;

  if v_confirmados >= v_capacidade then
    raise exception 'Nao ha mais vaga remanescente na volta desta rota';
  end if;

  insert into public.presenca (alocacao_id, data)
  values (v_alocacao, v_data)
  on conflict (alocacao_id, data) do nothing;

  update public.presenca
     set confirmou_volta = true,
         hora_volta = now(),
         cancelou_volta = false,
         motivo_cancelamento_volta = null,
         cancelado_volta_em = null
   where alocacao_id = v_alocacao and data = v_data;

  update public.solicitacao_volta
     set status = 'aprovada', motivo_recusa = null,
         decidido_por = auth.uid(), decidido_em = now()
   where id = p_solicitacao_id;

  perform public.registrar_log('aprovar_volta_avulsa', 'solicitacao_volta',
                               p_solicitacao_id, jsonb_build_object('rota_id', v_rota));

  return jsonb_build_object('status', 'aprovada', 'mensagem', 'Volta confirmada para o estudante');
end;
$fn$;

-- ---------------------------------------------------------------------
-- Estudante desiste da solicitacao
-- ---------------------------------------------------------------------
create or replace function public.cancelar_solicitacao_volta(
  p_data         date default current_date,
  p_estudante_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estudante uuid;
  v_alocacao  uuid;
begin
  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    raise exception 'Perfil sem permissao para cancelar a solicitacao';
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado';

  if v_alocacao is null then
    return jsonb_build_object('mensagem', 'Nenhuma solicitacao a cancelar');
  end if;

  update public.solicitacao_volta
     set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
   where alocacao_id = v_alocacao and data = p_data and status = 'pendente';

  return jsonb_build_object('status', 'cancelada', 'mensagem', 'Solicitacao cancelada');
end;
$fn$;

grant execute on function public.solicitar_volta_avulsa(text, date, uuid) to authenticated;
grant execute on function public.decidir_solicitacao_volta(uuid, boolean, text) to authenticated;
grant execute on function public.cancelar_solicitacao_volta(date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- confirmar_presenca: mesma versao de 0007, com uma unica mudanca.
--
-- O ESTUDANTE de perfil ida_volta deixa de confirmar a volta sozinho
-- quando nao confirmou a ida - passa por solicitar_volta_avulsa. O
-- STAFF continua marcando direto no balcao, com as mesmas regras RN05 e
-- RN17 de antes: e o caminho que a tela /presenca usa e ele nao pode
-- depender da decisao de um motorista.
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
as $fn$
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
  v_eh_estudante  boolean;
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  -- RN09: o estudante so confirma a propria presenca
  v_eh_estudante := public.meu_tipo() = 'estudante';
  if v_eh_estudante then
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

    -- Novidade: pelo lado do estudante, a volta sem ida precisa da
    -- justificativa aprovada pelo motorista. Se a solicitacao do dia ja
    -- foi aprovada, a presenca ja esta gravada e nao ha o que fazer.
    if v_eh_estudante then
      if exists (
        select 1 from public.solicitacao_volta
         where alocacao_id = v_alocacao and data = p_data and status = 'aprovada'
      ) then
        return jsonb_build_object('mensagem', 'Volta ja confirmada pelo motorista');
      end if;

      raise exception 'Confirme a ida ou envie uma justificativa para o motorista aprovar a volta';
    end if;

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
$fn$;

grant execute on function public.confirmar_presenca(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- cancelar_presenca: identica a de 0007, acrescentando o cancelamento
-- da solicitacao de volta do dia - senao o motorista continuaria vendo
-- um pedido de alguem que ja desistiu.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_presenca(
  p_estudante_id uuid,
  p_trecho text,
  p_motivo text,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estudante uuid;
  v_alocacao  uuid;
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
    raise exception 'Perfil sem permissao para cancelar presenca';
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado';

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
           cancelado_ida_em = now()
     where alocacao_id = v_alocacao and data = p_data;
  else
    update public.presenca
       set confirmou_volta = false, hora_volta = null,
           cancelou_volta = true,
           motivo_cancelamento_volta = trim(p_motivo),
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

grant execute on function public.cancelar_presenca(uuid, text, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- minha_rota: mesma consulta de 0005 com a chave solicitacao_volta.
-- Evita um round-trip extra na tela do aluno so para descobrir se o
-- pedido do dia foi aprovado ou recusado.
-- ---------------------------------------------------------------------
create or replace function public.minha_rota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
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
      'id', e.id, 'nome', e.nome, 'prontuario', e.prontuario, 'curso', e.curso,
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
    ) end,
    'solicitacao_volta', case when sv.id is null then null else jsonb_build_object(
      'id', sv.id, 'status', sv.status, 'justificativa', sv.justificativa,
      'motivo_recusa', sv.motivo_recusa, 'decidido_em', sv.decidido_em,
      'criado_em', sv.criado_em
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
  left join public.solicitacao_volta sv on sv.alocacao_id = a.id and sv.data = current_date
  where e.id = v_estudante;

  return v_resultado;
end;
$fn$;

grant execute on function public.minha_rota() to authenticated;
