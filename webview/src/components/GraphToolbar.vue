<script setup>
import {
  Search,
  Loader2,
  RefreshCw,
  Eraser,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  PlugZap,
  Filter,
  X,
  Telescope,
  Settings2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Check,
  Snowflake,
  Network,
  Share2,
  Target,
  Terminal,
  Keyboard,
  DatabaseBackup,
  ListChecks,
  PackagePlus,
  ArrowUp,
  ArrowDown,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  RotateCcw,
} from '@lucide/vue'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  form: { type: Object, required: true },
  isSearching: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  connection: { type: Object, required: true },
  context: { type: Object, required: true },
  loadedAt: { type: Number, default: 0 },
  isStale: { type: Boolean, default: false },
  changeCount: { type: Number, default: 0 },
  history: { type: Array, default: () => [] },
  historyIndex: { type: Number, default: -1 },
  minimapPosition: { type: String, default: 'bottom-right' },
})
const isSearchPanelOpen = defineModel('isSearchPanelOpen', { type: Boolean, default: false })
const isRelationPanelOpen = defineModel('isRelationPanelOpen', { type: Boolean, default: false })
const isDetailPanelOpen = defineModel('isDetailPanelOpen', { type: Boolean, default: true })
const isMinimapOpen = defineModel('isMinimapOpen', { type: Boolean, default: true })
const isConsoleOpen = defineModel('isConsoleOpen', { type: Boolean, default: false })
const graphFilter = defineModel('graphFilter', { type: String, default: '' })
const layoutType = defineModel('layoutType', { type: String, default: 'radial' })
const emit = defineEmits([
  'search',
  'refresh',
  'basket',
  'create',
  'resetView',
  'fit',
  'clear',
  'toggleTheme',
  'reconnect',
  'back',
  'forward',
  'go',
  'shortcuts',
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

const historyMenu = shallowRef(null)
const historyItems = computed(() =>
  props.history
    .map((entry, index) => ({
      action: String(index),
      label: entry.label,
      icon: index === props.historyIndex ? Check : Clock,
      color:
        index === props.historyIndex
          ? 'text-[#4b8bca] dark:text-[#61afef] hover:bg-[#61afef]/10'
          : 'text-gray-700 dark:text-[#abb2bf] hover:bg-gray-100 dark:hover:bg-white/10',
    }))
    .reverse(),
)

const openHistoryMenu = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  historyMenu.value = { x: rect.left, y: rect.bottom + 4 }
}

const handleHistoryAction = (action) => {
  historyMenu.value = null
  emit('go', Number(action))
}

const statusMap = {
  connecting: { label: '연결 중', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: '연결됨', dot: 'bg-emerald-500' },
  failed: { label: '연결 실패', dot: 'bg-red-500' },
  ended: { label: '세션 종료', dot: 'bg-gray-400' },
}
const status = computed(() => statusMap[props.connection.state] || statusMap.connecting)

const loadedText = useDateFormat(() => props.loadedAt, 'MM-DD HH:mm:ss')
const refreshTitle = computed(() =>
  [
    '데이터 새로고침 (펼친 내용을 다시 조회하고 달라진 곳을 표시)',
    props.loadedAt && `마지막 조회: ${loadedText.value}`,
    props.isStale && '지난 세션에서 복원했거나 쓰기 명령을 실행한 뒤라 최신이 아닐 수 있습니다.',
  ]
    .filter(Boolean)
    .join('\n'),
)

const fields = [
  { key: 'type', placeholder: 'Type 또는 Object ID', class: 'flex-1' },
  { key: 'name', placeholder: 'Name', class: 'flex-1' },
  { key: 'revision', placeholder: 'Rev', class: 'flex-1' },
  { key: 'where', placeholder: 'Where 조건', class: 'flex-2' },
]
const inputClass =
  'h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef] placeholder:text-gray-400 dark:placeholder:text-[#5c6370]'
const iconBtnClass =
  'h-7 w-7 flex items-center justify-center rounded-md border-none bg-transparent text-gray-500 dark:text-[#abb2bf] hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer'
const activeClass = 'text-[#61afef]! bg-[#61afef]/10'
</script>

<template>
  <div
    class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] shrink-0 flex-wrap"
  >
    <button
      :class="[iconBtnClass, isSearchPanelOpen && activeClass]"
      title="검색 결과"
      @click="isSearchPanelOpen = !isSearchPanelOpen"
    >
      <PanelLeft :size="16" />
    </button>
    <button
      :class="[iconBtnClass, isRelationPanelOpen && activeClass]"
      title="관계 필터 · 범례 (Alt+L)"
      @click="isRelationPanelOpen = !isRelationPanelOpen"
    >
      <Settings2 :size="16" />
    </button>
    <div class="flex items-center">
      <button
        :class="[iconBtnClass, 'disabled:opacity-30 disabled:cursor-default']"
        :disabled="props.historyIndex <= 0"
        title="이전 기준 객체 (Alt+[)"
        @click="emit('back')"
      >
        <ArrowLeft :size="16" />
      </button>
      <button
        :class="[iconBtnClass, 'disabled:opacity-30 disabled:cursor-default']"
        :disabled="!props.history.length"
        title="기준 객체 기록"
        @click="openHistoryMenu"
      >
        <Clock :size="16" />
      </button>
      <button
        :class="[iconBtnClass, 'disabled:opacity-30 disabled:cursor-default']"
        :disabled="props.historyIndex >= props.history.length - 1"
        title="다음 기준 객체 (Alt+])"
        @click="emit('forward')"
      >
        <ArrowRight :size="16" />
      </button>
    </div>
    <form class="flex-1 min-w-96 flex items-center gap-1.5" @submit.prevent="emit('search')">
      <input
        v-for="field in fields"
        :key="field.key"
        v-model="props.form[field.key]"
        :placeholder="field.placeholder"
        :class="[inputClass, field.class, 'min-w-0']"
        spellcheck="false"
      />
      <button
        type="submit"
        :disabled="props.isSearching"
        class="h-7 px-3 flex items-center gap-1.5 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer disabled:opacity-60 transition-colors"
      >
        <Loader2 v-if="props.isSearching" :size="14" class="animate-spin" />
        <Search v-else :size="14" />
        검색
      </button>
    </form>
    <Loader2 v-if="props.isLoading" :size="16" class="animate-spin text-[#e5c07b]" />
    <div class="relative flex items-center">
      <Filter :size="12" class="absolute left-2 text-gray-400 pointer-events-none" />
      <input v-model="graphFilter" placeholder="그래프 필터" :class="[inputClass, 'w-72 pl-6 pr-6']" spellcheck="false" />
      <button
        v-if="graphFilter"
        class="absolute right-1 p-0.5 flex items-center border-none bg-transparent text-gray-400 hover:text-gray-600 cursor-pointer"
        @click="graphFilter = ''"
      >
        <X :size="12" />
      </button>
    </div>
    <div
      class="max-w-56 flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#abb2bf]"
      :title="props.connection.message"
    >
      <span class="w-2 h-2 shrink-0 rounded-full" :class="status.dot"></span>
      <span class="truncate">{{ props.context.label || status.label }}</span>
    </div>
    <button :class="iconBtnClass" title="MQL 재연결" @click="emit('reconnect')">
      <PlugZap :size="16" />
    </button>
    <div class="flex items-center rounded-md bg-gray-100 dark:bg-white/5">
      <button
        v-for="layout in layouts"
        :key="layout.value"
        :class="[iconBtnClass, layoutType === layout.value && activeClass]"
        :title="layout.title"
        @click="layoutType = layout.value"
      >
        <component :is="layout.icon" :size="16" />
      </button>
    </div>
    <button :class="[iconBtnClass, props.isStale && 'text-amber-500!']" :title="refreshTitle" @click="emit('refresh')">
      <DatabaseBackup :size="16" />
    </button>
    <button :class="iconBtnClass" title="새 객체 만들기 (생성 문장을 변경 바구니에 담음)" @click="emit('create')">
      <PackagePlus :size="16" />
    </button>
    <button
      :class="[iconBtnClass, 'relative', props.changeCount && activeClass]"
      title="변경 바구니"
      @click="emit('basket')"
    >
      <ListChecks :size="16" />
      <span
        v-if="props.changeCount"
        class="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-[#61afef] text-white text-center text-[9px] leading-3.5 font-bold"
      >
        {{ props.changeCount }}
      </span>
    </button>
    <button :class="iconBtnClass" title="레이아웃 다시 정렬" @click="emit('resetView')">
      <RefreshCw :size="16" />
    </button>
    <button :class="iconBtnClass" title="화면 맞춤 (Ctrl+Alt+F)" @click="emit('fit')">
      <Target :size="16" />
    </button>
    <button :class="iconBtnClass" title="그래프 지우기 (Ctrl+L)" @click="emit('clear')">
      <Eraser :size="16" />
    </button>
    <div ref="minimapMenuRef" class="relative flex items-center">
      <button
        :class="[iconBtnClass, isMinimapOpen && activeClass]"
        title="미니맵 (Alt+M) · 우클릭: 위치 고정"
        @click="isMinimapOpen = !isMinimapOpen"
        @contextmenu.prevent="toggleMinimapMenu"
      >
        <Telescope :size="16" />
      </button>
      <div
        v-if="isMinimapMenuOpen"
        class="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-30 p-1 grid grid-cols-3 gap-1 rounded-lg border shadow-xl animate-pop-in bg-gray-50 dark:bg-[#21252b] border-gray-200 dark:border-[#3e4451]"
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
    <button
      :class="[iconBtnClass, isConsoleOpen && activeClass]"
      title="MQL 콘솔 (Alt+C)"
      @click="isConsoleOpen = !isConsoleOpen"
    >
      <Terminal :size="16" />
    </button>
    <button :class="iconBtnClass" title="단축키 안내 (Ctrl+Shift+L)" @click="emit('shortcuts')">
      <Keyboard :size="16" />
    </button>
    <button :class="iconBtnClass" :title="props.isDark ? '라이트 모드' : '다크 모드'" @click="emit('toggleTheme')">
      <Sun v-if="props.isDark" :size="16" />
      <Moon v-else :size="16" />
    </button>
    <button
      :class="[iconBtnClass, isDetailPanelOpen && activeClass]"
      title="상세 패널 (Alt+D)"
      @click="isDetailPanelOpen = !isDetailPanelOpen"
    >
      <PanelRight :size="16" />
    </button>
    <ContextMenu
      v-if="historyMenu"
      :menu="historyMenu"
      :items="historyItems"
      @action="handleHistoryAction"
      @close="historyMenu = null"
    />
  </div>
</template>
