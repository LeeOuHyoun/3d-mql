import { onMessage, post, request } from '@/api.js'
import { flattenStatement, formatMqlText, joinLinesAt, statementSpanAt } from '@/console/mqlFormat.js'
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

const lineAt = (value, caret) => {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const found = value.indexOf('\n', caret)
  return { lineStart, lineEnd: found < 0 ? value.length : found }
}

const clauseAt = (value, caret) => {
  const { lineStart, lineEnd } = lineAt(value, caret)
  const line = value.slice(lineStart, lineEnd)
  const trimmedRight = line.replace(/\s+$/, '')
  if (!trimmedRight.endsWith(';')) return caret
  const semi = lineStart + trimmedRight.length - 1
  if (caret >= semi && caret <= lineEnd) return semi
  return /^\s*$/.test(line.slice(caret - lineStart, trimmedRight.length - 1)) ? semi : caret
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

  const joinLines = () => {
    const el = textarea.value
    const joined = el && joinLinesAt(el.value, el.selectionStart, el.selectionEnd)
    if (!joined) return
    close()
    if (joined.text !== el.value) replaceRange(el, joined.from, joined.to, joined.insert)
    el.setSelectionRange(joined.start, joined.end)
  }

  const insertText = (text) => {
    const el = textarea.value
    if (!el || !text) return
    close()
    replaceRange(el, el.selectionStart, el.selectionEnd, text)
  }

  const insertStatement = (text) => {
    const el = textarea.value
    if (!el || !text) return
    close()
    if (!el.value.trim()) {
      replaceRange(el, 0, el.value.length, text)
      return
    }
    const at = caretOffset(el)
    const { lineStart, lineEnd } = lineAt(el.value, at)
    const prefix = el.value.slice(lineStart, at).trim() ? '\n' : ''
    const suffix = el.value.slice(at, lineEnd).trim() ? '\n' : ''
    replaceRange(el, at, at, `${prefix}${text}${suffix}`)
    const next = at + prefix.length + text.length
    el.setSelectionRange(next, next)
  }

  const appendClause = (text, pick = '') => {
    const el = textarea.value
    if (!el) return
    close()
    const at = clauseAt(el.value, caretOffset(el))
    const gap = at > 0 && !/\s/.test(el.value[at - 1]) ? ' ' : ''
    replaceRange(el, at, at, `${gap}${text}`)
    const mark = pick ? text.indexOf(pick) : -1
    const start = at + gap.length + (mark < 0 ? text.length : mark)
    el.setSelectionRange(start, mark < 0 ? start : start + pick.length)
  }

  const takeStatement = () => {
    const el = textarea.value
    const statement = el && statementSpanAt(el.value, caretOffset(el))
    const text = statement ? flattenStatement(statement.words) : ''
    if (!text) return ''
    const code = statement.words.filter((word) => word.type !== 'comment')
    const hole = placeholderSpans(el.value).find((span) =>
      code.some((word) => span.start >= word.start && span.end <= word.end),
    )
    if (hole) {
      el.focus()
      el.setSelectionRange(hole.start, hole.end)
      post({ type: 'notify', text: '채우지 않은 <…> 칸이 있어 실행하지 않았습니다.', warning: true })
      return ''
    }
    if (el.value[statement.codeEnd - 1] !== ';') {
      const { selectionStart, selectionEnd } = el
      const shift = (pos) => (pos >= statement.codeEnd ? pos + 1 : pos)
      replaceRange(el, statement.codeEnd, statement.codeEnd, ';')
      el.setSelectionRange(shift(selectionStart), shift(selectionEnd))
    }
    return text
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

  const shortcuts = { suggest: () => open(true), format, joinLines }

  tryOnScopeDispose(
    onMessage((message) => {
      if (message?.type === 'shortcut' && document.activeElement === textarea.value) shortcuts[message.name]?.()
    }),
  )
  tryOnScopeDispose(() => setFocus(false))

  return {
    items,
    index,
    caret,
    close,
    accept,
    takeStatement,
    insertText,
    insertStatement,
    appendClause,
    onKeydown,
    onInput,
    onFocus,
    onBlur,
  }
}
