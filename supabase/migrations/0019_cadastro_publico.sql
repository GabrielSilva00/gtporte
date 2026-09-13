-- ---------------------------------------------------------------------
-- Cadastro publico: cidade e universidade legiveis sem sessao
--
-- O cadastro do estudante passou a acontecer antes de existir conta (o
-- e-mail e a senha sao o ultimo passo). Nesse momento quem preenche o
-- formulario ainda e anonimo, e as policies de cidade e universidade
-- exigiam auth.role() = 'authenticated': os campos "Cidade onde mora" e
-- "Universidade" apareciam vazios, sem erro nenhum na tela.
--
-- Sao listas publicas — nomes de municipios e de instituicoes de ensino,
-- nada pessoal. A escrita continua restrita ao staff.
-- ---------------------------------------------------------------------

drop policy if exists cidade_select on public.cidade;
create policy cidade_select on public.cidade
  for select using (true);

drop policy if exists universidade_select on public.universidade;
create policy universidade_select on public.universidade
  for select using (true);
