<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ParticleLogo from './ParticleLogo.vue'
import { resolveWidget } from '@/composables/useWidgets.js'
import { usePulse } from '@pulse/composables/usePulse.js'
import { useDashboard } from '@pulse/composables/useDashboard.js'
import PulseWidgetControls from '@pulse/components/PulseWidgetControls.vue'

const props = defineProps({
  size: { type: Number, default: 220 },
  dark: { type: Boolean, default: true },
})
const emit = defineEmits(['spread'])

const { pulseActive, isTempHidden } = usePulse()
const { widgets: dashStates, getWidgetState, setWidgetState, saveState } = useDashboard()

// A node is pinned when its (per-user) dashboard state has locked = true.
function lockedOf(id) {
  return dashStates.value.find((w) => w.id === id)?.locked === true
}

const wrap = ref(null)
const open = ref(false)
// System (orbit) widgets are hidden on mobile — too cramped to be useful.
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
// Core centre in viewport coords — the teleported orbit layer anchors here.
const cx = ref(0)
const cy = ref(0)

// Initial node placement: evenly around the core (four diagonals) so the
// force layout starts at equilibrium. Angles in degrees (0 = right, +clockwise).
const SLOTS = [
  { id: 'sys-load', name: 'System Load', angle: -135 },
  { id: 'sys-disk', name: 'Storage', angle: -45 },
  { id: 'sys-temp', name: 'Temperatures', angle: 135 },
  { id: 'sys-net', name: 'Network', angle: 45 },
]

// ── Force-layout state (positions are offsets from the core centre) ──────────
const REST = 250   // tether rest length (edge length to the core)
const SEP = 220    // min centre-to-centre spacing before nodes repel
const TETHER = 0.05
const REPEL = 0.55
const DECAY = 0.76 // velocity decay per frame

const nodes = reactive(
  SLOTS.map((s, i) => {
    const rad = (s.angle * Math.PI) / 180
    return {
      id: s.id,
      name: s.name,
      comp: resolveWidget(s.id),
      x: Math.cos(rad) * REST,
      y: Math.sin(rad) * REST,
      vx: 0,
      vy: 0,
      floatDur: (8 + i * 1.7).toFixed(2),
      floatDelay: (i * -2.6).toFixed(2),
    }
  })
)

// Only nodes Pulse has left enabled (defaults to on). Hidden entirely on mobile.
const activeNodes = computed(() => {
  if (isMobile.value) return []
  return nodes.filter((n) => {
    if (isTempHidden(n.id)) return false
    const st = dashStates.value.find((w) => w.id === n.id)
    return st ? st.enabled !== false : true
  })
})

// Restore saved positions once the (per-user) dashboard state loads.
const restored = new Set()
watch(
  dashStates,
  (list) => {
    for (const n of nodes) {
      if (restored.has(n.id)) continue
      const st = list.find((w) => w.id === n.id)
      if (!st) continue
      const o = st.config?.orbit
      if (o && typeof o.x === 'number') {
        n.x = o.x
        n.y = o.y
        n.vx = 0
        n.vy = 0
      }
      restored.add(n.id)
    }
  },
  { immediate: true, deep: true }
)

// Persist a node's offset to its dashboard config (scoped to the logged-in user).
function saveNode(n) {
  const st = getWidgetState(n.id)
  setWidgetState(n.id, {
    config: { ...(st?.config || {}), orbit: { x: Math.round(n.x), y: Math.round(n.y) } },
  })
  saveState()
}

// Deploy: 0 = collapsed into the core, 1 = flown out to node positions.
const deploy = ref(0)
const expanded = computed(() => open.value || pulseActive.value)
// "Spread" = opened by hover, with system widgets out, but NOT during Pulse
// editing (where the dashboard must stay readable). Emitted to HomeView, which
// renders the background blur (must live inside #app to share its backdrop
// root) and lifts just the particle logo above it. Disabled on mobile.
const spread = computed(() => open.value && !pulseActive.value && !isMobile.value)
watch(spread, (v) => emit('spread', v), { immediate: true })
const dragging = ref(null)

// ── Proximity: open near the core, stay open near a node (not the app buttons) ─
const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
const WIDGET_RADIUS = 130
function center() {
  const r = wrap.value.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
}
function onMove(e) {
  if (!canHover || !wrap.value || dragging.value) return
  const [cx, cy] = center()
  let near = Math.hypot(e.clientX - cx, e.clientY - cy) < props.size * 0.62
  if (!near && open.value) {
    for (const n of activeNodes.value) {
      if (Math.hypot(e.clientX - (cx + n.x), e.clientY - (cy + n.y)) < WIDGET_RADIUS) {
        near = true
        break
      }
    }
  }
  open.value = near
}

// ── Drag (from the toolbar's move handle) — node follows cursor, others repel ─
function startDrag(node, e) {
  if (lockedOf(node.id)) return
  e.preventDefault()
  const [cx, cy] = center()
  const offX = e.clientX - cx - node.x
  const offY = e.clientY - cy - node.y
  dragging.value = node
  const move = (ev) => {
    const [mx, my] = center()
    node.x = ev.clientX - mx - offX
    node.y = ev.clientY - my - offY
    node.vx = 0
    node.vy = 0
  }
  const up = () => {
    dragging.value = null
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    saveNode(node) // persist the new position for this user
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// ── Simulation loop ──────────────────────────────────────────────────────────
let raf = 0
function frame() {
  raf = requestAnimationFrame(frame)

  // Track the core centre so the teleported layer stays anchored to the logo.
  if (wrap.value) {
    const r = wrap.value.getBoundingClientRect()
    cx.value = r.left + r.width / 2
    cy.value = r.top + r.height / 2
  }

  // Ease the deploy factor; snap when essentially settled (keeps text crisp).
  const target = expanded.value ? 1 : 0
  deploy.value += (target - deploy.value) * 0.15
  if (Math.abs(target - deploy.value) < 0.002) deploy.value = target

  const list = activeNodes.value
  for (const n of list) {
    // Dragged and locked (pinned) nodes hold position but still repel others.
    if (n === dragging.value || lockedOf(n.id)) continue
    let fx = 0
    let fy = 0

    // Tether to the core: pull toward the rest radius along the edge.
    const dist = Math.hypot(n.x, n.y) || 0.001
    fx += TETHER * (REST - dist) * (n.x / dist)
    fy += TETHER * (REST - dist) * (n.y / dist)

    // Repulsion: nodes that get too close push each other apart.
    for (const m of list) {
      if (m === n) continue
      let dx = n.x - m.x
      let dy = n.y - m.y
      let d = Math.hypot(dx, dy)
      if (d < 0.001) { dx = 1; dy = 1; d = 1.414 } // de-overlap exact coincidence
      if (d < SEP) {
        const f = (REPEL * (SEP - d)) / d
        fx += dx * f
        fy += dy * f
      }
    }

    n.vx = (n.vx + fx) * DECAY
    n.vy = (n.vy + fy) * DECAY
    n.x += n.vx
    n.y += n.vy
  }
}

const onResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  window.addEventListener('pointermove', onMove)
  window.addEventListener('resize', onResize)
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(raf)
})

function widgetStyle(n) {
  const d = deploy.value
  return {
    // Round to whole pixels so transformed card text stays crisp.
    transform: `translate(-50%, -50%) translate(${Math.round(n.x * d)}px, ${Math.round(n.y * d)}px) scale(${(0.3 + 0.7 * d).toFixed(3)})`,
    opacity: d,
    pointerEvents: d > 0.5 ? 'auto' : 'none',
  }
}

function lineStyle(n) {
  const d = deploy.value
  const x = n.x * d
  const y = n.y * d
  const len = Math.max(0, Math.round(Math.hypot(x, y)) - 70)
  const ang = (Math.atan2(y, x) * 180) / Math.PI
  return { width: len + 'px', transform: `rotate(${ang}deg)` }
}
</script>

<template>
  <div ref="wrap" class="orbit" :class="{ 'orbit-lift': spread }">
    <ParticleLogo :size="size" :dark="dark" :active="expanded" />

    <!-- Teleported to body so a high z-index escapes the logo's stacking
         context and floats above the Pulse overlay. Anchored to the core. -->
    <Teleport to="body">
    <div class="orbit-center" :style="{ left: cx + 'px', top: cy + 'px' }">
      <div
        v-for="n in activeNodes"
        :key="n.id + '-line'"
        class="orbit-line"
        :style="lineStyle(n)"
      />
      <div
        v-for="n in activeNodes"
        :key="n.id"
        class="orbit-widget"
        :class="{ dragging: dragging === n }"
        :style="widgetStyle(n)"
      >
        <div
          class="orbit-float"
          :style="{ animationDuration: n.floatDur + 's', animationDelay: n.floatDelay + 's' }"
        >
          <component :is="n.comp" v-if="n.comp" size="small" :dark="dark" />
        </div>

        <!-- Pulse editing: same toolbar as other widgets, with a move handle. -->
        <div v-if="pulseActive" class="orbit-tool">
          <PulseWidgetControls
            :widget="{ id: n.id, name: n.name, slot: 'nucleus', locked: lockedOf(n.id) }"
            @movestart="startDrag(n, $event)"
          />
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.orbit {
  position: relative;
  display: inline-block;
  line-height: 0;
}
/* Lift only the particle logo above the backdrop blur while spread. Relies on
   no ancestor (logo wrapper / #app / page root) creating a stacking context. */
.orbit-lift {
  z-index: 70;
}
.orbit-center {
  position: fixed;
  width: 0;
  height: 0;
  z-index: 100; /* above the Pulse overlay (50); below modals (200) */
  pointer-events: none;
  line-height: 0;
}
/* Positions are driven per-frame by the simulation — no CSS transitions. */
.orbit-line {
  position: absolute;
  top: 0;
  left: 0;
  height: 2px;
  transform-origin: 0 50%;
  background: linear-gradient(90deg, rgba(168, 139, 250, 0), rgba(168, 139, 250, 0.85));
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.55);
  border-radius: 2px;
}
.orbit-widget {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto;
}
.orbit-widget.dragging {
  cursor: grabbing;
}
/* Subtle, independent ambient drift (timing set per-widget inline). */
.orbit-float {
  animation-name: orbit-float;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes orbit-float {
  0%, 100% { transform: translate(0, 0); }
  25%      { transform: translate(4px, -5px); }
  50%      { transform: translate(-3px, -7px); }
  75%      { transform: translate(-5px, -2px); }
}

/* Pulse-mode toolbar: anchored under the node. line-height reset because the
   .orbit wrapper sets it to 0 (for the canvas). */
.orbit-tool {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 10px;
  line-height: normal;
  z-index: 1;
}
</style>
