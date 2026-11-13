import { BUS_BREAKS, DDL_WORDS, EXPAND_BREAKS, HEADER_TARGETS, MQL_STARTERS, QUERY_CLAUSES } from './mqlFormat.js'
import { PLACEHOLDER, TEMPLATE_HOLES } from './mqlAssist.js'

export const HIGHLIGHT_MAX_CHARS = 20000

const TOKEN =
  /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1?|<[A-Za-z_][\w|,.]*>|\d+(?:\.\d+){3}|[A-Za-z_][\w.-]*(?:\[[^\]\n]*\][\w.-]*)*|\d+(?:\.\d+)?|[;|*]/g

const KEYWORDS = new Set([
  ...QUERY_CLAUSES,
  ...EXPAND_BREAKS,
  ...BUS_BREAKS,
  ...DDL_WORDS,
  'bus',
  'name',
  'revision',
  'id',
  'attribute',
  'and',
  'or',
  'not',
  'all',
  'end',
  'on',
  'off',
  'transaction',
  'context',
  'user',
  'password',
  'program',
])

const TONES = {
  verb: 'text-purple-700 dark:text-[#c678dd]',
  kw: 'text-blue-700 dark:text-[#61afef]',
  str: 'text-green-700 dark:text-[#98c379]',
  num: 'text-amber-700 dark:text-[#d19a66]',
  sel: 'text-cyan-700 dark:text-[#56b6c2]',
  hole: 'text-yellow-600 dark:text-[#e5c07b] underline decoration-dotted',
  punct: 'text-gray-400 dark:text-[#5c6370]',
}

const isLineStart = (text, index) => text.slice(text.lastIndexOf('\n', index - 1) + 1, index).trim() === ''

const quotedParts = (text, start, end) => {
  const parts = []
  let at = start
  for (const match of text.slice(start, end).matchAll(PLACEHOLDER)) {
    if (!TEMPLATE_HOLES.has(match[0])) continue
    const from = start + match.index
    if (from > at) parts.push({ start: at, end: from, tone: 'str' })
    parts.push({ start: from, end: from + match[0].length, tone: 'hole' })
    at = from + match[0].length
  }
  if (at < end) parts.push({ start: at, end, tone: 'str' })
  return parts
}

const wordTone = (word, value, isStatementStart, afterVerb) => {
  if (isStatementStart && MQL_STARTERS.has(word)) return 'verb'
  if (afterVerb && (word === 'query' || HEADER_TARGETS.has(word))) return 'kw'
  if (value.includes('[')) return 'sel'
  return KEYWORDS.has(word) ? 'kw' : ''
}

const toneSpans = (text) => {
  const spans = []
  let statementStart = true
  let afterVerb = false
  for (const match of text.matchAll(TOKEN)) {
    const value = match[0]
    const start = match.index
    const end = start + value.length
    if (value[0] === '"' || value[0] === "'") {
      spans.push(...quotedParts(text, start, end))
      statementStart = false
      afterVerb = false
      continue
    }
    const word = /^[A-Za-z_]/.test(value) ? value.toLowerCase() : ''
    let tone = ''
    if (value === ';' || value === '|' || value === '*') tone = 'punct'
    else if (value[0] === '<') tone = TEMPLATE_HOLES.has(value) ? 'hole' : ''
    else if (!word) tone = 'num'
    else tone = wordTone(word, value, statementStart || isLineStart(text, start), afterVerb)
    if (tone) spans.push({ start, end, tone })
    afterVerb = tone === 'verb' || (afterVerb && word === 'query')
    statementStart = value === ';'
  }
  return spans
}

export const highlightParts = (text) => {
  const parts = []
  let at = 0
  for (const { start, end, tone } of toneSpans(text)) {
    if (start > at) parts.push({ text: text.slice(at, start), cls: '' })
    parts.push({ text: text.slice(start, end), cls: TONES[tone] })
    at = end
  }
  if (at < text.length) parts.push({ text: text.slice(at), cls: '' })
  return parts
}
