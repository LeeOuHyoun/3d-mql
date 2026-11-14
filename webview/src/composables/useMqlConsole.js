import { clamp } from 'lodash-es'
import { onMessage, request } from '@/api.js'
import { opensAsGrid } from '@/console/mqlResult.js'
import { quoteName } from '@/console/mqlAssist.js'

const HISTORY_LIMIT = 100
const STREAM_FLUSH_MS = 100
const SAVED_OUTPUT_LIMIT = 100000
const SAVED_TOTAL_LIMIT = 2000000
const SAVE_DELAY_MS = 500
const TRIMMED_NOTE = '\n… (저장 용량 때문에 결과 앞부분만 복원했습니다)'
const secretPattern = /'[^']*'|"[^"]*"|(\bpassword\s+)('[^']*'|"[^"]*"|[^\s;'"]+)/gi
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

const maskSecret = (text) => text.replace(secretPattern, (match, head) => (head ? `${head}****` : match))

const hasSecret = (text) => maskSecret(text) !== text

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

const entries = ref(savedEntries.value.filter((saved) => !hasSecret(saved.command)).map(restoreEntry))

const trimOutput = (output) => {
  if (output.length <= SAVED_OUTPUT_LIMIT) return output
  const cut = output.lastIndexOf('\n', SAVED_OUTPUT_LIMIT)
  return `${output.slice(0, cut > 0 ? cut : SAVED_OUTPUT_LIMIT)}${TRIMMED_NOTE}`
}

const saveEntries = () => {
  const kept = []
  let total = 0
  for (const entry of [...entries.value].reverse()) {
    if (entry.isRunning || entry.isSecret) continue
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
history.value = history.value.filter((item) => !hasSecret(item.text))
let historyCursor = -1
let historyDraft = ''

const remember = (text) => {
  historyCursor = -1
  if (hasSecret(text)) return
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

const SYMBOLIC_ADMINS = new Set([
  'attribute',
  'type',
  'policy',
  'relationship',
  'interface',
  'format',
  'store',
  'vault',
  'role',
  'group',
  'association',
  'program',
  'command',
  'menu',
  'form',
  'table',
  'channel',
  'portal',
  'page',
  'inquiry',
])
const addAdminPattern = /^add\s+([a-z]+)\s+(?:'([^']+)'|"([^"]+)"|([^\s;'"]+))/i

const symbolicTarget = (command) => {
  const match = addAdminPattern.exec(command.trim())
  const admin = match?.[1].toLowerCase()
  if (!admin || !SYMBOLIC_ADMINS.has(admin)) return null
  const name = match[2] ?? match[3] ?? match[4]
  const suffix = admin === 'table' ? ' system' : ''
  return {
    key: `${admin} ${name}`,
    text: `add property ${admin}_${name.replace(/\s+/g, '')} on program eServiceSchemaVariableMapping.tcl to ${admin} ${quoteName(name)}${suffix};`,
  }
}

const addSymbolicHint = async (entry, command) => {
  const target = symbolicTarget(command)
  if (!target) return
  const found = await request('symbolics', { names: [target.key] }).catch(() => null)
  if (!found || found[target.key]) return
  entry.hints = [...(entry.hints ?? []), { label: '심볼릭 등록', text: target.text, isRunnable: true }]
}

const execute = async (text) => {
  pending.value++
  const entry = reactive({
    id: ++seq,
    command: maskSecret(text),
    output: '',
    error: '',
    isFailed: false,
    isRunning: true,
    isSecret: hasSecret(text),
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
    if (!error) void addSymbolicHint(entry, text)
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

const inFlight = new Set()

const run = async (command = input.value, { confirm = true, fill = true } = {}) => {
  const text = command.trim()
  const key = text.endsWith(';') ? text : `${text};`
  if (!text || inFlight.has(key)) return
  inFlight.add(key)
  try {
    isOpen.value = true
    if (fill) input.value = text
    const decision = confirm ? await request('confirmRun', { command: text }).catch(() => 'cancel') : 'run'
    if (decision === 'cancel') return
    remember(text)
    if (decision === 'transaction' && (await execute('start transaction;')).error) return
    return await execute(text)
  } finally {
    inFlight.delete(key)
  }
}

const stop = () => request('stop').catch(() => false)

const isTxActive = ref(false)

onMessage((message) => {
  if (message?.type === 'tx') isTxActive.value = !!message.active
  else if (message?.type === 'init') isTxActive.value = !!message.tx
})

const insertInput = (text) => {
  input.value = input.value.trim() ? `${input.value.replace(/\s+$/, '')}\n${text}` : text
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
  stop,
  isTxActive,
  insertInput,
  clear,
  openInEditor,
  history,
  recall,
  togglePin,
  removeHistory,
})
