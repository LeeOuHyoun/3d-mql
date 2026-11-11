<script setup>
import {
  RefreshCw,
  Sun,
  Moon,
  PlugZap,
  Telescope,
  Snowflake,
  Network,
  Share2,
  Target,
  Terminal,
  Keyboard,
  ListChecks,
  PackagePlus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  RotateCcw,
} from '@lucide/vue'

const props = defineProps({
  isDark: { type: Boolean, default: false },
  connection: { type: Object, required: true },
  context: { type: Object, required: true },
  minimapPosition: { type: String, default: 'bottom-right' },
  changeCount: { type: Number, default: 0 },
})
const isMinimapOpen = defineModel('isMinimapOpen', { type: Boolean, default: true })
const isConsoleOpen = defineModel('isConsoleOpen', { type: Boolean, default: false })
const layoutType = defineModel('layoutType', { type: String, default: 'radial' })
const emit = defineEmits([
  'resetView',
  'fit',
  'toggleTheme',
  'reconnect',
  'shortcuts',
  'basket',
  'create',
  'minimapPosition',
  'resetMinimap',
])

const minimapPositions = [
  { value: 'top-left', title: '왼쪽 위 고정', icon: ArrowUpLeft },
  { value: 'top', title: '위쪽 고정', icon: ArrowUp },
  { value: 'top-right', title: '오른쪽 위 고정', icon: ArrowUpRight },
  { value: 'left', title: '왼쪽 고정', icon: ArrowLeft },
  { value: 'reset', title: '미니맵 위치 · 크기 초기화', icon: RotateCcw },
  { value: 'right', title: '오른쪽 고정', icon: ArrowRight },
  { value: 'bottom-left', title: '왼쪽 아래 고정', icon: ArrowDownLeft },
  { value: 'bottom', title: '아래쪽 고정', icon: ArrowDown },
  { value: 'bottom-right', title: '오른쪽 아래 고정', icon: ArrowDownRight },
]
const minimapMenuRef = ref(null)
const isMinimapMenuOpen = ref(false)

onClickOutside(minimapMenuRef, () => (isMinimapMenuOpen.value = false))
whenever(
  () => !isMinimapOpen.value,
  () => (isMinimapMenuOpen.value = false),
)

const toggleMinimapMenu = () => {
  isMinimapMenuOpen.value = isMinimapOpen.value && !isMinimapMenuOpen.value
}

const selectMinimapPosition = (value) => {
  if (value === 'reset') emit('resetMinimap')
  else emit('minimapPosition', value)
}

const layouts = [
  { value: 'radial', title: 'Radial 레이아웃', icon: Snowflake },
  { value: 'flow-tb', title: 'Flowchart (세로)', icon: Network },
  { value: 'flow-lr', title: 'Flowchart (가로)', icon: Share2 },
]

const statusMap = {
  connecting: { label: '연결 중', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: '연결됨', dot: 'bg-emerald-500' },
  failed: { label: '연결 실패', dot: 'bg-red-500' },
  ended: { label: '세션 종료', dot: 'bg-gray-400' },
}
const status = computed(() => statusMap[props.connection.state] || statusMap.connecting)

const iconBtnClass =
  'h-6 w-6 flex items-center justify-center rounded-md border-none bg-transparent text-gray-500 dark:text-[#abb2bf] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer'
const activeClass = 'text-[#61afef]! bg-[#61afef]/10'
const dividerClass = 'w-px h-4 mx-1 shrink-0 bg-gray-200 dark:bg-[#3e4451]'
</script>

<template>
  <div
    class="h-8 px-3 flex items-center gap-1 border-t border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] shrink-0 text-xs"
  >
    <div class="flex items-center rounded-md bg-gray-100 dark:bg-white/5">
      <button
        v-for="layout in layouts"
        :key="layout.value"
        :class="[iconBtnClass, layoutType === layout.value && activeClass]"
        :title="layout.title"
        @click="layoutType = layout.value"
      >
        <component :is="layout.icon" :size="14" />
      </button>
    </div>
    <button :class="iconBtnClass" title="레이아웃 다시 정렬" @click="emit('resetView')">
      <RefreshCw :size="14" />
    </button>
    <button :class="iconBtnClass" title="화면 맞춤 (Ctrl+Alt+F)" @click="emit('fit')">
      <Target :size="14" />
    </button>
    <div ref="minimapMenuRef" class="relative flex items-center">
      <button
        :class="[iconBtnClass, isMinimapOpen && activeClass]"
        title="미니맵 (Alt+M) · 우클릭: 위치 고정"
        @click="isMinimapOpen = !isMinimapOpen"
        @contextmenu.prevent="toggleMinimapMenu"
      >
        <Telescope :size="14" />
      </button>
      <div
        v-if="isMinimapMenuOpen"
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 w-max p-1 grid grid-cols-3 gap-1 rounded-lg border shadow-xl animate-pop-in bg-gray-50 dark:bg-[#21252b] border-gray-200 dark:border-[#3e4451]"
      >
        <button
          v-for="item in minimapPositions"
          :key="item.value"
          class="w-6 h-6 flex items-center justify-center rounded-md border cursor-pointer transition-colors"
          :class="
            props.minimapPosition === item.value
              ? 'border-[#61afef] bg-[#61afef] text-white'
              : 'border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#1e2227] text-gray-400 hover:text-[#61afef]'
          "
          :title="item.title"
          @click="selectMinimapPosition(item.value)"
        >
          <component :is="item.icon" :size="14" />
        </button>
      </div>
    </div>
    <div :class="dividerClass"></div>
    <button :class="iconBtnClass" title="단축키 안내 (Ctrl+Shift+L)" @click="emit('shortcuts')">
      <Keyboard :size="14" />
    </button>
    <button :class="iconBtnClass" :title="props.isDark ? '라이트 모드' : '다크 모드'" @click="emit('toggleTheme')">
      <Sun v-if="props.isDark" :size="14" />
      <Moon v-else :size="14" />
    </button>
    <div class="ml-auto min-w-0 flex items-center gap-1">
      <button :class="iconBtnClass" title="새 객체 만들기 (생성 문장을 변경 바구니에 담음)" @click="emit('create')">
        <PackagePlus :size="14" />
      </button>
      <button
        :class="[iconBtnClass, 'relative', props.changeCount && activeClass]"
        title="변경 바구니"
        @click="emit('basket')"
      >
        <ListChecks :size="14" />
        <span
          v-if="props.changeCount"
          class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-[#61afef] text-white text-center text-[9px] leading-3.5 font-bold"
        >
          {{ props.changeCount }}
        </span>
      </button>
      <div :class="dividerClass"></div>
      <button
        :class="[iconBtnClass, isConsoleOpen && activeClass]"
        title="MQL 콘솔 (Alt+B)"
        @click="isConsoleOpen = !isConsoleOpen"
      >
        <Terminal :size="14" />
      </button>
      <div :class="dividerClass"></div>
      <div class="min-w-0 flex items-center gap-1.5 text-gray-500 dark:text-[#abb2bf]" :title="props.connection.message">
        <span class="w-2 h-2 shrink-0 rounded-full" :class="status.dot"></span>
        <span class="truncate">{{ props.context.label || status.label }}</span>
      </div>
      <button :class="iconBtnClass" title="MQL 재연결" @click="emit('reconnect')">
        <PlugZap :size="14" />
      </button>
    </div>
  </div>
</template>
