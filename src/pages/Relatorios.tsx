import { useState } from 'react'
import { useMotoristas, useOcupacaoRotas, useUniversidades, useVeiculos } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataBR, hora } from '../lib/format'
import { exportarExcel, exportarPDF, type Coluna } from '../lib/exportar'
import { useToast } from '../components/ui/Toast'
import { Modal } from '../components/ui/Modal'
import {
  IconeDashboard,
  IconeDocumento,
  IconeEquipe,
  IconePresenca,
  IconeRota,
  IconeVeiculo,
} from '../components/icons'

type ChaveRelatorio =
  | 'frequencia'
  | 'ocupacao'
  | 'alunos_rota'
  | 'historico'
  | 'feedbacks'
  | 'log'

interface Filtros {
  inicio: string
  fim: string
  rotaId: string
  veiculoId: string
  motoristaId: string
  universidadeId: string
}

const FILTROS_VAZIOS: Filtros = {
  inicio: '',
  fim: '',
  rotaId: '',
  veiculoId: '',
  motoristaId: '',
  universidadeId: '',
}

const RELATORIOS: {
  chave: ChaveRelatorio
  titulo: string
  descricao: string
  Icone: typeof IconePresenca
  iconBg: string
  iconFg: string
  requisito: string
}[] = [
  {
    chave: 'frequencia',
    titulo: 'Frequência por estudante',
    descricao: 'Embarques confirmados por aluno e período.',
    Icone: IconePresenca,
    iconBg: '#EAF3EC',
    iconFg: '#2E7D5A',
    requisito: 'RF18',
  },
  {
    chave: 'ocupacao',
    titulo: 'Ocupação por veículo',
    descricao: 'Assentos ocupados por rota e capacidade da frota.',
    Icone: IconeVeiculo,
    iconBg: '#FBEEDA',
    iconFg: '#8A5A15',
    requisito: 'RF19',
  },
  {
    chave: 'alunos_rota',
    titulo: 'Alunos por rota',
    descricao: 'Distribuição atual por rota e universidade.',
    Icone: IconeRota,
    iconBg: '#EEF1EF',
    iconFg: '#1F3A2E',
    requisito: 'RF17',
  },
  {
    chave: 'historico',
    titulo: 'Histórico de utilização',
    descricao: 'Cronologia individual de alocações por estudante.',
    Icone: IconeDashboard,
    iconBg: '#F4EAE1',
    iconFg: '#C4633A',
    requisito: 'RF24',
  },
  {
    chave: 'feedbacks',
    titulo: 'Feedbacks recebidos',
    descricao: 'Avaliações registradas pelos estudantes.',
    Icone: IconeDocumento,
    iconBg: '#EEF1EF',
    iconFg: '#6B7570',
    requisito: 'RF23',
  },
  {
    chave: 'log',
    titulo: 'Log administrativo',
    descricao: 'Alterações cadastrais e ajustes manuais de alocação.',
    Icone: IconeEquipe,
    iconBg: '#EEF1EF',
    iconFg: '#1F3A2E',
    requisito: 'RN12',
  },
]

const COLUNAS: Record<ChaveRelatorio, Coluna[]> = {
  frequencia: [
    { chave: 'nome', titulo: 'Estudante' },
    { chave: 'ra', titulo: 'RA' },
    { chave: 'universidade', titulo: 'Universidade' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'data', titulo: 'Data' },
    { chave: 'presencas_ida', titulo: 'Ida' },
    { chave: 'presencas_volta', titulo: 'Volta' },
  ],
  ocupacao: [
    { chave: 'codigo', titulo: 'Rota' },
    { chave: 'nome', titulo: 'Descrição' },
    { chave: 'placa', titulo: 'Placa' },
    { chave: 'modelo', titulo: 'Modelo' },
    { chave: 'motorista', titulo: 'Motorista' },
    { chave: 'ocupacao', titulo: 'Ocupados' },
    { chave: 'capacidade_maxima', titulo: 'Capacidade' },
    { chave: 'percentual', titulo: '%' },
  ],
  alunos_rota: [
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'rota_nome', titulo: 'Descrição' },
    { chave: 'universidade', titulo: 'Universidade' },
    { chave: 'alunos', titulo: 'Alunos' },
  ],
  historico: [
    { chave: 'nome', titulo: 'Estudante' },
    { chave: 'ra', titulo: 'RA' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'situacao', titulo: 'Situação' },
    { chave: 'origem', titulo: 'Origem' },
    { chave: 'criado_em', titulo: 'Início' },
    { chave: 'encerrado_em', titulo: 'Fim' },
  ],
  feedbacks: [
    { chave: 'estudante', titulo: 'Estudante' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'nota', titulo: 'Nota' },
    { chave: 'comentario', titulo: 'Comentário' },
    { chave: 'criado_em', titulo: 'Data' },
  ],
  log: [
    { chave: 'criado_em', titulo: 'Data' },
    { chave: 'acao', titulo: 'Ação' },
    { chave: 'entidade', titulo: 'Entidade' },
    { chave: 'responsavel', titulo: 'Responsável' },
  ],
}

/** RF17, RF18, RF19 — relatórios gerenciais com filtros e exportação. */
export default function Relatorios() {
  const { data: rotas } = useOcupacaoRotas()
  const { data: veiculos } = useVeiculos()
  const { data: motoristas } = useMotoristas()
  const { data: universidades } = useUniversidades()
  const toast = useToast()

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [previa, setPrevia] = useState<{
    chave: ChaveRelatorio
    titulo: string
    linhas: Record<string, unknown>[]
  } | null>(null)
  const [gerando, setGerando] = useState<ChaveRelatorio | null>(null)

  const subtitulo = montarSubtitulo(filtros, rotas, veiculos, motoristas, universidades)

  async function carregar(chave: ChaveRelatorio): Promise<Record<string, unknown>[]> {
    switch (chave) {
      case 'frequencia': {
        let q = supabase.from('vw_frequencia_estudante').select('*').not('data', 'is', null)
        if (filtros.inicio) q = q.gte('data', filtros.inicio)
        if (filtros.fim) q = q.lte('data', filtros.fim)
        if (filtros.universidadeId) {
          const uni = universidades?.find((u) => u.id === filtros.universidadeId)
          if (uni) q = q.eq('universidade', uni.nome)
        }
        if (filtros.rotaId) {
          const rota = rotas?.find((r) => r.rota_id === filtros.rotaId)
          if (rota) q = q.eq('rota', rota.codigo)
        }
        const { data, error } = await q.order('nome')
        if (error) throw error
        return data.map((l) => ({ ...l, data: dataBR(l.data as string) }))
      }

      case 'ocupacao': {
        let q = supabase.from('vw_ocupacao_rota').select('*')
        if (filtros.rotaId) q = q.eq('rota_id', filtros.rotaId)
        if (filtros.veiculoId) {
          const v = veiculos?.find((x) => x.id === filtros.veiculoId)
          if (v) q = q.eq('placa', v.placa)
        }
        if (filtros.motoristaId) {
          const m = motoristas?.find((x) => x.id === filtros.motoristaId)
          if (m) q = q.eq('motorista', m.nome)
        }
        const { data, error } = await q.order('codigo')
        if (error) throw error
        return data.map((l) => ({
          ...l,
          percentual: `${l.percentual ?? 0}%`,
          horario: `${hora(l.horario_partida as string)} → ${hora(l.horario_retorno as string)}`,
        }))
      }

      case 'alunos_rota': {
        let q = supabase.from('vw_alunos_por_rota').select('*')
        if (filtros.universidadeId) {
          const uni = universidades?.find((u) => u.id === filtros.universidadeId)
          if (uni) q = q.eq('universidade', uni.nome)
        }
        const { data, error } = await q.order('rota')
        if (error) throw error
        return data
      }

      case 'historico': {
        let q = supabase.from('vw_historico_utilizacao').select('*')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false }).limit(2000)
        if (error) throw error
        return data.map((l) => ({
          ...l,
          criado_em: dataBR(l.criado_em as string),
          encerrado_em: l.encerrado_em ? dataBR(l.encerrado_em as string) : 'em vigor',
        }))
      }

      case 'feedbacks': {
        let q = supabase
          .from('feedback')
          .select('nota, comentario, criado_em, estudante:estudante_id (nome), rota:rota_id (codigo)')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false })
        if (error) throw error
        return (data as unknown as {
          nota: number
          comentario: string | null
          criado_em: string
          estudante: { nome: string } | null
          rota: { codigo: string } | null
        }[]).map((f) => ({
          estudante: f.estudante?.nome ?? '—',
          rota: f.rota?.codigo ?? '—',
          nota: f.nota,
          comentario: f.comentario ?? '—',
          criado_em: dataBR(f.criado_em),
        }))
      }

      case 'log': {
        let q = supabase
          .from('log_administrativo')
          .select('acao, entidade, criado_em, perfil:perfil_id (nome)')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false }).limit(1000)
        if (error) throw error
        return (data as unknown as {
          acao: string
          entidade: string
          criado_em: string
          perfil: { nome: string } | null
        }[]).map((l) => ({
          criado_em: new Date(l.criado_em).toLocaleString('pt-BR'),
          acao: l.acao,
          entidade: l.entidade,
          responsavel: l.perfil?.nome ?? 'sistema',
        }))
      }
    }
  }

  async function gerar(chave: ChaveRelatorio, formato: 'previa' | 'pdf' | 'excel') {
    const meta = RELATORIOS.find((r) => r.chave === chave)!
    setGerando(chave)
    try {
      const linhas = await carregar(chave)
      if (linhas.length === 0) {
        toast.alerta('Nenhum dado encontrado para os filtros selecionados.')
        return
      }
      if (formato === 'pdf') exportarPDF(meta.titulo, subtitulo, COLUNAS[chave], linhas)
      else if (formato === 'excel') exportarExcel(meta.titulo, COLUNAS[chave], linhas)
      else setPrevia({ chave, titulo: meta.titulo, linhas })
    } catch (e) {
      toast.erro(mensagemErro(e))
    } finally {
      setGerando(null)
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Relatórios</h1>
        <div className="mt-1 text-[13px] text-muted">
          Exporte dados para análise e prestação de contas.
        </div>
      </div>

      {/* Filtros */}
      <div className="card mb-4 grid grid-cols-2 gap-3 p-4 lg:grid-cols-6">
        <label>
          <span className="field-label">Início</span>
          <input
            type="date"
            value={filtros.inicio}
            onChange={(e) => setFiltros({ ...filtros, inicio: e.target.value })}
            className="field py-2 text-[12.5px]"
          />
        </label>
        <label>
          <span className="field-label">Fim</span>
          <input
            type="date"
            value={filtros.fim}
            onChange={(e) => setFiltros({ ...filtros, fim: e.target.value })}
            className="field py-2 text-[12.5px]"
          />
        </label>
        <label>
          <span className="field-label">Rota</span>
          <select
            value={filtros.rotaId}
            onChange={(e) => setFiltros({ ...filtros, rotaId: e.target.value })}
            className="field py-2 text-[12.5px]"
          >
            <option value="">Todas</option>
            {rotas?.map((r) => (
              <option key={r.rota_id} value={r.rota_id}>
                {r.codigo}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Veículo</span>
          <select
            value={filtros.veiculoId}
            onChange={(e) => setFiltros({ ...filtros, veiculoId: e.target.value })}
            className="field py-2 text-[12.5px]"
          >
            <option value="">Todos</option>
            {veiculos?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Motorista</span>
          <select
            value={filtros.motoristaId}
            onChange={(e) => setFiltros({ ...filtros, motoristaId: e.target.value })}
            className="field py-2 text-[12.5px]"
          >
            <option value="">Todos</option>
            {motoristas?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Universidade</span>
          <select
            value={filtros.universidadeId}
            onChange={(e) => setFiltros({ ...filtros, universidadeId: e.target.value })}
            className="field py-2 text-[12.5px]"
          >
            <option value="">Todas</option>
            {universidades?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {RELATORIOS.map(({ chave, titulo, descricao, Icone, iconBg, iconFg, requisito }) => (
          <div key={chave} className="card p-[18px]">
            <div className="flex items-start justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-[9px]"
                style={{ background: iconBg, color: iconFg }}
              >
                <Icone size={17} />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wide text-soft">
                {requisito}
              </span>
            </div>
            <div className="mt-3 text-[14px] font-semibold">{titulo}</div>
            <div className="mt-1 text-[12px] leading-[1.5] text-muted">{descricao}</div>
            <div className="mt-3.5 flex gap-1.5">
              <button
                onClick={() => gerar(chave, 'pdf')}
                disabled={gerando === chave}
                className="flex-1 rounded-field border border-edge py-1.5 text-[12px] hover:bg-bg disabled:opacity-50"
              >
                PDF
              </button>
              <button
                onClick={() => gerar(chave, 'excel')}
                disabled={gerando === chave}
                className="flex-1 rounded-field border border-edge py-1.5 text-[12px] hover:bg-bg disabled:opacity-50"
              >
                Excel
              </button>
              <button
                onClick={() => gerar(chave, 'previa')}
                disabled={gerando === chave}
                className="flex-[1.6] rounded-field bg-primary py-1.5 text-[12px] font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {gerando === chave ? 'Gerando…' : 'Gerar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Prévia */}
      <Modal
        aberto={previa !== null}
        titulo={previa?.titulo ?? ''}
        descricao={`${previa?.linhas.length ?? 0} registro(s) · ${subtitulo}`}
        largura={1100}
        onFechar={() => setPrevia(null)}
        rodape={
          <>
            <button onClick={() => setPrevia(null)} className="btn-ghost">
              Fechar
            </button>
            <button
              onClick={() =>
                previa && exportarExcel(previa.titulo, COLUNAS[previa.chave], previa.linhas)
              }
              className="btn-ghost"
            >
              Exportar Excel
            </button>
            <button
              onClick={() =>
                previa && exportarPDF(previa.titulo, subtitulo, COLUNAS[previa.chave], previa.linhas)
              }
              className="btn-primary"
            >
              Exportar PDF
            </button>
          </>
        }
      >
        {previa && (
          <div className="max-h-[55vh] overflow-auto rounded-card border border-edge">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-edge">
                  {COLUNAS[previa.chave].map((c) => (
                    <th key={c.chave} className="th whitespace-nowrap">
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.slice(0, 200).map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {COLUNAS[previa.chave].map((c) => (
                      <td key={c.chave} className="td whitespace-nowrap">
                        {String(l[c.chave] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previa.linhas.length > 200 && (
              <div className="border-t border-line px-4 py-2.5 text-center text-[11.5px] text-muted">
                Mostrando 200 de {previa.linhas.length} registros — a exportação inclui todos.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function montarSubtitulo(
  f: Filtros,
  rotas?: { rota_id: string; codigo: string }[],
  veiculos?: { id: string; placa: string }[],
  motoristas?: { id: string; nome: string }[],
  universidades?: { id: string; nome: string }[],
): string {
  const partes: string[] = []
  if (f.inicio || f.fim) {
    partes.push(`Período: ${f.inicio ? dataBR(f.inicio) : 'início'} a ${f.fim ? dataBR(f.fim) : 'hoje'}`)
  }
  const rota = rotas?.find((r) => r.rota_id === f.rotaId)
  if (rota) partes.push(`Rota ${rota.codigo}`)
  const veiculo = veiculos?.find((v) => v.id === f.veiculoId)
  if (veiculo) partes.push(`Veículo ${veiculo.placa}`)
  const motorista = motoristas?.find((m) => m.id === f.motoristaId)
  if (motorista) partes.push(`Motorista ${motorista.nome}`)
  const uni = universidades?.find((u) => u.id === f.universidadeId)
  if (uni) partes.push(uni.nome)
  return partes.length ? partes.join(' · ') : 'Sem filtros aplicados'
}
