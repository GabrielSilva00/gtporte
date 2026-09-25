// Gerado pelo img2threejs a partir de docs/modelo-van/object-sculpt-spec.json e enxugado por
// docs/modelo-van/strip_factory.py. Não editar à mão: altere a spec e gere de novo.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: GTporte Student Van
// Sculpt build pass: optimization-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createGTporteStudentVanModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "GTporte Student Van";

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["paint-white"] = createSculptMaterial(
    "paint-white",
    {"id": "paint-white", "baseColor": "#F2F3F0", "color": "#F2F3F0", "albedo": {"dominant": "#F2F3F0"}, "roughness": {"base": 0.45, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "clearcoat": {"base": 0.75, "variation": 0.0}, "clearcoatRoughness": {"base": 0.12, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["glass-tint"] = createSculptMaterial(
    "glass-tint",
    {"id": "glass-tint", "baseColor": "#141B22", "color": "#141B22", "albedo": {"dominant": "#141B22"}, "roughness": {"base": 0.05, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "clearcoat": 1.0, "clearcoatRoughness": 0.0525, "transmission": {"base": 1.0, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["plastic-black"] = createSculptMaterial(
    "plastic-black",
    {"id": "plastic-black", "baseColor": "#1E1F21", "color": "#1E1F21", "albedo": {"dominant": "#1E1F21"}, "roughness": {"base": 0.68, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["rubber"] = createSculptMaterial(
    "rubber",
    {"id": "rubber", "baseColor": "#151515", "color": "#151515", "albedo": {"dominant": "#151515"}, "roughness": {"base": 0.88, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.48, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["steel-rim"] = createSculptMaterial(
    "steel-rim",
    {"id": "steel-rim", "baseColor": "#B9BDC1", "color": "#B9BDC1", "albedo": {"dominant": "#B9BDC1"}, "roughness": {"base": 0.4, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "anisotropy": {"base": 0.2, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["decal-navy"] = createSculptMaterial(
    "decal-navy",
    {"id": "decal-navy", "baseColor": "#3A4C68", "color": "#3A4C68", "albedo": {"dominant": "#3A4C68"}, "roughness": {"base": 0.45, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "clearcoat": {"base": 0.75, "variation": 0.0}, "clearcoatRoughness": {"base": 0.12, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["lamp-orange"] = createSculptMaterial(
    "lamp-orange",
    {"id": "lamp-orange", "baseColor": "#D9570A", "color": "#D9570A", "albedo": {"dominant": "#F07A1A"}, "roughness": {"base": 0.28, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "emissive": "#D9570A", "emissiveIntensity": 0.35, "clearcoat": {"base": 0.2, "variation": 0.0}, "clearcoatRoughness": {"base": 0.18, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );
  materialMap["lamp-red"] = createSculptMaterial(
    "lamp-red",
    {"id": "lamp-red", "baseColor": "#C8141E", "color": "#C8141E", "albedo": {"dominant": "#C8141E"}, "roughness": {"base": 0.28, "variation": 0.03, "map": "scalar-from-referencePbr-roughness-estimate", "localResponse": "uniform scalar; independent of albedo"}, "metalness": {"base": 0.0, "variation": 0.0}, "emissive": "#C8141E", "emissiveIntensity": 0.35, "clearcoat": {"base": 0.2, "variation": 0.0}, "clearcoatRoughness": {"base": 0.18, "variation": 0.0}, "ior": {"base": 1.5, "variation": 0.0}, "textureless": {"declared": true}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_chassis_0 = makeAttachmentEndpoint(null);
  const node_chassis_0 = new THREE.Group();
  node_chassis_0.name = "Chassis underbody__pivot";
  node_chassis_0.scale.set(1, 1, 1);
  if (endpoint_chassis_0) {
    node_chassis_0.position.copy(endpoint_chassis_0.start);
    node_chassis_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_chassis_0.position.set(0.0, 0.45, 0.0);
    node_chassis_0.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["root"] ?? root).add(node_chassis_0);
  nodes["chassis"] = node_chassis_0;
  const mesh_chassis_0Geometry = endpoint_chassis_0
    ? new THREE.CylinderGeometry(endpoint_chassis_0.endRadius, endpoint_chassis_0.baseRadius, endpoint_chassis_0.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_chassis_0) {
    mesh_chassis_0Geometry.scale(5.4, 0.14, 1.8);
  }
  const mesh_chassis_0 = new THREE.Mesh(
    mesh_chassis_0Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_chassis_0.name = "Chassis underbody";
  if (endpoint_chassis_0) {
    mesh_chassis_0.position.copy(endpoint_chassis_0.midpoint);
    mesh_chassis_0.quaternion.copy(endpoint_chassis_0.quaternion);
  }
  mesh_chassis_0.castShadow = options.castShadow ?? true;
  mesh_chassis_0.receiveShadow = options.receiveShadow ?? true;
  node_chassis_0.add(mesh_chassis_0);
  meshes["chassis"] = mesh_chassis_0;
  colliders["chassis"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Chassis underbody."};
  destructionGroups["chassis"] ??= [];
  destructionGroups["chassis"].push(node_chassis_0);
  const socket_chassis_rear_trail_0 = new THREE.Object3D();
  socket_chassis_rear_trail_0.name = "rear-trail";
  socket_chassis_rear_trail_0.position.set(-3.02, -0.2, 0.0);
  socket_chassis_rear_trail_0.rotation.set(0.0, 0.0, 0.0);
  socket_chassis_rear_trail_0.userData.socket = {"id": "rear-trail", "localPosition": [-3.02, -0.2, 0.0], "localRotation": [0, 0, 0], "purpose": "emitter origin for exhaust/trail particles behind the rear bumper at road level"};
  node_chassis_0.add(socket_chassis_rear_trail_0);
  sockets["chassis:rear-trail"] = socket_chassis_rear_trail_0;
  const socket_chassis_exhaust_1 = new THREE.Object3D();
  socket_chassis_exhaust_1.name = "exhaust";
  socket_chassis_exhaust_1.position.set(-2.9, -0.12, -0.62);
  socket_chassis_exhaust_1.rotation.set(0.0, 0.0, 0.0);
  socket_chassis_exhaust_1.userData.socket = {"id": "exhaust", "localPosition": [-2.9, -0.12, -0.62], "localRotation": [0, 0, 0], "purpose": "exhaust tip under the rear bumper (left side, Sprinter layout; inferred)"};
  node_chassis_0.add(socket_chassis_exhaust_1);
  sockets["chassis:exhaust"] = socket_chassis_exhaust_1;

  const endpoint_body_shell_1 = makeAttachmentEndpoint(null);
  const node_body_shell_1 = new THREE.Group();
  node_body_shell_1.name = "Body shell (high roof)__pivot";
  node_body_shell_1.scale.set(1, 1, 1);
  if (endpoint_body_shell_1) {
    node_body_shell_1.position.copy(endpoint_body_shell_1.start);
    node_body_shell_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_body_shell_1.position.set(0.0, -0.45, -0.975);
    node_body_shell_1.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_body_shell_1);
  nodes["body-shell"] = node_body_shell_1;
  const mesh_body_shell_1Geometry = endpoint_body_shell_1
    ? new THREE.CylinderGeometry(endpoint_body_shell_1.endRadius, endpoint_body_shell_1.baseRadius, endpoint_body_shell_1.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-2.95, 0.5], [-2.4044, 0.5], [-2.3577, 0.6138], [-2.2831, 0.7116], [-2.1856, 0.7867], [-2.072, 0.8339], [-1.95, 0.85], [-1.828, 0.8339], [-1.7144, 0.7867], [-1.6169, 0.7116], [-1.5423, 0.6138], [-1.4956, 0.5], [1.2656, 0.5], [1.3123, 0.6138], [1.3869, 0.7116], [1.4844, 0.7867], [1.598, 0.8339], [1.72, 0.85], [1.842, 0.8339], [1.9556, 0.7867], [2.0531, 0.7116], [2.1277, 0.6138], [2.1744, 0.5], [2.95, 0.5], [3.0, 0.8], [2.98, 1.08], [2.8, 1.22], [2.55, 1.32], [1.98, 2.3], [1.85, 2.55], [1.62, 2.72], [1.3, 2.76], [-2.78, 2.76], [-2.9, 2.71], [-2.95, 2.6]], "depth": 1.95});
  if (!endpoint_body_shell_1) {
    mesh_body_shell_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_body_shell_1 = new THREE.Mesh(
    mesh_body_shell_1Geometry,
    materialMap["paint-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_body_shell_1.name = "Body shell (high roof)";
  if (endpoint_body_shell_1) {
    mesh_body_shell_1.position.copy(endpoint_body_shell_1.midpoint);
    mesh_body_shell_1.quaternion.copy(endpoint_body_shell_1.quaternion);
  }
  mesh_body_shell_1.castShadow = options.castShadow ?? true;
  mesh_body_shell_1.receiveShadow = options.receiveShadow ?? true;
  node_body_shell_1.add(mesh_body_shell_1);
  meshes["body-shell"] = mesh_body_shell_1;
  colliders["body-shell"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Body shell (high roof)."};
  destructionGroups["body-shell"] ??= [];
  destructionGroups["body-shell"].push(node_body_shell_1);

  const endpoint_window_band_2 = makeAttachmentEndpoint(null);
  const node_window_band_2 = new THREE.Group();
  node_window_band_2.name = "Side window band (right)__pivot";
  node_window_band_2.scale.set(1, 1, 1);
  if (endpoint_window_band_2) {
    node_window_band_2.position.copy(endpoint_window_band_2.start);
    node_window_band_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_window_band_2.position.set(-1.139, 1.5, 0.979);
    node_window_band_2.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_window_band_2);
  nodes["window-band"] = node_window_band_2;
  const mesh_window_band_2Geometry = endpoint_window_band_2
    ? new THREE.CylinderGeometry(endpoint_window_band_2.endRadius, endpoint_window_band_2.baseRadius, endpoint_window_band_2.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_window_band_2) {
    mesh_window_band_2Geometry.scale(3.309, 0.895, 0.012);
  }
  const mesh_window_band_2 = new THREE.Mesh(
    mesh_window_band_2Geometry,
    materialMap["glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_window_band_2.name = "Side window band (right)";
  if (endpoint_window_band_2) {
    mesh_window_band_2.position.copy(endpoint_window_band_2.midpoint);
    mesh_window_band_2.quaternion.copy(endpoint_window_band_2.quaternion);
  }
  mesh_window_band_2.castShadow = options.castShadow ?? true;
  mesh_window_band_2.receiveShadow = options.receiveShadow ?? true;
  node_window_band_2.add(mesh_window_band_2);
  meshes["window-band"] = mesh_window_band_2;
  colliders["window-band"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side window band (right)."};
  destructionGroups["window-band"] ??= [];
  destructionGroups["window-band"].push(node_window_band_2);

  const endpoint_pillar_right_0_3 = makeAttachmentEndpoint(null);
  const node_pillar_right_0_3 = new THREE.Group();
  node_pillar_right_0_3.name = "Window pillar right 0__pivot";
  node_pillar_right_0_3.scale.set(1, 1, 1);
  if (endpoint_pillar_right_0_3) {
    node_pillar_right_0_3.position.copy(endpoint_pillar_right_0_3.start);
    node_pillar_right_0_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_right_0_3.position.set(-1.536, 1.5, 0.983);
    node_pillar_right_0_3.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_right_0_3);
  nodes["pillar-right-0"] = node_pillar_right_0_3;
  const mesh_pillar_right_0_3Geometry = endpoint_pillar_right_0_3
    ? new THREE.CylinderGeometry(endpoint_pillar_right_0_3.endRadius, endpoint_pillar_right_0_3.baseRadius, endpoint_pillar_right_0_3.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_right_0_3) {
    mesh_pillar_right_0_3Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_right_0_3 = new THREE.Mesh(
    mesh_pillar_right_0_3Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_right_0_3.name = "Window pillar right 0";
  if (endpoint_pillar_right_0_3) {
    mesh_pillar_right_0_3.position.copy(endpoint_pillar_right_0_3.midpoint);
    mesh_pillar_right_0_3.quaternion.copy(endpoint_pillar_right_0_3.quaternion);
  }
  mesh_pillar_right_0_3.castShadow = options.castShadow ?? true;
  mesh_pillar_right_0_3.receiveShadow = options.receiveShadow ?? true;
  node_pillar_right_0_3.add(mesh_pillar_right_0_3);
  meshes["pillar-right-0"] = mesh_pillar_right_0_3;
  colliders["pillar-right-0"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar right 0."};
  destructionGroups["pillar-right-0"] ??= [];
  destructionGroups["pillar-right-0"].push(node_pillar_right_0_3);

  const endpoint_pillar_right_1_4 = makeAttachmentEndpoint(null);
  const node_pillar_right_1_4 = new THREE.Group();
  node_pillar_right_1_4.name = "Window pillar right 1__pivot";
  node_pillar_right_1_4.scale.set(1, 1, 1);
  if (endpoint_pillar_right_1_4) {
    node_pillar_right_1_4.position.copy(endpoint_pillar_right_1_4.start);
    node_pillar_right_1_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_right_1_4.position.set(-0.477, 1.5, 0.983);
    node_pillar_right_1_4.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_right_1_4);
  nodes["pillar-right-1"] = node_pillar_right_1_4;
  const mesh_pillar_right_1_4Geometry = endpoint_pillar_right_1_4
    ? new THREE.CylinderGeometry(endpoint_pillar_right_1_4.endRadius, endpoint_pillar_right_1_4.baseRadius, endpoint_pillar_right_1_4.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_right_1_4) {
    mesh_pillar_right_1_4Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_right_1_4 = new THREE.Mesh(
    mesh_pillar_right_1_4Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_right_1_4.name = "Window pillar right 1";
  if (endpoint_pillar_right_1_4) {
    mesh_pillar_right_1_4.position.copy(endpoint_pillar_right_1_4.midpoint);
    mesh_pillar_right_1_4.quaternion.copy(endpoint_pillar_right_1_4.quaternion);
  }
  mesh_pillar_right_1_4.castShadow = options.castShadow ?? true;
  mesh_pillar_right_1_4.receiveShadow = options.receiveShadow ?? true;
  node_pillar_right_1_4.add(mesh_pillar_right_1_4);
  meshes["pillar-right-1"] = mesh_pillar_right_1_4;
  colliders["pillar-right-1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar right 1."};
  destructionGroups["pillar-right-1"] ??= [];
  destructionGroups["pillar-right-1"].push(node_pillar_right_1_4);

  const endpoint_pillar_right_2_5 = makeAttachmentEndpoint(null);
  const node_pillar_right_2_5 = new THREE.Group();
  node_pillar_right_2_5.name = "Window pillar right 2__pivot";
  node_pillar_right_2_5.scale.set(1, 1, 1);
  if (endpoint_pillar_right_2_5) {
    node_pillar_right_2_5.position.copy(endpoint_pillar_right_2_5.start);
    node_pillar_right_2_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_right_2_5.position.set(0.516, 1.5, 0.983);
    node_pillar_right_2_5.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_right_2_5);
  nodes["pillar-right-2"] = node_pillar_right_2_5;
  const mesh_pillar_right_2_5Geometry = endpoint_pillar_right_2_5
    ? new THREE.CylinderGeometry(endpoint_pillar_right_2_5.endRadius, endpoint_pillar_right_2_5.baseRadius, endpoint_pillar_right_2_5.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_right_2_5) {
    mesh_pillar_right_2_5Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_right_2_5 = new THREE.Mesh(
    mesh_pillar_right_2_5Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_right_2_5.name = "Window pillar right 2";
  if (endpoint_pillar_right_2_5) {
    mesh_pillar_right_2_5.position.copy(endpoint_pillar_right_2_5.midpoint);
    mesh_pillar_right_2_5.quaternion.copy(endpoint_pillar_right_2_5.quaternion);
  }
  mesh_pillar_right_2_5.castShadow = options.castShadow ?? true;
  mesh_pillar_right_2_5.receiveShadow = options.receiveShadow ?? true;
  node_pillar_right_2_5.add(mesh_pillar_right_2_5);
  meshes["pillar-right-2"] = mesh_pillar_right_2_5;
  colliders["pillar-right-2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar right 2."};
  destructionGroups["pillar-right-2"] ??= [];
  destructionGroups["pillar-right-2"].push(node_pillar_right_2_5);

  const endpoint_window_band_left_6 = makeAttachmentEndpoint(null);
  const node_window_band_left_6 = new THREE.Group();
  node_window_band_left_6.name = "Side window band (left)__pivot";
  node_window_band_left_6.scale.set(1, 1, 1);
  if (endpoint_window_band_left_6) {
    node_window_band_left_6.position.copy(endpoint_window_band_left_6.start);
    node_window_band_left_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_window_band_left_6.position.set(-1.139, 1.5, -0.979);
    node_window_band_left_6.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_window_band_left_6);
  nodes["window-band-left"] = node_window_band_left_6;
  const mesh_window_band_left_6Geometry = endpoint_window_band_left_6
    ? new THREE.CylinderGeometry(endpoint_window_band_left_6.endRadius, endpoint_window_band_left_6.baseRadius, endpoint_window_band_left_6.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_window_band_left_6) {
    mesh_window_band_left_6Geometry.scale(3.309, 0.895, 0.012);
  }
  const mesh_window_band_left_6 = new THREE.Mesh(
    mesh_window_band_left_6Geometry,
    materialMap["glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_window_band_left_6.name = "Side window band (left)";
  if (endpoint_window_band_left_6) {
    mesh_window_band_left_6.position.copy(endpoint_window_band_left_6.midpoint);
    mesh_window_band_left_6.quaternion.copy(endpoint_window_band_left_6.quaternion);
  }
  mesh_window_band_left_6.castShadow = options.castShadow ?? true;
  mesh_window_band_left_6.receiveShadow = options.receiveShadow ?? true;
  node_window_band_left_6.add(mesh_window_band_left_6);
  meshes["window-band-left"] = mesh_window_band_left_6;
  colliders["window-band-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side window band (left)."};
  destructionGroups["window-band-left"] ??= [];
  destructionGroups["window-band-left"].push(node_window_band_left_6);

  const endpoint_pillar_left_0_7 = makeAttachmentEndpoint(null);
  const node_pillar_left_0_7 = new THREE.Group();
  node_pillar_left_0_7.name = "Window pillar left 0__pivot";
  node_pillar_left_0_7.scale.set(1, 1, 1);
  if (endpoint_pillar_left_0_7) {
    node_pillar_left_0_7.position.copy(endpoint_pillar_left_0_7.start);
    node_pillar_left_0_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_left_0_7.position.set(-1.536, 1.5, -0.983);
    node_pillar_left_0_7.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_left_0_7);
  nodes["pillar-left-0"] = node_pillar_left_0_7;
  const mesh_pillar_left_0_7Geometry = endpoint_pillar_left_0_7
    ? new THREE.CylinderGeometry(endpoint_pillar_left_0_7.endRadius, endpoint_pillar_left_0_7.baseRadius, endpoint_pillar_left_0_7.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_left_0_7) {
    mesh_pillar_left_0_7Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_left_0_7 = new THREE.Mesh(
    mesh_pillar_left_0_7Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_left_0_7.name = "Window pillar left 0";
  if (endpoint_pillar_left_0_7) {
    mesh_pillar_left_0_7.position.copy(endpoint_pillar_left_0_7.midpoint);
    mesh_pillar_left_0_7.quaternion.copy(endpoint_pillar_left_0_7.quaternion);
  }
  mesh_pillar_left_0_7.castShadow = options.castShadow ?? true;
  mesh_pillar_left_0_7.receiveShadow = options.receiveShadow ?? true;
  node_pillar_left_0_7.add(mesh_pillar_left_0_7);
  meshes["pillar-left-0"] = mesh_pillar_left_0_7;
  colliders["pillar-left-0"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar left 0."};
  destructionGroups["pillar-left-0"] ??= [];
  destructionGroups["pillar-left-0"].push(node_pillar_left_0_7);

  const endpoint_pillar_left_1_8 = makeAttachmentEndpoint(null);
  const node_pillar_left_1_8 = new THREE.Group();
  node_pillar_left_1_8.name = "Window pillar left 1__pivot";
  node_pillar_left_1_8.scale.set(1, 1, 1);
  if (endpoint_pillar_left_1_8) {
    node_pillar_left_1_8.position.copy(endpoint_pillar_left_1_8.start);
    node_pillar_left_1_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_left_1_8.position.set(-0.477, 1.5, -0.983);
    node_pillar_left_1_8.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_left_1_8);
  nodes["pillar-left-1"] = node_pillar_left_1_8;
  const mesh_pillar_left_1_8Geometry = endpoint_pillar_left_1_8
    ? new THREE.CylinderGeometry(endpoint_pillar_left_1_8.endRadius, endpoint_pillar_left_1_8.baseRadius, endpoint_pillar_left_1_8.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_left_1_8) {
    mesh_pillar_left_1_8Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_left_1_8 = new THREE.Mesh(
    mesh_pillar_left_1_8Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_left_1_8.name = "Window pillar left 1";
  if (endpoint_pillar_left_1_8) {
    mesh_pillar_left_1_8.position.copy(endpoint_pillar_left_1_8.midpoint);
    mesh_pillar_left_1_8.quaternion.copy(endpoint_pillar_left_1_8.quaternion);
  }
  mesh_pillar_left_1_8.castShadow = options.castShadow ?? true;
  mesh_pillar_left_1_8.receiveShadow = options.receiveShadow ?? true;
  node_pillar_left_1_8.add(mesh_pillar_left_1_8);
  meshes["pillar-left-1"] = mesh_pillar_left_1_8;
  colliders["pillar-left-1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar left 1."};
  destructionGroups["pillar-left-1"] ??= [];
  destructionGroups["pillar-left-1"].push(node_pillar_left_1_8);

  const endpoint_pillar_left_2_9 = makeAttachmentEndpoint(null);
  const node_pillar_left_2_9 = new THREE.Group();
  node_pillar_left_2_9.name = "Window pillar left 2__pivot";
  node_pillar_left_2_9.scale.set(1, 1, 1);
  if (endpoint_pillar_left_2_9) {
    node_pillar_left_2_9.position.copy(endpoint_pillar_left_2_9.start);
    node_pillar_left_2_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pillar_left_2_9.position.set(0.516, 1.5, -0.983);
    node_pillar_left_2_9.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_pillar_left_2_9);
  nodes["pillar-left-2"] = node_pillar_left_2_9;
  const mesh_pillar_left_2_9Geometry = endpoint_pillar_left_2_9
    ? new THREE.CylinderGeometry(endpoint_pillar_left_2_9.endRadius, endpoint_pillar_left_2_9.baseRadius, endpoint_pillar_left_2_9.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_pillar_left_2_9) {
    mesh_pillar_left_2_9Geometry.scale(0.07, 0.915, 0.01);
  }
  const mesh_pillar_left_2_9 = new THREE.Mesh(
    mesh_pillar_left_2_9Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pillar_left_2_9.name = "Window pillar left 2";
  if (endpoint_pillar_left_2_9) {
    mesh_pillar_left_2_9.position.copy(endpoint_pillar_left_2_9.midpoint);
    mesh_pillar_left_2_9.quaternion.copy(endpoint_pillar_left_2_9.quaternion);
  }
  mesh_pillar_left_2_9.castShadow = options.castShadow ?? true;
  mesh_pillar_left_2_9.receiveShadow = options.receiveShadow ?? true;
  node_pillar_left_2_9.add(mesh_pillar_left_2_9);
  meshes["pillar-left-2"] = mesh_pillar_left_2_9;
  colliders["pillar-left-2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Window pillar left 2."};
  destructionGroups["pillar-left-2"] ??= [];
  destructionGroups["pillar-left-2"].push(node_pillar_left_2_9);

  const endpoint_windshield_10 = makeAttachmentEndpoint(null);
  const node_windshield_10 = new THREE.Group();
  node_windshield_10.name = "Windshield__pivot";
  node_windshield_10.scale.set(1, 1, 1);
  if (endpoint_windshield_10) {
    node_windshield_10.position.copy(endpoint_windshield_10.start);
    node_windshield_10.rotation.set(0.0, 0.0, 0.54);
  } else {
    node_windshield_10.position.set(2.28, 1.3800000000000001, 0.0);
    node_windshield_10.rotation.set(0.0, 0.0, 0.54);
  }
  (nodes["chassis"] ?? root).add(node_windshield_10);
  nodes["windshield"] = node_windshield_10;
  const mesh_windshield_10Geometry = endpoint_windshield_10
    ? new THREE.CylinderGeometry(endpoint_windshield_10.endRadius, endpoint_windshield_10.baseRadius, endpoint_windshield_10.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_windshield_10) {
    mesh_windshield_10Geometry.scale(0.02, 1.12, 1.78);
  }
  const mesh_windshield_10 = new THREE.Mesh(
    mesh_windshield_10Geometry,
    materialMap["glass-tint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_windshield_10.name = "Windshield";
  if (endpoint_windshield_10) {
    mesh_windshield_10.position.copy(endpoint_windshield_10.midpoint);
    mesh_windshield_10.quaternion.copy(endpoint_windshield_10.quaternion);
  }
  mesh_windshield_10.castShadow = options.castShadow ?? true;
  mesh_windshield_10.receiveShadow = options.receiveShadow ?? true;
  node_windshield_10.add(mesh_windshield_10);
  meshes["windshield"] = mesh_windshield_10;
  colliders["windshield"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Windshield."};
  destructionGroups["windshield"] ??= [];
  destructionGroups["windshield"].push(node_windshield_10);

  const endpoint_lower_cladding_11 = makeAttachmentEndpoint(null);
  const node_lower_cladding_11 = new THREE.Group();
  node_lower_cladding_11.name = "Lower cladding strip__pivot";
  node_lower_cladding_11.scale.set(1, 1, 1);
  if (endpoint_lower_cladding_11) {
    node_lower_cladding_11.position.copy(endpoint_lower_cladding_11.start);
    node_lower_cladding_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lower_cladding_11.position.set(-0.115, 0.18, 0.0);
    node_lower_cladding_11.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_lower_cladding_11);
  nodes["lower-cladding"] = node_lower_cladding_11;
  const mesh_lower_cladding_11Geometry = endpoint_lower_cladding_11
    ? new THREE.CylinderGeometry(endpoint_lower_cladding_11.endRadius, endpoint_lower_cladding_11.baseRadius, endpoint_lower_cladding_11.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_lower_cladding_11) {
    mesh_lower_cladding_11Geometry.scale(2.63, 0.28, 1.98);
  }
  const mesh_lower_cladding_11 = new THREE.Mesh(
    mesh_lower_cladding_11Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lower_cladding_11.name = "Lower cladding strip";
  if (endpoint_lower_cladding_11) {
    mesh_lower_cladding_11.position.copy(endpoint_lower_cladding_11.midpoint);
    mesh_lower_cladding_11.quaternion.copy(endpoint_lower_cladding_11.quaternion);
  }
  mesh_lower_cladding_11.castShadow = options.castShadow ?? true;
  mesh_lower_cladding_11.receiveShadow = options.receiveShadow ?? true;
  node_lower_cladding_11.add(mesh_lower_cladding_11);
  meshes["lower-cladding"] = mesh_lower_cladding_11;
  colliders["lower-cladding"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Lower cladding strip."};
  destructionGroups["lower-cladding"] ??= [];
  destructionGroups["lower-cladding"].push(node_lower_cladding_11);

  const endpoint_rear_bumper_12 = makeAttachmentEndpoint(null);
  const node_rear_bumper_12 = new THREE.Group();
  node_rear_bumper_12.name = "Rear bumper__pivot";
  node_rear_bumper_12.scale.set(1, 1, 1);
  if (endpoint_rear_bumper_12) {
    node_rear_bumper_12.position.copy(endpoint_rear_bumper_12.start);
    node_rear_bumper_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rear_bumper_12.position.set(-2.715, 0.16, 0.0);
    node_rear_bumper_12.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_rear_bumper_12);
  nodes["rear-bumper"] = node_rear_bumper_12;
  const mesh_rear_bumper_12Geometry = endpoint_rear_bumper_12
    ? new THREE.CylinderGeometry(endpoint_rear_bumper_12.endRadius, endpoint_rear_bumper_12.baseRadius, endpoint_rear_bumper_12.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_rear_bumper_12) {
    mesh_rear_bumper_12Geometry.scale(0.53, 0.3, 1.99);
  }
  const mesh_rear_bumper_12 = new THREE.Mesh(
    mesh_rear_bumper_12Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rear_bumper_12.name = "Rear bumper";
  if (endpoint_rear_bumper_12) {
    mesh_rear_bumper_12.position.copy(endpoint_rear_bumper_12.midpoint);
    mesh_rear_bumper_12.quaternion.copy(endpoint_rear_bumper_12.quaternion);
  }
  mesh_rear_bumper_12.castShadow = options.castShadow ?? true;
  mesh_rear_bumper_12.receiveShadow = options.receiveShadow ?? true;
  node_rear_bumper_12.add(mesh_rear_bumper_12);
  meshes["rear-bumper"] = mesh_rear_bumper_12;
  colliders["rear-bumper"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Rear bumper."};
  destructionGroups["rear-bumper"] ??= [];
  destructionGroups["rear-bumper"].push(node_rear_bumper_12);

  const endpoint_front_bumper_13 = makeAttachmentEndpoint(null);
  const node_front_bumper_13 = new THREE.Group();
  node_front_bumper_13.name = "Front bumper__pivot";
  node_front_bumper_13.scale.set(1, 1, 1);
  if (endpoint_front_bumper_13) {
    node_front_bumper_13.position.copy(endpoint_front_bumper_13.start);
    node_front_bumper_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_bumper_13.position.set(2.68, 0.18, 0.0);
    node_front_bumper_13.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_front_bumper_13);
  nodes["front-bumper"] = node_front_bumper_13;
  const mesh_front_bumper_13Geometry = endpoint_front_bumper_13
    ? new THREE.CylinderGeometry(endpoint_front_bumper_13.endRadius, endpoint_front_bumper_13.baseRadius, endpoint_front_bumper_13.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_front_bumper_13) {
    mesh_front_bumper_13Geometry.scale(0.64, 0.36, 1.99);
  }
  const mesh_front_bumper_13 = new THREE.Mesh(
    mesh_front_bumper_13Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_bumper_13.name = "Front bumper";
  if (endpoint_front_bumper_13) {
    mesh_front_bumper_13.position.copy(endpoint_front_bumper_13.midpoint);
    mesh_front_bumper_13.quaternion.copy(endpoint_front_bumper_13.quaternion);
  }
  mesh_front_bumper_13.castShadow = options.castShadow ?? true;
  mesh_front_bumper_13.receiveShadow = options.receiveShadow ?? true;
  node_front_bumper_13.add(mesh_front_bumper_13);
  meshes["front-bumper"] = mesh_front_bumper_13;
  colliders["front-bumper"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Front bumper."};
  destructionGroups["front-bumper"] ??= [];
  destructionGroups["front-bumper"].push(node_front_bumper_13);

  const endpoint_marker_right_rear_14 = makeAttachmentEndpoint(null);
  const node_marker_right_rear_14 = new THREE.Group();
  node_marker_right_rear_14.name = "Side marker lamp (marker-right-rear)__pivot";
  node_marker_right_rear_14.scale.set(1, 1, 1);
  if (endpoint_marker_right_rear_14) {
    node_marker_right_rear_14.position.copy(endpoint_marker_right_rear_14.start);
    node_marker_right_rear_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_marker_right_rear_14.position.set(-1.38, 0.22, 0.993);
    node_marker_right_rear_14.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_marker_right_rear_14);
  nodes["marker-right-rear"] = node_marker_right_rear_14;
  const mesh_marker_right_rear_14Geometry = endpoint_marker_right_rear_14
    ? new THREE.CylinderGeometry(endpoint_marker_right_rear_14.endRadius, endpoint_marker_right_rear_14.baseRadius, endpoint_marker_right_rear_14.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_marker_right_rear_14) {
    mesh_marker_right_rear_14Geometry.scale(0.1, 0.05, 0.012);
  }
  const mesh_marker_right_rear_14 = new THREE.Mesh(
    mesh_marker_right_rear_14Geometry,
    materialMap["lamp-orange"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_marker_right_rear_14.name = "Side marker lamp (marker-right-rear)";
  if (endpoint_marker_right_rear_14) {
    mesh_marker_right_rear_14.position.copy(endpoint_marker_right_rear_14.midpoint);
    mesh_marker_right_rear_14.quaternion.copy(endpoint_marker_right_rear_14.quaternion);
  }
  mesh_marker_right_rear_14.castShadow = options.castShadow ?? true;
  mesh_marker_right_rear_14.receiveShadow = options.receiveShadow ?? true;
  node_marker_right_rear_14.add(mesh_marker_right_rear_14);
  meshes["marker-right-rear"] = mesh_marker_right_rear_14;
  colliders["marker-right-rear"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side marker lamp."};
  destructionGroups["marker-right-rear"] ??= [];
  destructionGroups["marker-right-rear"].push(node_marker_right_rear_14);

  const endpoint_marker_left_rear_15 = makeAttachmentEndpoint(null);
  const node_marker_left_rear_15 = new THREE.Group();
  node_marker_left_rear_15.name = "Side marker lamp (marker-left-rear)__pivot";
  node_marker_left_rear_15.scale.set(1, 1, 1);
  if (endpoint_marker_left_rear_15) {
    node_marker_left_rear_15.position.copy(endpoint_marker_left_rear_15.start);
    node_marker_left_rear_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_marker_left_rear_15.position.set(-1.38, 0.22, -0.993);
    node_marker_left_rear_15.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_marker_left_rear_15);
  nodes["marker-left-rear"] = node_marker_left_rear_15;
  const mesh_marker_left_rear_15Geometry = endpoint_marker_left_rear_15
    ? new THREE.CylinderGeometry(endpoint_marker_left_rear_15.endRadius, endpoint_marker_left_rear_15.baseRadius, endpoint_marker_left_rear_15.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_marker_left_rear_15) {
    mesh_marker_left_rear_15Geometry.scale(0.1, 0.05, 0.012);
  }
  const mesh_marker_left_rear_15 = new THREE.Mesh(
    mesh_marker_left_rear_15Geometry,
    materialMap["lamp-orange"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_marker_left_rear_15.name = "Side marker lamp (marker-left-rear)";
  if (endpoint_marker_left_rear_15) {
    mesh_marker_left_rear_15.position.copy(endpoint_marker_left_rear_15.midpoint);
    mesh_marker_left_rear_15.quaternion.copy(endpoint_marker_left_rear_15.quaternion);
  }
  mesh_marker_left_rear_15.castShadow = options.castShadow ?? true;
  mesh_marker_left_rear_15.receiveShadow = options.receiveShadow ?? true;
  node_marker_left_rear_15.add(mesh_marker_left_rear_15);
  meshes["marker-left-rear"] = mesh_marker_left_rear_15;
  colliders["marker-left-rear"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side marker lamp."};
  destructionGroups["marker-left-rear"] ??= [];
  destructionGroups["marker-left-rear"].push(node_marker_left_rear_15);

  const endpoint_marker_right_front_16 = makeAttachmentEndpoint(null);
  const node_marker_right_front_16 = new THREE.Group();
  node_marker_right_front_16.name = "Side marker lamp (marker-right-front)__pivot";
  node_marker_right_front_16.scale.set(1, 1, 1);
  if (endpoint_marker_right_front_16) {
    node_marker_right_front_16.position.copy(endpoint_marker_right_front_16.start);
    node_marker_right_front_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_marker_right_front_16.position.set(1.192, 0.22, 0.993);
    node_marker_right_front_16.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_marker_right_front_16);
  nodes["marker-right-front"] = node_marker_right_front_16;
  const mesh_marker_right_front_16Geometry = endpoint_marker_right_front_16
    ? new THREE.CylinderGeometry(endpoint_marker_right_front_16.endRadius, endpoint_marker_right_front_16.baseRadius, endpoint_marker_right_front_16.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_marker_right_front_16) {
    mesh_marker_right_front_16Geometry.scale(0.1, 0.05, 0.012);
  }
  const mesh_marker_right_front_16 = new THREE.Mesh(
    mesh_marker_right_front_16Geometry,
    materialMap["lamp-orange"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_marker_right_front_16.name = "Side marker lamp (marker-right-front)";
  if (endpoint_marker_right_front_16) {
    mesh_marker_right_front_16.position.copy(endpoint_marker_right_front_16.midpoint);
    mesh_marker_right_front_16.quaternion.copy(endpoint_marker_right_front_16.quaternion);
  }
  mesh_marker_right_front_16.castShadow = options.castShadow ?? true;
  mesh_marker_right_front_16.receiveShadow = options.receiveShadow ?? true;
  node_marker_right_front_16.add(mesh_marker_right_front_16);
  meshes["marker-right-front"] = mesh_marker_right_front_16;
  colliders["marker-right-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side marker lamp."};
  destructionGroups["marker-right-front"] ??= [];
  destructionGroups["marker-right-front"].push(node_marker_right_front_16);

  const endpoint_marker_left_front_17 = makeAttachmentEndpoint(null);
  const node_marker_left_front_17 = new THREE.Group();
  node_marker_left_front_17.name = "Side marker lamp (marker-left-front)__pivot";
  node_marker_left_front_17.scale.set(1, 1, 1);
  if (endpoint_marker_left_front_17) {
    node_marker_left_front_17.position.copy(endpoint_marker_left_front_17.start);
    node_marker_left_front_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_marker_left_front_17.position.set(1.192, 0.22, -0.993);
    node_marker_left_front_17.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_marker_left_front_17);
  nodes["marker-left-front"] = node_marker_left_front_17;
  const mesh_marker_left_front_17Geometry = endpoint_marker_left_front_17
    ? new THREE.CylinderGeometry(endpoint_marker_left_front_17.endRadius, endpoint_marker_left_front_17.baseRadius, endpoint_marker_left_front_17.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_marker_left_front_17) {
    mesh_marker_left_front_17Geometry.scale(0.1, 0.05, 0.012);
  }
  const mesh_marker_left_front_17 = new THREE.Mesh(
    mesh_marker_left_front_17Geometry,
    materialMap["lamp-orange"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_marker_left_front_17.name = "Side marker lamp (marker-left-front)";
  if (endpoint_marker_left_front_17) {
    mesh_marker_left_front_17.position.copy(endpoint_marker_left_front_17.midpoint);
    mesh_marker_left_front_17.quaternion.copy(endpoint_marker_left_front_17.quaternion);
  }
  mesh_marker_left_front_17.castShadow = options.castShadow ?? true;
  mesh_marker_left_front_17.receiveShadow = options.receiveShadow ?? true;
  node_marker_left_front_17.add(mesh_marker_left_front_17);
  meshes["marker-left-front"] = mesh_marker_left_front_17;
  colliders["marker-left-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Side marker lamp."};
  destructionGroups["marker-left-front"] ??= [];
  destructionGroups["marker-left-front"].push(node_marker_left_front_17);

  const endpoint_tail_lamp_right_18 = makeAttachmentEndpoint(null);
  const node_tail_lamp_right_18 = new THREE.Group();
  node_tail_lamp_right_18.name = "Tail lamp column (tail-lamp-right)__pivot";
  node_tail_lamp_right_18.scale.set(1, 1, 1);
  if (endpoint_tail_lamp_right_18) {
    node_tail_lamp_right_18.position.copy(endpoint_tail_lamp_right_18.start);
    node_tail_lamp_right_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tail_lamp_right_18.position.set(-2.955, 0.724, 0.82);
    node_tail_lamp_right_18.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_tail_lamp_right_18);
  nodes["tail-lamp-right"] = node_tail_lamp_right_18;
  const mesh_tail_lamp_right_18Geometry = endpoint_tail_lamp_right_18
    ? new THREE.CylinderGeometry(endpoint_tail_lamp_right_18.endRadius, endpoint_tail_lamp_right_18.baseRadius, endpoint_tail_lamp_right_18.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_tail_lamp_right_18) {
    mesh_tail_lamp_right_18Geometry.scale(0.02, 0.57, 0.12);
  }
  const mesh_tail_lamp_right_18 = new THREE.Mesh(
    mesh_tail_lamp_right_18Geometry,
    materialMap["lamp-red"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tail_lamp_right_18.name = "Tail lamp column (tail-lamp-right)";
  if (endpoint_tail_lamp_right_18) {
    mesh_tail_lamp_right_18.position.copy(endpoint_tail_lamp_right_18.midpoint);
    mesh_tail_lamp_right_18.quaternion.copy(endpoint_tail_lamp_right_18.quaternion);
  }
  mesh_tail_lamp_right_18.castShadow = options.castShadow ?? true;
  mesh_tail_lamp_right_18.receiveShadow = options.receiveShadow ?? true;
  node_tail_lamp_right_18.add(mesh_tail_lamp_right_18);
  meshes["tail-lamp-right"] = mesh_tail_lamp_right_18;
  colliders["tail-lamp-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tail lamp column."};
  destructionGroups["tail-lamp-right"] ??= [];
  destructionGroups["tail-lamp-right"].push(node_tail_lamp_right_18);

  const endpoint_tail_lamp_left_19 = makeAttachmentEndpoint(null);
  const node_tail_lamp_left_19 = new THREE.Group();
  node_tail_lamp_left_19.name = "Tail lamp column (tail-lamp-left)__pivot";
  node_tail_lamp_left_19.scale.set(1, 1, 1);
  if (endpoint_tail_lamp_left_19) {
    node_tail_lamp_left_19.position.copy(endpoint_tail_lamp_left_19.start);
    node_tail_lamp_left_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tail_lamp_left_19.position.set(-2.955, 0.724, -0.82);
    node_tail_lamp_left_19.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_tail_lamp_left_19);
  nodes["tail-lamp-left"] = node_tail_lamp_left_19;
  const mesh_tail_lamp_left_19Geometry = endpoint_tail_lamp_left_19
    ? new THREE.CylinderGeometry(endpoint_tail_lamp_left_19.endRadius, endpoint_tail_lamp_left_19.baseRadius, endpoint_tail_lamp_left_19.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_tail_lamp_left_19) {
    mesh_tail_lamp_left_19Geometry.scale(0.02, 0.57, 0.12);
  }
  const mesh_tail_lamp_left_19 = new THREE.Mesh(
    mesh_tail_lamp_left_19Geometry,
    materialMap["lamp-red"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tail_lamp_left_19.name = "Tail lamp column (tail-lamp-left)";
  if (endpoint_tail_lamp_left_19) {
    mesh_tail_lamp_left_19.position.copy(endpoint_tail_lamp_left_19.midpoint);
    mesh_tail_lamp_left_19.quaternion.copy(endpoint_tail_lamp_left_19.quaternion);
  }
  mesh_tail_lamp_left_19.castShadow = options.castShadow ?? true;
  mesh_tail_lamp_left_19.receiveShadow = options.receiveShadow ?? true;
  node_tail_lamp_left_19.add(mesh_tail_lamp_left_19);
  meshes["tail-lamp-left"] = mesh_tail_lamp_left_19;
  colliders["tail-lamp-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tail lamp column."};
  destructionGroups["tail-lamp-left"] ??= [];
  destructionGroups["tail-lamp-left"].push(node_tail_lamp_left_19);

  const endpoint_door_handle_front_20 = makeAttachmentEndpoint(null);
  const node_door_handle_front_20 = new THREE.Group();
  node_door_handle_front_20.name = "Door handle (door-handle-front)__pivot";
  node_door_handle_front_20.scale.set(1, 1, 1);
  if (endpoint_door_handle_front_20) {
    node_door_handle_front_20.position.copy(endpoint_door_handle_front_20.start);
    node_door_handle_front_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_door_handle_front_20.position.set(1.31, 1.037, 0.987);
    node_door_handle_front_20.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_door_handle_front_20);
  nodes["door-handle-front"] = node_door_handle_front_20;
  const mesh_door_handle_front_20Geometry = endpoint_door_handle_front_20
    ? new THREE.CylinderGeometry(endpoint_door_handle_front_20.endRadius, endpoint_door_handle_front_20.baseRadius, endpoint_door_handle_front_20.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_door_handle_front_20) {
    mesh_door_handle_front_20Geometry.scale(0.2, 0.045, 0.02);
  }
  const mesh_door_handle_front_20 = new THREE.Mesh(
    mesh_door_handle_front_20Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_door_handle_front_20.name = "Door handle (door-handle-front)";
  if (endpoint_door_handle_front_20) {
    mesh_door_handle_front_20.position.copy(endpoint_door_handle_front_20.midpoint);
    mesh_door_handle_front_20.quaternion.copy(endpoint_door_handle_front_20.quaternion);
  }
  mesh_door_handle_front_20.castShadow = options.castShadow ?? true;
  mesh_door_handle_front_20.receiveShadow = options.receiveShadow ?? true;
  node_door_handle_front_20.add(mesh_door_handle_front_20);
  meshes["door-handle-front"] = mesh_door_handle_front_20;
  colliders["door-handle-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Door handle."};
  destructionGroups["door-handle-front"] ??= [];
  destructionGroups["door-handle-front"].push(node_door_handle_front_20);

  const endpoint_door_handle_slide_21 = makeAttachmentEndpoint(null);
  const node_door_handle_slide_21 = new THREE.Group();
  node_door_handle_slide_21.name = "Door handle (door-handle-slide)__pivot";
  node_door_handle_slide_21.scale.set(1, 1, 1);
  if (endpoint_door_handle_slide_21) {
    node_door_handle_slide_21.position.copy(endpoint_door_handle_slide_21.start);
    node_door_handle_slide_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_door_handle_slide_21.position.set(-0.1, 1.07, 0.987);
    node_door_handle_slide_21.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_door_handle_slide_21);
  nodes["door-handle-slide"] = node_door_handle_slide_21;
  const mesh_door_handle_slide_21Geometry = endpoint_door_handle_slide_21
    ? new THREE.CylinderGeometry(endpoint_door_handle_slide_21.endRadius, endpoint_door_handle_slide_21.baseRadius, endpoint_door_handle_slide_21.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_door_handle_slide_21) {
    mesh_door_handle_slide_21Geometry.scale(0.2, 0.045, 0.02);
  }
  const mesh_door_handle_slide_21 = new THREE.Mesh(
    mesh_door_handle_slide_21Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_door_handle_slide_21.name = "Door handle (door-handle-slide)";
  if (endpoint_door_handle_slide_21) {
    mesh_door_handle_slide_21.position.copy(endpoint_door_handle_slide_21.midpoint);
    mesh_door_handle_slide_21.quaternion.copy(endpoint_door_handle_slide_21.quaternion);
  }
  mesh_door_handle_slide_21.castShadow = options.castShadow ?? true;
  mesh_door_handle_slide_21.receiveShadow = options.receiveShadow ?? true;
  node_door_handle_slide_21.add(mesh_door_handle_slide_21);
  meshes["door-handle-slide"] = mesh_door_handle_slide_21;
  colliders["door-handle-slide"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Door handle."};
  destructionGroups["door-handle-slide"] ??= [];
  destructionGroups["door-handle-slide"].push(node_door_handle_slide_21);

  const attachment_student_decal_22 = {"parentSocket": "body-shell-hub", "contactType": "socket", "localStart": [-0.901, 0.734, 0.975], "localEnd": [-0.901, 0.734, 0.981], "baseRadius": 0.3, "endRadius": 0.3, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_student_decal_22 = makeAttachmentEndpoint(attachment_student_decal_22);
  const node_student_decal_22 = new THREE.Group();
  node_student_decal_22.name = "Student transport decal__pivot";
  node_student_decal_22.scale.set(1, 1, 1);
  if (endpoint_student_decal_22) {
    node_student_decal_22.position.copy(endpoint_student_decal_22.start);
    node_student_decal_22.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_student_decal_22.position.set(0.0, 0.0, 0.0);
    node_student_decal_22.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_student_decal_22);
  nodes["student-decal"] = node_student_decal_22;
  const mesh_student_decal_22Geometry = endpoint_student_decal_22
    ? new THREE.CylinderGeometry(endpoint_student_decal_22.endRadius, endpoint_student_decal_22.baseRadius, endpoint_student_decal_22.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_student_decal_22) {
    mesh_student_decal_22Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_student_decal_22 = new THREE.Mesh(
    mesh_student_decal_22Geometry,
    materialMap["decal-navy"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_student_decal_22.name = "Student transport decal";
  if (endpoint_student_decal_22) {
    mesh_student_decal_22.position.copy(endpoint_student_decal_22.midpoint);
    mesh_student_decal_22.quaternion.copy(endpoint_student_decal_22.quaternion);
  }
  mesh_student_decal_22.castShadow = options.castShadow ?? true;
  mesh_student_decal_22.receiveShadow = options.receiveShadow ?? true;
  node_student_decal_22.add(mesh_student_decal_22);
  meshes["student-decal"] = mesh_student_decal_22;
  colliders["student-decal"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Student transport decal."};
  destructionGroups["student-decal"] ??= [];
  destructionGroups["student-decal"].push(node_student_decal_22);

  const attachment_wheel_rear_right_23 = {"parentSocket": "chassis-hub", "contactType": "socket", "localStart": [-1.95, -0.07, 0.7], "localEnd": [-1.95, -0.07, 0.96], "baseRadius": 0.38, "endRadius": 0.38, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_wheel_rear_right_23 = makeAttachmentEndpoint(attachment_wheel_rear_right_23);
  const node_wheel_rear_right_23 = new THREE.Group();
  node_wheel_rear_right_23.name = "Tire wheel-rear-right__pivot";
  node_wheel_rear_right_23.scale.set(1, 1, 1);
  if (endpoint_wheel_rear_right_23) {
    node_wheel_rear_right_23.position.copy(endpoint_wheel_rear_right_23.start);
    node_wheel_rear_right_23.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_rear_right_23.position.set(0.0, 0.0, 0.0);
    node_wheel_rear_right_23.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_wheel_rear_right_23);
  nodes["wheel-rear-right"] = node_wheel_rear_right_23;
  const mesh_wheel_rear_right_23Geometry = endpoint_wheel_rear_right_23
    ? new THREE.CylinderGeometry(endpoint_wheel_rear_right_23.endRadius, endpoint_wheel_rear_right_23.baseRadius, endpoint_wheel_rear_right_23.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_rear_right_23) {
    mesh_wheel_rear_right_23Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_rear_right_23 = new THREE.Mesh(
    mesh_wheel_rear_right_23Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_rear_right_23.name = "Tire wheel-rear-right";
  if (endpoint_wheel_rear_right_23) {
    mesh_wheel_rear_right_23.position.copy(endpoint_wheel_rear_right_23.midpoint);
    mesh_wheel_rear_right_23.quaternion.copy(endpoint_wheel_rear_right_23.quaternion);
  }
  mesh_wheel_rear_right_23.castShadow = options.castShadow ?? true;
  mesh_wheel_rear_right_23.receiveShadow = options.receiveShadow ?? true;
  node_wheel_rear_right_23.add(mesh_wheel_rear_right_23);
  meshes["wheel-rear-right"] = mesh_wheel_rear_right_23;
  colliders["wheel-rear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tire wheel-rear-right."};
  destructionGroups["wheel-rear-right"] ??= [];
  destructionGroups["wheel-rear-right"].push(node_wheel_rear_right_23);

  const attachment_rim_rear_right_24 = {"parentSocket": "wheel-rear-right-hub", "contactType": "socket", "localStart": [0, 0, 0.255], "localEnd": [0, 0, 0.277], "baseRadius": 0.23, "endRadius": 0.23, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_rim_rear_right_24 = makeAttachmentEndpoint(attachment_rim_rear_right_24);
  const node_rim_rear_right_24 = new THREE.Group();
  node_rim_rear_right_24.name = "Steel rim (rim-rear-right)__pivot";
  node_rim_rear_right_24.scale.set(1, 1, 1);
  if (endpoint_rim_rear_right_24) {
    node_rim_rear_right_24.position.copy(endpoint_rim_rear_right_24.start);
    node_rim_rear_right_24.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rim_rear_right_24.position.set(0.0, 0.0, 0.0);
    node_rim_rear_right_24.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-rear-right"] ?? root).add(node_rim_rear_right_24);
  nodes["rim-rear-right"] = node_rim_rear_right_24;
  const mesh_rim_rear_right_24Geometry = endpoint_rim_rear_right_24
    ? new THREE.CylinderGeometry(endpoint_rim_rear_right_24.endRadius, endpoint_rim_rear_right_24.baseRadius, endpoint_rim_rear_right_24.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_rim_rear_right_24) {
    mesh_rim_rear_right_24Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rim_rear_right_24 = new THREE.Mesh(
    mesh_rim_rear_right_24Geometry,
    materialMap["steel-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rim_rear_right_24.name = "Steel rim (rim-rear-right)";
  if (endpoint_rim_rear_right_24) {
    mesh_rim_rear_right_24.position.copy(endpoint_rim_rear_right_24.midpoint);
    mesh_rim_rear_right_24.quaternion.copy(endpoint_rim_rear_right_24.quaternion);
  }
  mesh_rim_rear_right_24.castShadow = options.castShadow ?? true;
  mesh_rim_rear_right_24.receiveShadow = options.receiveShadow ?? true;
  node_rim_rear_right_24.add(mesh_rim_rear_right_24);
  meshes["rim-rear-right"] = mesh_rim_rear_right_24;
  colliders["rim-rear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Steel rim."};
  destructionGroups["rim-rear-right"] ??= [];
  destructionGroups["rim-rear-right"].push(node_rim_rear_right_24);

  const attachment_hub_rear_right_25 = {"parentSocket": "wheel-rear-right-hub", "contactType": "socket", "localStart": [0, 0, 0.265], "localEnd": [0, 0, 0.28500000000000003], "baseRadius": 0.07, "endRadius": 0.07, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_hub_rear_right_25 = makeAttachmentEndpoint(attachment_hub_rear_right_25);
  const node_hub_rear_right_25 = new THREE.Group();
  node_hub_rear_right_25.name = "Hub cap (hub-rear-right)__pivot";
  node_hub_rear_right_25.scale.set(1, 1, 1);
  if (endpoint_hub_rear_right_25) {
    node_hub_rear_right_25.position.copy(endpoint_hub_rear_right_25.start);
    node_hub_rear_right_25.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hub_rear_right_25.position.set(0.0, 0.0, 0.0);
    node_hub_rear_right_25.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-rear-right"] ?? root).add(node_hub_rear_right_25);
  nodes["hub-rear-right"] = node_hub_rear_right_25;
  const mesh_hub_rear_right_25Geometry = endpoint_hub_rear_right_25
    ? new THREE.CylinderGeometry(endpoint_hub_rear_right_25.endRadius, endpoint_hub_rear_right_25.baseRadius, endpoint_hub_rear_right_25.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_hub_rear_right_25) {
    mesh_hub_rear_right_25Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hub_rear_right_25 = new THREE.Mesh(
    mesh_hub_rear_right_25Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hub_rear_right_25.name = "Hub cap (hub-rear-right)";
  if (endpoint_hub_rear_right_25) {
    mesh_hub_rear_right_25.position.copy(endpoint_hub_rear_right_25.midpoint);
    mesh_hub_rear_right_25.quaternion.copy(endpoint_hub_rear_right_25.quaternion);
  }
  mesh_hub_rear_right_25.castShadow = options.castShadow ?? true;
  mesh_hub_rear_right_25.receiveShadow = options.receiveShadow ?? true;
  node_hub_rear_right_25.add(mesh_hub_rear_right_25);
  meshes["hub-rear-right"] = mesh_hub_rear_right_25;
  colliders["hub-rear-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Hub cap."};
  destructionGroups["hub-rear-right"] ??= [];
  destructionGroups["hub-rear-right"].push(node_hub_rear_right_25);

  const attachment_wheel_front_right_26 = {"parentSocket": "chassis-hub", "contactType": "socket", "localStart": [1.72, -0.07, 0.7], "localEnd": [1.72, -0.07, 0.96], "baseRadius": 0.38, "endRadius": 0.38, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_wheel_front_right_26 = makeAttachmentEndpoint(attachment_wheel_front_right_26);
  const node_wheel_front_right_26 = new THREE.Group();
  node_wheel_front_right_26.name = "Tire wheel-front-right__pivot";
  node_wheel_front_right_26.scale.set(1, 1, 1);
  if (endpoint_wheel_front_right_26) {
    node_wheel_front_right_26.position.copy(endpoint_wheel_front_right_26.start);
    node_wheel_front_right_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_front_right_26.position.set(0.0, 0.0, 0.0);
    node_wheel_front_right_26.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_wheel_front_right_26);
  nodes["wheel-front-right"] = node_wheel_front_right_26;
  const mesh_wheel_front_right_26Geometry = endpoint_wheel_front_right_26
    ? new THREE.CylinderGeometry(endpoint_wheel_front_right_26.endRadius, endpoint_wheel_front_right_26.baseRadius, endpoint_wheel_front_right_26.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_front_right_26) {
    mesh_wheel_front_right_26Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_front_right_26 = new THREE.Mesh(
    mesh_wheel_front_right_26Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_front_right_26.name = "Tire wheel-front-right";
  if (endpoint_wheel_front_right_26) {
    mesh_wheel_front_right_26.position.copy(endpoint_wheel_front_right_26.midpoint);
    mesh_wheel_front_right_26.quaternion.copy(endpoint_wheel_front_right_26.quaternion);
  }
  mesh_wheel_front_right_26.castShadow = options.castShadow ?? true;
  mesh_wheel_front_right_26.receiveShadow = options.receiveShadow ?? true;
  node_wheel_front_right_26.add(mesh_wheel_front_right_26);
  meshes["wheel-front-right"] = mesh_wheel_front_right_26;
  colliders["wheel-front-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tire wheel-front-right."};
  destructionGroups["wheel-front-right"] ??= [];
  destructionGroups["wheel-front-right"].push(node_wheel_front_right_26);

  const attachment_rim_front_right_27 = {"parentSocket": "wheel-front-right-hub", "contactType": "socket", "localStart": [0, 0, 0.255], "localEnd": [0, 0, 0.277], "baseRadius": 0.23, "endRadius": 0.23, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_rim_front_right_27 = makeAttachmentEndpoint(attachment_rim_front_right_27);
  const node_rim_front_right_27 = new THREE.Group();
  node_rim_front_right_27.name = "Steel rim (rim-front-right)__pivot";
  node_rim_front_right_27.scale.set(1, 1, 1);
  if (endpoint_rim_front_right_27) {
    node_rim_front_right_27.position.copy(endpoint_rim_front_right_27.start);
    node_rim_front_right_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rim_front_right_27.position.set(0.0, 0.0, 0.0);
    node_rim_front_right_27.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-front-right"] ?? root).add(node_rim_front_right_27);
  nodes["rim-front-right"] = node_rim_front_right_27;
  const mesh_rim_front_right_27Geometry = endpoint_rim_front_right_27
    ? new THREE.CylinderGeometry(endpoint_rim_front_right_27.endRadius, endpoint_rim_front_right_27.baseRadius, endpoint_rim_front_right_27.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_rim_front_right_27) {
    mesh_rim_front_right_27Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rim_front_right_27 = new THREE.Mesh(
    mesh_rim_front_right_27Geometry,
    materialMap["steel-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rim_front_right_27.name = "Steel rim (rim-front-right)";
  if (endpoint_rim_front_right_27) {
    mesh_rim_front_right_27.position.copy(endpoint_rim_front_right_27.midpoint);
    mesh_rim_front_right_27.quaternion.copy(endpoint_rim_front_right_27.quaternion);
  }
  mesh_rim_front_right_27.castShadow = options.castShadow ?? true;
  mesh_rim_front_right_27.receiveShadow = options.receiveShadow ?? true;
  node_rim_front_right_27.add(mesh_rim_front_right_27);
  meshes["rim-front-right"] = mesh_rim_front_right_27;
  colliders["rim-front-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Steel rim."};
  destructionGroups["rim-front-right"] ??= [];
  destructionGroups["rim-front-right"].push(node_rim_front_right_27);

  const attachment_hub_front_right_28 = {"parentSocket": "wheel-front-right-hub", "contactType": "socket", "localStart": [0, 0, 0.265], "localEnd": [0, 0, 0.28500000000000003], "baseRadius": 0.07, "endRadius": 0.07, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_hub_front_right_28 = makeAttachmentEndpoint(attachment_hub_front_right_28);
  const node_hub_front_right_28 = new THREE.Group();
  node_hub_front_right_28.name = "Hub cap (hub-front-right)__pivot";
  node_hub_front_right_28.scale.set(1, 1, 1);
  if (endpoint_hub_front_right_28) {
    node_hub_front_right_28.position.copy(endpoint_hub_front_right_28.start);
    node_hub_front_right_28.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hub_front_right_28.position.set(0.0, 0.0, 0.0);
    node_hub_front_right_28.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-front-right"] ?? root).add(node_hub_front_right_28);
  nodes["hub-front-right"] = node_hub_front_right_28;
  const mesh_hub_front_right_28Geometry = endpoint_hub_front_right_28
    ? new THREE.CylinderGeometry(endpoint_hub_front_right_28.endRadius, endpoint_hub_front_right_28.baseRadius, endpoint_hub_front_right_28.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_hub_front_right_28) {
    mesh_hub_front_right_28Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hub_front_right_28 = new THREE.Mesh(
    mesh_hub_front_right_28Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hub_front_right_28.name = "Hub cap (hub-front-right)";
  if (endpoint_hub_front_right_28) {
    mesh_hub_front_right_28.position.copy(endpoint_hub_front_right_28.midpoint);
    mesh_hub_front_right_28.quaternion.copy(endpoint_hub_front_right_28.quaternion);
  }
  mesh_hub_front_right_28.castShadow = options.castShadow ?? true;
  mesh_hub_front_right_28.receiveShadow = options.receiveShadow ?? true;
  node_hub_front_right_28.add(mesh_hub_front_right_28);
  meshes["hub-front-right"] = mesh_hub_front_right_28;
  colliders["hub-front-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Hub cap."};
  destructionGroups["hub-front-right"] ??= [];
  destructionGroups["hub-front-right"].push(node_hub_front_right_28);

  const attachment_wheel_rear_left_29 = {"parentSocket": "chassis-hub", "contactType": "socket", "localStart": [-1.95, -0.07, -0.7], "localEnd": [-1.95, -0.07, -0.96], "baseRadius": 0.38, "endRadius": 0.38, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_wheel_rear_left_29 = makeAttachmentEndpoint(attachment_wheel_rear_left_29);
  const node_wheel_rear_left_29 = new THREE.Group();
  node_wheel_rear_left_29.name = "Tire wheel-rear-left__pivot";
  node_wheel_rear_left_29.scale.set(1, 1, 1);
  if (endpoint_wheel_rear_left_29) {
    node_wheel_rear_left_29.position.copy(endpoint_wheel_rear_left_29.start);
    node_wheel_rear_left_29.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_rear_left_29.position.set(0.0, 0.0, 0.0);
    node_wheel_rear_left_29.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_wheel_rear_left_29);
  nodes["wheel-rear-left"] = node_wheel_rear_left_29;
  const mesh_wheel_rear_left_29Geometry = endpoint_wheel_rear_left_29
    ? new THREE.CylinderGeometry(endpoint_wheel_rear_left_29.endRadius, endpoint_wheel_rear_left_29.baseRadius, endpoint_wheel_rear_left_29.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_rear_left_29) {
    mesh_wheel_rear_left_29Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_rear_left_29 = new THREE.Mesh(
    mesh_wheel_rear_left_29Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_rear_left_29.name = "Tire wheel-rear-left";
  if (endpoint_wheel_rear_left_29) {
    mesh_wheel_rear_left_29.position.copy(endpoint_wheel_rear_left_29.midpoint);
    mesh_wheel_rear_left_29.quaternion.copy(endpoint_wheel_rear_left_29.quaternion);
  }
  mesh_wheel_rear_left_29.castShadow = options.castShadow ?? true;
  mesh_wheel_rear_left_29.receiveShadow = options.receiveShadow ?? true;
  node_wheel_rear_left_29.add(mesh_wheel_rear_left_29);
  meshes["wheel-rear-left"] = mesh_wheel_rear_left_29;
  colliders["wheel-rear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tire wheel-rear-left."};
  destructionGroups["wheel-rear-left"] ??= [];
  destructionGroups["wheel-rear-left"].push(node_wheel_rear_left_29);

  const attachment_rim_rear_left_30 = {"parentSocket": "wheel-rear-left-hub", "contactType": "socket", "localStart": [0, 0, -0.255], "localEnd": [0, 0, -0.277], "baseRadius": 0.23, "endRadius": 0.23, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_rim_rear_left_30 = makeAttachmentEndpoint(attachment_rim_rear_left_30);
  const node_rim_rear_left_30 = new THREE.Group();
  node_rim_rear_left_30.name = "Steel rim (rim-rear-left)__pivot";
  node_rim_rear_left_30.scale.set(1, 1, 1);
  if (endpoint_rim_rear_left_30) {
    node_rim_rear_left_30.position.copy(endpoint_rim_rear_left_30.start);
    node_rim_rear_left_30.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rim_rear_left_30.position.set(0.0, 0.0, 0.0);
    node_rim_rear_left_30.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-rear-left"] ?? root).add(node_rim_rear_left_30);
  nodes["rim-rear-left"] = node_rim_rear_left_30;
  const mesh_rim_rear_left_30Geometry = endpoint_rim_rear_left_30
    ? new THREE.CylinderGeometry(endpoint_rim_rear_left_30.endRadius, endpoint_rim_rear_left_30.baseRadius, endpoint_rim_rear_left_30.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_rim_rear_left_30) {
    mesh_rim_rear_left_30Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rim_rear_left_30 = new THREE.Mesh(
    mesh_rim_rear_left_30Geometry,
    materialMap["steel-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rim_rear_left_30.name = "Steel rim (rim-rear-left)";
  if (endpoint_rim_rear_left_30) {
    mesh_rim_rear_left_30.position.copy(endpoint_rim_rear_left_30.midpoint);
    mesh_rim_rear_left_30.quaternion.copy(endpoint_rim_rear_left_30.quaternion);
  }
  mesh_rim_rear_left_30.castShadow = options.castShadow ?? true;
  mesh_rim_rear_left_30.receiveShadow = options.receiveShadow ?? true;
  node_rim_rear_left_30.add(mesh_rim_rear_left_30);
  meshes["rim-rear-left"] = mesh_rim_rear_left_30;
  colliders["rim-rear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Steel rim."};
  destructionGroups["rim-rear-left"] ??= [];
  destructionGroups["rim-rear-left"].push(node_rim_rear_left_30);

  const attachment_hub_rear_left_31 = {"parentSocket": "wheel-rear-left-hub", "contactType": "socket", "localStart": [0, 0, -0.265], "localEnd": [0, 0, -0.28500000000000003], "baseRadius": 0.07, "endRadius": 0.07, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_hub_rear_left_31 = makeAttachmentEndpoint(attachment_hub_rear_left_31);
  const node_hub_rear_left_31 = new THREE.Group();
  node_hub_rear_left_31.name = "Hub cap (hub-rear-left)__pivot";
  node_hub_rear_left_31.scale.set(1, 1, 1);
  if (endpoint_hub_rear_left_31) {
    node_hub_rear_left_31.position.copy(endpoint_hub_rear_left_31.start);
    node_hub_rear_left_31.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hub_rear_left_31.position.set(0.0, 0.0, 0.0);
    node_hub_rear_left_31.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-rear-left"] ?? root).add(node_hub_rear_left_31);
  nodes["hub-rear-left"] = node_hub_rear_left_31;
  const mesh_hub_rear_left_31Geometry = endpoint_hub_rear_left_31
    ? new THREE.CylinderGeometry(endpoint_hub_rear_left_31.endRadius, endpoint_hub_rear_left_31.baseRadius, endpoint_hub_rear_left_31.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_hub_rear_left_31) {
    mesh_hub_rear_left_31Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hub_rear_left_31 = new THREE.Mesh(
    mesh_hub_rear_left_31Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hub_rear_left_31.name = "Hub cap (hub-rear-left)";
  if (endpoint_hub_rear_left_31) {
    mesh_hub_rear_left_31.position.copy(endpoint_hub_rear_left_31.midpoint);
    mesh_hub_rear_left_31.quaternion.copy(endpoint_hub_rear_left_31.quaternion);
  }
  mesh_hub_rear_left_31.castShadow = options.castShadow ?? true;
  mesh_hub_rear_left_31.receiveShadow = options.receiveShadow ?? true;
  node_hub_rear_left_31.add(mesh_hub_rear_left_31);
  meshes["hub-rear-left"] = mesh_hub_rear_left_31;
  colliders["hub-rear-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Hub cap."};
  destructionGroups["hub-rear-left"] ??= [];
  destructionGroups["hub-rear-left"].push(node_hub_rear_left_31);

  const attachment_wheel_front_left_32 = {"parentSocket": "chassis-hub", "contactType": "socket", "localStart": [1.72, -0.07, -0.7], "localEnd": [1.72, -0.07, -0.96], "baseRadius": 0.38, "endRadius": 0.38, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_wheel_front_left_32 = makeAttachmentEndpoint(attachment_wheel_front_left_32);
  const node_wheel_front_left_32 = new THREE.Group();
  node_wheel_front_left_32.name = "Tire wheel-front-left__pivot";
  node_wheel_front_left_32.scale.set(1, 1, 1);
  if (endpoint_wheel_front_left_32) {
    node_wheel_front_left_32.position.copy(endpoint_wheel_front_left_32.start);
    node_wheel_front_left_32.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_front_left_32.position.set(0.0, 0.0, 0.0);
    node_wheel_front_left_32.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_wheel_front_left_32);
  nodes["wheel-front-left"] = node_wheel_front_left_32;
  const mesh_wheel_front_left_32Geometry = endpoint_wheel_front_left_32
    ? new THREE.CylinderGeometry(endpoint_wheel_front_left_32.endRadius, endpoint_wheel_front_left_32.baseRadius, endpoint_wheel_front_left_32.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_front_left_32) {
    mesh_wheel_front_left_32Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_front_left_32 = new THREE.Mesh(
    mesh_wheel_front_left_32Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_front_left_32.name = "Tire wheel-front-left";
  if (endpoint_wheel_front_left_32) {
    mesh_wheel_front_left_32.position.copy(endpoint_wheel_front_left_32.midpoint);
    mesh_wheel_front_left_32.quaternion.copy(endpoint_wheel_front_left_32.quaternion);
  }
  mesh_wheel_front_left_32.castShadow = options.castShadow ?? true;
  mesh_wheel_front_left_32.receiveShadow = options.receiveShadow ?? true;
  node_wheel_front_left_32.add(mesh_wheel_front_left_32);
  meshes["wheel-front-left"] = mesh_wheel_front_left_32;
  colliders["wheel-front-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Tire wheel-front-left."};
  destructionGroups["wheel-front-left"] ??= [];
  destructionGroups["wheel-front-left"].push(node_wheel_front_left_32);

  const attachment_rim_front_left_33 = {"parentSocket": "wheel-front-left-hub", "contactType": "socket", "localStart": [0, 0, -0.255], "localEnd": [0, 0, -0.277], "baseRadius": 0.23, "endRadius": 0.23, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_rim_front_left_33 = makeAttachmentEndpoint(attachment_rim_front_left_33);
  const node_rim_front_left_33 = new THREE.Group();
  node_rim_front_left_33.name = "Steel rim (rim-front-left)__pivot";
  node_rim_front_left_33.scale.set(1, 1, 1);
  if (endpoint_rim_front_left_33) {
    node_rim_front_left_33.position.copy(endpoint_rim_front_left_33.start);
    node_rim_front_left_33.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rim_front_left_33.position.set(0.0, 0.0, 0.0);
    node_rim_front_left_33.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-front-left"] ?? root).add(node_rim_front_left_33);
  nodes["rim-front-left"] = node_rim_front_left_33;
  const mesh_rim_front_left_33Geometry = endpoint_rim_front_left_33
    ? new THREE.CylinderGeometry(endpoint_rim_front_left_33.endRadius, endpoint_rim_front_left_33.baseRadius, endpoint_rim_front_left_33.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_rim_front_left_33) {
    mesh_rim_front_left_33Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rim_front_left_33 = new THREE.Mesh(
    mesh_rim_front_left_33Geometry,
    materialMap["steel-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rim_front_left_33.name = "Steel rim (rim-front-left)";
  if (endpoint_rim_front_left_33) {
    mesh_rim_front_left_33.position.copy(endpoint_rim_front_left_33.midpoint);
    mesh_rim_front_left_33.quaternion.copy(endpoint_rim_front_left_33.quaternion);
  }
  mesh_rim_front_left_33.castShadow = options.castShadow ?? true;
  mesh_rim_front_left_33.receiveShadow = options.receiveShadow ?? true;
  node_rim_front_left_33.add(mesh_rim_front_left_33);
  meshes["rim-front-left"] = mesh_rim_front_left_33;
  colliders["rim-front-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Steel rim."};
  destructionGroups["rim-front-left"] ??= [];
  destructionGroups["rim-front-left"].push(node_rim_front_left_33);

  const attachment_hub_front_left_34 = {"parentSocket": "wheel-front-left-hub", "contactType": "socket", "localStart": [0, 0, -0.265], "localEnd": [0, 0, -0.28500000000000003], "baseRadius": 0.07, "endRadius": 0.07, "embedDepth": 0.005, "gapTolerance": 0.01};
  const endpoint_hub_front_left_34 = makeAttachmentEndpoint(attachment_hub_front_left_34);
  const node_hub_front_left_34 = new THREE.Group();
  node_hub_front_left_34.name = "Hub cap (hub-front-left)__pivot";
  node_hub_front_left_34.scale.set(1, 1, 1);
  if (endpoint_hub_front_left_34) {
    node_hub_front_left_34.position.copy(endpoint_hub_front_left_34.start);
    node_hub_front_left_34.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hub_front_left_34.position.set(0.0, 0.0, 0.0);
    node_hub_front_left_34.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["wheel-front-left"] ?? root).add(node_hub_front_left_34);
  nodes["hub-front-left"] = node_hub_front_left_34;
  const mesh_hub_front_left_34Geometry = endpoint_hub_front_left_34
    ? new THREE.CylinderGeometry(endpoint_hub_front_left_34.endRadius, endpoint_hub_front_left_34.baseRadius, endpoint_hub_front_left_34.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_hub_front_left_34) {
    mesh_hub_front_left_34Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hub_front_left_34 = new THREE.Mesh(
    mesh_hub_front_left_34Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hub_front_left_34.name = "Hub cap (hub-front-left)";
  if (endpoint_hub_front_left_34) {
    mesh_hub_front_left_34.position.copy(endpoint_hub_front_left_34.midpoint);
    mesh_hub_front_left_34.quaternion.copy(endpoint_hub_front_left_34.quaternion);
  }
  mesh_hub_front_left_34.castShadow = options.castShadow ?? true;
  mesh_hub_front_left_34.receiveShadow = options.receiveShadow ?? true;
  node_hub_front_left_34.add(mesh_hub_front_left_34);
  meshes["hub-front-left"] = mesh_hub_front_left_34;
  colliders["hub-front-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Hub cap."};
  destructionGroups["hub-front-left"] ??= [];
  destructionGroups["hub-front-left"].push(node_hub_front_left_34);

  const endpoint_arch_liner_rear_35 = makeAttachmentEndpoint(null);
  const node_arch_liner_rear_35 = new THREE.Group();
  node_arch_liner_rear_35.name = "Wheel arch liner (rear)__pivot";
  node_arch_liner_rear_35.scale.set(1, 1, 1);
  if (endpoint_arch_liner_rear_35) {
    node_arch_liner_rear_35.position.copy(endpoint_arch_liner_rear_35.start);
    node_arch_liner_rear_35.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_arch_liner_rear_35.position.set(-1.95, 0.22999999999999993, 0.0);
    node_arch_liner_rear_35.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_arch_liner_rear_35);
  nodes["arch-liner-rear"] = node_arch_liner_rear_35;
  const mesh_arch_liner_rear_35Geometry = endpoint_arch_liner_rear_35
    ? new THREE.CylinderGeometry(endpoint_arch_liner_rear_35.endRadius, endpoint_arch_liner_rear_35.baseRadius, endpoint_arch_liner_rear_35.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_arch_liner_rear_35) {
    mesh_arch_liner_rear_35Geometry.scale(0.86, 0.32, 1.86);
  }
  const mesh_arch_liner_rear_35 = new THREE.Mesh(
    mesh_arch_liner_rear_35Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_arch_liner_rear_35.name = "Wheel arch liner (rear)";
  if (endpoint_arch_liner_rear_35) {
    mesh_arch_liner_rear_35.position.copy(endpoint_arch_liner_rear_35.midpoint);
    mesh_arch_liner_rear_35.quaternion.copy(endpoint_arch_liner_rear_35.quaternion);
  }
  mesh_arch_liner_rear_35.castShadow = options.castShadow ?? true;
  mesh_arch_liner_rear_35.receiveShadow = options.receiveShadow ?? true;
  node_arch_liner_rear_35.add(mesh_arch_liner_rear_35);
  meshes["arch-liner-rear"] = mesh_arch_liner_rear_35;
  colliders["arch-liner-rear"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Lower cladding strip."};
  destructionGroups["arch-liner-rear"] ??= [];
  destructionGroups["arch-liner-rear"].push(node_arch_liner_rear_35);

  const endpoint_arch_liner_front_36 = makeAttachmentEndpoint(null);
  const node_arch_liner_front_36 = new THREE.Group();
  node_arch_liner_front_36.name = "Wheel arch liner (front)__pivot";
  node_arch_liner_front_36.scale.set(1, 1, 1);
  if (endpoint_arch_liner_front_36) {
    node_arch_liner_front_36.position.copy(endpoint_arch_liner_front_36.start);
    node_arch_liner_front_36.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_arch_liner_front_36.position.set(1.72, 0.22999999999999993, 0.0);
    node_arch_liner_front_36.rotation.set(0.0, 0.0, 0.0);
  }
  (nodes["chassis"] ?? root).add(node_arch_liner_front_36);
  nodes["arch-liner-front"] = node_arch_liner_front_36;
  const mesh_arch_liner_front_36Geometry = endpoint_arch_liner_front_36
    ? new THREE.CylinderGeometry(endpoint_arch_liner_front_36.endRadius, endpoint_arch_liner_front_36.baseRadius, endpoint_arch_liner_front_36.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_arch_liner_front_36) {
    mesh_arch_liner_front_36Geometry.scale(0.86, 0.32, 1.86);
  }
  const mesh_arch_liner_front_36 = new THREE.Mesh(
    mesh_arch_liner_front_36Geometry,
    materialMap["plastic-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_arch_liner_front_36.name = "Wheel arch liner (front)";
  if (endpoint_arch_liner_front_36) {
    mesh_arch_liner_front_36.position.copy(endpoint_arch_liner_front_36.midpoint);
    mesh_arch_liner_front_36.quaternion.copy(endpoint_arch_liner_front_36.quaternion);
  }
  mesh_arch_liner_front_36.castShadow = options.castShadow ?? true;
  mesh_arch_liner_front_36.receiveShadow = options.receiveShadow ?? true;
  node_arch_liner_front_36.add(mesh_arch_liner_front_36);
  meshes["arch-liner-front"] = mesh_arch_liner_front_36;
  colliders["arch-liner-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Box proxy for Lower cladding strip."};
  destructionGroups["arch-liner-front"] ??= [];
  destructionGroups["arch-liner-front"].push(node_arch_liner_front_36);
  // repetition system "wheels" describes 4 parts that are already built individually; not instanced.
  // repetition system "window-pillars" describes 6 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "real-time-stylized", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."], "qualityPriorityRationale": "Loading-screen prop on mobile PWAs: flat textureless materials (declared with evidence) instead of reference texture maps."};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createGTporteStudentVanLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "GTporte Student Van look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key-sun", "type": "directional", "direction": [-0.4, -0.8, 0.45], "color": "#FFF6E8", "intensity": 2.6, "evidence": "hard contact shadow under the body and bright roof highlight; sun high, from vehicle front-right"}, {"id": "fill-sky", "type": "hemisphere", "skyColor": "#CFE3FF", "groundColor": "#4A4A4A", "intensity": 0.9, "evidence": "cool bounce on white side panels in shadow; asphalt below"}, {"id": "rim-bounce", "type": "directional", "direction": [0.6, -0.2, -0.6], "color": "#FFFFFF", "intensity": 0.6, "evidence": "soft edge separation on the rear vertical corner against the background"}, {"id": "tone", "type": "renderer", "toneMapping": "ACESFilmic", "exposure": 1.0, "outputColorSpace": "srgb", "evidence": "bright daylight; white paint must not clip under ACES filmic tone mapping at exposure 1.0"}];
  lights.userData.lookDevTargets = {"qualityPriority": "real-time-stylized", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."], "qualityPriorityRationale": "Loading-screen prop on mobile PWAs: flat textureless materials (declared with evidence) instead of reference texture maps."};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createGTporteStudentVanEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameGTporteStudentVanCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createGTporteStudentVanPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureGTporteStudentVanRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createGTporteStudentVanInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
