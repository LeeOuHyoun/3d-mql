<script setup>
import { X, Play, Copy, Check, Search, TextCursorInput, RefreshCw, Loader2 } from '@lucide/vue'
import { request } from '../api.js'
import { useMqlConsole } from '../composables/useMqlConsole.js'
import { useCopyFeedback } from '../composables/useCopyFeedback.js'
import { buildFindRegex } from '../console/mqlResult.js'
import { quoteName } from '../console/mqlAssist.js'
import ConsoleText from './ConsoleText.vue'

const LIST_KINDS = [
  'type',
  'person',
  'policy',
  'attribute',
  'relationship',
  'program',
  'vault',
  'role',
  'group',
  'association',
  'command',
  'menu',
  'form',
  'table',
  'channel',
  'portal',
  'page',
]
const HELP_ADMIN = [
  'application', 'association', 'attribute', 'bus', 'businessobject', 'channel', 'command', 'connection', 'context', 'dataobject',
  'dimension', 'expression', 'filter', 'form', 'format', 'group', 'index', 'inheritancerule', 'inquiry', 'interface',
  'location', 'menu', 'package', 'page', 'path', 'pathtype', 'person', 'policy', 'portal', 'product',
  'program', 'property', 'relationship', 'resource', 'role', 'rule', 'searchindex', 'site', 'store', 'system',
  'table', 'transaction', 'type', 'uniquekey', 'user', 'vault', 'webreport',
]
const HELP_COMMANDS = [
  'abort', 'add', 'approve', 'checkin', 'checkout', 'checkshowaccess', 'clear', 'commit', 'compare', 'compile',
  'config', 'connect', 'copy', 'del', 'delete', 'demote', 'disable', 'disconnect', 'enable', 'env',
  'escape', 'eval', 'evaluate', 'eventmonitor', 'exec', 'execute', 'expand', 'export', 'extract', 'history',
  'ignore', 'import', 'insert', 'list', 'lock', 'mail', 'mod', 'modify', 'monitor', 'move',
  'mql', 'override', 'password', 'pop', 'print', 'promote', 'push', 'query', 'reject', 'run',
  'server', 'sessions', 'set', 'start', 'temp', 'thread', 'toolset', 'trace', 'transfer', 'transition',
  'trigger', 'unlock', 'validate', 'verb', 'verbose', 'version',
]

const emit = defineEmits(['close', 'insert'])

const { run, schemaWriteCount } = useMqlConsole()
const { copy, isCopied } = useCopyFeedback()

const mode = useStorage('3d-mql-console-schema-mode', 'list')
const listKind = useStorage('3d-mql-console-schema-kind', 'type')
const helpTopic = useStorage('3d-mql-console-schema-topic', '')
const keyword = ref('')
const names = ref([])
const symbolics = shallowRef({})
const helpOutput = ref('')
const isLoading = ref(false)
const error = ref('')
let token = 0

const load = async () => {
  const current = ++token
  isLoading.value = true
  error.value = ''
  try {
    if (mode.value === 'help') {
      const text = await request('help', { topic: helpTopic.value })
      if (current === token) helpOutput.value = text
      return
    }
    const [list, map] = await Promise.all([
      request('list', { kind: listKind.value }),
      request('symbolicMap').catch(() => ({})),
    ])
    if (current !== token) return
    names.value = list
    symbolics.value = map
  } catch (e) {
    if (current === token) error.value = e.message
  } finally {
    if (current === token) isLoading.value = false
  }
}

watch([mode, listKind, helpTopic], load, { immediate: true })
watch(schemaWriteCount, () => mode.value === 'list' && load())

const filtered = computed(() => {
  const query = keyword.value.toLowerCase().trim()
  return query ? names.value.filter((name) => name.toLowerCase().includes(query)) : names.value
})

const symbolicOf = (name) => symbolics.value[`${listKind.value} ${name}`] ?? ''

const printCommand = (name) => `print ${listKind.value} ${quoteName(name)}${listKind.value === 'table' ? ' system' : ''};`

const helpRef = ref(null)
const findRegex = computed(() =>
  mode.value === 'help' && keyword.value.trim() ? buildFindRegex(keyword.value.trim(), { matchCase: false, useRegex: false }) : null,
)

watch(findRegex, () => nextTick(() => helpRef.value?.querySelector('[data-find-hit]')?.scrollIntoView({ block: 'nearest' })))

const iconBtnClass =
  'p-0.5 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] cursor-pointer'
const selectClass =
  'flex-1 min-w-0 h-6 px-1 rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]'
const tabClass = 'h-6 px-2 rounded-md border-none text-xs font-semibold cursor-pointer'
</script>

<template>
  <div class="w-64 shrink-0 border-l border-gray-200 dark:border-[#3e4451] flex flex-col bg-white dark:bg-[#282c34] text-xs">
    <div class="px-2 py-1.5 flex items-center gap-1 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
      <button
        v-for="name in ['list', 'help']"
        :key="name"
        :class="[tabClass, mode === name ? 'bg-[#61afef]/15 text-[#61afef]' : 'bg-transparent text-gray-500 dark:text-[#abb2bf]']"
        @click="mode = name"
      >
        {{ name }}
      </button>
      <select v-if="mode === 'list'" v-model="listKind" :class="selectClass" aria-label="list 대상">
        <option v-for="kind in LIST_KINDS" :key="kind" :value="kind">{{ kind }}</option>
      </select>
      <select v-else v-model="helpTopic" :class="selectClass" aria-label="help 대상">
        <option value="">전체</option>
        <optgroup label="대상">
          <option v-for="topic in HELP_ADMIN" :key="topic" :value="topic">{{ topic }}</option>
        </optgroup>
        <optgroup label="명령">
          <option v-for="topic in HELP_COMMANDS" :key="topic" :value="topic">{{ topic }}</option>
        </optgroup>
      </select>
      <button :class="iconBtnClass" title="다시 조회" @click="load">
        <Loader2 v-if="isLoading" :size="14" class="animate-spin" />
        <RefreshCw v-else :size="14" />
      </button>
      <button :class="iconBtnClass" title="닫기" @click="emit('close')">
        <X :size="14" />
      </button>
    </div>
    <div class="px-2 py-1 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
      <div class="relative flex items-center">
        <Search :size="12" class="absolute left-2 text-gray-400 pointer-events-none" />
        <input
          v-model="keyword"
          :placeholder="mode === 'list' ? '이름 필터' : 'help 내용에서 찾기'"
          spellcheck="false"
          class="w-full h-6 pl-6 pr-2 rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
      </div>
    </div>
    <div v-if="error" class="p-3 text-red-500 break-all">조회하지 못했습니다. {{ error }}</div>
    <pre
      v-else-if="mode === 'help'"
      ref="helpRef"
      class="flex-1 min-h-0 m-0 p-2 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-all text-gray-700 dark:text-[#abb2bf]"
    ><ConsoleText :text="helpOutput" :findRegex="findRegex" /></pre>
    <div v-else class="flex-1 min-h-0 overflow-auto">
      <div v-if="!isLoading && !filtered.length" class="p-3 text-gray-400 italic text-center">결과가 없습니다.</div>
      <div
        v-for="name in filtered"
        :key="name"
        class="group px-2 py-1 flex items-center gap-1 border-b border-gray-100 dark:border-[#3e4451]/60 hover:bg-[#61afef]/10"
      >
        <span class="flex-1 min-w-0 truncate font-mono text-[11px] text-gray-800 dark:text-[#abb2bf]" :title="name">
          {{ name }}
          <span v-if="symbolicOf(name)" class="text-gray-400 dark:text-[#5c6370]">{{ symbolicOf(name) }}</span>
        </span>
        <button
          :class="[iconBtnClass, 'invisible group-hover:visible']"
          :title="`${printCommand(name)} 실행`"
          @click="run(printCommand(name), { fill: false })"
        >
          <Play :size="12" />
        </button>
        <button :class="[iconBtnClass, 'invisible group-hover:visible']" title="커서 위치에 넣기" @click="emit('insert', quoteName(name))">
          <TextCursorInput :size="12" />
        </button>
        <button :class="[iconBtnClass, 'invisible group-hover:visible']" title="이름 복사" @click="copy(name, name)">
          <Check v-if="isCopied(name)" :size="12" class="text-green-500" />
          <Copy v-else :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>
