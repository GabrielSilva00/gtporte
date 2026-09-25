import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createGTporteStudentVanModel } from './vanModelo'
import { aplicarPictogramaEstudante } from './decalEstudante'

export interface CoresCena {
  /** Cor principal das partículas do rastro */
  rastro: string
  /** Segunda cor, misturada por partícula */
  rastroClaro: string
  /** Faixas da pista */
  faixa: string
  /** Sombra de contato sob a van */
  sombra: string
}

const VELOCIDADE = 6
const RAIO_RODA = 0.38
// Teto das diretrizes de partículas para celular intermediário; o rastro não precisa de mais.
const PARTICULAS = 420
const FAIXAS = 12
const ESPACO_FAIXA = 1.6

/**
 * Funde as peças estáticas por material e deixa as quatro rodas separadas para girar.
 * Cai de ~60 para ~20 draw calls.
 */
function fundirPecasEstaticas(modelo: THREE.Object3D): THREE.Object3D[] {
  modelo.updateMatrixWorld(true)
  const rodas: THREE.Object3D[] = []
  modelo.traverse((o) => {
    if (o.name.startsWith('Tire ') && o.name.endsWith('__pivot')) rodas.push(o)
  })
  const dentroDeRoda = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (rodas.includes(p)) return true
    return false
  }

  const inversa = modelo.matrixWorld.clone().invert()
  const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const fundidas: THREE.Mesh[] = []
  modelo.traverse((o) => {
    const malha = o as THREE.Mesh
    if (!malha.isMesh || dentroDeRoda(malha)) return
    let g = malha.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, malha.matrixWorld))
    if (g.index) g = g.toNonIndexed()
    for (const nome of Object.keys(g.attributes)) {
      if (nome !== 'position' && nome !== 'normal' && nome !== 'uv') g.deleteAttribute(nome)
    }
    g.clearGroups()
    const material = malha.material as THREE.Material
    porMaterial.set(material, [...(porMaterial.get(material) ?? []), g])
    fundidas.push(malha)
  })

  for (const malha of fundidas) {
    malha.removeFromParent()
    malha.geometry.dispose()
  }
  for (const [material, geometrias] of porMaterial) {
    const unida = mergeGeometries(geometrias)
    geometrias.forEach((g) => g.dispose())
    if (unida) modelo.add(new THREE.Mesh(unida, material))
  }
  return rodas
}

function texturaSombra(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function criarRastro(cores: CoresCena) {
  const posicoes = new Float32Array(PARTICULAS * 3)
  const velocidades = new Float32Array(PARTICULAS * 3)
  const idade = new Float32Array(PARTICULAS)
  const vida = new Float32Array(PARTICULAS)
  const mistura = new Float32Array(PARTICULAS)
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3).setUsage(THREE.DynamicDrawUsage))
  geometria.setAttribute('aIdade', new THREE.BufferAttribute(idade, 1).setUsage(THREE.DynamicDrawUsage))
  geometria.setAttribute('aVida', new THREE.BufferAttribute(vida, 1))
  geometria.setAttribute('aMistura', new THREE.BufferAttribute(mistura, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCor: { value: new THREE.Color(cores.rastro) },
      uCorClara: { value: new THREE.Color(cores.rastroClaro) },
      uEscala: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aIdade;
      attribute float aVida;
      attribute float aMistura;
      uniform float uEscala;
      varying float vT;
      varying float vMistura;
      void main() {
        vT = clamp(aIdade / aVida, 0.0, 1.0);
        vMistura = aMistura;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = mix(0.14, 0.55, vT) * uEscala / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCor;
      uniform vec3 uCorClara;
      varying float vT;
      varying float vMistura;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alfa = smoothstep(0.5, 0.1, d) * (1.0 - vT) * 0.6;
        gl_FragColor = vec4(mix(uCor, uCorClara, vMistura), alfa);
        #include <colorspace_fragment>
      }`,
  })
  const pontos = new THREE.Points(geometria, material)
  pontos.frustumCulled = false

  const origem = new THREE.Vector3()
  const renascer = (i: number, idadeInicial: number) => {
    posicoes[i * 3] = origem.x + (Math.random() - 0.5) * 0.3
    posicoes[i * 3 + 1] = origem.y + Math.random() * 0.5
    posicoes[i * 3 + 2] = origem.z + (Math.random() - 0.5) * 1.4
    velocidades[i * 3] = -(2.2 + Math.random() * 1.8)
    velocidades[i * 3 + 1] = 0.15 + Math.random() * 0.45
    velocidades[i * 3 + 2] = (Math.random() - 0.5) * 0.5
    vida[i] = 1.1 + Math.random() * 0.9
    idade[i] = idadeInicial
    mistura[i] = Math.random()
  }

  const iniciar = (pontoEmissao: THREE.Vector3) => {
    origem.copy(pontoEmissao)
    for (let i = 0; i < PARTICULAS; i++) {
      renascer(i, 0)
      // Adianta cada partícula para o rastro já nascer formado, sem "enchimento" no primeiro segundo.
      const t = Math.random() * vida[i]
      idade[i] = t
      posicoes[i * 3] += velocidades[i * 3] * t
      posicoes[i * 3 + 1] += velocidades[i * 3 + 1] * t
      posicoes[i * 3 + 2] += velocidades[i * 3 + 2] * t
    }
    geometria.attributes.aVida.needsUpdate = true
    geometria.attributes.aMistura.needsUpdate = true
  }

  const avancar = (dt: number, pontoEmissao: THREE.Vector3) => {
    origem.copy(pontoEmissao)
    for (let i = 0; i < PARTICULAS; i++) {
      idade[i] += dt
      if (idade[i] >= vida[i]) {
        renascer(i, 0)
        continue
      }
      posicoes[i * 3] += velocidades[i * 3] * dt
      posicoes[i * 3 + 1] += velocidades[i * 3 + 1] * dt
      posicoes[i * 3 + 2] += velocidades[i * 3 + 2] * dt
      velocidades[i * 3 + 1] *= 0.985
    }
    geometria.attributes.position.needsUpdate = true
    geometria.attributes.aIdade.needsUpdate = true
    geometria.attributes.aVida.needsUpdate = true
    geometria.attributes.aMistura.needsUpdate = true
  }

  return { pontos, material, geometria, iniciar, avancar }
}

/**
 * Monta a cena da van em `container` e devolve a função de desmontagem.
 * Lança erro quando o aparelho não tem WebGL — quem chama mostra o fallback.
 */
export function montarCenaVan(container: HTMLElement, cores: CoresCena, rotulo: string): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const canvas = renderer.domElement
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', rotulo)
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  container.appendChild(canvas)

  const cena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  cena.environment = ambiente
  cena.environmentIntensity = 0.9
  cena.add(new THREE.HemisphereLight(0xe6eeff, 0x3b4048, 0.9))
  const sol = new THREE.DirectionalLight(0xfff6e8, 2.2)
  sol.position.set(2, 6, 8)
  cena.add(sol)

  const van = createGTporteStudentVanModel()
  const soltarPictograma = aplicarPictogramaEstudante(van)
  const rodas = fundirPecasEstaticas(van)
  cena.add(van)
  const emissor =
    (van.userData.sculptRuntime?.sockets?.['chassis:rear-trail'] as THREE.Object3D | undefined) ?? null

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 2.8),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), color: cores.sombra, transparent: true, opacity: 0.45, depthWrite: false }),
  )
  sombra.rotation.x = -Math.PI / 2
  sombra.position.y = 0.005
  cena.add(sombra)

  const faixas = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.75, 0.09),
    new THREE.MeshBasicMaterial({ color: cores.faixa, transparent: true, opacity: 0.35, depthWrite: false }),
    FAIXAS,
  )
  const matriz = new THREE.Matrix4()
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  const escalaUm = new THREE.Vector3(1, 1, 1)
  const posFaixa = new THREE.Vector3()
  const extensaoFaixas = FAIXAS * ESPACO_FAIXA
  let deslocamento = 0
  const posicionarFaixas = () => {
    for (let i = 0; i < FAIXAS; i++) {
      const x = ((i * ESPACO_FAIXA - deslocamento) % extensaoFaixas + extensaoFaixas) % extensaoFaixas - extensaoFaixas / 2
      faixas.setMatrixAt(i, matriz.compose(posFaixa.set(x, 0.01, 1.55), giro, escalaUm))
    }
    faixas.instanceMatrix.needsUpdate = true
  }
  posicionarFaixas()
  cena.add(faixas)

  const rastro = criarRastro(cores)
  cena.add(rastro.pontos)
  const pontoEmissao = new THREE.Vector3()
  const lerEmissor = () => {
    van.updateMatrixWorld(true)
    if (emissor) emissor.getWorldPosition(pontoEmissao)
    else pontoEmissao.set(-3, 0.25, 0)
    return pontoEmissao
  }
  rastro.iniciar(lerEmissor())

  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 60)
  const alvo = new THREE.Vector3(-1.1, 1.05, 0)
  const enquadrar = () => {
    const largura = Math.max(1, container.clientWidth)
    const altura = Math.max(1, container.clientHeight)
    renderer.setSize(largura, altura, false)
    camera.aspect = largura / altura
    camera.updateProjectionMatrix()
    // Distância que faz caber a van e ~4 m de rastro na largura disponível.
    const meiaLarguraFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
    const distancia = 5.6 / Math.tan(meiaLarguraFov)
    camera.position.set(alvo.x + distancia * 0.32, alvo.y + distancia * 0.2, distancia * 0.93)
    camera.lookAt(alvo)
    const tanMeioFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    rastro.material.uniforms.uEscala.value = (altura * renderer.getPixelRatio()) / (2 * tanMeioFov)
  }
  enquadrar()
  const observador = new ResizeObserver(() => {
    enquadrar()
    if (!rodando) renderer.render(cena, camera)
  })
  observador.observe(container)

  let anterior = 0
  let tempo = 0
  let quadro = 0
  let rodando = false

  const passo = (agora: number) => {
    // O timestamp do rAF marca o início do quadro e pode ser anterior ao momento em que a
    // animação foi ligada; sem o piso em zero o primeiro passo andava para trás no tempo.
    const dt = anterior < 0 ? 0 : Math.min(Math.max((agora - anterior) / 1000, 0), 1 / 20)
    anterior = agora
    tempo += dt
    const giroRoda = (VELOCIDADE * dt) / RAIO_RODA
    for (const roda of rodas) roda.rotation.z -= giroRoda
    van.position.y = 0.035 * Math.sin(tempo * 9) + 0.015 * Math.sin(tempo * 23)
    van.rotation.z = 0.008 * Math.sin(tempo * 4.5)
    deslocamento += VELOCIDADE * dt
    posicionarFaixas()
    rastro.avancar(dt, lerEmissor())
    renderer.render(cena, camera)
    quadro = requestAnimationFrame(passo)
  }
  const iniciar = () => {
    if (rodando) return
    rodando = true
    anterior = -1
    quadro = requestAnimationFrame(passo)
  }
  const parar = () => {
    rodando = false
    cancelAnimationFrame(quadro)
  }

  const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)')
  const atualizar = () => {
    if (movimentoReduzido.matches || document.hidden) {
      parar()
      renderer.render(cena, camera)
    } else {
      iniciar()
    }
  }
  movimentoReduzido.addEventListener('change', atualizar)
  document.addEventListener('visibilitychange', atualizar)
  atualizar()

  return () => {
    parar()
    observador.disconnect()
    movimentoReduzido.removeEventListener('change', atualizar)
    document.removeEventListener('visibilitychange', atualizar)
    soltarPictograma()
    cena.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const materiais = m.material ? ([] as THREE.Material[]).concat(m.material) : []
      for (const mat of materiais) {
        for (const valor of Object.values(mat)) if (valor instanceof THREE.Texture) valor.dispose()
        mat.dispose()
      }
    })
    ambiente.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }
}
