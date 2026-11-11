<script setup>
import {
  X,
  Terminal,
  Play,
  Eraser,
  Copy,
  Loader2,
  Fullscreen,
  Minimize,
  Search,
  History,
  ArrowUp,
  ArrowDown,
  CaseSensitive,
  Regex,
  Crosshair,
  ChevronsDown,
  CornerRightUp,
  CirclePlus,
} from '@lucide/vue'
import { request } from '../api.js'
import { useMqlConsole } from '../composables/useMqlConsole.js'
import { useConsoleAssist } from '../composables/useConsoleAssist.js'
import { usePanelResize } from '../composables/usePanelResize.js'
import { buildFindRegex } from '../console/mqlResult.js'
import ConsoleAssist from './ConsoleAssist.vue'
import ConsoleEntry from './ConsoleEntry.vue'
import ConsoleHistory from './ConsoleHistory.vue'
import ContextMenu from './ContextMenu.vue'

const fullscreen = defineModel('fullscreen', { type: Boolean, default: false })
const emit = defineEmits(['openRoot', 'highlight', 'add'])
const hasExitedFullscreen = ref(false)

whenever(
  () => !fullscreen.value,
  () => (hasExitedFullscreen.value = true),
)
const { isOpen, input, entries, isRunning, run, clear, recall } = useMqlConsole()
const { width: height, onResizeStart } = usePanelResize('console', 220, 'top')
const { width: inputHeight, onResizeStart: onInputResizeStart } = usePanelResize('console-input', 92, 'top', 48, 400)

const logRef = ref(null)
const inputRef = ref(null)

const {
  items: assistItems,
  index: assistIndex,
  caret: assistCaret,
  close: closeAssist,
  accept: acceptAssist,
  takeStatement,
  onKeydown: onInputKeydown,
  onInput: onInputChange,
  onFocus: onInputFocus,
  onBlur: onInputBlur,
} = useConsoleAssist(inputRef)

const runInput = () => {
  closeAssist()
  if (isRunning.value) return
  const statement = takeStatement()
  if (statement) run(statement, { fill: false })
}

watch(
  () => entries.value.length,
  () => nextTick(() => logRef.value && (logRef.value.scrollTop = logRef.value.scrollHeight)),
)

const isHistoryOpen = useStorage('3d-mql-console-history-open', false)

const isFindOpen = ref(false)
const findInputRef = ref(null)
const findQuery = ref('')
const findOptions = reactive({ matchCase: false, useRegex: false })
const findRegex = computed(() => (isFindOpen.value ? buildFindRegex(findQuery.value, findOptions) : null))
const isFindInvalid = computed(() => !!findQuery.value && isFindOpen.value && !findRegex.value)
const findIndex = ref(-1)
const findCount = ref(0)

const focusHit = (index) => {
  const hits = [...(logRef.value?.querySelectorAll('[data-find-hit]') ?? [])]
  hits.forEach((el) => delete el.dataset.current)
  findCount.value = hits.length
  findIndex.value = hits.length ? (index + hits.length) % hits.length : -1
  if (!hits.length) return
  hits[findIndex.value].dataset.current = ''
  hits[findIndex.value].scrollIntoView({ block: 'nearest' })
}

const moveFind = (step) => focusHit(findIndex.value + step)

watch([findRegex, entries], () => nextTick(() => focusHit(0)), { deep: true })

const openFind = () => {
  isFindOpen.value = true
  nextTick(() => findInputRef.value?.select())
}

const closeFind = () => {
  isFindOpen.value = false
}

const toggleFind = () => (isFindOpen.value ? closeFind() : openFind())

const toggleFindOption = (name) => {
  findOptions[name] = !findOptions[name]
}

const { copy } = useClipboard({ legacy: true })

const objectIdMenu = shallowRef(null)

const openObjectIdMenu = (e, id) => {
  objectIdMenu.value = { x: e.clientX, y: e.clientY, id }
}

const objectIdMenuItems = [
  {
    action: 'openRoot',
    label: '그래프에서 열기 (기준 객체)',
    icon: Crosshair,
    color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
  },
  {
    action: 'add',
    label: '그래프에 추가 (기준 객체 유지)',
    icon: CirclePlus,
    color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
  },
  {
    action: 'printBus',
    label: 'print bus 실행',
    icon: Play,
    color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40',
  },
  {
    action: 'expandFrom',
    label: 'expand bus (from) 실행',
    icon: ChevronsDown,
    color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40',
  },
  {
    action: 'expandTo',
    label: 'expand bus (to) 실행',
    icon: CornerRightUp,
    color: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/40',
  },
  {
    action: 'copy',
    label: 'Object ID 복사',
    icon: Copy,
    color: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40',
  },
]

const handleObjectIdAction = async (action) => {
  const { id } = objectIdMenu.value
  objectIdMenu.value = null
  if (action === 'openRoot') emit('openRoot', id)
  else if (action === 'add') emit('add', [id])
  else if (action === 'copy') copy(id)
  else run(await request('query', { action, targets: [{ id }] }))
}

const iconBtnClass =
  'p-1 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer'
const activeClass = 'text-[#61afef]! bg-[#61afef]/10'
</script>

<template>
  <div
    class="bg-gray-50 dark:bg-[#21252b] flex flex-col"
    :class="
      fullscreen
        ? 'fixed inset-0 z-40 animate-zoom-in'
        : ['relative shrink-0 border-t border-gray-200 dark:border-[#3e4451]', hasExitedFullscreen && 'animate-settle']
    "
    :style="fullscreen ? undefined : { height: `${height}px`, '--panel-size': `${height}px` }"
    @keydown.ctrl.f.prevent="openFind"
  >
    <div
      v-if="!fullscreen"
      class="absolute top-0 left-0 right-0 h-1 z-10 cursor-row-resize hover:bg-[#61afef]/40"
      @pointerdown.prevent="onResizeStart"
    ></div>
    <div
      class="px-3 py-1.5 flex items-center gap-2 border-b border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shrink-0 text-xs"
    >
      <Terminal :size="14" class="text-[#61afef]" />
      <span class="font-bold text-gray-900 dark:text-[#61afef]">MQL Console</span>
      <Loader2 v-if="isRunning" :size="14" class="animate-spin text-[#e5c07b]" />
      <div class="flex-1"></div>
      <button :class="[iconBtnClass, isFindOpen && activeClass]" title="결과에서 찾기 (Ctrl+F)" @click="toggleFind">
        <Search :size="14" />
      </button>
      <button :class="[iconBtnClass, isHistoryOpen && activeClass]" title="명령 기록" @click="isHistoryOpen = !isHistoryOpen">
        <History :size="14" />
      </button>
      <button :class="iconBtnClass" title="결과 지우기" @click="clear">
        <Eraser :size="14" />
      </button>
      <button :class="iconBtnClass" :title="fullscreen ? '전체 화면 종료 (Esc)' : '전체 화면 (Ctrl+Alt+C)'" @click="fullscreen = !fullscreen">
        <Minimize v-if="fullscreen" :size="14" />
        <Fullscreen v-else :size="14" />
      </button>
      <button :class="iconBtnClass" title="닫기" @click="isOpen = false">
        <X :size="14" />
      </button>
    </div>
    <div
      v-if="isFindOpen"
      class="px-3 py-1 flex items-center gap-1 border-b border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shrink-0 text-xs"
    >
      <input
        ref="findInputRef"
        v-model="findQuery"
        placeholder="결과에서 찾기 (Enter: 다음 · Shift+Enter: 이전)"
        spellcheck="false"
        class="flex-1 min-w-0 h-6 px-2 rounded-md border bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none"
        :class="isFindInvalid ? 'border-red-400' : 'border-gray-200 dark:border-[#3e4451] focus:border-[#61afef]'"
        @keydown.enter.exact.prevent="moveFind(1)"
        @keydown.shift.enter.prevent="moveFind(-1)"
        @keydown.esc.stop.prevent="closeFind"
      />
      <button :class="[iconBtnClass, findOptions.matchCase && activeClass]" title="대소문자 구분" @click="toggleFindOption('matchCase')">
        <CaseSensitive :size="14" />
      </button>
      <button :class="[iconBtnClass, findOptions.useRegex && activeClass]" title="정규식" @click="toggleFindOption('useRegex')">
        <Regex :size="14" />
      </button>
      <span class="w-14 text-center text-gray-400 tabular-nums">
        {{ findCount ? `${findIndex + 1}/${findCount}` : findQuery ? '없음' : '' }}
      </span>
      <button :class="iconBtnClass" title="이전 (Shift+Enter)" @click="moveFind(-1)">
        <ArrowUp :size="14" />
      </button>
      <button :class="iconBtnClass" title="다음 (Enter)" @click="moveFind(1)">
        <ArrowDown :size="14" />
      </button>
      <button :class="iconBtnClass" title="찾기 닫기 (Esc)" @click="closeFind">
        <X :size="14" />
      </button>
    </div>
    <div class="flex-1 min-h-0 flex">
      <div ref="logRef" class="flex-1 min-w-0 overflow-auto px-3 py-2 font-mono text-[11px] flex flex-col gap-2">
        <div v-if="!entries.length" class="text-gray-400 italic font-sans">
          MQL 명령을 입력하고 Ctrl+Enter로 실행합니다. Ctrl+↑/↓로 이전 명령을 불러오고, 결과의 Object ID를 클릭하면
          그래프에서 열 수 있습니다.
        </div>
        <ConsoleEntry
          v-for="entry in entries"
          :key="entry.id"
          :entry="entry"
          :findRegex="findRegex"
          @objectId="openObjectIdMenu"
          @highlight="emit('highlight', $event)"
          @add="emit('add', $event)"
        />
      </div>
      <ConsoleHistory v-if="isHistoryOpen" @close="isHistoryOpen = false" />
    </div>
    <div
      class="relative px-3 py-2 border-t border-gray-200 dark:border-[#3e4451] flex items-end gap-2 min-h-12"
      :style="{ height: `${inputHeight}px` }"
    >
      <div
        class="absolute -top-0.5 left-0 right-0 h-1 z-10 cursor-row-resize hover:bg-[#61afef]/40"
        @pointerdown.prevent="onInputResizeStart"
      ></div>
      <textarea
        ref="inputRef"
        v-model="input"
        spellcheck="false"
        placeholder="MQL 명령 입력 (Ctrl+Enter 실행 · Ctrl+Space 제안 · Ctrl+Shift+F 포매팅 · Ctrl+↑/↓ 이전 명령)"
        class="flex-1 self-stretch px-2 py-1 font-mono text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef] resize-none"
        @keydown="onInputKeydown"
        @keydown.ctrl.enter.prevent="runInput"
        @keydown.ctrl.up.prevent="recall(1)"
        @keydown.ctrl.down.prevent="recall(-1)"
        @input="onInputChange"
        @focus="onInputFocus"
        @blur="onInputBlur"
      ></textarea>
      <button
        class="h-7 px-3 flex items-center gap-1.5 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer"
        @click="runInput"
      >
        <Play :size="12" />
        실행
      </button>
    </div>
    <ContextMenu
      v-if="objectIdMenu"
      :menu="objectIdMenu"
      :items="objectIdMenuItems"
      @action="handleObjectIdAction"
      @close="objectIdMenu = null"
    />
    <ConsoleAssist
      v-if="assistItems.length"
      :items="assistItems"
      :index="assistIndex"
      :caret="assistCaret"
      @pick="acceptAssist"
    />
  </div>
</template>
