import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GraduationCap } from 'lucide-react'
import type { DadosMapa } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'

function marcador(cor: string, texto: string, tamanho = 26) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50%;background:${cor};
      color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px Inter,sans-serif;
      box-shadow:0 2px 6px rgba(0,0,0,.45);border:2px solid #fff">${texto}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  })
}

/**
 * Mapa da viagem, so no app do motorista: paradas, o raio de aviso de
 * cada universidade (definido pela secretaria) e a posicao do onibus.
 * O raio nao aparece para o estudante.
 */
export function MapaMotorista({
  dados,
  carregando,
  posicao,
}: {
  dados: DadosMapa | null
  carregando: boolean
  /** Posicao lida agora pelo GPS do aparelho, antes de chegar ao banco. */
  posicao: { lat: number; lng: number } | null
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const camadaRef = useRef<L.LayerGroup | null>(null)
  const enquadrado = useRef(false)

  useEffect(() => {
    if (!divRef.current || mapaRef.current) return
    const mapa = L.map(divRef.current, { zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapa)
    L.control.zoom({ position: 'bottomright' }).addTo(mapa)
    mapa.setView([-21.2089, -50.4328], 12)
    mapaRef.current = mapa
    camadaRef.current = L.layerGroup().addTo(mapa)
    return () => {
      mapa.remove()
      mapaRef.current = null
    }
  }, [])

  useEffect(() => {
    const mapa = mapaRef.current
    const camada = camadaRef.current
    if (!mapa || !camada || !dados) return
    camada.clearLayers()
    const pontos: L.LatLngExpression[] = []

    for (const u of dados.universidades) {
      if (u.latitude === null || u.longitude === null) continue
      const passou = !!u.entrou_em
      L.circle([u.latitude, u.longitude], {
        radius: u.raio_m,
        color: passou ? '#10B981' : '#EAB308',
        weight: 2,
        fillOpacity: 0.12,
        dashArray: '6 6',
      })
        .bindPopup(
          `<b>${u.nome}</b><br>Raio de aviso: ${u.raio_m} m<br>${u.alunos} aluno(s) nesta rota` +
            (passou ? '<br><i>Alunos já avisados hoje</i>' : ''),
        )
        .addTo(camada)
      pontos.push([u.latitude, u.longitude])
    }

    const comCoord = dados.paradas.filter((p) => p.latitude !== null && p.longitude !== null)
    const trajeto: L.LatLngExpression[] = comCoord.map((p) => [p.latitude!, p.longitude!])
    comCoord.forEach((p) => {
      L.marker([p.latitude!, p.longitude!], { icon: marcador('#1D4ED8', String(p.ordem)) })
        .bindPopup(`<b>${p.nome}</b>${p.universidade ? `<br><i>${p.universidade}</i>` : ''}`)
        .addTo(camada)
    })
    if (trajeto.length > 1) {
      L.polyline(trajeto, { color: '#60A5FA', weight: 4, opacity: 0.7 }).addTo(camada)
    }
    pontos.push(...trajeto)

    const onibus = posicao
      ? ([posicao.lat, posicao.lng] as L.LatLngExpression)
      : dados.veiculo
        ? ([dados.veiculo.latitude, dados.veiculo.longitude] as L.LatLngExpression)
        : null
    if (onibus) {
      L.marker(onibus, { icon: marcador('#EAB308', '🚌', 34) }).addTo(camada)
      pontos.push(onibus)
    }

    // Enquadra uma vez; depois o motorista mexe no mapa a vontade.
    if (!enquadrado.current && pontos.length > 0) {
      // Sem animacao: trocar de aba no meio do zoom animado removia o mapa
      // antes do fim da transicao e o Leaflet quebrava (_leaflet_pos).
      mapa.fitBounds(L.latLngBounds(pontos).pad(0.2), { maxZoom: 15, animate: false })
      enquadrado.current = true
    }
  }, [dados, posicao])

  const semCoordenadas =
    dados && dados.universidades.length > 0 && dados.universidades.every((u) => u.latitude === null)

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06]">
        <div ref={divRef} className="h-64 w-full bg-navy-800" />
        {carregando && !dados && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900/70">
            <Spinner />
          </div>
        )}
      </div>

      {dados && dados.universidades.length > 0 && (
        <ul className="space-y-1">
          {dados.universidades.map((u) => (
            <li key={u.id} className="flex items-center gap-2 text-xs text-white/60">
              <GraduationCap className={`h-3.5 w-3.5 flex-shrink-0 ${u.entrou_em ? 'text-emerald-400' : 'text-gold-500'}`} />
              <span className="flex-1 truncate">{u.nome}</span>
              <span className="text-white/35">{u.raio_m} m · {u.alunos} aluno(s)</span>
            </li>
          ))}
        </ul>
      )}
      {semCoordenadas && (
        <p className="text-[11px] text-amber-400">
          As universidades desta rota não têm localização cadastrada: os avisos de aproximação
          ficam desligados até a secretaria informar latitude e longitude.
        </p>
      )}
    </div>
  )
}
