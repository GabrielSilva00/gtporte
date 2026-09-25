-- ---------------------------------------------------------------------
-- 0028 - App do motorista: embarque, mensagens lidas e notificacoes
--
--  1. Check-in do aluno x embarque. Ate aqui confirmou_ida/confirmou_volta
--     eram marcados tanto pelo aluno (no app dele) quanto pelo motorista
--     (na porta do onibus), sem registro de quem marcou. O historico do
--     motorista precisa separar "confirmou no app mas nao embarcou" de
--     "embarcou", entao cada lado passa a ter a propria marca de tempo:
--       checkin_aluno_*_em - o aluno confirmou pelo app
--       embarque_*_em      - o motorista registrou o embarque
--     confirmou_* continua valendo como antes para o resto do sistema.
--     O "desfazer" do motorista deixa de usar cancelar_presenca(), que
--     gravava um cancelamento como se tivesse partido do aluno.
--  2. Leitura das conversas (conversa_leitura), para o contador de
--     mensagens nao lidas no app do motorista.
--  3. Notificacoes para o motorista: pedido de volta, troca de onibus,
--     aluno que cancelou a viagem do dia e documento revisado.
--  4. Detalhe de uma viagem do historico (quem foi, voltou, cancelou...).
--
-- Idempotente: pode ser reexecutada.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. CHECK-IN DO ALUNO x EMBARQUE
-- =====================================================================
alter table public.presenca
  add column if not exists checkin_aluno_ida_em   timestamptz,
  add column if not exists checkin_aluno_volta_em timestamptz,
  add column if not exists embarque_ida_em        timestamptz,
  add column if not exists embarque_volta_em      timestamptz;

comment on column public.presenca.checkin_aluno_ida_em is
  'Quando o proprio aluno confirmou a ida pelo app (0028).';
comment on column public.presenca.embarque_ida_em is
  'Quando o motorista registrou o embarque na ida (0028).';


-- Recriada a partir de 0022_alocacao_por_dia.sql; a unica diferenca sao
-- as marcas checkin_aluno_* e embarque_* nos dois UPDATEs finais.
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
  v_eh_motorista  boolean := false;
  v_meu_motorista uuid;
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
    -- RN08: o motorista registra a presenca de quem viaja na rota dele
    v_meu_motorista := public.meu_motorista_id();
    if v_meu_motorista is null then
      raise exception 'Perfil sem permissao para registrar presenca';
    end if;
    if public.motorista_da_alocacao(p_estudante_id, p_data) is distinct from v_meu_motorista then
      raise exception 'Este estudante nao viaja em uma rota sob sua responsabilidade';
    end if;
    v_estudante    := p_estudante_id;
    v_eh_motorista := true;
  end if;

  select a.id, a.rota_id, e.perfil_uso
    into v_alocacao, v_rota, v_perfil_uso
    from public.alocacao_estudante a
    join public.estudante e on e.id = a.estudante_id
   where a.estudante_id = v_estudante
     and a.ativa and a.situacao = 'alocado'
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
    if v_perfil_uso = 'somente_volta' then
      raise exception 'Estudante com perfil somente volta nao confirma ida';
    end if;
    update public.presenca
       set confirmou_ida = true,
           hora_ida = now(),
           cancelou_ida = false,
           motivo_cancelamento_ida = null,
           cancelado_ida_em = null,
           checkin_aluno_ida_em = case when v_eh_estudante then now() else checkin_aluno_ida_em end,
           embarque_ida_em      = case when v_eh_motorista then now() else embarque_ida_em end
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

    -- RN05 nao se aplica ao motorista: ver 0015_checkin_motorista.sql
    if not v_eh_motorista then
      select coalesce(valor::int, 2) into v_antecedencia
        from public.configuracao_sistema where chave = 'rn05_antecedencia_horas';

      if now() > (p_data + v_retorno) - make_interval(hours => coalesce(v_antecedencia, 2)) then
        raise exception 'Prazo para confirmacao encerrado';
      end if;
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
         cancelado_volta_em = null,
         checkin_aluno_volta_em = case when v_eh_estudante then now() else checkin_aluno_volta_em end,
         embarque_volta_em      = case when v_eh_motorista then now() else embarque_volta_em end
   where alocacao_id = v_alocacao and data = p_data;

  return jsonb_build_object('mensagem', 'Presenca de volta confirmada');
end;
$fn$;

grant execute on function public.confirmar_presenca(uuid, text, date) to authenticated;


-- Recriada a partir de 0023_paradas_e_troca_de_rota.sql; cancelar tambem
-- apaga o check-in do aluno e o embarque daquele trecho.
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
    if public.motorista_da_alocacao(p_estudante_id, p_data) is distinct from v_meu_motorista then
      raise exception 'Este estudante nao viaja em uma rota sob sua responsabilidade';
    end if;
    v_estudante := p_estudante_id;
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado'
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
           cancelado_ida_em = now(),
           checkin_aluno_ida_em = null,
           embarque_ida_em = null
     where alocacao_id = v_alocacao and data = p_data;
  else
    update public.presenca
       set confirmou_volta = false, hora_volta = null,
           cancelou_volta = true,
           motivo_cancelamento_volta = trim(p_motivo),
           motivo_tipo_volta = p_motivo_tipo,
           cancelado_volta_em = now(),
           checkin_aluno_volta_em = null,
           embarque_volta_em = null
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


/**
 * O motorista desfaz um embarque registrado por engano. Nao e um
 * cancelamento: se o aluno tinha confirmado pelo app, a confirmacao dele
 * continua valendo; se foi o motorista que marcou, o trecho volta a ficar
 * sem confirmacao.
 */
create or replace function public.desfazer_embarque(
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
  v_alocacao uuid;
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  if not public.eh_staff()
     and (public.meu_motorista_id() is null
          or public.motorista_da_alocacao(p_estudante_id, p_data) is distinct from public.meu_motorista_id()) then
    raise exception 'Este estudante nao viaja em uma rota sob sua responsabilidade';
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = p_estudante_id and a.ativa and a.situacao = 'alocado'
     and (a.dia_semana = extract(dow from p_data)::smallint or a.dia_semana is null)
   order by a.dia_semana nulls last
   limit 1;

  if v_alocacao is null then
    raise exception 'Estudante nao possui alocacao ativa em uma rota';
  end if;

  if p_trecho = 'ida' then
    update public.presenca
       set embarque_ida_em = null,
           confirmou_ida   = checkin_aluno_ida_em is not null,
           hora_ida        = checkin_aluno_ida_em
     where alocacao_id = v_alocacao and data = p_data;
  else
    update public.presenca
       set embarque_volta_em = null,
           confirmou_volta   = checkin_aluno_volta_em is not null,
           hora_volta        = checkin_aluno_volta_em
     where alocacao_id = v_alocacao and data = p_data;
  end if;

  perform public.registrar_log('desfazer_embarque', 'presenca', v_alocacao,
                               jsonb_build_object('trecho', p_trecho, 'data', p_data));

  return jsonb_build_object('mensagem', 'Embarque desfeito');
end;
$fn$;

revoke all on function public.desfazer_embarque(uuid, text, date) from public, anon;
grant execute on function public.desfazer_embarque(uuid, text, date) to authenticated;


-- =====================================================================
-- 2. LEITURA DAS CONVERSAS
-- =====================================================================
create table if not exists public.conversa_leitura (
  conversa_id uuid not null references public.conversa(id) on delete cascade,
  perfil_id   uuid not null references public.perfil(id) on delete cascade,
  lida_ate    timestamptz not null default now(),
  primary key (conversa_id, perfil_id)
);

alter table public.conversa_leitura enable row level security;

-- So leitura direta, e so das proprias linhas; a escrita e pela funcao.
drop policy if exists conversa_leitura_propria on public.conversa_leitura;
create policy conversa_leitura_propria on public.conversa_leitura
  for select using (perfil_id = auth.uid());

/** Marca a conversa como lida ate agora para o usuario logado. */
create or replace function public.marcar_conversa_lida(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado.';
  end if;
  insert into public.conversa_leitura (conversa_id, perfil_id, lida_ate)
  select c.id, auth.uid(), now() from public.conversa c where c.id = p_conversa_id
  on conflict (conversa_id, perfil_id) do update
     set lida_ate = greatest(public.conversa_leitura.lida_ate, excluded.lida_ate);
end;
$$;

revoke all on function public.marcar_conversa_lida(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida(uuid) to authenticated;


-- Mesma consulta de 0027, com a contagem de nao lidas. O tipo de retorno
-- muda, entao a funcao precisa ser removida antes.
-- Conversa nunca aberta conta so as mensagens dos ultimos 7 dias: sem
-- esse teto, o grupo de uma rota antiga estrearia o contador com
-- centenas de mensagens.
drop function if exists public.conversas_do_motorista();

create function public.conversas_do_motorista()
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
  aguardando      boolean,
  nao_lidas       integer
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
         coalesce(ult.autor_id is distinct from auth.uid() and ult.autor_id is not null, false),
         (select count(*)::int
            from public.conversa_mensagem cm
           where cm.conversa_id = c.id
             and cm.autor_id is distinct from auth.uid()
             and cm.criado_em > greatest(coalesce(l.lida_ate, '-infinity'::timestamptz),
                                         now() - interval '7 days'))
    from public.conversa c
    join public.rota r on r.id = c.rota_id and r.motorista_id = v_motorista
    left join public.estudante e on e.id = c.estudante_id
    left join public.conversa_leitura l on l.conversa_id = c.id and l.perfil_id = auth.uid()
    left join lateral (
      select cm.corpo, cm.autor_id from public.conversa_mensagem cm
       where cm.conversa_id = c.id order by cm.criado_em desc limit 1
    ) ult on true
   where c.tipo = 'grupo' or c.destino = 'motorista'
   order by c.ultima_em desc;
end;
$$;

revoke all on function public.conversas_do_motorista() from public, anon;
grant execute on function public.conversas_do_motorista() to authenticated;


-- =====================================================================
-- 3. NOTIFICACOES DO MOTORISTA
-- Tipos usados no app do motorista: mensagem, pedido, cancelamento,
-- documento. O destino e a aba do app que resolve o assunto.
-- =====================================================================

/** perfil (auth) do motorista responsavel pela rota. */
create or replace function public.perfil_motorista_da_rota(p_rota_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.perfil_id
    from public.rota r join public.motorista m on m.id = r.motorista_id
   where r.id = p_rota_id;
$$;

revoke all on function public.perfil_motorista_da_rota(uuid) from public, anon, authenticated;


-- Pedido de volta (0012): o motorista e quem aprova.
create or replace function public.tg_notifica_pedido_volta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if new.status <> 'pendente' then
    return new;
  end if;
  select e.nome into v_nome
    from public.alocacao_estudante a join public.estudante e on e.id = a.estudante_id
   where a.id = new.alocacao_id;
  perform public.notificar(public.perfil_motorista_da_rota(new.rota_id), 'pedido',
    'Pedido de volta · ' || coalesce(v_nome, 'estudante'),
    left(new.justificativa, 140), 'viagem', new.data = current_date);
  return new;
end;
$$;

drop trigger if exists notifica_pedido_volta on public.solicitacao_volta;
create trigger notifica_pedido_volta
  after insert on public.solicitacao_volta
  for each row execute function public.tg_notifica_pedido_volta();


-- Troca de onibus (0023): quem aceita e o motorista da rota de destino.
create or replace function public.tg_notifica_troca_rota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if new.status <> 'pendente' then
    return new;
  end if;
  select nome into v_nome from public.estudante where id = new.estudante_id;
  perform public.notificar(public.perfil_motorista_da_rota(new.rota_destino_id), 'pedido',
    'Pedido de troca de ônibus · ' || coalesce(v_nome, 'estudante'),
    coalesce(left(new.justificativa, 140), 'Quer fazer a ' || new.trecho || ' na sua rota.'),
    'viagem', new.data = current_date);
  return new;
end;
$$;

drop trigger if exists notifica_troca_rota on public.troca_rota;
create trigger notifica_troca_rota
  after insert on public.troca_rota
  for each row execute function public.tg_notifica_troca_rota();


-- Aluno cancelou a viagem de hoje: o motorista deixa de esperar por ele.
-- So o cancelamento feito pelo proprio aluno; o do motorista ou da
-- secretaria nao precisa avisar quem fez.
create or replace function public.tg_notifica_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome   text;
  v_rota   uuid;
  v_trecho text;
  v_motivo text;
begin
  if new.data <> current_date or public.meu_tipo() is distinct from 'estudante' then
    return new;
  end if;

  if new.cancelou_ida and not old.cancelou_ida then
    v_trecho := 'ida';
    v_motivo := new.motivo_cancelamento_ida;
  elsif new.cancelou_volta and not old.cancelou_volta then
    v_trecho := 'volta';
    v_motivo := new.motivo_cancelamento_volta;
  else
    return new;
  end if;

  select e.nome, a.rota_id into v_nome, v_rota
    from public.alocacao_estudante a join public.estudante e on e.id = a.estudante_id
   where a.id = new.alocacao_id;

  perform public.notificar(public.perfil_motorista_da_rota(v_rota), 'cancelamento',
    coalesce(v_nome, 'Estudante') || ' cancelou a ' || v_trecho || ' de hoje',
    coalesce(left(v_motivo, 140), 'Sem motivo informado.'), 'checkin', false);
  return new;
end;
$$;

drop trigger if exists notifica_cancelamento on public.presenca;
create trigger notifica_cancelamento
  after update of cancelou_ida, cancelou_volta on public.presenca
  for each row execute function public.tg_notifica_cancelamento();


-- Documento do motorista revisado pela secretaria.
create or replace function public.tg_notifica_documento_motorista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil uuid;
begin
  select perfil_id into v_perfil from public.motorista where id = new.motorista_id;
  if new.status = 'rejeitado' then
    perform public.notificar(v_perfil, 'documento', 'Documento recusado',
      coalesce(new.observacao, 'Envie o documento "' || new.nome_arquivo || '" de novo.'),
      'documentos', true);
  elsif new.status = 'aprovado' then
    perform public.notificar(v_perfil, 'documento', 'Documento aprovado',
      'O documento "' || new.nome_arquivo || '" foi aprovado pela secretaria.',
      'documentos', false);
  end if;
  return new;
end;
$$;

drop trigger if exists notifica_documento_motorista on public.documento_motorista;
create trigger notifica_documento_motorista
  after update of status on public.documento_motorista
  for each row
  when (old.status is distinct from new.status)
  execute function public.tg_notifica_documento_motorista();


-- =====================================================================
-- 4. DETALHE DE UMA VIAGEM DO HISTORICO
-- security definer porque a policy estudante_motorista so mostra alunos
-- com alocacao ATIVA: quem mudou de rota sumiria do historico antigo.
-- =====================================================================
create or replace function public.detalhe_viagem_motorista(p_rota_id uuid, p_data date)
returns table (
  estudante_id           uuid,
  nome                   text,
  prontuario             text,
  perfil_uso             perfil_uso,
  confirmou_ida          boolean,
  confirmou_volta        boolean,
  checkin_aluno_ida_em   timestamptz,
  checkin_aluno_volta_em timestamptz,
  embarque_ida_em        timestamptz,
  embarque_volta_em      timestamptz,
  hora_ida               timestamptz,
  hora_volta             timestamptz,
  cancelou_ida           boolean,
  cancelou_volta         boolean,
  motivo_cancelamento_ida   text,
  motivo_cancelamento_volta text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.eh_staff() or exists (
    select 1 from public.rota r
     where r.id = p_rota_id and r.motorista_id = public.meu_motorista_id()
  )) then
    raise exception 'Sem permissao.';
  end if;

  return query
  select e.id, e.nome, e.prontuario, e.perfil_uso,
         p.confirmou_ida, p.confirmou_volta,
         p.checkin_aluno_ida_em, p.checkin_aluno_volta_em,
         p.embarque_ida_em, p.embarque_volta_em,
         p.hora_ida, p.hora_volta,
         p.cancelou_ida, p.cancelou_volta,
         p.motivo_cancelamento_ida, p.motivo_cancelamento_volta
    from public.presenca p
    join public.alocacao_estudante a on a.id = p.alocacao_id
    join public.estudante e on e.id = a.estudante_id
   where a.rota_id = p_rota_id and p.data = p_data
   order by e.nome;
end;
$$;

revoke all on function public.detalhe_viagem_motorista(uuid, date) from public, anon;
grant execute on function public.detalhe_viagem_motorista(uuid, date) to authenticated;


-- conversa_leitura nao precisa de Realtime; notificacao ja esta na
-- publicacao desde 0027.
