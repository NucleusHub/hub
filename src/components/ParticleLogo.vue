<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  /** Rendered canvas size in CSS pixels (square). */
  size: { type: Number, default: 220 },
  /** Dark theme uses the glowing additive palette; light uses the soft logo colors. */
  dark: { type: Boolean, default: true },
})

const container = ref(null)
let cleanup = () => {}

// Two palettes. Dark glows additively on a dark bg; light uses the lighter
// logo colors with normal blending so they stay visible on a light bg.
const PALETTES = {
  dark: {
    core: new THREE.Color('#a855f7'),
    inner: new THREE.Color('#7c3aed'),
    outer: new THREE.Color('#312e81'),
    blending: THREE.AdditiveBlending,
    glowOpacity: 0.55,
  },
  light: {
    core: new THREE.Color('#c58efb'),
    inner: new THREE.Color('#986df5'),
    outer: new THREE.Color('#a3b7fb'),
    blending: THREE.NormalBlending,
    glowOpacity: 0.35,
  },
}

// Deterministic pseudo-random so the structure is stable across reloads.
function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// Particles spread over a full sphere surface (Fibonacci distribution).
function spherePoints(count, radius, color, sizeJitter, rand) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    const jit = 1 + (rand() - 0.5) * 0.06
    const px = Math.cos(theta) * r
    const py = y
    const pz = Math.sin(theta) * r
    positions[i * 3] = px * radius * jit
    positions[i * 3 + 1] = py * radius * jit
    positions[i * 3 + 2] = pz * radius * jit
    // Surface "mottling" — bright patches tied to position so the core's
    // rotation is actually visible (a uniform sphere looks static spinning).
    const patches = Math.sin(px * 7) * Math.sin(py * 6) * Math.sin(pz * 7)
    const b = 0.55 + Math.max(0, patches) * 0.7 + rand() * 0.2
    colors[i * 3] = Math.min(1, color.r * b)
    colors[i * 3 + 1] = Math.min(1, color.g * b)
    colors[i * 3 + 2] = Math.min(1, color.b * b)
  }
  return { positions, colors }
}

// Thin curved band: a latitude slice of a sphere surface (full ring belt).
function bandPoints(count, radius, latCenter, halfWidth, color, rand) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const cosMin = Math.cos(latCenter - halfWidth)
  const cosMax = Math.cos(latCenter + halfWidth)
  for (let i = 0; i < count; i++) {
    const phi = rand() * Math.PI * 2
    // Uniform area within the band.
    const cosT = cosMax + rand() * (cosMin - cosMax)
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
    const rr = radius * (1 + (rand() - 0.5) * 0.04)
    positions[i * 3] = Math.cos(phi) * sinT * rr
    positions[i * 3 + 1] = cosT * rr
    positions[i * 3 + 2] = Math.sin(phi) * sinT * rr
    const b = 0.7 + rand() * 0.5
    colors[i * 3] = Math.min(1, color.r * b)
    colors[i * 3 + 1] = Math.min(1, color.g * b)
    colors[i * 3 + 2] = Math.min(1, color.b * b)
  }
  return { positions, colors }
}

function makeSprite() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}

function makePoints(data, sprite, size, blending) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
  const mat = new THREE.PointsMaterial({
    size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending,
    sizeAttenuation: true,
  })
  return new THREE.Points(geo, mat)
}

function buildScene() {
  const pal = props.dark ? PALETTES.dark : PALETTES.light
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rand = rng(1337)

  // Overscan: the canvas is drawn larger than the logo's layout footprint so
  // particles can fly outward on hover without being clipped at the edges.
  // Pulling the camera back by the same factor keeps the resting size identical.
  const OVERSCAN = 1.8
  const canvasSize = props.size * OVERSCAN

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 3.1 * OVERSCAN)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvasSize, canvasSize)
  const canvas = renderer.domElement
  // Center the oversized canvas over the footprint; let it overflow freely.
  canvas.style.position = 'absolute'
  canvas.style.left = '50%'
  canvas.style.top = '50%'
  canvas.style.transform = 'translate(-50%, -50%)'
  container.value.appendChild(canvas)

  const sprite = makeSprite()
  const root = new THREE.Group()
  scene.add(root)

  const disposables = [sprite]

  // Particle sets whose points spread outward on cursor proximity.
  const displaceObjs = []
  function registerDisplace(points) {
    const attr = points.geometry.getAttribute('position')
    const base = Float32Array.from(attr.array)
    const n = attr.count
    const fac = new Float32Array(n)
    for (let k = 0; k < n; k++) fac[k] = ((k * 2654435761) % 1000) / 1000
    displaceObjs.push({ attr, base, fac, n })
  }

  // --- Core sphere ----------------------------------------------------------
  const core = makePoints(spherePoints(2600, 0.46, pal.core, 0.06, rand), sprite, 0.05, pal.blending)
  const coreSpin = new THREE.Group()
  coreSpin.add(core)
  coreSpin.rotation.z = 0.4 // tilt the spin axis so rotation reads clearly
  root.add(coreSpin)
  disposables.push(core.geometry, core.material)
  registerDisplace(core)

  // Soft central glow so the core reads as a solid, lit orb.
  const glowMat = new THREE.SpriteMaterial({
    map: sprite,
    color: pal.core,
    transparent: true,
    depthWrite: false,
    blending: pal.blending,
    opacity: pal.glowOpacity,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.set(1.25, 1.25, 1.25)
  root.add(glow)
  disposables.push(glowMat)

  // --- Orbiting shells (thin curved bands, independent tilted axes) ---------
  const SHELLS = [
    { radius: 0.64, lat: Math.PI * 0.5, hw: 0.16, count: 3200, mix: 0.15 },
    { radius: 0.78, lat: Math.PI * 0.42, hw: 0.13, count: 3400, mix: 0.4 },
    { radius: 0.92, lat: Math.PI * 0.58, hw: 0.12, count: 3600, mix: 0.65 },
    { radius: 1.06, lat: Math.PI * 0.5, hw: 0.1, count: 3800, mix: 0.85 },
    { radius: 1.2, lat: Math.PI * 0.46, hw: 0.09, count: 4000, mix: 1.0 },
  ]

  const shells = SHELLS.map((s, i) => {
    const color = pal.inner.clone().lerp(pal.outer, s.mix)
    const pts = makePoints(bandPoints(s.count, s.radius, s.lat, s.hw, color, rand), sprite, 0.05, pal.blending)
    const group = new THREE.Group()
    group.add(pts)
    root.add(group)
    disposables.push(pts.geometry, pts.material)
    registerDisplace(pts)
    // Deliberate, evenly-spread tilts so the shells form a balanced lattice
    // instead of a random tangle.
    const tilt = (i / SHELLS.length) * Math.PI
    group.rotation.set(tilt * 0.6, tilt, tilt * 0.3)
    // Each shell gets its own axis, but spread smoothly by index (not random)
    // so they spin independently without looking chaotic. All same direction,
    // gently varied speeds.
    const a = (i / SHELLS.length) * Math.PI * 0.8
    const axis = new THREE.Vector3(Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6).normalize()
    const speed = 0.22 + i * 0.07
    return { group, axis, speed }
  })

  // --- Cursor proximity ("alive" magnetism) ---------------------------------
  const PROX_PX = 100 // distance from the logo at which it starts reacting
  let targetExcite = 0
  const onPointer = e => {
    const r = container.value.getBoundingClientRect()
    // Distance from the pointer to the nearest edge of the canvas (0 if inside).
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
    const dist = Math.hypot(dx, dy)
    targetExcite = Math.max(0, 1 - dist / PROX_PX)
  }
  window.addEventListener('pointermove', onPointer)

  let raf = 0
  let last = 0
  let t = 0
  let excite = 0
  let displaced = false
  let boost = 0          // extra spin speed, coasts down naturally
  let wasClose = false   // rising-edge detector for "really close"
  const animate = ts => {
    raf = requestAnimationFrame(animate)
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016
    last = ts
    t += dt

    // Asymmetric timing: spreads out quickly as the cursor approaches, but
    // reassembles slowly once it leaves (a lazy settle, not an instant snap).
    const rate = targetExcite > excite ? 0.2 : 0.02
    excite += (targetExcite - excite) * rate

    // Hovering close → kick a spin surge the instant the cursor arrives
    // (driven by raw proximity, not the slow gather), then let it coast down
    // naturally (exponential decay) back to normal speed.
    const close = targetExcite > 0.5
    if (close && !wasClose) boost = 6
    wasClose = close
    boost *= Math.exp(-dt / 0.7)
    const spinMul = 1 + boost

    if (!reduceMotion) {
      coreSpin.rotation.y += dt * 0.35 * spinMul
      for (const sh of shells) sh.group.rotateOnWorldAxis(sh.axis, sh.speed * dt * spinMul)
    } else {
      root.rotation.set(-0.3, 0.5, 0)
    }

    if (excite > 0.002) {
      // Exponential onset: barely moves until the cursor is close, then surges.
      const e = Math.pow(excite, 4)
      for (const o of displaceObjs) {
        const { attr, base, fac, n } = o
        const arr = attr.array
        for (let k = 0; k < n; k++) {
          const j = k * 3
          const push = e * (0.12 + fac[k] * 0.55)
          const shimmer = Math.sin(t * 4 + fac[k] * 60) * e * 0.04 * fac[k]
          const m = 1 + push + shimmer
          arr[j] = base[j] * m
          arr[j + 1] = base[j + 1] * m
          arr[j + 2] = base[j + 2] * m
        }
        attr.needsUpdate = true
      }
      displaced = true
    } else if (displaced) {
      // Settle back to the resting shape exactly once.
      for (const o of displaceObjs) {
        o.attr.array.set(o.base)
        o.attr.needsUpdate = true
      }
      displaced = false
    }

    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(animate)

  cleanup = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onPointer)
    disposables.forEach(d => d.dispose?.())
    renderer.dispose()
    renderer.domElement.remove()
  }
}

onMounted(buildScene)
// Rebuild with the other palette when the theme flips.
watch(() => props.dark, () => { cleanup(); buildScene() })

onBeforeUnmount(() => cleanup())
</script>

<template>
  <div
    ref="container"
    class="particle-logo"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
</template>

<style scoped>
.particle-logo {
  display: inline-block;
  position: relative;
  line-height: 0;
}
.particle-logo :deep(canvas) {
  display: block;
  pointer-events: none;
}
</style>
