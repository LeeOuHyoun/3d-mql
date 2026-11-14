export const MQL_STARTERS = new Set([
  'temp',
  'query',
  'print',
  'expand',
  'list',
  'add',
  'modify',
  'delete',
  'connect',
  'disconnect',
  'promote',
  'demote',
  'set',
  'insert',
  'start',
  'commit',
  'abort',
  'help',
  'version',
  'quit',
  'exit',
  'exec',
  'execute',
  'eval',
  'evaluate',
  'run',
  'compile',
  'approve',
  'reject',
  'ignore',
  'enable',
  'disable',
  'override',
  'trigger',
  'push',
  'pop',
  'history',
  'clear',
  'copy',
  'move',
  'transfer',
  'lock',
  'unlock',
  'checkin',
  'checkout',
  'verb',
  'verbose',
  'mod',
  'del',
])

export const HEADER_TARGETS = new Set([
  'bus',
  'businessobject',
  'connection',
  'type',
  'policy',
  'attribute',
  'relationship',
  'person',
  'program',
  'prog',
  'command',
  'menu',
  'form',
  'vault',
  'role',
  'group',
  'association',
  'context',
  'transaction',
  'channel',
  'portal',
  'table',
  'system',
  'page',
  'index',
  'store',
  'site',
  'dimension',
  'expression',
  'rule',
])

const L1_BREAKS = new Set([
  'description',
  'type',
  'sequence',
  'store',
  'format',
  'defaultformat',
  'state',
  'allstate',
  'from',
  'to',
  'field',
  'column',
  'abstract',
  'derived',
  'attribute',
  'default',
  'multiline',
  'notmultiline',
  'hidden',
  'nothidden',
  'range',
  'trigger',
  'property',
  'setting',
  'command',
  'menu',
  'channel',
  'href',
  'alt',
  'height',
])

const STATE_SUBS = new Set([
  'revision',
  'version',
  'promote',
  'checkouthistory',
  'public',
  'owner',
  'user',
  'filter',
  'action',
  'check',
  'trigger',
  'signature',
  'route',
])

const REL_SUBS = new Set(['cardinality', 'revision', 'clone', 'propagate', 'meaning'])

const FIELD_SUBS = new Set(['name', 'label', 'businessobject', 'relationship', 'range', 'href', 'alt', 'sorttype', 'update'])

export const DDL_WORDS = new Set([...L1_BREAKS, ...STATE_SUBS, ...REL_SUBS, ...FIELD_SUBS, 'add', 'remove'])
const DDL_VERBS = new Set(['add', 'modify', 'mod'])
const EDIT_WORDS = new Set(['add', 'remove', 'modify', 'mod'])
const BUS_TARGETS = new Set(['bus', 'businessobject'])
const BUS_VERBS = new Set(['print', 'expand', 'modify', 'mod', 'add', 'delete', 'del', 'promote', 'demote', 'connect', 'disconnect'])
const ADMIN_VERBS = new Set(['print', 'list', 'modify', 'mod', 'add', 'delete', 'del'])
export const BUS_BREAKS = new Set(['description', 'policy', 'vault', 'owner', 'current', 'state'])
export const EXPAND_BREAKS = new Set(['from', 'to', 'relationship', 'rel', 'type', 'recurse', 'terse'])
export const QUERY_CLAUSES = new Set(['where', 'select', 'orderby', 'limit', 'dump', 'recordsep', 'tcl', 'output'])
const VALUE_HOLDERS = new Set(['orderby', 'limit', 'dump', 'recordsep', 'recurse'])
const SELECT_ENDS = new Set(['where', 'dump', 'recordsep', 'tcl', 'output', 'orderby', 'limit'])
const SECTION_WORDS = new Set(['state', 'allstate', 'from', 'to', 'field', 'column'])

const lower = (token) => token?.value.toLowerCase() ?? ''

const tokenize = (text) => {
  const tokens = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\r' || ch === '\n') {
      let j = i + 1
      while (j < text.length && (text[j] === '\r' || text[j] === '\n')) j += 1
      tokens.push({ type: 'newline' })
      i = j
      continue
    }
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === ';') {
      tokens.push({ type: 'semi', end: i + 1 })
      i += 1
      continue
    }
    if (ch === '#') {
      let end = i
      while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end += 1
      tokens.push({ type: 'comment', value: text.slice(i, end), start: i, end })
      i = end
      continue
    }
    let j = i
    let quote = ''
    let depth = 0
    while (j < text.length) {
      const c = text[j]
      if (quote) {
        if (c === '\\' && j + 1 < text.length) {
          j += 2
          continue
        }
        if (c === quote) quote = ''
      } else if (c === '"' || c === "'") quote = c
      else if (c === '[') depth += 1
      else if (c === ']') depth = Math.max(0, depth - 1)
      else if (depth === 0 && (/\s/.test(c) || c === ';')) break
      j += 1
    }
    tokens.push({ type: 'word', value: text.slice(i, j), start: i, end: j })
    i = j
  }
  return tokens
}

const isSchemaDdl = (words) =>
  DDL_VERBS.has(lower(words[0])) && HEADER_TARGETS.has(lower(words[1])) && !BUS_TARGETS.has(lower(words[1]))

const isStarterAt = (words) => {
  const first = lower(words[0])
  if (!MQL_STARTERS.has(first)) return false
  return first !== 'temp' || lower(words[1]) === 'query'
}

const continuesDdl = (statement, word) => {
  if (!isSchemaDdl(statement)) return false
  if (word === 'add') return lower(statement[0]) !== 'add'
  return DDL_WORDS.has(word)
}

const nextWords = (tokens, from) => {
  const words = []
  for (let k = from; k < tokens.length && words.length < 2 && tokens[k].type === 'word'; k += 1) words.push(tokens[k])
  return words
}

const codeWords = (words) => words.filter((word) => word.type !== 'comment')

const splitStatements = (text) => {
  const tokens = tokenize(text)
  const statements = []
  let current = []
  let afterNewline = false
  let trailing = null
  const flush = (semiEnd) => {
    if (current.length) {
      const end = semiEnd ?? current.at(-1).end
      const codeEnd = semiEnd ?? codeWords(current).at(-1)?.end ?? end
      statements.push({ words: current, start: current[0].start, end, codeEnd })
    }
    current = []
    afterNewline = false
  }
  tokens.forEach((token, index) => {
    if (token.type === 'semi') {
      if (!current.length) return
      flush(token.end)
      trailing = statements.at(-1)
      return
    }
    if (token.type === 'newline') {
      trailing = null
      if (current.length) afterNewline = true
      return
    }
    if (token.type === 'comment' && !current.length && trailing) {
      trailing.words.push(token)
      trailing.end = token.end
      return
    }
    if (afterNewline) {
      const words = nextWords(tokens, index)
      if (isStarterAt(words) && !continuesDdl(codeWords(current), lower(words[0]))) flush()
      else afterNewline = false
    }
    current.push(token)
  })
  flush()
  return statements
}

const headerLength = (words) => {
  const [w0, w1, w2] = [0, 1, 2].map((index) => lower(words[index]))
  if (w0 === 'temp' && w1 === 'query' && BUS_TARGETS.has(w2)) return Math.min(words.length, 6)
  if (w0 === 'query' && BUS_TARGETS.has(w1)) return Math.min(words.length, 5)
  if (BUS_VERBS.has(w0) && BUS_TARGETS.has(w1)) {
    return /^[0-9]+(\.[0-9]+)+$/.test(words[2]?.value ?? '') ? 3 : Math.min(words.length, 5)
  }
  if (ADMIN_VERBS.has(w0) && HEADER_TARGETS.has(w1)) {
    if ((w1 === 'form' || w1 === 'table') && /^(web|system)$/i.test(words[3]?.value ?? '')) return Math.min(words.length, 4)
    return Math.min(words.length, w1 === 'context' ? 2 : 3)
  }
  return 1
}

const isClauseBreak = (words, index, headerEnd) => {
  if (index < headerEnd) return false
  const word = lower(words[index])
  const prev = lower(words[index - 1])
  if (VALUE_HOLDERS.has(prev)) return false
  if (QUERY_CLAUSES.has(word)) return true
  const [w0, w1] = [lower(words[0]), lower(words[1])]
  if (w0 === 'expand' && EXPAND_BREAKS.has(word)) return !((word === 'relationship' || word === 'rel') && (prev === 'from' || prev === 'to'))
  if ((w0 === 'temp' || w0 === 'query') && (word === 'vault' || word === 'owner')) return true
  if (DDL_VERBS.has(w0) && BUS_TARGETS.has(w1)) return BUS_BREAKS.has(word)
  if (!isSchemaDdl(words) || EDIT_WORDS.has(prev)) return false
  return DDL_WORDS.has(word)
}

const commentsByWord = (words) => {
  const notes = new Map()
  let at = -1
  words.forEach((word) => {
    if (word.type !== 'comment') at += 1
    else notes.set(at, [...(notes.get(at) ?? []), word.value])
  })
  return notes
}

const formatStatement = (allWords) => {
  const words = codeWords(allWords)
  const notes = commentsByWord(allWords)
  const leading = notes.get(-1) ?? []
  if (!words.length) return leading.join('\n')
  const headerEnd = headerLength(words)
  const isDdl = isSchemaDdl(words)
  const lines = []
  const lineNotes = []
  let line = []
  let indent = ''
  let section = ''
  let inSelect = false
  let isBreakNext = false
  const indentFor = (word) => {
    if (!isDdl) return '  '
    if (SECTION_WORDS.has(word)) {
      section = word
      return '  '
    }
    if ((section === 'state' || section === 'allstate') && (STATE_SUBS.has(word) || word === 'property')) return '    '
    if ((section === 'from' || section === 'to') && (REL_SUBS.has(word) || word === 'type' || word === 'relationship')) return '    '
    if ((section === 'field' || section === 'column') && (FIELD_SUBS.has(word) || word === 'setting' || word === 'user')) return '    '
    if (L1_BREAKS.has(word)) {
      section = ''
      return '  '
    }
    return section ? '    ' : '  '
  }
  const pushLine = () => lines.push(lines.length ? indent + line.join(' ') : line.join(' '))
  words.forEach((token, index) => {
    const word = lower(token)
    const isBreak = isClauseBreak(words, index, headerEnd) && !(inSelect && !SELECT_ENDS.has(word))
    if ((isBreak || isBreakNext) && line.length) {
      pushLine()
      line = []
      if (isBreak) {
        indent = indentFor(word)
        inSelect = word === 'select'
      } else indent ||= '  '
    } else if (index >= headerEnd && word === 'select') inSelect = true
    isBreakNext = false
    line.push(token.value)
    if (notes.has(index)) {
      lineNotes[lines.length] = notes.get(index)
      isBreakNext = true
    }
  })
  if (line.length) pushLine()
  if (!lines.at(-1).endsWith(';')) lines[lines.length - 1] += ';'
  const body = lines.flatMap((text, index) => {
    const [first, ...rest] = lineNotes[index] ?? []
    return [first ? `${text} ${first}` : text, ...rest.map((note) => `${index ? indent : ''}${note}`)]
  })
  return [...leading, ...body].join('\n')
}

export const formatMqlText = (text) =>
  splitStatements(text)
    .map((statement) => formatStatement(statement.words))
    .join('\n\n')

export const statementSpanAt = (text, cursor) => {
  const statements = splitStatements(text)
  return (
    statements.find((statement) => cursor >= statement.start && cursor <= statement.end) ??
    statements.findLast((statement) => statement.start <= cursor) ??
    statements[0] ??
    null
  )
}

export const flattenStatement = (words) => {
  const line = codeWords(words)
    .map((word) => word.value)
    .join(' ')
  if (!line) return ''
  return line.endsWith(';') ? line : `${line};`
}

export const joinLinesAt = (text, selStart, selEnd) => {
  const lines = text.split('\n')
  const lineStarts = []
  let offset = 0
  for (const line of lines) {
    lineStarts.push(offset)
    offset += line.length + 1
  }
  const posAt = (index) => {
    let line = 0
    for (let i = 1; i < lineStarts.length && lineStarts[i] <= index; i += 1) line = i
    return { line: line + 1, column: index - lineStarts[line] + 1 }
  }
  const startPos = posAt(selStart)
  const endPos = posAt(selEnd)
  const isEmpty = selStart === selEnd
  const isOneLine = isEmpty || startPos.line === endPos.line
  const startLine = startPos.line
  const endLine = isOneLine ? Math.min(startLine + 1, lines.length) : endPos.line
  const selectionEndOffset = lines[endPos.line - 1].length - endPos.column
  let joined = lines[startLine - 1]
  let columnDelta = 0
  for (let i = startLine + 1; i <= endLine; i += 1) {
    const lineText = lines[i - 1]
    const contentAt = lineText.search(/\S/)
    if (contentAt < 0) {
      columnDelta = 0
      continue
    }
    let hasSpace = joined !== ''
    if (hasSpace && /[ \t]$/.test(joined)) {
      hasSpace = false
      joined = joined.replace(/[\s﻿\xA0]+$/g, ' ')
    }
    const content = lineText.substring(contentAt)
    joined += (hasSpace ? ' ' : '') + content
    columnDelta = content.length + (hasSpace ? 1 : 0)
  }
  const from = lineStarts[startLine - 1]
  const to = lineStarts[endLine - 1] + lines[endLine - 1].length
  if (from === to) return null
  const next = text.slice(0, from) + joined + text.slice(to)
  const caretAt = isEmpty ? from + joined.length - columnDelta : from + startPos.column - 1
  const endAt = isEmpty
    ? caretAt
    : startPos.line === endPos.line
      ? from + endPos.column - 1
      : from + joined.length - selectionEndOffset - 1
  const [start, end] = [caretAt, endAt].map((index) => Math.min(Math.max(0, index), next.length)).sort((a, b) => a - b)
  if (next === text && start === selStart && end === selEnd) return null
  return { text: next, start, end, from, to, insert: joined }
}
