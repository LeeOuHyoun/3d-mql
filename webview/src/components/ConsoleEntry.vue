<script setup>
import {
  Play,
  Copy,
  Check,
  FileText,
  ChevronRight,
  Table2,
  Highlighter,
  CirclePlus,
  CircleAlert,
  Square,
  TextCursorInput,
} from '@lucide/vue'
import { uniq } from 'lodash-es'
import { useMqlConsole } from '../composables/useMqlConsole.js'
import { useCopyFeedback } from '../composables/useCopyFeedback.js'
import { gridOf, gridTsv, OBJECT_ID_PATTERN } from '../console/mqlResult.js'
import { highlightParts } from '../console/mqlHighlight.js'
import ConsoleText from './ConsoleText.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  findRegex: { type: RegExp, default: null },
})
const emit = defineEmits(['objectId', 'highlight', 'add'])

const objectIds = computed(() => uniq(props.entry.output.match(OBJECT_ID_PATTERN) ?? []))

const commandParts = computed(() => highlightParts(props.entry.command))

const { run, stop, insertInput, openInEditor } = useMqlConsole()

const { copy: copyHint, isCopied: isHintCopied } = useCopyFeedback()

const runHint = (hint) => {
  props.entry.hints = props.entry.hints.filter((item) => item !== hint)
  run(hint.text, { fill: false })
}

const grid = computed(() =>
  props.entry.output && !props.entry.isRunning && !props.entry.error ? gridOf(props.entry.command, props.entry.output) : null,
)
const isGridShown = computed(() => props.entry.isGrid && !!grid.value)
const resultText = computed(() => props.entry.output || props.entry.error)
const lineCount = computed(() => resultText.value.split('\n').length)
const isFoldShown = computed(() => props.entry.isFolded && !(props.findRegex && resultText.value.search(props.findRegex) >= 0))

const { copy, copied } = useClipboard({ legacy: true })

const copyResult = () => copy(isGridShown.value ? gridTsv(grid.value) : resultText.value)

const toggleGrid = () => {
  props.entry.isGrid = !props.entry.isGrid
  props.entry.isFolded = false
}

const toggleFold = () => {
  props.entry.isFolded = !props.entry.isFolded
}

const forwardObjectId = (e, id) => emit('objectId', e, id)

const iconBtnClass =
  'p-1 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer'
const cellClass = 'px-2 py-0.5 border border-gray-200 dark:border-[#3e4451] text-left align-top whitespace-pre-wrap break-all'
</script>

<template>
  <div class="group">
    <div class="sticky top-0 z-[2] -mx-3 px-3 pt-1.5 pb-0.5 flex items-start gap-1 bg-gray-50 dark:bg-[#21252b]">
      <button :class="iconBtnClass" class="-ml-1 p-0!" :title="props.entry.isFolded ? '결과 펼치기' : '결과 접기'" @click="toggleFold">
        <ChevronRight :size="14" class="transition-transform" :class="!props.entry.isFolded && 'rotate-90'" />
      </button>
      <span class="text-[#61afef] shrink-0">MQL&gt;</span>
      <span class="flex-1 min-w-0 whitespace-pre-wrap break-all text-gray-800 dark:text-[#abb2bf]"
        ><ConsoleText
          v-if="props.findRegex"
          :text="props.entry.command"
          :findRegex="props.findRegex"
          @objectId="forwardObjectId" /><template v-else
          ><span v-for="(part, index) in commandParts" :key="index" :class="part.cls">{{ part.text }}</span></template
        ></span
      >
      <span v-if="props.entry.error" class="shrink-0 flex text-red-500" title="실패">
        <CircleAlert :size="12" />
      </span>
      <span class="shrink-0 text-gray-400">{{ props.entry.elapsed ? `${props.entry.elapsed}ms` : '' }}</span>
      <button v-if="props.entry.isRunning" :class="iconBtnClass" class="text-red-500!" title="실행 중단" @click="stop">
        <Square :size="12" />
      </button>
      <button
        v-if="grid"
        :class="[iconBtnClass, isGridShown && 'text-[#61afef]!']"
        :title="isGridShown ? '텍스트로 보기' : '표로 보기'"
        @click="toggleGrid"
      >
        <Table2 :size="12" />
      </button>
      <span class="shrink-0 flex invisible group-hover:visible">
        <template v-if="objectIds.length">
          <button
            :class="iconBtnClass"
            :title="`결과의 ID ${objectIds.length}개를 그래프에서 강조`"
            @click="emit('highlight', objectIds)"
          >
            <Highlighter :size="12" />
          </button>
          <button
            :class="iconBtnClass"
            :title="`결과의 객체 ${objectIds.length}개를 그래프에 추가 (기준 객체 유지)`"
            @click="emit('add', objectIds)"
          >
            <CirclePlus :size="12" />
          </button>
        </template>
        <button v-if="!props.entry.isSecret" :class="iconBtnClass" title="다시 실행" @click="run(props.entry.command)">
          <Play :size="12" />
        </button>
        <button :class="iconBtnClass" :title="isGridShown ? '표 복사 (TSV)' : '결과 복사'" @click="copyResult">
          <Check v-if="copied" :size="12" class="text-green-500" />
          <Copy v-else :size="12" />
        </button>
        <button :class="iconBtnClass" title="결과를 에디터로 열기" @click="openInEditor(resultText)">
          <FileText :size="12" />
        </button>
      </span>
    </div>
    <div v-if="isFoldShown" class="ml-4 mt-0.5 text-gray-400 italic font-sans">
      {{ props.entry.elapsed ? `결과 ${lineCount}줄 접힘` : '실행 중...' }}
    </div>
    <pre v-else-if="props.entry.error && !props.entry.output" class="m-0 mt-0.5 whitespace-pre-wrap break-all text-red-600 dark:text-red-400"><ConsoleText
      :text="props.entry.error"
      :findRegex="props.findRegex"
      @objectId="forwardObjectId"
    /></pre>
    <div v-else-if="isGridShown" class="mt-1 overflow-auto max-h-96">
      <table class="border-collapse text-gray-700 dark:text-[#abb2bf]">
        <thead>
          <tr>
            <th
              v-for="(name, index) in grid.head"
              :key="index"
              :class="cellClass"
              class="sticky top-0 font-bold bg-gray-100 dark:bg-[#2c313a] text-gray-600 dark:text-[#61afef]"
            >
              {{ name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in grid.rows" :key="rowIndex" class="hover:bg-[#61afef]/10">
            <td v-for="(name, colIndex) in grid.head" :key="colIndex" :class="cellClass">
              <ConsoleText :text="row[colIndex] ?? ''" :findRegex="props.findRegex" @objectId="forwardObjectId" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <pre
      v-else
      class="m-0 mt-0.5 whitespace-pre-wrap break-all text-gray-600 dark:text-[#98c379]"
    ><ConsoleText
      v-if="props.entry.output"
      :text="props.entry.output"
      :findRegex="props.findRegex"
      :tones="!props.entry.isRunning"
      @objectId="forwardObjectId"
    /><template v-else>{{ props.entry.elapsed ? '(결과 없음)' : '실행 중...' }}</template></pre>
    <pre
      v-if="!isFoldShown && props.entry.output && props.entry.error && !props.entry.isFailed"
      class="m-0 mt-0.5 whitespace-pre-wrap break-all text-red-600 dark:text-red-400"
    >{{ props.entry.error }}</pre>
    <template v-if="!isFoldShown">
      <div
        v-for="(hint, index) in props.entry.hints"
        :key="index"
        class="mt-1 ml-4 px-2 py-1 rounded border border-dashed border-gray-300 dark:border-[#3e4451] font-sans text-gray-500 dark:text-[#7f848e]"
      >
        <div v-if="hint.text" class="flex items-start gap-1">
          <span class="shrink-0">{{ hint.label }}:</span>
          <span class="flex-1 min-w-0 font-mono whitespace-pre-wrap break-all text-gray-700 dark:text-[#abb2bf]">{{
            hint.text
          }}</span>
          <button v-if="hint.isRunnable" :class="iconBtnClass" :title="`${hint.label} 실행`" @click="runHint(hint)">
            <Play :size="12" />
          </button>
          <button :class="iconBtnClass" title="입력창에 넣기" @click="insertInput(hint.text)">
            <TextCursorInput :size="12" />
          </button>
          <button :class="iconBtnClass" title="복사" @click="copyHint(hint.text, index)">
            <Check v-if="isHintCopied(index)" :size="12" class="text-green-500" />
            <Copy v-else :size="12" />
          </button>
        </div>
        <div v-if="hint.note">{{ hint.note }}</div>
      </div>
    </template>
  </div>
</template>
