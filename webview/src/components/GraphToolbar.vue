<script setup>
import {
  Search,
  Loader2,
  Eraser,
  PanelLeft,
  PanelRight,
  Filter,
  X,
  Settings2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Check,
  DatabaseBackup,
  ListFilter,
} from '@lucide/vue'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  form: { type: Object, required: true },
  isSearching: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  loadedAt: { type: Number, default: 0 },
  isStale: { type: Boolean, default: false },
  history: { type: Array, default: () => [] },
  historyIndex: { type: Number, default: -1 },
})
const isSearchPanelOpen = defineModel('isSearchPanelOpen', { type: Boolean, default: false })
const isRelationPanelOpen = defineModel('isRelationPanelOpen', { type: Boolean, default: false })
const isDetailPanelOpen = defineModel('isDetailPanelOpen', { type: Boolean, default: true })
const graphFilter = defineModel('graphFilter', { type: String, default: '' })
const emit = defineEmits(['search', 'refresh', 'clear', 'back', 'forward', 'go'])

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
]

const isWhereOpen = ref(false)
const whereBox = ref(null)
const whereButton = ref(null)
const whereInput = ref(null)
const hasWhere = computed(() => !!props.form.where.trim())
const whereTitle = computed(() => (hasWhere.value ? `Where 조건 적용 중:\n${props.form.where.trim()}` : 'Where 조건'))

watch(whereInput, (el) => el?.focus())
onClickOutside(whereBox, () => (isWhereOpen.value = false), { ignore: [whereButton] })

const submitWhere = () => {
  isWhereOpen.value = false
  emit('search')
}

const clearWhere = () => {
  props.form.where = ''
  whereInput.value?.focus()
}
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
    <form class="flex-1 min-w-120 flex items-center gap-1.5" @submit.prevent="emit('search')">
      <input
        v-for="field in fields"
        :key="field.key"
        v-model="props.form[field.key]"
        :placeholder="field.placeholder"
        :class="[inputClass, field.class, 'min-w-0']"
        spellcheck="false"
      />
      <div class="relative flex items-center">
        <button
          ref="whereButton"
          type="button"
          :class="[iconBtnClass, 'relative', (hasWhere || isWhereOpen) && activeClass]"
          :title="whereTitle"
          @click="isWhereOpen = !isWhereOpen"
        >
          <ListFilter :size="16" />
          <span v-if="hasWhere" class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
        </button>
        <div
          v-if="isWhereOpen"
          ref="whereBox"
          class="absolute top-full right-0 mt-1 z-30 w-96 p-2 flex flex-col gap-1.5 rounded-lg border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shadow-xl"
        >
          <textarea
            ref="whereInput"
            v-model="props.form.where"
            rows="4"
            placeholder="Where 조건 (예: current=='Released' && owner=='creator')"
            :class="[inputClass, 'h-auto py-1.5 resize-y font-mono']"
            spellcheck="false"
            @keydown.enter.prevent="submitWhere"
            @keydown.esc.stop="isWhereOpen = false"
          />
          <div class="flex items-center gap-2 text-[11px] text-gray-400 dark:text-[#5c6370]">
            <span class="flex-1">Enter 검색 · Esc 닫기</span>
            <button
              v-if="hasWhere"
              type="button"
              class="px-1.5 border-none bg-transparent text-gray-500 dark:text-[#abb2bf] hover:text-[#61afef] cursor-pointer"
              @click="clearWhere"
            >
              지우기
            </button>
          </div>
        </div>
      </div>
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
      <input v-model="graphFilter" placeholder="그래프 필터" :class="[inputClass, 'w-56 pl-6 pr-6']" spellcheck="false" />
      <button
        v-if="graphFilter"
        class="absolute right-1 p-0.5 flex items-center border-none bg-transparent text-gray-400 hover:text-gray-600 cursor-pointer"
        @click="graphFilter = ''"
      >
        <X :size="12" />
      </button>
    </div>
    <button
      :class="[iconBtnClass, props.isStale && 'text-amber-500!', 'disabled:opacity-30 disabled:cursor-default']"
      :title="refreshTitle"
      :disabled="props.isLoading"
      @click="emit('refresh')"
    >
      <DatabaseBackup :size="16" />
    </button>
    <button :class="iconBtnClass" title="그래프 지우기 (Ctrl+L)" @click="emit('clear')">
      <Eraser :size="16" />
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
