<script setup>
import { X, Terminal, Play, Eraser, Copy, Check, FileText, Loader2, Maximize2, Minimize2 } from '@lucide/vue'
import { useMqlConsole } from '../composables/useMqlConsole.js'
import { usePanelResize } from '../composables/usePanelResize.js'

const fullscreen = defineModel('fullscreen', { type: Boolean, default: false })
const { isOpen, input, entries, isRunning, run, clear, openInEditor } = useMqlConsole()
const { width: height, onResizeStart } = usePanelResize('console', 220, 'top')
const { width: inputHeight, onResizeStart: onInputResizeStart } = usePanelResize('console-input', 92, 'top', 48, 400)

const { copy, copied } = useClipboard({ legacy: true })
const copiedId = ref(0)

const handleCopy = (entry) => {
  copy(entry.output || entry.error)
  copiedId.value = entry.id
}

const logRef = ref(null)

watch(
  () => entries.value.length,
  () => nextTick(() => logRef.value && (logRef.value.scrollTop = logRef.value.scrollHeight)),
)

const iconBtnClass =
  'p-1 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer'
</script>

<template>
  <div
    class="bg-gray-50 dark:bg-[#21252b] flex flex-col"
    :class="fullscreen ? 'fixed inset-0 z-40' : 'relative shrink-0 border-t border-gray-200 dark:border-[#3e4451]'"
    :style="fullscreen ? undefined : { height: `${height}px` }"
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
      <button :class="iconBtnClass" title="기록 지우기" @click="clear">
        <Eraser :size="14" />
      </button>
      <button :class="iconBtnClass" :title="fullscreen ? '전체 화면 종료 (Esc)' : '전체 화면 (Ctrl+Alt+C)'" @click="fullscreen = !fullscreen">
        <Minimize2 v-if="fullscreen" :size="14" />
        <Maximize2 v-else :size="14" />
      </button>
      <button :class="iconBtnClass" title="닫기" @click="isOpen = false">
        <X :size="14" />
      </button>
    </div>
    <div ref="logRef" class="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] flex flex-col gap-2">
      <div v-if="!entries.length" class="text-gray-400 italic font-sans">
        MQL 명령을 입력하고 Ctrl+Enter로 실행합니다. 그래프 우클릭 메뉴의 ▶ 버튼으로도 실행할 수 있습니다.
      </div>
      <div v-for="entry in entries" :key="entry.id" class="group">
        <div class="flex items-start gap-1">
          <span class="text-[#61afef] shrink-0">MQL&gt;</span>
          <span class="flex-1 min-w-0 whitespace-pre-wrap break-all text-gray-800 dark:text-[#abb2bf]">{{ entry.command }}</span>
          <span class="shrink-0 text-gray-400">{{ entry.elapsed ? `${entry.elapsed}ms` : '' }}</span>
          <span class="shrink-0 flex invisible group-hover:visible">
            <button :class="iconBtnClass" title="다시 실행" @click="run(entry.command)">
              <Play :size="12" />
            </button>
            <button :class="iconBtnClass" title="결과 복사" @click="handleCopy(entry)">
              <Check v-if="copied && copiedId === entry.id" :size="12" class="text-green-500" />
              <Copy v-else :size="12" />
            </button>
            <button :class="iconBtnClass" title="결과를 에디터로 열기" @click="openInEditor(entry.output || entry.error)">
              <FileText :size="12" />
            </button>
          </span>
        </div>
        <pre
          v-if="entry.error"
          class="m-0 mt-0.5 whitespace-pre-wrap break-all text-red-600 dark:text-red-400"
        >{{ entry.error }}</pre>
        <pre
          v-else
          class="m-0 mt-0.5 whitespace-pre-wrap break-all text-gray-600 dark:text-[#98c379]"
        >{{ entry.output || (entry.elapsed ? '(결과 없음)' : '실행 중...') }}</pre>
      </div>
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
        v-model="input"
        spellcheck="false"
        placeholder="MQL 명령 입력 (Ctrl+Enter 실행)"
        class="flex-1 self-stretch px-2 py-1 font-mono text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef] resize-none"
        @keydown.ctrl.enter.prevent="run()"
      ></textarea>
      <button
        class="h-7 px-3 flex items-center gap-1.5 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer"
        @click="run()"
      >
        <Play :size="12" />
        실행
      </button>
    </div>
  </div>
</template>
