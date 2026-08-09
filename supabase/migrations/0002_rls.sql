-- =====================================================================
-- GTPORTE - 0002_rls.sql
-- Controle de acesso por perfil (RF20, RF21) e regras de negocio
-- RN06 (so admin altera rotas), RN07 (so admin aprova documentos),
-- RN08 (motorista ve apenas sua rota), RN09 (estudante ve apenas o seu).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- security definer para poder ler public.perfil sem cair na propria RLS
-- ---------------------------------------------------------------------
create or replace function public.meu_tipo()
returns tipo_perfil
language sql
stable
security definer
set search_path = public
as $$
  select tipo from public.perfil where id = auth.uid();
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select tipo from public.perfil where id = auth.uid()) = 'admin', false);
$$;

-- admin ou operador: acesso ao painel administrativo
create or replace function public.eh_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tipo from public.perfil where id = auth.uid()) in ('admin', 'operador'),
    false
  );
$$;

-- id do registro de motorista do usuario logado (RN08)
create or replace function public.meu_motorista_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.motorista where perfil_id = auth.uid();
$$;

-- id do registro de estudante do usuario logado (RN09)
create or replace function public.meu_estudante_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.estudante where perfil_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas
-- ---------------------------------------------------------------------
alter table public.perfil               enable row level security;
alter table public.cidade               enable row level security;
alter table public.universidade         enable row level security;
alter table public.estudante            enable row level security;
alter table public.motorista            enable row level security;
alter table public.veiculo              enable row level security;
alter table public.rota                 enable row level security;
alter table public.documento            enable row level security;
alter table public.grade_horaria        enable row level security;
alter table public.alocacao_estudante   enable row level security;
alter table public.presenca             enable row level security;
alter table public.feedback             enable row level security;
alter table public.localizacao_rota     enable row level security;
alter table public.log_administrativo   enable row level security;
alter table public.configuracao_sistema enable row level security;

-- ---------------------------------------------------------------------
-- perfil
-- ---------------------------------------------------------------------
drop policy if exists perfil_select_proprio on public.perfil;
create policy perfil_select_proprio on public.perfil
  for select using (id = auth.uid() or public.eh_staff());

drop policy if exists perfil_update_proprio on public.perfil;
create policy perfil_update_proprio on public.perfil
  for update using (id = auth.uid()) with check (id = auth.uid());

-- RF20: apenas admin gerencia perfis de acesso de terceiros
drop policy if exists perfil_admin_all on public.perfil;
create policy perfil_admin_all on public.perfil
  for all using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- cidade / universidade: leitura para qualquer autenticado, escrita staff
-- ---------------------------------------------------------------------
drop policy if exists cidade_select on public.cidade;
create policy cidade_select on public.cidade
  for select using (auth.role() = 'authenticated');

drop policy if exists cidade_write on public.cidade;
create policy cidade_write on public.cidade
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists universidade_select on public.universidade;
create policy universidade_select on public.universidade
  for select using (auth.role() = 'authenticated');

drop policy if exists universidade_write on public.universidade;
create policy universidade_write on public.universidade
  for all using (public.eh_staff()) with check (public.eh_staff());

-- ---------------------------------------------------------------------
-- estudante
-- RN09: estudante enxerga apenas o proprio registro
-- ---------------------------------------------------------------------
drop policy if exists estudante_staff on public.estudante;
create policy estudante_staff on public.estudante
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists estudante_proprio on public.estudante;
create policy estudante_proprio on public.estudante
  for select using (perfil_id = auth.uid());

-- RF22: estudante atualiza os proprios dados cadastrais
drop policy if exists estudante_update_proprio on public.estudante;
create policy estudante_update_proprio on public.estudante
  for update using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- RN08: motorista ve os estudantes alocados na sua rota
drop policy if exists estudante_motorista on public.estudante;
create policy estudante_motorista on public.estudante
  for select using (
    exists (
      select 1
      from public.alocacao_estudante a
      join public.rota r on r.id = a.rota_id
      where a.estudante_id = estudante.id
        and a.ativa
        and r.motorista_id = public.meu_motorista_id()
    )
  );

-- ---------------------------------------------------------------------
-- motorista
-- ---------------------------------------------------------------------
drop policy if exists motorista_staff on public.motorista;
create policy motorista_staff on public.motorista
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists motorista_proprio on public.motorista;
create policy motorista_proprio on public.motorista
  for select using (perfil_id = auth.uid());

-- estudante precisa ver o motorista responsavel pela sua rota
drop policy if exists motorista_select_autenticado on public.motorista;
create policy motorista_select_autenticado on public.motorista
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- veiculo
-- ---------------------------------------------------------------------
drop policy if exists veiculo_select on public.veiculo;
create policy veiculo_select on public.veiculo
  for select using (auth.role() = 'authenticated');

drop policy if exists veiculo_write on public.veiculo;
create policy veiculo_write on public.veiculo
  for all using (public.eh_staff()) with check (public.eh_staff());

-- ---------------------------------------------------------------------
-- rota
-- RN06: APENAS administradores podem alterar rotas cadastradas
-- ---------------------------------------------------------------------
drop policy if exists rota_select on public.rota;
create policy rota_select on public.rota
  for select using (auth.role() = 'authenticated');

drop policy if exists rota_insert_admin on public.rota;
create policy rota_insert_admin on public.rota
  for insert with check (public.eh_admin());

drop policy if exists rota_update_admin on public.rota;
create policy rota_update_admin on public.rota
  for update using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists rota_delete_admin on public.rota;
create policy rota_delete_admin on public.rota
  for delete using (public.eh_admin());

-- ---------------------------------------------------------------------
-- documento
-- RN07: APENAS administradores podem aprovar/rejeitar documentos
-- (staff pode inserir em nome do estudante; estudante envia os seus)
-- ---------------------------------------------------------------------
drop policy if exists documento_select on public.documento;
create policy documento_select on public.documento
  for select using (
    public.eh_staff()
    or estudante_id = public.meu_estudante_id()
  );

drop policy if exists documento_insert on public.documento;
create policy documento_insert on public.documento
  for insert with check (
    public.eh_staff()
    or estudante_id = public.meu_estudante_id()
  );

drop policy if exists documento_update_admin on public.documento;
create policy documento_update_admin on public.documento
  for update using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists documento_delete on public.documento;
create policy documento_delete on public.documento
  for delete using (
    public.eh_admin()
    or (estudante_id = public.meu_estudante_id()
        and status = 'pendente')
  );

-- ---------------------------------------------------------------------
-- grade_horaria
-- ---------------------------------------------------------------------
drop policy if exists grade_staff on public.grade_horaria;
create policy grade_staff on public.grade_horaria
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists grade_propria on public.grade_horaria;
create policy grade_propria on public.grade_horaria
  for all using (estudante_id = public.meu_estudante_id())
  with check (estudante_id = public.meu_estudante_id());

-- ---------------------------------------------------------------------
-- alocacao_estudante
-- RN08 motorista / RN09 estudante
-- ---------------------------------------------------------------------
drop policy if exists alocacao_staff on public.alocacao_estudante;
create policy alocacao_staff on public.alocacao_estudante
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists alocacao_propria on public.alocacao_estudante;
create policy alocacao_propria on public.alocacao_estudante
  for select using (estudante_id = public.meu_estudante_id());

drop policy if exists alocacao_motorista on public.alocacao_estudante;
create policy alocacao_motorista on public.alocacao_estudante
  for select using (
    exists (
      select 1 from public.rota r
      where r.id = alocacao_estudante.rota_id
        and r.motorista_id = public.meu_motorista_id()
    )
  );

-- ---------------------------------------------------------------------
-- presenca
-- ---------------------------------------------------------------------
drop policy if exists presenca_staff on public.presenca;
create policy presenca_staff on public.presenca
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists presenca_propria on public.presenca;
create policy presenca_propria on public.presenca
  for all using (
    exists (
      select 1 from public.alocacao_estudante a
      where a.id = presenca.alocacao_id
        and a.estudante_id = public.meu_estudante_id()
    )
  ) with check (
    exists (
      select 1 from public.alocacao_estudante a
      where a.id = presenca.alocacao_id
        and a.estudante_id = public.meu_estudante_id()
    )
  );

drop policy if exists presenca_motorista on public.presenca;
create policy presenca_motorista on public.presenca
  for select using (
    exists (
      select 1
      from public.alocacao_estudante a
      join public.rota r on r.id = a.rota_id
      where a.id = presenca.alocacao_id
        and r.motorista_id = public.meu_motorista_id()
    )
  );

-- ---------------------------------------------------------------------
-- feedback  (RF23)
-- ---------------------------------------------------------------------
drop policy if exists feedback_staff on public.feedback;
create policy feedback_staff on public.feedback
  for select using (public.eh_staff());

drop policy if exists feedback_proprio on public.feedback;
create policy feedback_proprio on public.feedback
  for all using (estudante_id = public.meu_estudante_id())
  with check (estudante_id = public.meu_estudante_id());

-- ---------------------------------------------------------------------
-- localizacao_rota  (RF15)
-- ---------------------------------------------------------------------
drop policy if exists localizacao_select on public.localizacao_rota;
create policy localizacao_select on public.localizacao_rota
  for select using (auth.role() = 'authenticated');

drop policy if exists localizacao_insert_motorista on public.localizacao_rota;
create policy localizacao_insert_motorista on public.localizacao_rota
  for insert with check (
    public.eh_staff()
    or exists (
      select 1 from public.rota r
      where r.id = rota_id and r.motorista_id = public.meu_motorista_id()
    )
  );

-- ---------------------------------------------------------------------
-- log_administrativo  (RN12) - somente leitura pelo staff.
-- A escrita ocorre exclusivamente por triggers security definer.
-- ---------------------------------------------------------------------
drop policy if exists log_select_staff on public.log_administrativo;
create policy log_select_staff on public.log_administrativo
  for select using (public.eh_staff());

-- ---------------------------------------------------------------------
-- configuracao_sistema
-- ---------------------------------------------------------------------
drop policy if exists config_select on public.configuracao_sistema;
create policy config_select on public.configuracao_sistema
  for select using (auth.role() = 'authenticated');

drop policy if exists config_write_admin on public.configuracao_sistema;
create policy config_write_admin on public.configuracao_sistema
  for all using (public.eh_admin()) with check (public.eh_admin());

-- =====================================================================
-- STORAGE - bucket privado de documentos (RF02)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Convencao de caminho: documentos/{estudante_id}/{tipo}-{timestamp}.{ext}
-- A primeira pasta do path e o id do estudante, usado nas policies abaixo.

drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects
  for select using (
    bucket_id = 'documentos'
    and (
      public.eh_staff()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
    )
  );

drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and (
      public.eh_staff()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
    )
  );

drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects
  for update using (bucket_id = 'documentos' and public.eh_staff());

drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects
  for delete using (
    bucket_id = 'documentos'
    and (
      public.eh_admin()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
    )
  );
