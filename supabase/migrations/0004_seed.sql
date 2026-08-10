-- =====================================================================
-- GTPORTE - 0004_seed.sql
-- Dados de demonstracao equivalentes ao prototipo (_prototipo/GTPORTE.dc.html)
-- Idempotente: pode ser reexecutado sem duplicar registros.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cidades (RF07)
-- ---------------------------------------------------------------------
insert into public.cidade (nome, uf) values
  ('Araçatuba', 'SP'),
  ('Guararapes', 'SP'),
  ('Birigui', 'SP'),
  ('Penápolis', 'SP'),
  ('Coroados', 'SP'),
  ('São Carlos', 'SP'),
  ('Ilha Solteira', 'SP'),
  ('Limeira', 'SP')
on conflict (nome, uf) do nothing;

-- ---------------------------------------------------------------------
-- Universidades (RF06)
-- ---------------------------------------------------------------------
insert into public.universidade (nome, cidade_id, cor)
select v.nome, c.id, v.cor
from (values
  ('UNESP Araçatuba',      'Araçatuba',     '#1F3A2E'),
  ('UNESP Ilha Solteira',  'Ilha Solteira', '#1F3A2E'),
  ('UFSCar São Carlos',    'São Carlos',    '#8A5A15'),
  ('FATEC Araçatuba',      'Araçatuba',     '#C4633A'),
  ('Unicamp Limeira',      'Limeira',       '#2E7D5A'),
  ('UNIP Araçatuba',       'Araçatuba',     '#9E3E3E')
) as v(nome, cidade, cor)
join public.cidade c on c.nome = v.cidade
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- Veiculos (RF05) - capacidade_maxima e o limitador da RN03
-- ---------------------------------------------------------------------
insert into public.veiculo (placa, modelo, ano, capacidade_maxima, status) values
  ('OPE-1234', 'Mercedes O-500',     2019, 45, 'em_rota'),
  ('OXY-9876', 'Volare W9',          2020, 44, 'em_rota'),
  ('OSC-4410', 'Marcopolo Senior',   2018, 38, 'em_rota'),
  ('PRT-2201', 'Iveco Neobus',       2021, 44, 'em_rota'),
  ('OWL-3345', 'Comil Versatile',    2017, 40, 'em_rota'),
  ('QAT-8876', 'Volare V8',          2019, 32, 'em_rota'),
  ('OXY-5521', 'Volare V8 (reserva)',2016, 39, 'manutencao')
on conflict (placa) do nothing;

-- ---------------------------------------------------------------------
-- Motoristas (RF04)
-- ---------------------------------------------------------------------
insert into public.motorista (nome, cnh, categoria_cnh, telefone, status) values
  ('Juvenal Ribas de Oliveira', '02887411231', 'D', '(18) 99711-4402', 'em_rota'),
  ('Marcos Antonio Lima',       '03442015876', 'D', '(18) 99623-2170', 'em_rota'),
  ('Elton Jose da Silva',       '04127788901', 'D', '(18) 99204-8875', 'aguardando'),
  ('Rosana Padilha Fontes',     '02771442339', 'D', '(18) 99515-1220', 'em_rota'),
  ('Waldir Ambrosio de Souza',  '01998812234', 'E', '(18) 99127-6633', 'em_rota'),
  ('Zilda Rodrigues Prates',    '03556677021', 'D', '(18) 99310-4488', 'folga')
on conflict (cnh) do nothing;

-- ---------------------------------------------------------------------
-- Rotas (RF08) - RN14: toda rota tem motorista responsavel
-- ---------------------------------------------------------------------
insert into public.rota (codigo, nome, cidade_origem_id, cidade_destino_id, universidade_id,
                         veiculo_id, motorista_id, horario_partida, horario_retorno, status, descricao)
select v.codigo, v.nome,
       co.id, cd.id, u.id, ve.id, mo.id,
       v.partida::time, v.retorno::time, v.status::status_rota, v.descricao
from (values
  ('R01', 'Araçatuba -> UFSCar São Carlos',    'Araçatuba',  'São Carlos',    'UFSCar São Carlos',   'OPE-1234', '02887411231', '05:40', '22:30', 'ativa',  'Saida do terminal rodoviario'),
  ('R02', 'Araçatuba -> UNESP Ilha Solteira',  'Araçatuba',  'Ilha Solteira', 'UNESP Ilha Solteira', 'OXY-9876', '03442015876', '06:00', '22:45', 'ativa',  'Paradas em Bilac e Birigui'),
  ('R03', 'Guararapes <-> UNESP Araçatuba',    'Guararapes', 'Araçatuba',     'UNESP Araçatuba',     'OSC-4410', '04127788901', '17:30', '23:15', 'ativa',  'Turno noturno'),
  ('R04', 'Birigui -> Unicamp Limeira',        'Birigui',    'Limeira',       'Unicamp Limeira',     'PRT-2201', '02771442339', '05:10', '22:00', 'ativa',  'Rota de longa distancia'),
  ('R05', 'Penápolis -> FATEC Araçatuba',      'Penápolis',  'Araçatuba',     'FATEC Araçatuba',     'OWL-3345', '01998812234', '05:20', '22:15', 'ativa',  'Alta demanda'),
  ('R06', 'Coroados -> UNESP Araçatuba',       'Coroados',   'Araçatuba',     'UNESP Araçatuba',     'QAT-8876', '03556677021', '06:30', '22:30', 'revisao','Em revisao de itinerario')
) as v(codigo, nome, origem, destino, universidade, placa, cnh, partida, retorno, status, descricao)
join public.cidade co       on co.nome = v.origem
join public.cidade cd       on cd.nome = v.destino
join public.universidade u  on u.nome  = v.universidade
join public.veiculo ve      on ve.placa = v.placa
join public.motorista mo    on mo.cnh   = v.cnh
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Estudantes (RF01)
-- ---------------------------------------------------------------------
insert into public.estudante (nome, cpf, data_nascimento, telefone, email, curso,
                              endereco, universidade_id, cidade_id, perfil_uso, status_documental)
select v.nome, v.cpf, v.nasc::date, v.fone, v.email, v.curso, v.endereco,
       u.id, c.id, v.uso::perfil_uso, v.doc::status_documental
from (values
  ('Marina Cavalcanti Rocha',   '20241834', '412.887.330-01', '2004-03-12', '(18) 99841-2210', 'marina.rocha@email.com',   'Direito',        'Rua Floriano Peixoto, 220',  'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Igor Bastos Nakamura',      '20240087', '388.112.440-72', '2003-07-25', '(18) 99712-8890', 'igor.nakamura@email.com',  'ADS',            'Av. Brasilia, 1450',         'FATEC Araçatuba',     'Penápolis',   'ida_volta',    'aprovado'),
  ('Beatriz Pinheiro Santos',   '20238812', '501.774.220-38', '2002-11-04', '(18) 99655-1120', 'beatriz.santos@email.com', 'Direito',        'Rua Sao Paulo, 87',          'UFSCar São Carlos',   'Araçatuba',   'ida_volta',    'pendente'),
  ('Rafael Toledo Ferraz',      '20241102', '445.220.118-90', '2004-01-19', '(18) 99530-4471', 'rafael.ferraz@email.com',  'Eng. Eletrica',  'Rua Ceara, 330',             'UNESP Ilha Solteira', 'Araçatuba',   'ida_volta',    'aprovado'),
  ('Sabrina Almeida Prado',     '20241205', '390.665.117-45', '2003-09-30', '(18) 99228-3390', 'sabrina.prado@email.com',  'Administracao',  'Rua Bahia, 512',             'Unicamp Limeira',     'Birigui',     'ida_volta',    'aprovado'),
  ('Diego Ferrari Montenegro',  '20250334', '477.881.220-13', '2005-02-08', '(18) 99114-7723', 'diego.montenegro@email.com','Enfermagem',    'Av. Governador, 90',         'UNESP Araçatuba',     'Coroados',    'ida_volta',    'rejeitado'),
  ('Ana Luisa Barreto Xavier',  '20239914', '366.442.980-27', '2003-05-15', '(18) 99442-6650', 'ana.xavier@email.com',     'Eng. Civil',     'Rua Piaui, 78',              'UFSCar São Carlos',   'Araçatuba',   'ida_volta',    'aprovado'),
  ('Vinicius Camargo Peixoto',  '20240552', '412.009.887-64', '2004-08-22', '(18) 99377-2214', 'vinicius.peixoto@email.com','GTI',           'Rua Parana, 1200',           'FATEC Araçatuba',     'Penápolis',   'ida_volta',    'aprovado'),
  ('Otavio Cerqueira Lins',     '20240113', '520.117.664-30', '2002-12-01', '(18) 99880-1145', 'otavio.lins@email.com',    'Medicina',       'Rua Sergipe, 15',            'UFSCar São Carlos',   'Araçatuba',   'ida_volta',    'aprovado'),
  ('Priscila Naves Costa',      '20240995', '399.556.221-08', '2003-04-17', '(18) 99664-0092', 'priscila.costa@email.com', 'Quimica',        'Av. Joubert, 640',           'UFSCar São Carlos',   'Araçatuba',   'ida_volta',    'aprovado'),
  ('Mateus Braga Cortez',       '20241377', '433.778.115-59', '2004-06-09', '(18) 99201-7734', 'mateus.cortez@email.com',  'Eng. Mecanica',  'Rua Goias, 410',             'UNESP Ilha Solteira', 'Araçatuba',   'ida_volta',    'aprovado'),
  ('Fernanda Salles Vidal',     '20241448', '408.229.775-16', '2003-10-27', '(18) 99558-2201', 'fernanda.vidal@email.com', 'Fisica',         'Rua Minas Gerais, 233',      'UNESP Ilha Solteira', 'Araçatuba',   'ida_volta',    'aprovado'),
  ('Kaue Melo Antunes',         '20241560', '451.660.339-84', '2004-02-14', '(18) 99310-6688', 'kaue.antunes@email.com',   'Eng. Civil',     'Rua Amazonas, 900',          'UNESP Ilha Solteira', 'Araçatuba',   'ida_volta',    'aprovado'),
  ('Bruno Wagner Ibanez',       '20240771', '377.114.882-25', '2003-01-30', '(18) 99447-3320', 'bruno.ibanez@email.com',   'ADS',            'Rua Tiradentes, 55',         'FATEC Araçatuba',     'Penápolis',   'ida_volta',    'aprovado'),
  ('Camila Reis Bonfim',        '20241688', '462.335.117-70', '2004-09-11', '(18) 99223-9981', 'camila.bonfim@email.com',  'GTI',            'Rua Rui Barbosa, 320',       'FATEC Araçatuba',     'Penápolis',   'ida_volta',    'pendente'),
  ('Tulio Machado Prado',       '20241902', '489.007.223-41', '2004-05-02', '(18) 99118-4470', 'tulio.prado@email.com',    'Odontologia',    'Rua Duque de Caxias, 44',    'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Yasmin Cabral Lima',        '20240712', '355.998.114-06', '2003-08-19', '(18) 99664-5512', 'yasmin.lima@email.com',    'Veterinaria',    'Rua XV de Novembro, 780',    'UNESP Araçatuba',     'Guararapes',  'somente_volta','aprovado'),
  ('Renato Furtado Braga',      '20241456', '421.556.008-93', '2004-11-23', '(18) 99775-1103', 'renato.braga@email.com',   'Odontologia',    'Av. Prestes Maia, 210',      'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Camilla Osorio de Freitas', '20241119', '404.771.335-28', '2003-03-07', '(18) 99332-8840', 'camilla.freitas@email.com','Veterinaria',    'Rua Sao Joao, 66',           'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Fabio Kuroda Nishimoto',    '20240824', '398.116.774-52', '2003-12-16', '(18) 99880-3324', 'fabio.nishimoto@email.com','Medicina Vet.',  'Rua Marechal Deodoro, 501',  'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Lucas Emiliano Bertazzo',   '20250114', '470.223.669-17', '2005-01-08', '(18) 99441-0075', 'lucas.bertazzo@email.com', 'Zootecnia',      'Rua Pernambuco, 145',        'UNESP Araçatuba',     'Guararapes',  'ida_volta',    'aprovado'),
  ('Henrique Vasconcelos Sa',   '20241733', '388.554.220-63', '2004-07-04', '(18) 99226-7719', 'henrique.sa@email.com',    'Engenharia',     'Rua Alagoas, 380',           'Unicamp Limeira',     'Birigui',     'ida_volta',    'pendente'),
  ('Larissa Meira Fontes',      '20241844', '419.887.005-34', '2004-10-21', '(18) 99553-2280', 'larissa.fontes@email.com', 'Eng. Eletrica',  'Rua Espirito Santo, 92',     'UNESP Ilha Solteira', 'Araçatuba',   'ida_volta',    'pendente')
) as v(nome, ra_legado, cpf, nasc, fone, email, curso, endereco, universidade, cidade, uso, doc)
join public.universidade u on u.nome = v.universidade
join public.cidade c       on c.nome = v.cidade
on conflict (cpf) do nothing;

-- ---------------------------------------------------------------------
-- Grades horarias (insumo da RN02) - segunda a sexta
-- ---------------------------------------------------------------------
insert into public.grade_horaria (estudante_id, dia_semana, hora_inicio, hora_fim)
select e.id, d.dia, v.inicio::time, v.fim::time
from (values
  ('20241834', '18:30', '22:40'),
  ('20240087', '07:30', '17:00'),
  ('20238812', '07:30', '17:00'),
  ('20241102', '07:30', '18:00'),
  ('20241205', '07:00', '17:30'),
  ('20250334', '18:30', '22:40'),
  ('20239914', '08:00', '18:00'),
  ('20240552', '07:30', '17:00'),
  ('20240113', '07:00', '19:00'),
  ('20240995', '08:00', '17:00'),
  ('20241377', '07:30', '18:00'),
  ('20241448', '08:00', '17:00'),
  ('20241560', '07:00', '17:30'),
  ('20240771', '08:00', '17:00'),
  ('20241688', '07:30', '17:00'),
  ('20241902', '18:30', '22:40'),
  ('20240712', '18:30', '22:40'),
  ('20241456', '18:30', '22:40'),
  ('20241119', '18:30', '22:40'),
  ('20240824', '18:30', '22:40'),
  ('20250114', '18:30', '22:40'),
  ('20241733', '07:00', '17:30'),
  ('20241844', '07:30', '18:00')
) as v(ra, inicio, fim)
join public.estudante e on e.ra = v.ra
cross join (values (1), (2), (3), (4), (5)) as d(dia)
on conflict (estudante_id, dia_semana, hora_inicio) do nothing;

-- ---------------------------------------------------------------------
-- Documentos (RF02) - registros de referencia da fila de validacao.
-- storage_path aponta para arquivos ainda nao enviados ao bucket; ao
-- abrir a tela de Documentos os itens sem arquivo aparecem como
-- "arquivo indisponivel" ate que um upload real seja feito.
-- ---------------------------------------------------------------------
insert into public.documento (estudante_id, tipo, nome_arquivo, storage_path, status)
select e.id, t.tipo::tipo_documento,
       t.tipo || '_' || lower(split_part(e.nome, ' ', 1)) || '.pdf',
       e.id || '/' || t.tipo || '-seed.pdf',
       case
         when e.status_documental = 'aprovado'  then 'aprovado'::status_documental
         when e.status_documental = 'rejeitado' and t.tipo = 'matricula' then 'rejeitado'::status_documental
         when e.status_documental = 'rejeitado' then 'aprovado'::status_documental
         else 'pendente'::status_documental
       end
from public.estudante e
cross join (values ('rg'), ('cpf'), ('matricula'), ('residencia')) as t(tipo)
on conflict (estudante_id, tipo) do nothing;

-- ---------------------------------------------------------------------
-- Presencas de exemplo do dia corrente na rota R03 (tela Presenca)
-- Executado apenas apos a primeira distribuicao; ver README.
-- ---------------------------------------------------------------------
-- (sem dados fixos: a tela de Presenca cria as linhas conforme as
--  confirmacoes acontecem via confirmar_presenca)

-- ---------------------------------------------------------------------
-- Feedbacks de exemplo (RF23)
-- ---------------------------------------------------------------------
insert into public.feedback (estudante_id, rota_id, nota, comentario)
select e.id, r.id, v.nota, v.comentario
from (values
  ('20241834', 'R03', 5, 'Motorista pontual, onibus limpo.'),
  ('20240087', 'R05', 3, 'Onibus lotado na volta.'),
  ('20241102', 'R02', 4, 'Boa viagem, so o ar-condicionado que falhou.'),
  ('20239914', 'R01', 5, 'Sem atrasos durante todo o mes.')
) as v(ra, rota, nota, comentario)
join public.estudante e on e.ra = v.ra
join public.rota r      on r.codigo = v.rota
on conflict do nothing;
