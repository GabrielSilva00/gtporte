import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export interface Coluna {
  chave: string
  titulo: string
}

/** RF17-RF19 — exportação em PDF com cabeçalho institucional. */
export function exportarPDF(
  titulo: string,
  subtitulo: string,
  colunas: Coluna[],
  linhas: Record<string, unknown>[],
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  doc.setFontSize(15)
  doc.setTextColor('#1F3A2E')
  doc.text('GTPORTE · Transporte Acadêmico Municipal', 40, 40)

  doc.setFontSize(11)
  doc.setTextColor('#1B1D1E')
  doc.text(titulo, 40, 60)

  doc.setFontSize(9)
  doc.setTextColor('#6B7570')
  doc.text(subtitulo, 40, 74)
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 40, 87)

  autoTable(doc, {
    startY: 100,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => formatarCelula(l[c.chave]))),
    styles: { fontSize: 8.5, cellPadding: 5, textColor: '#1B1D1E' },
    headStyles: { fillColor: '#1F3A2E', textColor: '#F5F3EE', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#F5F3EE' },
  })

  doc.save(`${nomeArquivo(titulo)}.pdf`)
}

/** RF17-RF19 — exportação em planilha. */
export function exportarExcel(
  titulo: string,
  colunas: Coluna[],
  linhas: Record<string, unknown>[],
) {
  const dados = linhas.map((l) => {
    const linha: Record<string, unknown> = {}
    colunas.forEach((c) => {
      linha[c.titulo] = formatarCelula(l[c.chave])
    })
    return linha
  })

  const planilha = XLSX.utils.json_to_sheet(dados)
  const pasta = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(pasta, planilha, titulo.slice(0, 30))
  XLSX.writeFile(pasta, `${nomeArquivo(titulo)}.xlsx`)
}

function formatarCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  return String(valor)
}

function nomeArquivo(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
  return `gtporte_${base}_${new Date().toISOString().slice(0, 10)}`
}
