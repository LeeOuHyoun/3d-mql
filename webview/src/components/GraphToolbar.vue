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
  Map as MapIcon,
  ListFilter,
  ArrowLeft,
  ArrowRight,
  Clock,
  Check,
  Orbit,
  MoveDown,
  MoveRight,
  Scan,
  Terminal,
  Keyboard,
} from '@lucide/vue'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  form: { type: Object, required: true },
  isSearching: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  connection: { type: Object, required: true },
  history: { type: Array, default: () => [] },
  historyIndex: { type: Number, default: -1 },
})
const isSearchPanelOpen = defineModel('isSearchPanelOpen', { type: Boolean, default: false })
const isRelationPanelOpen = defineModel('isRelationPanelOpen', { type: Boolean, default: false })
const isDetailPanelOpen = defineModel('isDetailPanelOpen', { type: Boolean, default: true })
const isMinimapOpen = defineModel('isMinimapOpen', { type: Boolean, default: true })
const isConsoleOpen = defineModel('isConsoleOpen', { type: Boolean, default: false })
const graphFilter = defineModel('graphFilter', { type: String, default: '' })
const layoutType = defineModel('layoutType', { type: String, default: 'radial' })
const emit = defineEmits(['search', 'resetView', 'fit', 'clear', 'toggleTheme', 'reconnect', 'back', 'forward', 'go', 'shortcuts'])

const layouts = [
  { value: 'radial', title: 'Radial 레이아웃', icon: Orbit },
  { value: 'flow-tb', title: 'Flowchart (세로)', icon: MoveDown },
  { value: 'flow-lr', title: 'Flowchart (가로)', icon: MoveRight },
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

const fields = [
  { key: 'type', placeholder: 'Type 또는 Object ID' },
  { key: 'name', placeholder: 'Name' },
  { key: 'revision', placeholder: 'Rev' },
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
      title="관계 필터 · 범례"
      @click="isRelationPanelOpen = !isRelationPanelOpen"
    >
      <ListFilter :size="16" />
    </button>
    <div class="flex items-center">
      <button
        :class="[iconBtnClass, 'disabled:opacity-30 disabled:cursor-default']"
        :disabled="props.historyIndex <= 0"
        title="이전 기준 객체"
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
        title="다음 기준 객체"
        @click="emit('forward')"
      >
        <ArrowRight :size="16" />
      </button>
    </div>
    <form class="flex-1 min-w-80 flex items-center gap-1.5" @submit.prevent="emit('search')">
      <input
        v-for="field in fields"
        :key="field.key"
        v-model="props.form[field.key]"
        :placeholder="field.placeholder"
        :class="[inputClass, 'flex-1 min-w-0']"
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
    <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#abb2bf]" :title="props.connection.message">
      <span class="w-2 h-2 rounded-full" :class="status.dot"></span>
      {{ status.label }}
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
    <button :class="iconBtnClass" title="레이아웃 다시 정렬" @click="emit('resetView')">
      <RefreshCw :size="16" />
    </button>
    <button :class="iconBtnClass" title="화면 맞춤" @click="emit('fit')">
      <Scan :size="16" />
    </button>
    <button :class="iconBtnClass" title="그래프 지우기 (Ctrl+L)" @click="emit('clear')">
      <Eraser :size="16" />
    </button>
    <button
      :class="[iconBtnClass, isMinimapOpen && activeClass]"
      title="미니맵 (Alt+M)"
      @click="isMinimapOpen = !isMinimapOpen"
    >
      <MapIcon :size="16" />
    </button>
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
      title="상세 패널"
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
