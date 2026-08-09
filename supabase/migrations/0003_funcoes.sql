-- =====================================================================
-- GTPORTE - 0003_funcoes.sql
-- Regras de negocio no banco: motor de distribuicao automatica (RF09),
-- ajuste manual (RF10), validacao documental (RF03), log (RN12) e
-- views de relatorio (RF17, RF18, RF19).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registro no log administrativo (RN12)
-- ---------------------------------------------------------------------
create or replace function public.registrar_log(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid,
  p_detalhe jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.log_administrativo (perfil_id, acao, entidade, entidade_id, detalhe)
  values (auth.uid(), p_acao, p_entidade, p_entidade_id, p_detalhe);
end;
$$;

create or replace function public.trg_log_generico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid
                                     else (to_jsonb(new)->>'id')::uuid end;

  insert into public.log_administrativo (perfil_id, acao, entidade, entidade_id, detalhe)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_id,
    case
      when tg_op = 'INSERT' then jsonb_build_object('novo', to_jsonb(new))
      when tg_op = 'DELETE' then jsonb_build_object('anterior', to_jsonb(old))
      else jsonb_build_object('anterior', to_jsonb(old), 'novo', to_jsonb(new))
    end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Insert/delete sempre geram log; updates so quando algum campo de negocio muda
-- (a coluna atualizado_em sozinha nao justifica uma entrada no log).
drop trigger if exists trg_log_rota on public.rota;
create trigger trg_log_rota after insert or delete on public.rota
  for each row execute function public.trg_log_generico();

drop trigger if exists trg_log_rota_update on public.rota;
create trigger trg_log_rota_update after update on public.rota
  for each row when (
    (old.codigo, old.nome, old.cidade_origem_id, old.cidade_destino_id, old.universidade_id,
     old.veiculo_id, old.motorista_id, old.horario_partida, old.horario_retorno,
     old.descricao, old.status)
    is distinct from
    (new.codigo, new.nome, new.cidade_origem_id, new.cidade_destino_id, new.universidade_id,
     new.veiculo_id, new.motorista_id, new.horario_partida, new.horario_retorno,
     new.descricao, new.status)
  )
  execute function public.trg_log_generico();

drop trigger if exists trg_log_veiculo on public.veiculo;
create trigger trg_log_veiculo after insert or delete on public.veiculo
  for each row execute function public.trg_log_generico();

drop trigger if exists trg_log_veiculo_update on public.veiculo;
create trigger trg_log_veiculo_update after update on public.veiculo
  for each row when (
    (old.placa, old.modelo, old.ano, old.capacidade_maxima, old.status, old.observacao)
    is distinct from
    (new.placa, new.modelo, new.ano, new.capacidade_maxima, new.status, new.observacao)
  )
  execute function public.trg_log_generico();

drop trigger if exists trg_log_documento on public.documento;
create trigger trg_log_documento after update on public.documento
  for each row when (old.status is distinct from new.status)
  execute function public.trg_log_generico();

drop trigger if exists trg_log_alocacao on public.alocacao_estudante;
create trigger trg_log_alocacao after insert on public.alocacao_estudante
  for each row execute function public.trg_log_generico();

drop trigger if exists trg_log_alocacao_update on public.alocacao_estudante;
create trigger trg_log_alocacao_update after update on public.alocacao_estudante
  for each row when (old.rota_id is distinct from new.rota_id)
  execute function public.trg_log_generico();

-- ---------------------------------------------------------------------
-- Recalculo do status documental do estudante
-- Aprovado somente quando os 4 tipos obrigatorios estiverem aprovados.
-- Rejeitado se qualquer um foi rejeitado. Caso contrario, pendente.
-- ---------------------------------------------------------------------
create or replace function public.recalcular_status_documental(p_estudante_id uuid)
returns status_documental
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aprovados  int;
  v_rejeitados int;
  v_novo       status_documental;
begin
  select count(*) filter (where status = 'aprovado'),
         count(*) filter (where status = 'rejeitado')
    into v_aprovados, v_rejeitados
  from public.documento
  where estudante_id = p_estudante_id;

  if v_rejeitados > 0 then
    v_novo := 'rejeitado';
  elsif v_aprovados >= 4 then
    v_novo := 'aprovado';
  else
    v_novo := 'pendente';
  end if;

  update public.estudante set status_documental = v_novo where id = p_estudante_id;
  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------
-- Aprovar / rejeitar documento (RF03, RN07)
-- A restricao "apenas admin" tambem e reforcada aqui, pois as funcoes
-- rodam com security definer e portanto ignoram a RLS da tabela.
-- ---------------------------------------------------------------------
create or replace function public.aprovar_documento(p_documento_id uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'RN07: apenas administradores podem aprovar documentos';
  end if;

  update public.documento
     set status = 'aprovado',
         observacao = p_observacao,
         revisado_por = auth.uid(),
         revisado_em = now()
   where id = p_documento_id
  returning estudante_id into v_estudante;

  if v_estudante is null then
    raise exception 'Documento nao encontrado';
  end if;

  v_status := public.recalcular_status_documental(v_estudante);
  return jsonb_build_object('estudante_id', v_estudante, 'status_documental', v_status);
end;
$$;

create or replace function public.rejeitar_documento(p_documento_id uuid, p_observacao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'RN07: apenas administradores podem rejeitar documentos';
  end if;

  if coalesce(trim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  update public.documento
     set status = 'rejeitado',
         observacao = p_observacao,
         revisado_por = auth.uid(),
         revisado_em = now()
   where id = p_documento_id
  returning estudante_id into v_estudante;

  if v_estudante is null then
    raise exception 'Documento nao encontrado';
  end if;

  v_status := public.recalcular_status_documental(v_estudante);
  return jsonb_build_object('estudante_id', v_estudante, 'status_documental', v_status);
end;
$$;

-- Aprova/rejeita todos os documentos pendentes de um estudante de uma vez
create or replace function public.revisar_documentos_estudante(
  p_estudante_id uuid,
  p_status status_documental,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status status_documental;
begin
  if not public.eh_admin() then
    raise exception 'RN07: apenas administradores podem revisar documentos';
  end if;

  update public.documento
     set status = p_status,
         observacao = p_observacao,
         revisado_por = auth.uid(),
         revisado_em = now()
   where estudante_id = p_estudante_id;

  v_status := public.recalcular_status_documental(p_estudante_id);
  return jsonb_build_object('estudante_id', p_estudante_id, 'status_documental', v_status);
end;
$$;

-- ---------------------------------------------------------------------
-- Ocupacao atual de uma rota (assentos ocupados por alocacoes ativas)
-- ---------------------------------------------------------------------
create or replace function public.ocupacao_rota(p_rota_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.alocacao_estudante
  where rota_id = p_rota_id and ativa and situacao = 'alocado';
$$;

-- =====================================================================
-- RF09 - DISTRIBUICAO AUTOMATICA DE ESTUDANTES
--
-- RN01: apenas estudantes com documentacao aprovada entram na distribuicao
-- RN02: compatibilidade entre a grade horaria e os horarios da rota
-- RN03: nenhum veiculo excede a capacidade maxima do veiculo
-- RN10: alocacoes marcadas como 'manual' sao preservadas
-- RNF03: alvo de execucao < 10s
--
-- Criterio de compatibilidade (RN02):
--   rota.horario_partida <= menor hora_inicio da grade  E
--   rota.horario_retorno >= maior  hora_fim    da grade
--   e a rota atende a universidade (ou a cidade de destino) do estudante.
--
-- Ordem de prioridade: estudantes com cadastro mais antigo primeiro.
-- Excedente da capacidade -> fila_espera. Sem rota compativel -> sem_rota.
-- =====================================================================
create or replace function public.executar_distribuicao(p_rota_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_est        record;
  v_rota       uuid;
  v_alocados   int := 0;
  v_espera     int := 0;
  v_sem_rota   int := 0;
  v_mensagens  jsonb := '[]'::jsonb;
  v_inicio     timestamptz := clock_timestamp();
  v_lotadas    text[] := '{}';
begin
  if not public.eh_staff() then
    raise exception 'Apenas administradores e operadores podem executar a distribuicao';
  end if;

  -- Capacidade disponivel por rota, ja descontando as alocacoes manuais
  -- que serao preservadas (RN10).
  drop table if exists _cap;
  create temp table _cap on commit drop as
  select r.id            as rota_id,
         r.codigo,
         r.nome,
         r.horario_partida,
         r.horario_retorno,
         r.universidade_id,
         r.cidade_destino_id,
         v.capacidade_maxima
           - coalesce((select count(*)
                         from public.alocacao_estudante a
                        where a.rota_id = r.id and a.ativa
                          and a.origem = 'manual' and a.situacao = 'alocado'), 0)
           as vagas,
         v.capacidade_maxima
  from public.rota r
  join public.veiculo v on v.id = r.veiculo_id
  where r.status in ('ativa', 'lotada')
    and (p_rota_ids is null or r.id = any(p_rota_ids));

  -- Encerra as alocacoes automaticas anteriores; as manuais permanecem (RN10).
  update public.alocacao_estudante
     set ativa = false, encerrado_em = now()
   where ativa
     and origem = 'automatica'
     and (p_rota_ids is null or rota_id is null or rota_id = any(p_rota_ids));

  -- Estudantes elegiveis: documentacao aprovada (RN01), ativos, com grade,
  -- e que ainda nao possuem alocacao manual ativa.
  for r_est in
    select e.id,
           e.nome,
           e.universidade_id,
           e.cidade_id,
           min(g.hora_inicio) as inicio_aula,
           max(g.hora_fim)    as fim_aula
      from public.estudante e
      join public.grade_horaria g on g.estudante_id = e.id
     where e.ativo
       and e.status_documental = 'aprovado'
       and not exists (
             select 1 from public.alocacao_estudante a
              where a.estudante_id = e.id and a.ativa and a.origem = 'manual'
           )
     group by e.id, e.nome, e.universidade_id, e.cidade_id
     order by min(e.criado_em)
  loop
    -- RN02 + RN03: primeira rota compativel com vaga, priorizando a de
    -- partida mais proxima do inicio das aulas (menor tempo de espera).
    select c.rota_id into v_rota
      from _cap c
     where c.vagas > 0
       and c.horario_partida <= r_est.inicio_aula
       and c.horario_retorno >= r_est.fim_aula
       and (c.universidade_id is null or c.universidade_id = r_est.universidade_id)
     order by c.horario_partida desc
     limit 1;

    if v_rota is not null then
      insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa)
      values (r_est.id, v_rota, 'alocado', 'automatica', true);
      update _cap set vagas = vagas - 1 where rota_id = v_rota;
      v_alocados := v_alocados + 1;

      -- registra rota que acabou de lotar
      if (select vagas from _cap where rota_id = v_rota) = 0 then
        select array_append(v_lotadas, codigo) into v_lotadas from _cap where rota_id = v_rota;
      end if;
    else
      -- Existe rota compativel de horario, mas sem vaga? -> fila de espera.
      if exists (
        select 1 from _cap c
         where c.horario_partida <= r_est.inicio_aula
           and c.horario_retorno >= r_est.fim_aula
           and (c.universidade_id is null or c.universidade_id = r_est.universidade_id)
      ) then
        insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa, motivo)
        values (r_est.id, null, 'fila_espera', 'automatica', true, 'Veiculo excedeu capacidade');
        v_espera := v_espera + 1;
      else
        insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa, motivo)
        values (r_est.id, null, 'sem_rota', 'automatica', true, 'Aluno sem rota compativel');
        v_sem_rota := v_sem_rota + 1;
      end if;
    end if;

    v_rota := null;
  end loop;

  -- Atualiza o status das rotas conforme a lotacao resultante.
  -- O filtro final evita gravar update (e log) em rotas que nao mudaram.
  update public.rota r
     set status = case
                    when public.ocupacao_rota(r.id) >= v.capacidade_maxima then 'lotada'::status_rota
                    else 'ativa'::status_rota
                  end
    from public.veiculo v
   where v.id = r.veiculo_id
     and r.status in ('ativa', 'lotada')
     and (p_rota_ids is null or r.id = any(p_rota_ids))
     and r.status is distinct from case
           when public.ocupacao_rota(r.id) >= v.capacidade_maxima then 'lotada'::status_rota
           else 'ativa'::status_rota
         end;

  -- Mensagens do sistema (protótipo, doc 4.1.5)
  v_mensagens := v_mensagens || jsonb_build_array(
    jsonb_build_object('tipo', 'sucesso', 'texto', 'Distribuicao concluida com sucesso')
  );
  if array_length(v_lotadas, 1) > 0 then
    v_mensagens := v_mensagens || jsonb_build_array(
      jsonb_build_object('tipo', 'alerta',
                         'texto', 'Veiculo excedeu capacidade: ' || array_to_string(v_lotadas, ', '))
    );
  end if;
  if v_sem_rota > 0 then
    v_mensagens := v_mensagens || jsonb_build_array(
      jsonb_build_object('tipo', 'erro',
                         'texto', v_sem_rota || ' aluno(s) sem rota compativel')
    );
  end if;

  perform public.registrar_log('executar_distribuicao', 'alocacao_estudante', null,
    jsonb_build_object('alocados', v_alocados, 'fila_espera', v_espera, 'sem_rota', v_sem_rota));

  return jsonb_build_object(
    'alocados',    v_alocados,
    'fila_espera', v_espera,
    'sem_rota',    v_sem_rota,
    'duracao_ms',  round(extract(epoch from (clock_timestamp() - v_inicio)) * 1000),
    'mensagens',   v_mensagens
  );
end;
$$;

-- =====================================================================
-- RF10 - AJUSTE MANUAL DA DISTRIBUICAO
-- Valida a capacidade (RN03) e marca a alocacao como manual para que a
-- proxima execucao automatica a preserve (RN10). Registra log (RN12).
-- p_rota_destino_id nulo move o estudante para a fila de espera.
-- =====================================================================
create or replace function public.mover_alocacao_manual(
  p_estudante_id uuid,
  p_rota_destino_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacidade int;
  v_ocupacao   int;
  v_codigo     text;
  v_nova       uuid;
begin
  if not public.eh_staff() then
    raise exception 'Apenas administradores e operadores podem ajustar a distribuicao';
  end if;

  if p_rota_destino_id is not null then
    select v.capacidade_maxima, r.codigo into v_capacidade, v_codigo
      from public.rota r
      join public.veiculo v on v.id = r.veiculo_id
     where r.id = p_rota_destino_id;

    if v_capacidade is null then
      raise exception 'Rota de destino nao encontrada';
    end if;

    v_ocupacao := public.ocupacao_rota(p_rota_destino_id);

    -- RN03: nenhum veiculo pode exceder sua capacidade maxima
    if v_ocupacao >= v_capacidade then
      raise exception 'RN03: veiculo excedeu capacidade (rota % com %/% assentos)',
        v_codigo, v_ocupacao, v_capacidade;
    end if;
  end if;

  update public.alocacao_estudante
     set ativa = false, encerrado_em = now()
   where estudante_id = p_estudante_id and ativa;

  insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa, motivo)
  values (
    p_estudante_id,
    p_rota_destino_id,
    case when p_rota_destino_id is null then 'fila_espera'::situacao_alocacao
         else 'alocado'::situacao_alocacao end,
    'manual',
    true,
    'Ajuste manual do administrador'
  )
  returning id into v_nova;

  return jsonb_build_object('alocacao_id', v_nova, 'rota_id', p_rota_destino_id);
end;
$$;

-- =====================================================================
-- RF13 / RF14 - CONFIRMACAO DE PRESENCA
-- RN04: ida e volta independentes.
-- RN16: a exigencia de confirmar a ida vale apenas para o perfil ida_volta.
-- RN17: quem tem perfil ida_volta e nao confirmou a ida so registra a volta
--       se houver assento remanescente.
-- RN05: alem disso, precisa respeitar a antecedencia minima configurada.
-- =====================================================================
create or replace function public.confirmar_presenca(
  p_estudante_id uuid,
  p_trecho text,               -- 'ida' | 'volta'
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
begin
  if p_trecho not in ('ida', 'volta') then
    raise exception 'Trecho invalido: use ida ou volta';
  end if;

  select a.id, a.rota_id, e.perfil_uso
    into v_alocacao, v_rota, v_perfil_uso
    from public.alocacao_estudante a
    join public.estudante e on e.id = a.estudante_id
   where a.estudante_id = p_estudante_id
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
  select confirmou_ida into v_confirmou_ida
    from public.presenca where alocacao_id = v_alocacao and data = p_data;

  -- RN16: a regra de dependencia so vale para o perfil ida_volta
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

-- =====================================================================
-- VIEWS DE RELATORIO (RF17, RF18, RF19)
-- security_invoker garante que a RLS das tabelas base continue valendo.
-- =====================================================================

-- RF19 - ocupacao por veiculo / rota
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
       )::int as percentual
from public.rota r
join public.veiculo v   on v.id = r.veiculo_id
join public.motorista m on m.id = r.motorista_id
left join public.alocacao_estudante a on a.rota_id = r.id
group by r.id, r.codigo, r.nome, r.status, r.horario_partida, r.horario_retorno,
         v.placa, v.modelo, v.capacidade_maxima, m.nome;

-- RF18 - frequencia por estudante
create or replace view public.vw_frequencia_estudante
with (security_invoker = true) as
select e.id           as estudante_id,
       e.nome,
       e.ra,
       u.nome         as universidade,
       r.codigo       as rota,
       count(p.id)::int                                         as dias_registrados,
       count(p.id) filter (where p.confirmou_ida)::int          as presencas_ida,
       count(p.id) filter (where p.confirmou_volta)::int        as presencas_volta,
       p.data
from public.estudante e
left join public.alocacao_estudante a on a.estudante_id = e.id
left join public.rota r  on r.id = a.rota_id
left join public.universidade u on u.id = e.universidade_id
left join public.presenca p on p.alocacao_id = a.id
group by e.id, e.nome, e.ra, u.nome, r.codigo, p.data;

-- RF17 - quantidade de alunos por rota e universidade
create or replace view public.vw_alunos_por_rota
with (security_invoker = true) as
select r.codigo    as rota,
       r.nome      as rota_nome,
       u.nome      as universidade,
       count(a.id)::int as alunos
from public.rota r
left join public.alocacao_estudante a on a.rota_id = r.id and a.ativa and a.situacao = 'alocado'
left join public.estudante e on e.id = a.estudante_id
left join public.universidade u on u.id = e.universidade_id
group by r.codigo, r.nome, u.nome;

-- RF24 - historico de utilizacao por estudante
create or replace view public.vw_historico_utilizacao
with (security_invoker = true) as
select e.id      as estudante_id,
       e.nome,
       e.ra,
       r.codigo  as rota,
       a.situacao,
       a.origem,
       a.criado_em,
       a.encerrado_em
from public.alocacao_estudante a
join public.estudante e on e.id = a.estudante_id
left join public.rota r on r.id = a.rota_id;

-- ---------------------------------------------------------------------
-- Permissoes de execucao
-- ---------------------------------------------------------------------
grant execute on function public.executar_distribuicao(uuid[])       to authenticated;
grant execute on function public.mover_alocacao_manual(uuid, uuid)   to authenticated;
grant execute on function public.aprovar_documento(uuid, text)       to authenticated;
grant execute on function public.rejeitar_documento(uuid, text)      to authenticated;
grant execute on function public.revisar_documentos_estudante(uuid, status_documental, text) to authenticated;
grant execute on function public.confirmar_presenca(uuid, text, date) to authenticated;
grant execute on function public.ocupacao_rota(uuid)                 to authenticated;
