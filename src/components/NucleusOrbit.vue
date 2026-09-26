<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ParticleLogo from './ParticleLogo.vue'
import { resolveWidget } from '@/composables/useWidgets.js'
import { useDashboardProvider } from '@/composables/useDashboardProvider.js'
import { useRegistry } from '@core/useRegistry.js'

const props = defineProps({
  size: { type: Number, default: 220 },
  dark: { type: Boolean, default: true },
})
const emit = defineEmits(['spread'])

const {
  enabled: dashboardEnabled,
  editor: { active: editing, isTempHidden },
  dashboard: { widgets: dashStates, getWidgetState, setWidgetState, saveState },
  WidgetControls,
} = useDashboardProvider()
const { widgets: manifests, disabledWidgetIds } = useRegistry()

function lockedOf(id) {
  return dashStates.value.find((w) => w.id === id)?.locked === true
}

const wrap = ref(null)
const open = ref(false)
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
const cx = ref(0)
const cy = ref(0)

const REST = 250
const SEP = 220
const TETHER = 0.05
const REPEL = 0.55
const DECAY = 0.76

const nodes = reactive([])
watch(
  manifests,
  (list) => {
    const orbit = list.filter((m) => m.slot === 'nucleus' && resolveWidget(m.id))
    orbit.forEach((m, i) => {
      if (nodes.some((n) => n.id === m.id)) return
      const angle = typeof m.orbitAngle === 'number' ? m.orbitAngle : -135 + (360 / orbit.length) * i
      const rad = (angle * Math.PI) / 180
      nodes.push({
        id: m.id,
        name: m.name,
        comp: resolveWidget(m.id),
        x: Math.cos(rad) * REST,
        y: Math.sin(rad) * REST,
        vx: 0,
        vy: 0,
        floatDur: (8 + i * 1.7).toFixed(2),
        floatDelay: (i * -2.6).toFixed(2),
      })
    })
  },
  { immediate: true }
)

const activeNodes = computed(() => {
  if (isMobile.value || !dashboardEnabled.value) return []
  return nodes.filter((n) => {
    if (disabledWidgetIds.value.has(n.id)) return false
    if (isTempHidden(n.id)) return false
    const st = dashStates.value.find((w) => w.id === n.id)
    return st ? st.enabled !== false : true
  })
})

const restored = new Set()
watch(
  [dashStates, () => nodes.length],
  ([list]) => {
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

function saveNode(n) {
  const st = getWidgetState(n.id)
  setWidgetState(n.id, {
    config: { ...(st?.config || {}), orbit: { x: Math.round(n.x), y: Math.round(n.y) } },
  })
  saveState()
}

const deploy = ref(0)
const expanded = computed(() => open.value || editing.value)
const spread = computed(() => open.value && !editing.value && !isMobile.value && dashboardEnabled.value)
watch(spread, (v) => emit('spread', v), { immediate: true })
const dragging = ref(null)

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
    saveNode(node)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

let raf = 0
function frame() {
  raf = requestAnimationFrame(frame)

  if (wrap.value) {
    const r = wrap.value.getBoundingClientRect()
    cx.value = r.left + r.width / 2
    cy.value = r.top + r.height / 2
  }

  const target = expanded.value ? 1 : 0
  deploy.value += (target - deploy.value) * 0.15
  if (Math.abs(target - deploy.value) < 0.002) deploy.value = target

  const list = activeNodes.value
  for (const n of list) {
    if (n === dragging.value || lockedOf(n.id)) continue
    let fx = 0
    let fy = 0

    const dist = Math.hypot(n.x, n.y) || 0.001
    fx += TETHER * (REST - dist) * (n.x / dist)
    fy += TETHER * (REST - dist) * (n.y / dist)

    for (const m of list) {
      if (m === n) continue
      let dx = n.x - m.x
      let dy = n.y - m.y
      let d = Math.hypot(dx, dy)
      if (d < 0.001) { dx = 1; dy = 1; d = 1.414 }
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

        <div v-if="editing && WidgetControls" class="orbit-tool">
          <component
            :is="WidgetControls"
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
/* Relies on no ancestor creating a stacking context. */
.orbit-lift {
  z-index: 70;
}
.orbit-center {
  position: fixed;
  width: 0;
  height: 0;
  z-index: 100;
  pointer-events: none;
  line-height: 0;
}
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

/* .orbit sets line-height: 0 for the canvas. */
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
