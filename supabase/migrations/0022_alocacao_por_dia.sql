-- ---------------------------------------------------------------------
-- Alocacao por dia da semana
--
-- Ate aqui o estudante tinha UMA alocacao ativa, e a distribuicao
-- agregava a semana inteira num intervalo so:
--
--   min(g.hora_inicio) as inicio_aula,
--   max(g.hora_fim)    as fim_aula
--
-- Isso obrigava uma unica rota a cobrir o dia mais cedo e o mais tarde.
-- Quem sai as 21h na segunda e as 22h40 na terca esperava 1h40 na
-- segunda, e quem nao tivesse nenhuma rota cobrindo o intervalo inteiro
-- caia em 'sem_rota' mesmo havendo rota boa para cada dia.
--
-- Agora a alocacao tem dia_semana: uma rota por dia. dia_semana nulo
-- continua significando "vale para todos os dias", que e o caso das
-- alocacoes manuais genericas e das que ja existiam.
-- ---------------------------------------------------------------------

alter table public.alocacao_estudante
  add column if not exists dia_semana smallint;

do $$
begin
  alter table public.alocacao_estudante
    add constraint alocacao_dia_semana_valido
    check (dia_semana is null or dia_semana between 0 and 6);
exception when duplicate_object then null;
end;
$$;

comment on column public.alocacao_estudante.dia_semana is
  'Dia da semana (1=segunda ... 6=sabado) a que esta alocacao se aplica. '
  'Nulo vale para todos os dias.';

-- O unique antigo era por estudante: agora e por estudante e dia. O
-- coalesce e necessario porque NULLs nao colidem entre si no Postgres,
-- e duas alocacoes "todos os dias" seriam aceitas sem ele.
drop index if exists uq_alocacao_ativa;
create unique index if not exists uq_alocacao_ativa
  on public.alocacao_estudante (estudante_id, coalesce(dia_semana, -1))
  where ativa;

create index if not exists idx_alocacao_rota_dia
  on public.alocacao_estudante (rota_id, dia_semana) where ativa;


-- ---------------------------------------------------------------------
-- Distribuicao automatica, agora dia a dia
-- ---------------------------------------------------------------------
create or replace function public.executar_distribuicao(p_rota_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_dia        record;
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

  -- Capacidade por rota e por dia: a vaga e disputada dentro do dia, e
  -- nao na semana toda. Um assento vale para cada dia separadamente.
  drop table if exists _cap;
  create temp table _cap on commit drop as
  select r.id  as rota_id,
         r.codigo,
         r.horario_partida,
         r.horario_retorno,
         d.dia  as dia_semana,
         v.capacidade_maxima
           - coalesce((select count(*)
                         from public.alocacao_estudante a
                        where a.rota_id = r.id and a.ativa
                          and a.origem = 'manual' and a.situacao = 'alocado'
                          and (a.dia_semana is null or a.dia_semana = d.dia)), 0)
           as vagas
    from public.rota r
    join public.veiculo v on v.id = r.veiculo_id
    cross join generate_series(1, 6) as d(dia)
   where r.status in ('ativa', 'lotada')
     and (p_rota_ids is null or r.id = any(p_rota_ids));

  -- Limpa apenas o que foi distribuido automaticamente; alocacao manual
  -- feita pela secretaria permanece.
  update public.alocacao_estudante
     set ativa = false, encerrado_em = now()
   where ativa
     and origem = 'automatica'
     and (p_rota_ids is null or rota_id is null or rota_id = any(p_rota_ids));

  -- Uma linha por estudante e por dia com aula.
  for r_dia in
    select e.id             as estudante_id,
           e.universidade_id,
           g.dia_semana,
           min(g.hora_inicio) as inicio_aula,
           max(g.hora_fim)    as fim_aula
      from public.estudante e
      join public.grade_horaria g on g.estudante_id = e.id
     where e.ativo
       and e.status_documental = 'aprovado'
       and not exists (
             select 1 from public.alocacao_estudante a
              where a.estudante_id = e.id and a.ativa and a.origem = 'manual'
                and (a.dia_semana is null or a.dia_semana = g.dia_semana)
           )
     group by e.id, e.universidade_id, g.dia_semana
     order by e.id, g.dia_semana
  loop
    -- Rota compativel naquele dia, priorizando a partida mais proxima do
    -- inicio das aulas (menor espera do estudante).
    select c.rota_id into v_rota
      from _cap c
     where c.dia_semana = r_dia.dia_semana
       and c.vagas > 0
       and c.horario_partida <= r_dia.inicio_aula
       and c.horario_retorno >= r_dia.fim_aula
       and public.rota_atende_universidade(c.rota_id, r_dia.universidade_id)
     order by c.horario_partida desc
     limit 1;

    if v_rota is not null then
      insert into public.alocacao_estudante
             (estudante_id, rota_id, dia_semana, situacao, origem, ativa)
      values (r_dia.estudante_id, v_rota, r_dia.dia_semana, 'alocado', 'automatica', true);

      update _cap set vagas = vagas - 1
       where rota_id = v_rota and dia_semana = r_dia.dia_semana;

      v_alocados := v_alocados + 1;

      if (select vagas from _cap where rota_id = v_rota and dia_semana = r_dia.dia_semana) = 0 then
        select array_append(v_lotadas, codigo || ' (dia ' || r_dia.dia_semana || ')')
          into v_lotadas
          from _cap where rota_id = v_rota and dia_semana = r_dia.dia_semana;
      end if;
    else
      if exists (
        select 1 from _cap c
         where c.dia_semana = r_dia.dia_semana
           and c.horario_partida <= r_dia.inicio_aula
           and c.horario_retorno >= r_dia.fim_aula
           and public.rota_atende_universidade(c.rota_id, r_dia.universidade_id)
      ) then
        insert into public.alocacao_estudante
               (estudante_id, rota_id, dia_semana, situacao, origem, ativa, motivo)
        values (r_dia.estudante_id, null, r_dia.dia_semana, 'fila_espera', 'automatica', true,
                'Veiculo excedeu capacidade neste dia');
        v_espera := v_espera + 1;
      else
        insert into public.alocacao_estudante
               (estudante_id, rota_id, dia_semana, situacao, origem, ativa, motivo)
        values (r_dia.estudante_id, null, r_dia.dia_semana, 'sem_rota', 'automatica', true,
                'Sem rota compativel neste dia');
        v_sem_rota := v_sem_rota + 1;
      end if;
    end if;

    v_rota := null;
  end loop;

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

  if array_length(v_lotadas, 1) > 0 then
    v_mensagens := v_mensagens || to_jsonb('Rotas que atingiram a capacidade: ' ||
                                           array_to_string(v_lotadas, ', '));
  end if;
  if v_espera > 0 then
    v_mensagens := v_mensagens || to_jsonb(v_espera || ' alocacao(oes) em fila de espera.');
  end if;
  if v_sem_rota > 0 then
    v_mensagens := v_mensagens || to_jsonb(v_sem_rota || ' dia(s) sem rota compativel.');
  end if;

  perform public.registrar_log('distribuicao_automatica', 'alocacao_estudante', null,
    jsonb_build_object('alocados', v_alocados, 'fila_espera', v_espera, 'sem_rota', v_sem_rota));

  return jsonb_build_object(
    'alocados', v_alocados,
    'fila_espera', v_espera,
    'sem_rota', v_sem_rota,
    'mensagens', v_mensagens,
    'duracao_ms', round(extract(epoch from clock_timestamp() - v_inicio) * 1000)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- minha_rota() passa a responder pela rota do dia informado
-- (padrao: hoje). A assinatura sem argumento continua valendo.
-- ---------------------------------------------------------------------
create or replace function public.minha_rota(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_estudante uuid;
  v_dia       smallint;
  v_resultado jsonb;
begin
  v_estudante := public.meu_estudante_id();
  if v_estudante is null then
    return null;
  end if;

  -- extract(dow) devolve 0 para domingo; a grade usa 1=segunda..6=sabado.
  v_dia := extract(dow from p_data)::smallint;

  select jsonb_build_object(
    'data', p_data,
    'dia_semana', v_dia,
    'estudante', jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'prontuario', e.prontuario, 'curso', e.curso,
      'perfil_uso', e.perfil_uso, 'status_documental', e.status_documental,
      'universidade', u.nome
    ),
    'alocacao', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'situacao', a.situacao, 'origem', a.origem, 'motivo', a.motivo,
      'dia_semana', a.dia_semana
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
  -- a do dia tem prioridade sobre a generica (dia_semana nulo)
  left join lateral (
    select a2.* from public.alocacao_estudante a2
     where a2.estudante_id = e.id and a2.ativa
       and (a2.dia_semana = v_dia or a2.dia_semana is null)
     order by a2.dia_semana nulls last
     limit 1
  ) a on true
  left join public.rota r      on r.id = a.rota_id
  left join public.cidade co   on co.id = r.cidade_origem_id
  left join public.cidade cd   on cd.id = r.cidade_destino_id
  left join public.motorista m on m.id = r.motorista_id
  left join public.veiculo v   on v.id = r.veiculo_id
  left join public.presenca p  on p.alocacao_id = a.id and p.data = p_data
  left join public.solicitacao_volta sv on sv.alocacao_id = a.id and sv.data = p_data
  where e.id = v_estudante;

  return v_resultado;
end;
$fn$;

grant execute on function public.minha_rota(date) to authenticated;


-- ---------------------------------------------------------------------
-- Todas as rotas da semana do estudante, para a listagem no aplicativo
-- ---------------------------------------------------------------------
create or replace function public.minhas_rotas_semana()
returns table (
  dia_semana    smallint,
  alocacao_id   uuid,
  situacao      situacao_alocacao,
  motivo        text,
  rota_id       uuid,
  codigo        text,
  nome          text,
  horario_partida time,
  horario_retorno time,
  situacao_operacional situacao_operacional,
  origem        text,
  destino       text,
  motorista     text,
  motorista_telefone text,
  veiculo       text,
  hora_inicio_aula time,
  hora_fim_aula    time,
  eh_hoje       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select public.meu_estudante_id() as id),
  dias as (select generate_series(1, 6)::smallint as dia)
  select d.dia,
         a.id,
         a.situacao,
         a.motivo,
         r.id,
         r.codigo,
         r.nome,
         r.horario_partida,
         r.horario_retorno,
         r.situacao_operacional,
         co.nome,
         cd.nome,
         m.nome,
         m.telefone,
         v.placa,
         g.hora_inicio,
         g.hora_fim,
         d.dia = extract(dow from current_date)::smallint
    from dias d
    cross join eu
    left join lateral (
      select a2.* from public.alocacao_estudante a2
       where a2.estudante_id = eu.id and a2.ativa
         and (a2.dia_semana = d.dia or a2.dia_semana is null)
       order by a2.dia_semana nulls last
       limit 1
    ) a on true
    left join public.rota r      on r.id = a.rota_id
    left join public.cidade co   on co.id = r.cidade_origem_id
    left join public.cidade cd   on cd.id = r.cidade_destino_id
    left join public.motorista m on m.id = r.motorista_id
    left join public.veiculo v   on v.id = r.veiculo_id
    left join lateral (
      select min(g2.hora_inicio) as hora_inicio, max(g2.hora_fim) as hora_fim
        from public.grade_horaria g2
       where g2.estudante_id = eu.id and g2.dia_semana = d.dia
    ) g on true
   where eu.id is not null
   order by d.dia;
$$;

revoke all on function public.minhas_rotas_semana() from public;
grant execute on function public.minhas_rotas_semana() to authenticated;


-- ---------------------------------------------------------------------
-- Presenca com alocacao por dia
--
-- As duas funcoes selecionavam a alocacao com
--   where a.estudante_id = ... and a.ativa and a.situacao = 'alocado';
-- sem limite e sem dia. Com uma alocacao por dia da semana, esse
-- SELECT INTO passaria a encontrar varias linhas e gravaria a presenca
-- em uma rota qualquer — possivelmente a de outro dia.
--
-- Recriadas a partir de 0015_checkin_motorista.sql, com o filtro de dia
-- como unica diferenca.
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
    if public.motorista_da_alocacao(p_estudante_id) is distinct from v_meu_motorista then
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

    -- RN05 nao se aplica ao motorista: ver o cabecalho desta migration
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
         cancelado_volta_em = null
   where alocacao_id = v_alocacao and data = p_data;

  return jsonb_build_object('mensagem', 'Presenca de volta confirmada');
end;
$fn$;


-- motorista_da_alocacao tinha limit 1 sem criterio: com varias alocacoes
-- podia devolver o motorista de outro dia e barrar o check-in legitimo.
create or replace function public.motorista_da_alocacao(
  p_estudante_id uuid,
  p_data date default current_date
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.motorista_id
    from public.alocacao_estudante a
    join public.rota r on r.id = a.rota_id
   where a.estudante_id = p_estudante_id
     and a.ativa
     and a.situacao = 'alocado'
     and (a.dia_semana = extract(dow from p_data)::smallint or a.dia_semana is null)
   order by a.dia_semana nulls last
   limit 1;
$$;

grant execute on function public.motorista_da_alocacao(uuid, date) to authenticated;


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
