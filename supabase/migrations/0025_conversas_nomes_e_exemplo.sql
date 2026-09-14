-- ---------------------------------------------------------------------
-- Nomes dos participantes da conversa + rota de exemplo em andamento
--
-- 1. O aplicativo lia as mensagens com um embed em `perfil` para saber
--    quem falou. A policy perfil_select_proprio deixa o estudante ver
--    apenas o proprio perfil, entao no grupo da rota nenhum participante
--    teria nome — e o embed bloqueado e forte candidato ao erro ao abrir
--    o chat. A saida e uma funcao que resolve o nome no banco, sem
--    afrouxar a policy.
--
-- 2. Um bloco opcional no fim popula uma rota com paradas, posicao de
--    GPS e situacao "em rota", para dar o que ver no mapa e permitir
--    testar check-in e check-out.
-- ---------------------------------------------------------------------

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
         case when m.eh_bot then 'Assistente' else coalesce(p.nome, 'Participante') end,
         coalesce(p.tipo::text, 'bot'),
         m.eh_bot,
         m.corpo,
         m.criado_em
    from public.conversa_mensagem m
    left join public.perfil p on p.id = m.autor_id
   where m.conversa_id = p_conversa_id
   order by m.criado_em
   limit p_limite;
end;
$$;

revoke all on function public.mensagens_da_conversa(uuid, int) from public;
grant execute on function public.mensagens_da_conversa(uuid, int) to authenticated;


/**
 * Envio pela funcao, em vez de insert direto: assim o app nao precisa
 * saber preencher autor_id, e a checagem de participacao acontece em um
 * lugar so.
 */
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

  return v_id;
end;
$$;

revoke all on function public.enviar_mensagem_conversa(uuid, text) from public;
grant execute on function public.enviar_mensagem_conversa(uuid, text) to authenticated;


-- =====================================================================
-- ROTA DE EXEMPLO EM ANDAMENTO — ambiente de teste
--
-- Coloca a primeira rota ativa "em rota", cria paradas com coordenadas
-- reais em Aracatuba e grava uma posicao de GPS, para o mapa do
-- aplicativo ter o que desenhar e o check-in poder ser exercitado.
--
-- Idempotente. Para desfazer, use o bloco comentado no fim.
-- =====================================================================
do $$
declare
  v_rota uuid;
  v_uni  uuid;
begin
  select id into v_rota from public.rota where status <> 'inativa' order by codigo limit 1;
  if v_rota is null then
    raise notice 'Nenhuma rota ativa: nada a fazer.';
    return;
  end if;

  select id into v_uni from public.universidade where ativa order by nome limit 1;

  -- Paradas do trajeto, na ordem. Coordenadas aproximadas de Aracatuba/SP.
  insert into public.parada_rota (rota_id, ordem, nome, endereco, latitude, longitude, universidade_id, minutos_partida)
  values
    (v_rota, 1, 'Terminal Rodoviário',      'Av. Brasília, 1200 - Centro',        -21.2089, -50.4328, null,  0),
    (v_rota, 2, 'Praça Rui Barbosa',        'Praça Rui Barbosa - Centro',         -21.2075, -50.4402, null,  8),
    (v_rota, 3, 'Av. dos Araçás',           'Av. dos Araçás, 800 - Jd. Sumaré',   -21.1976, -50.4501, null, 16),
    (v_rota, 4, 'Campus Universitário',     'Rod. Marechal Rondon, km 527',       -21.1859, -50.4677, v_uni, 28)
  on conflict (rota_id, ordem) do update
     set nome = excluded.nome,
         endereco = excluded.endereco,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         universidade_id = excluded.universidade_id,
         minutos_partida = excluded.minutos_partida,
         ativo = true;

  -- Onibus a caminho, entre a segunda e a terceira parada.
  insert into public.localizacao_rota (rota_id, latitude, longitude, registrado_em)
       values (v_rota, -21.2031, -50.4455, now());

  update public.rota
     set situacao_operacional = 'em_rota',
         situacao_atualizada_em = now()
   where id = v_rota;

  raise notice 'Rota % em andamento, com 4 paradas e posicao de GPS.', v_rota;
end;
$$;

-- ---------------------------------------------------------------------
-- DESFAZER o exemplo (descomente e rode):
--
-- do $$
-- declare v_rota uuid;
-- begin
--   select id into v_rota from public.rota where status <> 'inativa' order by codigo limit 1;
--   delete from public.parada_rota where rota_id = v_rota;
--   delete from public.localizacao_rota where rota_id = v_rota;
--   update public.rota set situacao_operacional = 'aguardando' where id = v_rota;
-- end;
-- $$;
