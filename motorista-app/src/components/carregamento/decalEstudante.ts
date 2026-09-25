import * as THREE from 'three'

const NOME_MALHA_DECAL = 'Student transport decal'

function desenharPictograma(fundo: string): HTMLCanvasElement {
  const t = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = t
  const g = canvas.getContext('2d')!
  g.fillStyle = fundo
  g.fillRect(0, 0, t, t)
  g.fillStyle = '#ffffff'
  g.strokeStyle = fundo
  g.lineWidth = 6

  // Boné e cabeça
  g.beginPath()
  g.arc(128, 62, 24, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(120, 44, 30, 10, -0.15, Math.PI, Math.PI * 2)
  g.fill()
  g.fillRect(96, 42, 60, 8)

  // Tronco
  g.beginPath()
  g.roundRect(104, 92, 48, 72, 14)
  g.fill()

  // Mochila, com contorno na cor do fundo para destacar do tronco
  g.beginPath()
  g.roundRect(72, 98, 50, 62, 10)
  g.fill()
  g.stroke()
  g.beginPath()
  g.moveTo(80, 132)
  g.lineTo(114, 132)
  g.stroke()

  // Pernas
  g.fillRect(108, 160, 16, 58)
  g.fillRect(132, 160, 16, 58)

  return canvas
}

/** Aplica o pictograma do estudante no disco azul gerado pela factory da van. */
export function aplicarPictogramaEstudante(modelo: THREE.Object3D): () => void {
  const malha = modelo.getObjectByName(NOME_MALHA_DECAL) as THREE.Mesh | undefined
  if (!malha) return () => {}
  const original = malha.material as THREE.MeshStandardMaterial
  const fundo = `#${original.color.getHexString()}`
  const textura = new THREE.CanvasTexture(desenharPictograma(fundo))
  textura.colorSpace = THREE.SRGBColorSpace
  textura.center.set(0.5, 0.5)
  textura.rotation = Math.PI / 2
  const material = original.clone()
  material.color.set('#ffffff')
  material.map = textura
  malha.material = material
  return () => {
    textura.dispose()
    material.dispose()
  }
}
