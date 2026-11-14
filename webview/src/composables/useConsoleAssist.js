import { onMessage, post, request } from '@/api.js'
import { flattenStatement, formatMqlText, statementSpanAt } from '@/console/mqlFormat.js'
import {
  insertTextOf,
  isTemplate,
  matchPhrases,
  nextPlaceholder,
  placeholderSpans,
  schemaKindOf,
  statementPrefix,
} from '@/console/mqlAssist.js'
import { useMqlConsole } from './useMqlConsole.js'

const MIRROR_STYLES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
]

const schemaNames = new Map()
const { schemaWriteCount } = useMqlConsole()

watch(schemaWriteCount, () => schemaNames.clear())

const namesOf = (kind) => {
  if (!schemaNames.has(kind)) {
    schemaNames.set(
      kind,
      request('list', { kind }).catch(() => {
        schemaNames.delete(kind)
        return []
      }),
    )
  }
  return schemaNames.get(kind)
}

const caretOffset = (el) => (el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd)

const caretBox = (el) => {
  const style = getComputedStyle(el)
  const mirror = document.createElement('div')
  Object.assign(mirror.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    width: `${el.clientWidth}px`,
    border: '0',
  })
  MIRROR_STYLES.forEach((name) => {
    mirror.style[name] = style[name]
  })
  mirror.textContent = el.value.slice(0, caretOffset(el))
  const mark = document.createElement('span')
  mark.textContent = '\u200b'
  mirror.append(mark)
  document.body.append(mirror)
  const markRect = mark.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  mirror.remove()
  const rect = el.getBoundingClientRect()
  const x = rect.left + el.clientLeft + markRect.left - mirrorRect.left - el.scrollLeft
  const top = rect.top + el.clientTop + markRect.top - mirrorRect.top - el.scrollTop
  return { x, top, bottom: top + markRect.height }
}

const isCtrlSpace = (e) => e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.code === 'Space' || e.key === ' ')

const isFormatKey = (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyF'

const replaceRange = (el, from, to, text) => {
  el.focus()
  el.setSelectionRange(from, to)
  if (document.execCommand('insertText', false, text)) return
  el.setRangeText(text, from, to, 'end')
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useConsoleAssist(textarea) {
  const items = ref([])
  const index = ref(0)
  const caret = ref({ x: 0, top: 0, bottom: 0 })
  let token = 0

  const close = () => {
    token += 1
    items.value = []
  }

  const open = async (force = false) => {
    const el = textarea.value
    if (!el) return
    const current = ++token
    const kind = schemaKindOf(statementPrefix(el.value, caretOffset(el)).raw)
    const names = kind ? await namesOf(kind) : []
    if (current !== token || document.activeElement !== el) return
    const { raw } = statementPrefix(el.value, caretOffset(el))
    const matches = matchPhrases(raw, force, schemaKindOf(raw) === kind ? names : [])
    index.value = 0
    items.value = matches.map((text) => ({ text, isTemplate: isTemplate(text) }))
    if (matches.length) caret.value = caretBox(el)
  }

  const move = (step) => {
    index.value = (index.value + step + items.value.length) % items.value.length
  }

  const jump = (back) => {
    const el = textarea.value
    const span = el && nextPlaceholder(el.value, el.selectionStart, el.selectionEnd, back)
    if (!span) return false
    el.focus()
    el.setSelectionRange(span.start, span.end)
    return true
  }

  const accept = (at = index.value) => {
    const el = textarea.value
    const item = items.value[at]
    if (!el || !item) return
    const { from, to } = statementPrefix(el.value, caretOffset(el))
    close()
    replaceRange(el, from, to, insertTextOf(item.text))
    if (!item.isTemplate) return
    el.setSelectionRange(from, from)
    jump(false)
  }

  const format = () => {
    const el = textarea.value
    if (!el) return
    const { selectionStart: start, selectionEnd: end, value } = el
    const isWhole = start === end
    const source = isWhole ? value : value.slice(start, end)
    const formatted = source.trim() ? formatMqlText(source) : ''
    if (!formatted || formatted === source) return
    close()
    replaceRange(el, isWhole ? 0 : start, isWhole ? value.length : end, formatted)
    if (!isWhole) el.setSelectionRange(start, start + formatted.length)
  }

  const takeStatement = () => {
    const el = textarea.value
    const statement = el && statementSpanAt(el.value, caretOffset(el))
    if (!statement) return ''
    const hole = placeholderSpans(el.value).find((span) => span.start >= statement.start && span.end <= statement.end)
    if (hole) {
      el.focus()
      el.setSelectionRange(hole.start, hole.end)
      post({ type: 'notify', text: '채우지 않은 <…> 칸이 있어 실행하지 않았습니다.', warning: true })
      return ''
    }
    if (el.value[statement.end - 1] !== ';') {
      const { selectionStart, selectionEnd } = el
      const shift = (pos) => (pos >= statement.end ? pos + 1 : pos)
      replaceRange(el, statement.end, statement.end, ';')
      el.setSelectionRange(shift(selectionStart), shift(selectionEnd))
    }
    return flattenStatement(statement.words)
  }

  const navigate = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') move(e.key === 'ArrowDown' ? 1 : -1)
    else accept()
  }

  const onKeydown = (e) => {
    if (e.isComposing) return
    const isModified = e.ctrlKey || e.altKey || e.metaKey
    if (isCtrlSpace(e)) {
      e.preventDefault()
      open(true)
    } else if (isFormatKey(e)) {
      e.preventDefault()
      e.stopPropagation()
      format()
    } else if (items.value.length && isModified && /^Arrow(Up|Down)$/.test(e.key)) close()
    else if (items.value.length && !isModified && /^(Arrow(Up|Down)|Escape|Enter|Tab)$/.test(e.key)) {
      e.preventDefault()
      navigate(e)
    } else if (e.key === 'Tab' && !isModified && jump(e.shiftKey)) e.preventDefault()
  }

  const onInput = () => {
    if (items.value.length) open()
  }

  const setFocus = (focused) => post({ type: 'consoleFocus', focused })

  const onFocus = () => setFocus(true)

  const onBlur = () => {
    close()
    setFocus(false)
  }

  const shortcuts = { suggest: () => open(true), format }

  tryOnScopeDispose(
    onMessage((message) => {
      if (message?.type === 'shortcut' && document.activeElement === textarea.value) shortcuts[message.name]?.()
    }),
  )
  tryOnScopeDispose(() => setFocus(false))

  return { items, index, caret, close, accept, takeStatement, onKeydown, onInput, onFocus, onBlur }
}
