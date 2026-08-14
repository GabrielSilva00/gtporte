// Port dos ícones SVG do protótipo (_prototipo/GTPORTE.dc.html, funções ic() e bigIcon()).
// Mesmos paths, agora como componentes React.

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function Svg({
  size = 17,
  className,
  strokeWidth = 1.7,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export const IconeDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Svg>
)

export const IconeAlocacao = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </Svg>
)

export const IconePresenca = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Svg>
)

export const IconeRota = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="19" r="3" />
    <circle cx="18" cy="5" r="3" />
    <path d="M6.7 17.3 17.3 6.7" />
  </Svg>
)

export const IconeEstudante = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </Svg>
)

export const IconeVeiculo = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="7.5" cy="18" r="1.5" fill="currentColor" />
    <circle cx="16.5" cy="18" r="1.5" fill="currentColor" />
    <path d="M3 11h18M8 6V4h8v2" />
  </Svg>
)

export const IconeMotorista = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
)

export const IconeUniversidade = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 10 12 4l10 6-10 6z" />
    <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
  </Svg>
)

export const IconeDocumento = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 15l2 2 4-4" />
  </Svg>
)

export const IconeRelatorio = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 4 4 5-5" />
  </Svg>
)

export const IconeEquipe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M3 21a6 6 0 0 1 12 0" />
    <path d="M16 3.5a4 4 0 0 1 0 8" />
    <path d="M22 21c0-2-1.5-4-4-5" />
  </Svg>
)

export const IconeOnibus = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.6}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="7.5" cy="18" r="1.6" fill="currentColor" />
    <circle cx="16.5" cy="18" r="1.6" fill="currentColor" />
    <path d="M3 10h18M8 6V4h8v2" />
  </Svg>
)

export const IconeBusca = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
)

export const IconeMais = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconeFechar = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)

export const IconeSair = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
)

export const IconeSino = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
)

export const IconeEngrenagem = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.6}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Svg>
)

export const IconeRelogio = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
)

export const IconeCheck = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
)

export const IconeAlerta = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
)

export const IconeErro = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Svg>
)

export const IconeInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
)

export const IconeChave = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </Svg>
)

export const IconeSeta = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Svg>
)

export const IconeRecarregar = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Svg>
)

export const IconeArquivo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </Svg>
)

export const IconeUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </Svg>
)

export const IconeMensagem = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
)

export const IconeSolicitacao = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M12 11v6M9 14h6" />
  </Svg>
)

/** Barras horizontais — botão de recolher/expandir o menu lateral. */
export const IconeBarras = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Svg>
)

/** Cabeça de seta para baixo — usada nas categorias sanfonadas do menu. */
export const IconeChevron = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const IconeEnviar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </Svg>
)

export const IconeMenu = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" className={p.className}>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
)
