-- ---------------------------------------------------------------------
-- Teste do app do motorista (0028): embarque x check-in do aluno,
-- desfazer embarque, detalhe da viagem, contador de mensagens nao lidas
-- e notificacoes do motorista.
--
-- Roda dentro de uma transacao desfeita no fim (ROLLBACK): pode ser
-- executado no SQL Editor do Supabase sem deixar rastro. Cada
-- verificacao imprime "OK ..." ou aborta com "FALHOU ...".
-- Requer as migrations ate 0028.
-- ---------------------------------------------------------------------
begin;

-- ---- Cenario (como dono do banco) ----------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000101', 'aluna.um@gtporte.local',   '{"nome":"Ana Teste","tipo":"estudante"}'),
  ('00000000-0000-4000-a000-000000000102', 'aluno.dois@gtporte.local', '{"nome":"Bruno Teste","tipo":"estudante"}'),
  ('00000000-0000-4000-a000-000000000103', 'aluna.tres@gtporte.local', '{"nome":"Carla Teste","tipo":"estudante"}'),
  ('00000000-0000-4000-a000-000000000104', 'motorista.x@gtporte.local', '{"nome":"Motorista X","tipo":"motorista"}'),
  ('00000000-0000-4000-a000-000000000105', 'secretaria.x@gtporte.local', '{"nome":"Secretaria X","tipo":"admin"}');

insert into public.cidade (id, nome, uf) values
  ('00000000-0000-4000-b000-000000000101', 'Cidade Motorista GT', 'SP');
insert into public.universidade (id, nome, cidade_id) values
  ('00000000-0000-4000-b000-000000000111', 'Universidade M (teste)', '00000000-0000-4000-b000-000000000101');
insert into public.motorista (id, perfil_id, nome, cnh) values
  ('00000000-0000-4000-b000-000000000121', '00000000-0000-4000-a000-000000000104', 'Motorista X', '11111111111');
insert into public.veiculo (id, placa, modelo, capacidade_maxima) values
  ('00000000-0000-4000-b000-000000000131', 'MOT0A00', 'Ônibus teste', 40);
insert into public.rota (id, nome, cidade_origem_id, cidade_destino_id, veiculo_id, motorista_id,
                         horario_partida, horario_retorno) values
  ('00000000-0000-4000-b000-000000000141', 'Rota Motorista', '00000000-0000-4000-b000-000000000101',
   '00000000-0000-4000-b000-000000000101', '00000000-0000-4000-b000-000000000131',
   '00000000-0000-4000-b000-000000000121', '00:00', '23:59');

insert into public.estudante (id, perfil_id, nome, cpf, universidade_id, cidade_id, status_documental) values
  ('00000000-0000-4000-b000-000000000151', '00000000-0000-4000-a000-000000000101', 'Ana Teste',
   '52998224725', '00000000-0000-4000-b000-000000000111', '00000000-0000-4000-b000-000000000101', 'aprovado'),
  ('00000000-0000-4000-b000-000000000152', '00000000-0000-4000-a000-000000000102', 'Bruno Teste',
   '11144477735', '00000000-0000-4000-b000-000000000111', '00000000-0000-4000-b000-000000000101', 'aprovado'),
  ('00000000-0000-4000-b000-000000000153', '00000000-0000-4000-a000-000000000103', 'Carla Teste',
   '39053344705', '00000000-0000-4000-b000-000000000111', '00000000-0000-4000-b000-000000000101', 'aprovado');

insert into public.alocacao_estudante (estudante_id, rota_id, situacao, ativa) values
  ('00000000-0000-4000-b000-000000000151', '00000000-0000-4000-b000-000000000141', 'alocado', true),
  ('00000000-0000-4000-b000-000000000152', '00000000-0000-4000-b000-000000000141', 'alocado', true),
  ('00000000-0000-4000-b000-000000000153', '00000000-0000-4000-b000-000000000141', 'alocado', true);

insert into public.documento_motorista (id, motorista_id, tipo, nome_arquivo, storage_path, status) values
  ('00000000-0000-4000-b000-000000000161', '00000000-0000-4000-b000-000000000121', 'aso', 'aso.pdf',
   'motorista/00000000-0000-4000-b000-000000000121/aso-1.pdf', 'pendente');

set local role authenticated;


-- ---- 1. Alunos: Ana e Bruno confirmam pelo app; Carla cancela -------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000101', true);
select public.confirmar_presenca('00000000-0000-4000-b000-000000000151', 'ida');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000102', true);
select public.confirmar_presenca('00000000-0000-4000-b000-000000000152', 'ida');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000103', true);
select public.cancelar_presenca('00000000-0000-4000-b000-000000000153', 'ida', 'Consulta médica');
-- Carla abre conversa com o motorista (duas mensagens)
select public.abrir_conversa_direta('motorista',
  (select id from public.motivo_conversa where destino = 'motorista' limit 1), 'Amanhã eu vou.');

do $$ begin raise notice 'OK 1: alunos confirmaram, cancelaram e escreveram pelo app'; end $$;


-- ---- 2. Motorista: embarque, desfazer e notificacoes ----------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000104', true);

do $$
declare
  r record;
  v_conv uuid;
  v_nl int;
begin
  -- embarca Ana; Bruno confirmou pelo app mas nao sobe
  perform public.confirmar_presenca('00000000-0000-4000-b000-000000000151', 'ida');

  select * into r from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date)
   where nome = 'Ana Teste';
  if r.embarque_ida_em is null or r.checkin_aluno_ida_em is null then
    raise exception 'FALHOU: embarque da Ana sem as duas marcas (%, %)', r.checkin_aluno_ida_em, r.embarque_ida_em; end if;

  select * into r from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date)
   where nome = 'Bruno Teste';
  if r.embarque_ida_em is not null or r.checkin_aluno_ida_em is null or not r.confirmou_ida then
    raise exception 'FALHOU: Bruno deveria constar como check-in sem embarque'; end if;

  select * into r from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date)
   where nome = 'Carla Teste';
  if not r.cancelou_ida or r.motivo_cancelamento_ida <> 'Consulta médica' then
    raise exception 'FALHOU: cancelamento da Carla nao aparece no detalhe'; end if;

  -- desfazer o embarque da Ana mantem o check-in que ela fez pelo app
  perform public.desfazer_embarque('00000000-0000-4000-b000-000000000151', 'ida');
  select * into r from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date)
   where nome = 'Ana Teste';
  if r.embarque_ida_em is not null or not r.confirmou_ida or r.cancelou_ida then
    raise exception 'FALHOU: desfazer embarque apagou o check-in da aluna ou virou cancelamento'; end if;

  -- embarque marcado so pelo motorista, desfeito: volta a ficar sem confirmacao
  perform public.confirmar_presenca('00000000-0000-4000-b000-000000000153', 'ida');
  perform public.desfazer_embarque('00000000-0000-4000-b000-000000000153', 'ida');
  select * into r from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date)
   where nome = 'Carla Teste';
  if r.confirmou_ida or r.embarque_ida_em is not null then
    raise exception 'FALHOU: desfazer embarque sem check-in deveria limpar a confirmacao'; end if;

  -- notificacao do cancelamento da Carla
  if not exists (select 1 from public.notificacao
                  where tipo = 'cancelamento' and titulo like 'Carla Teste cancelou a ida%') then
    raise exception 'FALHOU: motorista nao foi avisado do cancelamento'; end if;
  -- e da mensagem direta
  if not exists (select 1 from public.notificacao where tipo = 'mensagem' and titulo like 'Mensagem de Carla%') then
    raise exception 'FALHOU: motorista nao foi avisado da mensagem'; end if;

  -- contador de nao lidas: 1 na conversa da Carla; zera ao marcar como lida
  select c.id, c.nao_lidas into v_conv, v_nl from public.conversas_do_motorista() c where c.tipo = 'direta';
  if v_nl <> 1 then raise exception 'FALHOU: esperado 1 nao lida, veio %', v_nl; end if;
  perform public.marcar_conversa_lida(v_conv);
  select c.nao_lidas into v_nl from public.conversas_do_motorista() c where c.id = v_conv;
  if v_nl <> 0 then raise exception 'FALHOU: marcar como lida nao zerou (%)', v_nl; end if;
  -- a resposta do proprio motorista nao conta
  perform public.enviar_mensagem_conversa(v_conv, 'Combinado.');
  select c.nao_lidas into v_nl from public.conversas_do_motorista() c where c.id = v_conv;
  if v_nl <> 0 then raise exception 'FALHOU: mensagem propria contou como nao lida'; end if;

  -- motorista nao le a leitura de outra pessoa nem o detalhe de rota alheia
  if exists (select 1 from public.conversa_leitura where perfil_id <> auth.uid()) then
    raise exception 'FALHOU: leitura de outro perfil visivel'; end if;
  raise notice 'OK 2: embarque, check-in sem embarque, cancelamento, desfazer, nao lidas e avisos';
end $$;


-- ---- 3. Aluno nao ve detalhe da viagem nem desfaz embarque ----------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000102', true);
do $$
begin
  begin
    perform * from public.detalhe_viagem_motorista('00000000-0000-4000-b000-000000000141', current_date);
    raise exception 'FALHOU: aluno leu o detalhe da viagem';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.desfazer_embarque('00000000-0000-4000-b000-000000000151', 'ida');
    raise exception 'FALHOU: aluno desfez embarque de outro';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  raise notice 'OK 3: aluno barrado no detalhe da viagem e no desfazer embarque';
end $$;


-- ---- 4. Secretaria recusa documento: motorista notificado ----------
reset role;
update public.documento_motorista set status = 'rejeitado', observacao = 'ASO ilegível'
 where id = '00000000-0000-4000-b000-000000000161';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000104', true);
do $$
begin
  if not exists (select 1 from public.notificacao where tipo = 'documento' and corpo = 'ASO ilegível' and urgente) then
    raise exception 'FALHOU: motorista nao foi avisado do documento recusado'; end if;
  raise notice 'OK 4: documento recusado notificado ao motorista';
end $$;

rollback;
