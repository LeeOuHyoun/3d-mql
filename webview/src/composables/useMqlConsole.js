import { clamp } from 'lodash-es'
import { request } from '@/api.js'

const HISTORY_LIMIT = 100
const STREAM_FLUSH_MS = 100
const passwordPattern = /\bpassword\s+\S/i
const readPattern = /^(print|list|temp|expand|query|help|version|eval)\b/i

export const hasWriteStatement = (command) =>
  command
    .split(';')
    .map((statement) => statement.trim())
    .some((statement) => statement && !readPattern.test(statement))

const isOpen = useStorage('3d-mql-console-open', false)
const input = ref('')
const entries = ref([])
const pending = ref(0)
const isRunning = computed(() => pending.value > 0)
const runCount = ref(0)
let seq = 0

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
    Object.assign(entry, { output: output.trim(), error, isFailed: !!error })
  } catch (e) {
    stream.flush()
    entry.error = e.message
  } finally {
    entry.elapsed = Date.now() - startedAt
    entry.isRunning = false
    pending.value--
    runCount.value++
  }
  return entry
}

const run = async (command = input.value, { confirm = true } = {}) => {
  const text = command.trim()
  if (!text) return
  isOpen.value = true
  input.value = text
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
  runCount,
  run,
  clear,
  openInEditor,
  history,
  recall,
  togglePin,
  removeHistory,
})
