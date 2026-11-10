import { escapeRegExp } from 'lodash-es'

const BUS_HEAD = ['type', 'name', 'revision']

export const OBJECT_ID_PATTERN = /\b\d+\.\d+\.\d+\.\d+\b/g

const dumpSeparator = (command) => {
  const match = command.match(/\bdump\b(?:\s+(?:'([^']*)'|"([^"]*)"|([^\s;'"]+)))?/i)
  if (!match) return ''
  const separator = match[1] ?? match[2] ?? match[3]
  return separator && !/^[a-z]+$/i.test(separator) ? separator : ','
}

const selectNames = (command) => {
  const match = command.match(/\bselect\s+([\s\S]*?)(?=\s+(?:dump|recordsep|tcl|output|where|orderby|limit)\b|\s*;|$)/i)
  return match ? match[1].match(/(?:[^\s[\]'"]+|\[[^\]]*\]|'[^']*'|"[^"]*")+/g) || [] : []
}

const dumpGrid = (command, lines, separator) => {
  const rows = lines.map((line) => line.split(separator))
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null
  const names = selectNames(command)
  const lead = width - names.length
  const head = Array.from({ length: width }, (_, i) => {
    if (lead >= 0 && i >= lead) return names[i - lead]
    if (lead === BUS_HEAD.length) return BUS_HEAD[i]
    return `#${i + 1}`
  })
  return { head, rows }
}

const selectGrid = (lines) => {
  const head = ['object']
  const index = new Map()
  const rows = []
  let row = null
  let key = ''
  lines.forEach((line) => {
    if (!/^\s/.test(line)) {
      row = [line.trim()]
      rows.push(row)
      key = ''
      return
    }
    const pair = line.match(/^\s+([^\s=](?:[^=]*?[^\s=])?)\s*=\s?(.*)$/)
    if (!pair) {
      if (row && key) row[index.get(key)] += `\n${line.trim()}`
      return
    }
    if (!row) {
      row = ['']
      rows.push(row)
    }
    key = pair[1]
    if (!index.has(key)) {
      index.set(key, head.length)
      head.push(key)
    }
    const at = index.get(key)
    row[at] = row[at] == null ? pair[2] : `${row[at]}\n${pair[2]}`
  })
  if (head.length < 2) return null
  if (rows.length !== 1) return { head, rows }
  return { head: ['key', 'value'], rows: head.map((name, i) => [name, rows[0][i] ?? '']) }
}

export const gridOf = (command, output) => {
  const lines = output.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  const separator = dumpSeparator(command)
  return separator ? dumpGrid(command, lines, separator) : selectGrid(lines)
}

export const gridTsv = (grid) => {
  const cell = (value) => (/[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return [grid.head, ...grid.rows].map((row) => grid.head.map((_, i) => cell(row[i] ?? '')).join('\t')).join('\n')
}

export const buildFindRegex = (query, { matchCase, useRegex }) => {
  if (!query) return null
  try {
    return new RegExp(useRegex ? query : escapeRegExp(query), matchCase ? 'g' : 'gi')
  } catch {
    return null
  }
}

export const splitByPattern = (text, pattern) => {
  if (!pattern) return [{ text, hit: false }]
  const parts = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) continue
    if (match.index > last) parts.push({ text: text.slice(last, match.index), hit: false })
    parts.push({ text: match[0], hit: true })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts
}
