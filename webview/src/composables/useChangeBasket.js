import { post, request } from '@/api.js'
import { OBJECT_ID_PATTERN } from '@/console/mqlResult.js'
import { useMqlConsole } from './useMqlConsole.js'

const TRANSACTION_SECONDS = 120
const bar = '#'.repeat(71)
const removeKinds = ['disconnect', 'delete']

export const pendingId = (key) => `pending-${key}`

export const pendingKey = (id) => Number(String(id).replace(/^pending-/, ''))

export const isPending = (item) => item.status !== 'done'

export function useChangeBasket(connection, onApplied, scriptInfo) {
  const { run, openInEditor } = useMqlConsole()
  const runChange = (command) => run(command, { confirm: false, fill: false })
  const changes = ref([])
  const isBasketOpen = ref(false)
  const isApplying = ref(false)
  const pendingChanges = computed(() => changes.value.filter(isPending))

  const createOf = (id) => changes.value.find((item) => item.kind === 'create' && pendingId(item.key) === id)

  const dependentsOf = (key) =>
    changes.value.filter((item) => [item.params?.from, item.params?.to].includes(pendingId(key)))

  const buildChange = async (params, meta, key) => {
    const refs = { fromObject: createOf(params.from)?.params.object, toObject: createOf(params.to)?.params.object }
    const change = await request('change', { ...params, ...refs })
    return { ...change, ...meta, params, key: key ?? Math.max(0, ...changes.value.map((item) => item.key)) + 1 }
  }

  const stageChange = async (params, meta) => {
    const change = await buildChange(params, meta)
    changes.value = [...changes.value, { ...change, status: '', error: '' }]
    post({ type: 'notify', text: `변경 바구니에 담았습니다: ${meta.label}` })
    return change.key
  }

  const isLocked = () => {
    const locked = isApplying.value || !!transaction.value
    if (locked) post({ type: 'notify', warning: true, text: '바구니를 실행하는 동안에는 항목을 빼거나 고칠 수 없습니다.' })
    return locked
  }

  const updateChange = async (key, params, meta) => {
    if (isLocked()) return
    const change = await buildChange(params, meta, key)
    changes.value = changes.value.map((item) => (item.key === key ? { ...change, status: '', error: '' } : item))
  }

  const removeChange = (key) => {
    if (isLocked()) return
    const dependents = dependentsOf(key).map((item) => item.key)
    changes.value = changes.value.filter((item) => item.key !== key && !dependents.includes(item.key))
    if (dependents.length) post({ type: 'notify', text: `이 객체를 쓰는 연결 문장 ${dependents.length}건도 함께 뺐습니다.` })
  }

  const clearChanges = () => {
    changes.value = []
  }

  const overlay = computed(() => {
    const createdIds = Object.fromEntries(
      changes.value.filter((item) => item.createdId).map((item) => [pendingId(item.key), item.createdId]),
    )
    const resolve = (id) => createdIds[id] ?? id
    return {
      nodes: pendingChanges.value.filter((item) => item.node).map(({ key, node }) => ({ ...node, id: pendingId(key) })),
      edges: pendingChanges.value
        .filter((item) => item.edge)
        .map(({ key, edge }) => ({
          id: pendingId(key),
          source: resolve(edge.from),
          target: resolve(edge.to),
          label: edge.relType,
        })),
      pending: Object.fromEntries(
        pendingChanges.value.flatMap(({ key, kind, edge, node, marks = [] }) =>
          edge || node
            ? [[pendingId(key), 'add']]
            : marks.map((id) => [id, removeKinds.includes(kind) ? 'remove' : 'change']),
        ),
      ),
    }
  })

  const runChanges = async (isPreview) => {
    isApplying.value = true
    const createdIds = []
    const connected = []
    try {
      for (const change of pendingChanges.value) {
        if (isPreview && !transaction.value) break
        const { error, output } = await runChange(change.forward)
        const createdId = change.kind === 'create' && !error ? output.match(OBJECT_ID_PATTERN)?.at(-1) : undefined
        Object.assign(change, { status: error ? 'failed' : 'done', error, createdId })
        if (createdId) createdIds.push(createdId)
        if (error) break
        if (change.kind === 'connect') connected.push(change.params)
      }
    } finally {
      isApplying.value = false
    }
    if (isPreview && transaction.value) resume()
    await onApplied(createdIds, connected)
  }

  const applyChanges = () => runChanges(false)

  const transaction = ref(null)

  const resetChanges = (keys) =>
    changes.value
      .filter((item) => keys.includes(item.key))
      .forEach((item) => Object.assign(item, { status: '', error: '', createdId: undefined }))

  const finishTransaction = async (action) => {
    if (!transaction.value) return
    const { keys } = transaction.value
    pause()
    transaction.value = null
    const { error } = await runChange(`${action} transaction;`)
    if (action === 'abort' || error) resetChanges(keys)
    await onApplied()
  }

  const { pause, resume } = useIntervalFn(
    () => {
      transaction.value.remaining -= 1
      if (transaction.value.remaining <= 0) finishTransaction('abort')
    },
    1000,
    { immediate: false },
  )

  const previewChanges = async () => {
    const keys = pendingChanges.value.map((item) => item.key)
    isApplying.value = true
    const { error } = await runChange('start transaction;')
    if (error) {
      isApplying.value = false
      return
    }
    transaction.value = { remaining: TRANSACTION_SECONDS, keys }
    await runChanges(true)
  }

  watch(
    () => connection.value.state,
    (state) => {
      if (state === 'ready' || !transaction.value) return
      resetChanges(transaction.value.keys)
      pause()
      transaction.value = null
    },
  )

  const scriptOf = (title, lines) => {
    const { name, user } = scriptInfo()
    return [
      bar,
      `# Created : ${new Date().toLocaleDateString('sv').replaceAll('-', '.')}`,
      `# Name : ${name} ${title}`,
      `# Create by ${user}`,
      bar,
      '',
      ...lines,
      '',
    ].join('\n')
  }

  const exportScript = () =>
    openInEditor(
      scriptOf(
        '변경 스크립트',
        changes.value.flatMap(({ note, forward }) => [...(note ? [`# ${note}`] : []), forward]),
      ),
    )

  const exportRollback = () => {
    const hasRun = changes.value.some((item) => item.status)
    const targets = hasRun ? changes.value.filter((item) => !isPending(item)) : changes.value
    const skipped = changes.value.length - targets.length
    return openInEditor(
      scriptOf('롤백 스크립트', [
        ...(skipped ? [`# 실행하지 않은 문장 ${skipped}건은 되돌릴 것이 없어 뺐습니다.`] : []),
        ...[...targets].reverse().map(({ inverse, forward }) => inverse || `# 되돌리는 문장 없음: ${forward}`),
      ]),
    )
  }

  return {
    changes,
    pendingChanges,
    isBasketOpen,
    isApplying,
    transaction,
    overlay,
    createOf,
    dependentsOf,
    stageChange,
    updateChange,
    removeChange,
    clearChanges,
    applyChanges,
    previewChanges,
    finishTransaction,
    exportScript,
    exportRollback,
  }
}
