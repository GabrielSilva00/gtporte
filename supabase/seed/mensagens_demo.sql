-- =====================================================================
-- GTPORTE - 0013_seed_demo.sql
-- SEED DE DEMONSTRACAO
--
-- As telas de Mensagens e Solicitacoes nascem vazias porque so o
-- estudante consegue abrir uma conversa. Para a banca conseguir ver o
-- canal funcionando sem precisar simular varios logins, este arquivo
-- popula algumas conversas de exemplo.
--
-- Tudo aqui e condicional: se nao houver perfis de estudante e de staff
-- cadastrados, o arquivo nao insere nada. Nenhuma linha existente e
-- alterada, e reexecutar nao duplica (o assunto e usado como chave).
-- Em producao este arquivo pode simplesmente nao ser aplicado.
-- =====================================================================

do $seed$
declare
  v_staff      uuid;
  v_est1       uuid;
  v_est2       uuid;
  v_est3       uuid;
  v_motorista  uuid;
  v_thread     uuid;
begin
  select id into v_staff from public.perfil
   where tipo in ('admin', 'operador') and ativo order by criado_em limit 1;

  select id into v_motorista from public.perfil
   where tipo = 'motorista' and ativo order by criado_em limit 1;

  select id into v_est1 from public.perfil where tipo = 'estudante' order by criado_em offset 0 limit 1;
  select id into v_est2 from public.perfil where tipo = 'estudante' order by criado_em offset 1 limit 1;
  select id into v_est3 from public.perfil where tipo = 'estudante' order by criado_em offset 2 limit 1;

  if v_staff is null or v_est1 is null then
    raise notice 'Seed de mensagens ignorado: nao ha perfis suficientes cadastrados.';
    return;
  end if;

  -- ------------------------------------------------------------------
  -- SOLICITACOES
  -- ------------------------------------------------------------------
  if not exists (select 1 from public.mensagem where assunto = 'Troca de rota por mudanca de horario') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (v_est1, null, 'solicitacao', 'aberta',
            'Troca de rota por mudanca de horario',
            'Boa tarde. Minhas aulas passaram do periodo noturno para o vespertino a partir deste mes. '
            'Gostaria de solicitar a troca para uma rota que atenda a saida as 18h. Fico no aguardo.',
            now() - interval '2 hours')
    returning id into v_thread;
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Inclusao de ponto de embarque no bairro') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_est2, v_est1), null, 'solicitacao', 'respondida',
            'Inclusao de ponto de embarque no bairro',
            'Somos tres estudantes do mesmo bairro e hoje precisamos caminhar cerca de 2 km ate o ponto '
            'atual. Seria possivel avaliar a inclusao de uma parada na avenida principal?',
            now() - interval '3 days')
    returning id into v_thread;

    insert into public.mensagem (remetente_id, destinatario_id, responde_a, tipo, status, assunto, corpo, criado_em)
    values (v_staff, coalesce(v_est2, v_est1), v_thread, 'solicitacao', 'respondida',
            'Re: Inclusao de ponto de embarque no bairro',
            'Boa tarde. A solicitacao foi encaminhada ao setor de planejamento de rotas. O levantamento '
            'da via esta previsto para a proxima semana e retornamos com a definicao.',
            now() - interval '2 days');
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Segunda via da carteirinha de transporte') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_est3, v_est1), null, 'solicitacao', 'encerrada',
            'Segunda via da carteirinha de transporte',
            'Perdi minha carteirinha no fim de semana. Como faco para solicitar a segunda via?',
            now() - interval '9 days')
    returning id into v_thread;

    insert into public.mensagem (remetente_id, destinatario_id, responde_a, tipo, status, assunto, corpo, criado_em)
    values (v_staff, coalesce(v_est3, v_est1), v_thread, 'solicitacao', 'encerrada',
            'Re: Segunda via da carteirinha de transporte',
            'A segunda via ja esta disponivel para retirada no Setor de Transporte, de segunda a sexta, '
            'das 8h as 17h. Basta apresentar um documento com foto.',
            now() - interval '8 days');
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Cancelamento temporario do transporte') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_est2, v_est1), null, 'solicitacao', 'aberta',
            'Cancelamento temporario do transporte',
            'Estarei em estagio obrigatorio fora da cidade de 10 a 30 do mes que vem e nao usarei o '
            'transporte nesse periodo. Posso suspender temporariamente sem perder a vaga na rota?',
            now() - interval '5 hours');
  end if;

  -- ------------------------------------------------------------------
  -- MENSAGENS
  -- ------------------------------------------------------------------
  if not exists (select 1 from public.mensagem where assunto = 'Duvida sobre confirmacao de presenca') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (v_est1, null, 'mensagem', 'respondida',
            'Duvida sobre confirmacao de presenca',
            'Ate que horario consigo confirmar a presenca da volta? Ontem tentei as 17h e o sistema '
            'nao deixou mais.',
            now() - interval '4 days')
    returning id into v_thread;

    insert into public.mensagem (remetente_id, destinatario_id, responde_a, tipo, status, assunto, corpo, criado_em)
    values (v_staff, v_est1, v_thread, 'mensagem', 'respondida',
            'Re: Duvida sobre confirmacao de presenca',
            'A confirmacao encerra com a antecedencia definida pelo setor em relacao ao horario de '
            'retorno da rota. Voce pode conferir o prazo na propria tela Minha Rota.',
            now() - interval '4 days' + interval '3 hours');
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Atraso na rota de hoje') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_motorista, v_est1), null, 'mensagem', 'aberta',
            'Atraso na rota de hoje',
            'Comunico que houve retencao no transito na rodovia por conta de obras. A rota deve chegar '
            'cerca de 20 minutos depois do horario previsto. Os passageiros ja foram avisados.',
            now() - interval '1 hour');
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Elogio ao motorista da rota') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_est3, v_est1), null, 'mensagem', 'encerrada',
            'Elogio ao motorista da rota',
            'Gostaria de registrar um elogio. O motorista tem sido muito pontual e atencioso, '
            'principalmente nos dias de chuva.',
            now() - interval '12 days')
    returning id into v_thread;

    insert into public.mensagem (remetente_id, destinatario_id, responde_a, tipo, status, assunto, corpo, criado_em)
    values (v_staff, coalesce(v_est3, v_est1), v_thread, 'mensagem', 'encerrada',
            'Re: Elogio ao motorista da rota',
            'Obrigado pelo retorno. O elogio foi repassado ao motorista e registrado no prontuario '
            'funcional dele.',
            now() - interval '11 days');
  end if;

  if not exists (select 1 from public.mensagem where assunto = 'Documentacao reprovada - o que fazer') then
    insert into public.mensagem (remetente_id, destinatario_id, tipo, status, assunto, corpo, criado_em)
    values (coalesce(v_est2, v_est1), null, 'mensagem', 'aberta',
            'Documentacao reprovada - o que fazer',
            'Meu comprovante de residencia foi reprovado por estar ilegivel. Posso enviar uma conta de '
            'agua no lugar da conta de luz?',
            now() - interval '30 minutes');
  end if;
end
$seed$;

-- ---------------------------------------------------------------------
-- Mensagens prontas complementares
-- As quatro primeiras vieram em 0007; estas cobrem os eventos criados
-- depois (solicitacao de volta, vencimento de documento do motorista).
-- ---------------------------------------------------------------------
insert into public.mensagem_modelo (titulo, assunto, corpo, automatica, evento)
select * from (values
  ('Volta avulsa aprovada', 'Sua volta de hoje foi aprovada',
   'O motorista aprovou sua solicitacao de embarque somente na volta de hoje. Compareca ao ponto no '
   'horario de retorno da rota.',
   true, 'volta_aprovada'),
  ('Volta avulsa recusada', 'Sua solicitacao de volta foi recusada',
   'O motorista nao pode atender sua solicitacao de embarque somente na volta de hoje. Consulte o '
   'motivo no painel do estudante.',
   true, 'volta_recusada'),
  ('CNH proxima do vencimento', 'Sua CNH esta proxima do vencimento',
   'Identificamos que sua CNH vence em breve. Providencie a renovacao e envie o documento atualizado '
   'pelo painel do motorista.',
   true, 'cnh_vencendo'),
  ('Exame toxicologico vencendo', 'Exame toxicologico proximo do vencimento',
   'O exame toxicologico e obrigatorio para as categorias C, D e E. Providencie a renovacao antes do '
   'vencimento para nao ficar impedido de dirigir.',
   true, 'toxicologico_vencendo'),
  ('Aviso de alteracao de rota', 'Houve alteracao na sua rota',
   'Sua rota teve alteracao de horario ou de itinerario. Confira os novos dados na tela Minha Rota.',
   false, 'rota_alterada'),
  ('Entrada na fila de espera', 'Voce entrou na fila de espera',
   'No momento nao ha vaga na rota compativel com sua grade horaria. Voce esta na fila e sera avisado '
   'assim que uma vaga for liberada.',
   true, 'fila_espera')
) as novos(titulo, assunto, corpo, automatica, evento)
where not exists (
  select 1 from public.mensagem_modelo m where m.evento = novos.evento
);
