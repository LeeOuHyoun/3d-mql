import { clamp } from 'lodash-es'
import { request } from '@/api.js'
import { opensAsGrid } from '@/console/mqlResult.js'

const HISTORY_LIMIT = 100
const STREAM_FLUSH_MS = 100
const SAVED_OUTPUT_LIMIT = 100000
const SAVED_TOTAL_LIMIT = 2000000
const SAVE_DELAY_MS = 500
const TRIMMED_NOTE = '\n… (저장 용량 때문에 결과 앞부분만 복원했습니다)'
const passwordPattern = /\bpassword\s+\S/i
const readPattern =
  /^(?:print|list|temp|expand|query|help|version|eval|verb\w*|(?:start|commit)\s+trans\w*|(?:set|push|pop)\s+cont\w*)\b/i

const dataWritePattern = /^\w+\s+(?:bus(?:inessobject)?|connection)\b/i

const writeStatementsOf = (command) =>
  command
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement && !readPattern.test(statement))

export const hasWriteStatement = (command) => writeStatementsOf(command).length > 0

const hasSchemaStatement = (command) => writeStatementsOf(command).some((statement) => !dataWritePattern.test(statement))

const isOpen = useStorage('3d-mql-console-open', false)
const input = ref('')
const pending = ref(0)
const isRunning = computed(() => pending.value > 0)
const writeCount = ref(0)
const schemaWriteCount = ref(0)
let seq = 0

const savedEntries = useStorage('3d-mql-console-entries', [])

const restoreEntry = (saved) =>
  reactive({
    id: ++seq,
    command: saved.command,
    output: saved.output,
    error: saved.error,
    isFailed: !!saved.error,
    isRunning: false,
    elapsed: saved.elapsed,
    isGrid: saved.isGrid,
    isFolded: saved.isFolded,
  })

const entries = ref(savedEntries.value.filter((saved) => !passwordPattern.test(saved.command)).map(restoreEntry))

const trimOutput = (output) => {
  if (output.length <= SAVED_OUTPUT_LIMIT) return output
  const cut = output.lastIndexOf('\n', SAVED_OUTPUT_LIMIT)
  return `${output.slice(0, cut > 0 ? cut : SAVED_OUTPUT_LIMIT)}${TRIMMED_NOTE}`
}

const saveEntries = () => {
  const kept = []
  let total = 0
  for (const entry of [...entries.value].reverse()) {
    if (entry.isRunning || passwordPattern.test(entry.command)) continue
    const output = trimOutput(entry.output)
    total += output.length + entry.command.length
    if (total > SAVED_TOTAL_LIMIT) break
    const isGrid = entry.isGrid && output === entry.output
    kept.unshift({ command: entry.command, output, error: entry.error, elapsed: entry.elapsed, isGrid, isFolded: entry.isFolded })
  }
  savedEntries.value = kept
}

watchDebounced(entries, saveEntries, { debounce: SAVE_DELAY_MS, deep: true })

const history = useStorage('3d-mql-console-history', [])
history.value = history.value.filter((item) => !passwordPattern.test(item.text))
let historyCursor = -1
let historyDraft = ''

const remember = (text) => {
  historyCursor = -1
  if (passwordPattern.test(text)) return
  const pinned = history.value.find((item) => item.text === text)?.pinned ?? false
  let unpinned = 0
  history.value = [{ text, pinned }, ...history.value.filter((item) => item.text !== text)].filter(
    (item) => item.pinned || ++unpinned <= HISTORY_LIMIT,
  )
}

const recall = (step) => {
  if (!history.value.length) return
  if (historyCursor === -1) historyDraft = input.value
  historyCursor = clamp(historyCursor + step, -1, history.value.length - 1)
  input.value = historyCursor === -1 ? historyDraft : history.value[historyCursor].text
}

const togglePin = (text) => {
  history.value = history.value.map((item) => (item.text === text ? { ...item, pinned: !item.pinned } : item))
}

const removeHistory = (text) => {
  history.value = history.value.filter((item) => item.text !== text)
}

const streamInto = (entry) => {
  let buffer = ''
  let timer
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    entry.output += buffer
    buffer = ''
  }
  const push = (text) => {
    buffer += text
    timer ??= setTimeout(flush, STREAM_FLUSH_MS)
  }
  return { push, flush }
}

const execute = async (text) => {
  pending.value++
  const entry = reactive({
    id: ++seq,
    command: text,
    output: '',
    error: '',
    isFailed: false,
    isRunning: true,
    elapsed: 0,
    isGrid: false,
    isFolded: false,
  })
  entries.value = [...entries.value.slice(-49), entry]
  const stream = streamInto(entry)
  const startedAt = Date.now()
  try {
    const { output, error } = await request('run', { command: text }, stream.push)
    stream.flush()
    Object.assign(entry, { output: output.trim(), error, isFailed: !!error, isGrid: !error && opensAsGrid(text, output) })
  } catch (e) {
    stream.flush()
    entry.error = e.message
  } finally {
    entry.elapsed = Date.now() - startedAt
    entry.isRunning = false
    pending.value--
    if (!entry.error && hasWriteStatement(text)) writeCount.value++
    if (!entry.error && hasSchemaStatement(text)) schemaWriteCount.value++
  }
  return entry
}

const run = async (command = input.value, { confirm = true, fill = true } = {}) => {
  const text = command.trim()
  if (!text) return
  isOpen.value = true
  if (fill) input.value = text
  const decision = confirm ? await request('confirmRun', { command: text }).catch(() => 'cancel') : 'run'
  if (decision === 'cancel') return
  remember(text)
  if (decision === 'transaction' && (await execute('start transaction;')).error) return
  return execute(text)
}

const clear = () => {
  entries.value = []
}

const openInEditor = (content) => request('openDocument', { content })

export const useMqlConsole = () => ({
  isOpen,
  input,
  entries,
  isRunning,
  writeCount,
  schemaWriteCount,
  run,
  clear,
  openInEditor,
  history,
  recall,
  togglePin,
  removeHistory,
})
