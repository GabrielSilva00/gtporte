-- ---------------------------------------------------------------------
-- 0015 - Check-in e check-out feitos pelo motorista
--
-- Ate aqui confirmar_presenca() e cancelar_presenca() so aceitavam dois
-- perfis: o proprio estudante e o staff (eh_staff() = admin ou operador).
-- O motorista caia no ramo final e recebia "Perfil sem permissao para
-- registrar presenca", entao o embarque no onibus nao tinha como ser
-- registrado por quem de fato o presencia.
--
-- Esta migration acrescenta um terceiro ramo: o motorista da rota em que
-- o estudante esta alocado. O resto das duas funcoes e identico ao de
-- 0012 - as regras RN16 (volta depende da ida) e RN17 (vaga remanescente)
-- continuam valendo.
--
-- Excecao deliberada: a antecedencia minima da RN05 nao se aplica ao
-- motorista. Aquele prazo existe para o aluno planejar a volta com horas
-- de antecedencia; o motorista registra quem esta subindo no veiculo
-- naquele instante, e recusar o embarque por causa do relogio deixaria o
-- aluno em terra com o onibus parado na frente dele.
-- ---------------------------------------------------------------------

-- Quem e o motorista da rota ativa deste estudante?
create or replace function public.motorista_da_alocacao(p_estudante_id uuid)
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
   limit 1;
$$;

grant execute on function public.motorista_da_alocacao(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- confirmar_presenca
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

grant execute on function public.confirmar_presenca(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- cancelar_presenca
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
