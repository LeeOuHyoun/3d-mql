<script setup>
import { Search, Loader2, RefreshCw, Eraser, PanelLeft, PanelRight, Sun, Moon, PlugZap, Filter, X, Map as MapIcon } from '@lucide/vue'

const props = defineProps({
  form: { type: Object, required: true },
  isSearching: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  connection: { type: Object, required: true },
})
const isSearchPanelOpen = defineModel('isSearchPanelOpen', { type: Boolean, default: false })
const isDetailPanelOpen = defineModel('isDetailPanelOpen', { type: Boolean, default: true })
const isMinimapOpen = defineModel('isMinimapOpen', { type: Boolean, default: true })
const graphFilter = defineModel('graphFilter', { type: String, default: '' })
const emit = defineEmits(['search', 'resetView', 'clear', 'toggleTheme', 'reconnect'])

const statusMap = {
  connecting: { label: '연결 중', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: '연결됨', dot: 'bg-emerald-500' },
  failed: { label: '연결 실패', dot: 'bg-red-500' },
  ended: { label: '세션 종료', dot: 'bg-gray-400' },
}
const status = computed(() => statusMap[props.connection.state] || statusMap.connecting)

const fields = [
  { key: 'type', placeholder: 'Type 또는 Object ID', width: 'w-44' },
  { key: 'name', placeholder: 'Name', width: 'w-40' },
  { key: 'revision', placeholder: 'Rev', width: 'w-16' },
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
    <form class="flex items-center gap-1.5" @submit.prevent="emit('search')">
      <input
        v-for="field in fields"
        :key="field.key"
        v-model="props.form[field.key]"
        :placeholder="field.placeholder"
        :class="[inputClass, field.width]"
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
      <input v-model="graphFilter" placeholder="그래프 필터" :class="[inputClass, 'w-44 pl-6 pr-6']" spellcheck="false" />
      <button
        v-if="graphFilter"
        class="absolute right-1 p-0.5 flex items-center border-none bg-transparent text-gray-400 hover:text-gray-600 cursor-pointer"
        @click="graphFilter = ''"
      >
        <X :size="12" />
      </button>
    </div>
    <div class="flex-1"></div>
    <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#abb2bf]" :title="props.connection.message">
      <span class="w-2 h-2 rounded-full" :class="status.dot"></span>
      {{ status.label }}
    </div>
    <button :class="iconBtnClass" title="MQL 재연결" @click="emit('reconnect')">
      <PlugZap :size="16" />
    </button>
    <button :class="iconBtnClass" title="레이아웃 다시 정렬" @click="emit('resetView')">
      <RefreshCw :size="16" />
    </button>
    <button :class="iconBtnClass" title="그래프 지우기" @click="emit('clear')">
      <Eraser :size="16" />
    </button>
    <button
      :class="[iconBtnClass, isMinimapOpen && activeClass]"
      title="미니맵"
      @click="isMinimapOpen = !isMinimapOpen"
    >
      <MapIcon :size="16" />
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
  </div>
</template>
