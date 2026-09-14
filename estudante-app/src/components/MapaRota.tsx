import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Navigation } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'

interface Parada {
  id: string
  ordem: number
  nome: string
  endereco: string | null
  latitude: number | null
  longitude: number | null
  universidade: string | null
  minutos_partida: number | null
}

interface Dados {
  paradas: Parada[]
  veiculo: { latitude: number; longitude: number; registrado_em: string } | null
  situacao: 'aguardando' | 'em_rota' | 'concluida' | null
}

/** Marcador redondo em SVG: evita depender das imagens padrao do Leaflet. */
function icone(cor: string, texto: string, tamanho = 26) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50%;background:${cor};
      color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px Inter,sans-serif;
      box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff">${texto}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  })
}

/**
 * Mapa do trajeto: paradas na ordem e, quando a rota esta em andamento,
 * a posicao do veiculo. A posicao vem de localizacao_rota, gravada pelo
 * app do motorista, e e reconsultada a cada 20 segundos.
 */
export function MapaRota({ rotaId, emRota }: { rotaId: string; emRota: boolean }) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const camadaRef = useRef<L.LayerGroup | null>(null)
  const [dados, setDados] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Busca inicial e, com a rota em andamento, atualizacao periodica.
  useEffect(() => {
    let vivo = true
    const buscar = async () => {
      const { data } = await supabase.rpc('paradas_da_rota', { p_rota_id: rotaId })
      if (!vivo) return
      setDados((data as Dados) ?? null)
      setCarregando(false)
    }
    buscar()
    if (!emRota) return
    const t = setInterval(buscar, 20000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [rotaId, emRota])

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!divRef.current || mapaRef.current) return
    const mapa = L.map(divRef.current, { zoomControl: false, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapa)
    L.control.zoom({ position: 'bottomright' }).addTo(mapa)
    mapa.setView([-21.2089, -50.4328], 12) // Araçatuba, até os dados chegarem
    mapaRef.current = mapa
    camadaRef.current = L.layerGroup().addTo(mapa)
    return () => {
      mapa.remove()
      mapaRef.current = null
    }
  }, [])

  // Redesenha marcadores e trajeto a cada atualização.
  useEffect(() => {
    const mapa = mapaRef.current
    const camada = camadaRef.current
    if (!mapa || !camada || !dados) return
    camada.clearLayers()

    const comCoord = dados.paradas.filter(
      (p) => p.latitude !== null && p.longitude !== null,
    ) as (Parada & { latitude: number; longitude: number })[]

    const pontos: L.LatLngExpression[] = comCoord.map((p) => [p.latitude, p.longitude])

    comCoord.forEach((p, i) => {
      const ultima = i === comCoord.length - 1
      L.marker([p.latitude, p.longitude], {
        icon: icone(ultima ? '#047857' : '#1D4ED8', String(p.ordem)),
      })
        .bindPopup(
          `<b>${p.nome}</b>${p.endereco ? `<br>${p.endereco}` : ''}` +
            `${p.universidade ? `<br><i>${p.universidade}</i>` : ''}` +
            `${p.minutos_partida !== null ? `<br>${p.minutos_partida} min da partida` : ''}`,
        )
        .addTo(camada)
    })

    if (pontos.length > 1) {
      L.polyline(pontos, { color: '#1D4ED8', weight: 4, opacity: 0.7 }).addTo(camada)
    }

    if (dados.veiculo) {
      const v: L.LatLngExpression = [dados.veiculo.latitude, dados.veiculo.longitude]
      L.marker(v, { icon: icone('#B45309', '🚌', 34) })
        .bindPopup(
          `<b>Ônibus</b><br>posição de ${new Date(dados.veiculo.registrado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        )
        .addTo(camada)
      pontos.push(v)
    }

    if (pontos.length > 0) {
      mapa.fitBounds(L.latLngBounds(pontos).pad(0.25), { maxZoom: 15 })
    }
  }, [dados])

  const semCoordenadas = dados && dados.paradas.every((p) => p.latitude === null)

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-line/60">
        <div ref={divRef} className="h-64 w-full bg-raised" />
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
            <Spinner />
          </div>
        )}
      </div>

      {emRota && dados?.veiculo && (
        <p className="flex items-center gap-1.5 text-[11px] text-ok">
          <Navigation className="h-3 w-3" />
          Posição do ônibus atualizada às{' '}
          {new Date(dados.veiculo.registrado_em).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
      {emRota && !dados?.veiculo && !carregando && (
        <p className="text-[11px] text-muted">
          O motorista ainda não enviou a localização desta viagem.
        </p>
      )}
      {!carregando && dados && dados.paradas.length === 0 && (
        <p className="text-[11px] text-muted">
          As paradas desta rota ainda não foram cadastradas pela secretaria.
        </p>
      )}
      {semCoordenadas && dados && dados.paradas.length > 0 && (
        <p className="text-[11px] text-warn">
          As paradas desta rota não têm coordenadas, então não aparecem no mapa.
        </p>
      )}

      {dados && dados.paradas.length > 0 && (
        <ol className="space-y-1.5">
          {dados.paradas.map((p) => (
            <li key={p.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-[10px] font-bold text-brand-500">
                {p.ordem}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">{p.nome}</span>
                {(p.endereco || p.universidade) && (
                  <span className="block text-[11px] text-muted">
                    {p.universidade ?? p.endereco}
                  </span>
                )}
              </span>
              {p.minutos_partida !== null && (
                <span className="shrink-0 text-[11px] text-faint">+{p.minutos_partida} min</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {!dados?.paradas.length && !carregando && (
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <MapPin className="h-3 w-3" />
          Sem pontos de parada para exibir.
        </p>
      )}
    </div>
  )
}
