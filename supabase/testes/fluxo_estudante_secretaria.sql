-- ---------------------------------------------------------------------
-- Teste ponta a ponta: o que o app do estudante envia chega na secretaria?
--
-- Roda dentro de uma transacao desfeita no fim (ROLLBACK): pode ser
-- executado no SQL Editor do Supabase sem deixar rastro. Cria um aluno,
-- um motorista e um funcionario de teste, faz cada acao do app PELO
-- PAPEL DO ESTUDANTE (role authenticated + RLS ligada) e confere, pelo
-- papel da secretaria, que cada registro ficou visivel para ela.
--
-- Cada verificacao imprime "OK ..." ou aborta com "FALHOU ...".
-- Requer as migrations ate 0027.
-- ---------------------------------------------------------------------
begin;

-- ---- Cenario (como dono do banco) ----------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'aluno.teste@gtporte.local',  '{"nome":"Aluno Teste","tipo":"estudante"}'),
  ('00000000-0000-4000-a000-000000000002', 'secretaria.teste@gtporte.local', '{"nome":"Secretaria Teste","tipo":"admin"}'),
  ('00000000-0000-4000-a000-000000000003', 'motorista.teste@gtporte.local',  '{"nome":"Motorista Teste","tipo":"motorista"}');

insert into public.cidade (id, nome, uf) values
  ('00000000-0000-4000-b000-000000000001', 'Cidade Teste GT', 'SP');

-- Duas universidades com raio de 300 m, uma depois da outra no trajeto.
insert into public.universidade (id, nome, cidade_id, latitude, longitude, raio_aviso_m) values
  ('00000000-0000-4000-b000-000000000011', 'Universidade A (teste)', '00000000-0000-4000-b000-000000000001', -21.2000, -50.4400, 300),
  ('00000000-0000-4000-b000-000000000012', 'Universidade B (teste)', '00000000-0000-4000-b000-000000000001', -21.1800, -50.4700, 300);

insert into public.motorista (id, perfil_id, nome, cnh) values
  ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-a000-000000000003', 'Motorista Teste', '00000000000');

insert into public.veiculo (id, placa, modelo, capacidade_maxima) values
  ('00000000-0000-4000-b000-000000000031', 'TST0A00', 'Ônibus teste', 40);

insert into public.rota (id, nome, cidade_origem_id, cidade_destino_id, veiculo_id, motorista_id,
                         horario_partida, horario_retorno) values
  ('00000000-0000-4000-b000-000000000041', 'Rota Teste', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000031',
   '00000000-0000-4000-b000-000000000021', '00:00', '23:59');

insert into public.parada_rota (rota_id, ordem, nome, latitude, longitude, universidade_id) values
  ('00000000-0000-4000-b000-000000000041', 1, 'Parada A', -21.2000, -50.4400, '00000000-0000-4000-b000-000000000011'),
  ('00000000-0000-4000-b000-000000000041', 2, 'Parada B', -21.1800, -50.4700, '00000000-0000-4000-b000-000000000012');

-- Aluno recem-cadastrado (fila de validacao), ja alocado pela secretaria.
insert into public.estudante (id, perfil_id, nome, cpf, universidade_id, cidade_id, status_documental) values
  ('00000000-0000-4000-b000-000000000051', '00000000-0000-4000-a000-000000000001', 'Aluno Teste',
   '00000000191', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-b000-000000000001', 'pendente');

insert into public.alocacao_estudante (estudante_id, rota_id, situacao, ativa) values
  ('00000000-0000-4000-b000-000000000051', '00000000-0000-4000-b000-000000000041', 'alocado', true);


-- ---- 1. Estudante na fila de validacao: nada externo ----------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);

do $$
declare v jsonb;
begin
  v := public.minha_rota();
  if v->'rota' <> 'null'::jsonb then raise exception 'FALHOU: rota exposta antes da validacao'; end if;
  if (select count(*) from public.minhas_rotas_semana()) > 0 then raise exception 'FALHOU: semana exposta'; end if;
  if jsonb_array_length(public.paradas_da_rota('00000000-0000-4000-b000-000000000041')->'paradas') > 0 then
    raise exception 'FALHOU: paradas expostas antes da validacao'; end if;
  if (select count(*) from public.localizacao_rota) > 0 then raise exception 'FALHOU: GPS exposto'; end if;
  perform public.garantir_grupos_das_rotas();
  if exists (select 1 from public.minhas_conversas() where tipo = 'grupo') then
    raise exception 'FALHOU: grupo da rota exposto antes da validacao'; end if;
  begin
    perform public.abrir_conversa_direta('motorista',
      (select id from public.motivo_conversa where destino = 'motorista' limit 1), 'oi');
    raise exception 'FALHOU: conversa com motorista liberada antes da validacao';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  raise notice 'OK 1: estudante nao validado nao ve rota, paradas, GPS, grupo nem motorista';
end $$;


-- ---- 2. Estudante envia dados pelo app ------------------------------
insert into public.documento (estudante_id, tipo, nome_arquivo, storage_path, status)
values ('00000000-0000-4000-b000-000000000051', 'rg', 'rg.pdf',
        '00000000-0000-4000-b000-000000000051/rg-1.pdf', 'pendente');

select public.solicitar_alteracao_cadastral('{"telefone":"18999990000"}'::jsonb);
select public.solicitar_alteracao_grade('[{"dia_semana":1,"hora_inicio":"08:00","hora_fim":"12:00"}]'::jsonb);
select public.abrir_conversa_direta('secretaria',
  (select id from public.motivo_conversa where destino = 'secretaria' and titulo = 'Documentos'),
  'Enviei meu RG, podem conferir?');

do $$ begin raise notice 'OK 2: documento, alteracao cadastral, grade e conversa enviados pelo estudante'; end $$;


-- ---- 3. Secretaria enxerga tudo -------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);

do $$
declare v_conv uuid;
begin
  if not exists (select 1 from public.documento where estudante_id = '00000000-0000-4000-b000-000000000051' and status = 'pendente') then
    raise exception 'FALHOU: documento nao chegou na secretaria'; end if;
  if not exists (select 1 from public.alteracao_cadastral where estudante_id = '00000000-0000-4000-b000-000000000051' and status = 'pendente') then
    raise exception 'FALHOU: alteracao cadastral nao chegou'; end if;
  if not exists (select 1 from public.alteracao_grade where estudante_id = '00000000-0000-4000-b000-000000000051' and status = 'pendente') then
    raise exception 'FALHOU: alteracao de grade nao chegou'; end if;

  select id into v_conv from public.conversas_atendimento('secretaria')
   where estudante_id = '00000000-0000-4000-b000-000000000051' and aguardando;
  if v_conv is null then raise exception 'FALHOU: conversa nao chegou na caixa da secretaria'; end if;
  if (select count(*) from public.mensagens_da_conversa(v_conv)) <> 1 then
    raise exception 'FALHOU: mensagem do estudante nao esta na conversa'; end if;

  perform public.enviar_mensagem_conversa(v_conv, 'Recebido, vamos conferir.');
  if (select count(*) from public.atividade_estudante('00000000-0000-4000-b000-000000000051')) < 4 then
    raise exception 'FALHOU: historico de atividade incompleto'; end if;

  -- valida o cadastro
  update public.documento set status = 'aprovado' where estudante_id = '00000000-0000-4000-b000-000000000051';
  update public.estudante set status_documental = 'aprovado' where id = '00000000-0000-4000-b000-000000000051';
  raise notice 'OK 3: secretaria ve documento, alteracoes, grade, conversa e atividade; respondeu e validou';
end $$;


-- ---- 4. Estudante validado: rota liberada e notificacoes ------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);

do $$
begin
  if public.minha_rota()->'rota' = 'null'::jsonb then raise exception 'FALHOU: rota nao liberada apos validacao'; end if;
  if not exists (select 1 from public.notificacao where titulo like 'Resposta da secretaria%') then
    raise exception 'FALHOU: estudante nao foi notificado da resposta'; end if;
  if not exists (select 1 from public.notificacao where titulo = 'Cadastro validado') then
    raise exception 'FALHOU: estudante nao foi notificado da validacao'; end if;
  perform public.garantir_grupos_das_rotas();
  if not exists (select 1 from public.minhas_conversas() where tipo = 'grupo') then
    raise exception 'FALHOU: grupo nao liberado apos validacao'; end if;
  raise notice 'OK 4: rota e grupo liberados; notificacoes de resposta e validacao recebidas';
end $$;


-- ---- 5. Raio das universidades --------------------------------------
-- Motorista: entra no raio de A, sai de A (aviso para B), entra em B.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000003', true);

insert into public.localizacao_rota (rota_id, latitude, longitude) values
  ('00000000-0000-4000-b000-000000000041', -21.2005, -50.4402);   -- dentro de A
insert into public.localizacao_rota (rota_id, latitude, longitude) values
  ('00000000-0000-4000-b000-000000000041', -21.1900, -50.4550);   -- entre A e B

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);
do $$
begin
  if not exists (select 1 from public.notificacao where titulo = 'O ônibus já está a caminho') then
    raise exception 'FALHOU: aluno de B nao foi avisado ao sair de A'; end if;
  if exists (select 1 from public.notificacao where titulo = 'O motorista está próximo') then
    raise exception 'FALHOU: aluno de B avisado de proximidade cedo demais'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000003', true);
insert into public.localizacao_rota (rota_id, latitude, longitude) values
  ('00000000-0000-4000-b000-000000000041', -21.1801, -50.4699);   -- dentro de B
insert into public.localizacao_rota (rota_id, latitude, longitude) values
  ('00000000-0000-4000-b000-000000000041', -21.1802, -50.4698);   -- ainda dentro de B

do $$
begin
  if jsonb_array_length(public.mapa_motorista('00000000-0000-4000-b000-000000000041')->'universidades') <> 2 then
    raise exception 'FALHOU: mapa do motorista sem as universidades'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);
do $$
begin
  if (select count(*) from public.notificacao where titulo = 'O motorista está próximo') <> 1 then
    raise exception 'FALHOU: aviso de proximidade ausente ou duplicado'; end if;
  begin
    perform public.mapa_motorista('00000000-0000-4000-b000-000000000041');
    raise exception 'FALHOU: estudante acessou o raio das universidades';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  raise notice 'OK 5: avisos de a caminho e de proximidade, uma vez cada; raio oculto do estudante';
end $$;

rollback;
