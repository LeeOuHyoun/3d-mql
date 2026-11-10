<script setup>
import { Play, Copy, Check, FileText, ChevronRight, Table2, Highlighter, CirclePlus } from '@lucide/vue'
import { uniq } from 'lodash-es'
import { useMqlConsole } from '../composables/useMqlConsole.js'
import { gridOf, gridTsv, OBJECT_ID_PATTERN } from '../console/mqlResult.js'
import ConsoleText from './ConsoleText.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  findRegex: { type: RegExp, default: null },
})
const emit = defineEmits(['objectId', 'highlight', 'add'])

const objectIds = computed(() => uniq(props.entry.output.match(OBJECT_ID_PATTERN) ?? []))

const { run, openInEditor } = useMqlConsole()

const grid = computed(() => (props.entry.output ? gridOf(props.entry.command, props.entry.output) : null))
const isGridShown = computed(() => props.entry.isGrid && !!grid.value)
const resultText = computed(() => props.entry.output || props.entry.error)
const lineCount = computed(() => resultText.value.split('\n').length)

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
    <div class="flex items-start gap-1">
      <button :class="iconBtnClass" class="-ml-1 p-0!" :title="props.entry.isFolded ? '결과 펼치기' : '결과 접기'" @click="toggleFold">
        <ChevronRight :size="14" class="transition-transform" :class="!props.entry.isFolded && 'rotate-90'" />
      </button>
      <span class="text-[#61afef] shrink-0">MQL&gt;</span>
      <span class="flex-1 min-w-0 whitespace-pre-wrap break-all text-gray-800 dark:text-[#abb2bf]">{{ props.entry.command }}</span>
      <span class="shrink-0 text-gray-400">{{ props.entry.elapsed ? `${props.entry.elapsed}ms` : '' }}</span>
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
        <button :class="iconBtnClass" title="다시 실행" @click="run(props.entry.command)">
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
    <div v-if="props.entry.isFolded" class="ml-4 mt-0.5 text-gray-400 italic font-sans">
      {{ props.entry.elapsed ? `결과 ${lineCount}줄 접힘` : '실행 중...' }}
    </div>
    <pre v-else-if="props.entry.error" class="m-0 mt-0.5 whitespace-pre-wrap break-all text-red-600 dark:text-red-400"><ConsoleText
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
      @objectId="forwardObjectId"
    /><template v-else>{{ props.entry.elapsed ? '(결과 없음)' : '실행 중...' }}</template></pre>
  </div>
</template>
