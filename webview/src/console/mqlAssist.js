import { MQL_STARTERS, formatMqlText } from './mqlFormat.js'

const PHRASES = [
  'temp query bus * * *',
  'temp query bus * * * select name id description',
  'temp query bus * * * where "attribute[???] == \'???\'"',
  'temp query bus * * * limit 0 orderby id select name id description',
  'query bus * * *',
  'print bus * * *',
  'print bus * * * select name id description',
  'print type',
  'print policy',
  'print attribute',
  'print relationship',
  'print person',
  'print program',
  'print command',
  'print menu',
  'print form',
  'print table system',
  'print channel',
  'print portal',
  'print page',
  'print context;',
  'list type',
  'list person',
  'list policy',
  'list attribute',
  'list relationship',
  'list program',
  'list vault',
  'list role',
  'list group',
  'list association',
  'list command',
  'list menu',
  'list form',
  'list table',
  'list channel',
  'list portal',
  'list page',
  'add bus',
  'add attribute',
  'add type',
  'add policy',
  'add relationship',
  'add command',
  'add menu',
  'add form',
  'add table',
  'add channel',
  'add portal',
  'add connection',
  'modify bus',
  'delete bus',
  'expand bus * * *',
  'expand bus * * * recurse to all select bus id current',
  'connect bus',
  'disconnect bus',
  'promote bus',
  'demote bus',
  'add property on program eServiceSchemaVariableMapping.tcl to',
  'set context user creator;',
  'verb on;',
  'verb off;',
  'insert prog',
  'compile prog',
  'start transaction;',
  'commit transaction;',
  'abort transaction;',
  'help;',
  'version;',
]

const DDL_TEMPLATES = new Map([
  ['add attribute', "add attribute '<attribute_name>' type <string|integer|real|date|boolean> description '<description>' default '<default_value>' notmultiline nothidden;"],
  ['add type', "add type '<type_name>' description '<description>' abstract <true|false> derived '<parent_type_name>' attribute '<attribute_name>';"],
  ['add policy', "add policy '<policy_name>' description '<description>' type '<type_name>' sequence '<sequence>' store '<store_name>' format generic state '<state_name>' revision <true|false> version <true|false> promote <true|false> public <access>;"],
  ['add relationship', "add relationship '<relationship_name>' description '<description>' nothidden from type '<from_type>' cardinality <one|many> revision <none|float|replicate> clone <none|float|replicate> to type '<to_type>' cardinality <one|many> revision <none|float|replicate> clone <none|float|replicate>;"],
  ['add command', "add command '<command_name>' description '<description>' label '<label_key>' href '<url_path>' setting 'Registered Suite' '<suite_name>' setting 'Target Location' '<content|popup|slidein>';"],
  ['add menu', "add menu '<menu_name>' description '<description>' label '<label_key>' setting 'Registered Suite' '<suite_name>' command '<command_name>';"],
  ['add form', "add form '<form_name>' web field name '<field_name>' label '<label_key>' businessobject '<expression>' setting 'Registered Suite' '<suite_name>' setting 'Field Type' '<basic|attribute>' setting 'Editable' '<true|false>';"],
  ['add table', "add table '<table_name>' system column name '<column_name>' label '<label_key>' businessobject '<expression>' sorttype '<none|alphanumeric|other>' setting 'Registered Suite' '<suite_name>';"],
  ['add channel', "add channel '<channel_name>' description '<description>' height '<height>' setting 'Registered Suite' '<suite_name>' command '<command_name>';"],
  ['add portal', "add portal '<portal_name>' description '<description>' setting 'Registered Suite' '<suite_name>' channel '<channel_name>';"],
  ['add bus', "add bus '<type>' '<name>' '<revision>' policy '<policy>' vault '<vault>';"],
  ['add connection', "add connection '<relationship>' from <from_id> to <to_id>;"],
  ['connect bus', "connect bus <from_id> relationship '<relationship>' to <to_id>;"],
])

const CLAUSE_HEADS = new Set([
  'where',
  'select',
  'orderby',
  'limit',
  'dump',
  'recordsep',
  'tcl',
  'output',
  'from',
  'to',
  'relationship',
  'rel',
  'recurse',
  'terse',
  'vault',
  'owner',
  'policy',
  'description',
  'state',
  'current',
])

const SCHEMA_KINDS =
  'type|policy|attribute|relationship|person|program|vault|role|group|association|command|menu|form|table|channel|portal|page'
const PLACEHOLDER = /(?<!\$)<[A-Za-z_][\w|,.]*>/g
const TEMPLATE_HOLES = new Set([...DDL_TEMPLATES.values()].flatMap((text) => text.match(PLACEHOLDER)))
const MATCH_LIMIT = 40
const attributePattern = /^(.*?\battribute\[)([^\]]*)$/i
const commandPattern = new RegExp(`^\\s*(print|mod|modify|del|delete|list)\\s+(${SCHEMA_KINDS})(?:\\s+([^\\s;]*))?$`, 'i')
const busQueryPattern = /^(\s*(?:temp\s+)?query\s+bus\s+\S+\s+\S+\s+\S+)(?:\s+(.*))?$/i
const busTargetPattern = /^(\s*(?:print|expand)\s+bus\s+(?:\d+(?:\.\d+){3}|\S+\s+\S+\s+\S+))(?:\s+(.*))?$/i
const QUERY_SUFFIXES = [
  'select name id description',
  'where "attribute[???] == \'???\'"',
  'limit 0 orderby id select name id description',
]
const PRINT_SUFFIXES = ['select name id description', 'select id current attribute[???].value']
const EXPAND_SUFFIXES = ['recurse to all select bus id current']

const phraseKey = (raw) => raw.replace(/\s+/g, ' ').trim().toLowerCase()

const quoteName = (name) => (name.includes('"') ? `'${name}'` : `"${name}"`)

const isLineStarter = (line) => {
  const [first, second] = line.trim().toLowerCase().split(/\s+/)
  if (!first || CLAUSE_HEADS.has(first)) return false
  if (first === 'temp' && second && !'query'.startsWith(second)) return false
  return [...MQL_STARTERS].some((starter) => starter.startsWith(first))
}

export const isTemplate = (phrase) => DDL_TEMPLATES.has(phrase)

export const insertTextOf = (phrase) => (isTemplate(phrase) ? formatMqlText(DDL_TEMPLATES.get(phrase)) : phrase)

export const statementPrefix = (text, cursor) => {
  let from = text.slice(0, cursor).lastIndexOf(';') + 1
  const lineBreak = Math.max(text.lastIndexOf('\n', cursor - 1), text.lastIndexOf('\r', cursor - 1))
  if (lineBreak >= from) {
    const before = text.slice(from, lineBreak).trim()
    const line = text.slice(lineBreak + 1, cursor).trim()
    if (before && (!line || isLineStarter(line))) from = lineBreak + 1
  }
  while (from < cursor && /\s/.test(text[from])) from += 1
  return { from, to: cursor, raw: text.slice(from, cursor) }
}

export const schemaKindOf = (raw) => (attributePattern.test(raw) ? 'attribute' : (commandPattern.exec(raw)?.[2].toLowerCase() ?? ''))

const schemaMatches = (raw, key, names) => {
  const bracket = attributePattern.exec(raw)
  if (bracket) {
    const partial = bracket[2].toLowerCase()
    return names
      .filter((name) => name.toLowerCase().startsWith(partial))
      .slice(0, MATCH_LIMIT)
      .map((name) => `${bracket[1]}${name}].value`)
  }
  const command = commandPattern.exec(raw)
  if (!command) return []
  const [, verb, kindText, partialText = ''] = command
  const kind = kindText.toLowerCase()
  const partial = partialText.replace(/^['"]|['"]$/g, '').toLowerCase()
  const suffix = kind === 'table' && verb.toLowerCase() === 'print' ? ' system' : ''
  return names
    .filter((name) => name.toLowerCase().includes(partial) && !(name.includes('"') && name.includes("'")))
    .map((name) => `${verb} ${kind} ${quoteName(name)}${suffix}`)
    .filter((candidate) => candidate.toLowerCase() !== key)
    .slice(0, MATCH_LIMIT)
}

const clauseMatches = (raw, key) =>
  [busQueryPattern, busTargetPattern].flatMap((pattern) => {
    const match = pattern.exec(raw)
    if (!match) return []
    const head = match[1].replace(/\s+/g, ' ').trim()
    const tail = (match[2] ?? '').trim().toLowerCase()
    const suffixes = pattern === busQueryPattern ? QUERY_SUFFIXES : /^expand\b/i.test(head) ? EXPAND_SUFFIXES : PRINT_SUFFIXES
    return suffixes
      .filter((suffix) => !tail || suffix.startsWith(tail))
      .map((suffix) => `${head} ${suffix}`)
      .filter((candidate) => candidate.toLowerCase() !== key)
  })

export const matchPhrases = (raw, force, names = []) => {
  const key = phraseKey(raw)
  if (!key) return [...PHRASES]
  const fixed = PHRASES.filter((phrase) => phrase.toLowerCase().startsWith(key) && phrase.toLowerCase() !== key)
  const combined = [...fixed, ...schemaMatches(raw, key, names)]
  if (combined.length) return combined
  const clauses = clauseMatches(raw, key)
  if (clauses.length || !force) return clauses
  const verb = key.split(' ')[0]
  const verbMatches = PHRASES.filter((phrase) => phrase.toLowerCase().startsWith(verb))
  return verbMatches.length ? verbMatches : [...PHRASES]
}

export const placeholderSpans = (text) =>
  [...text.matchAll(PLACEHOLDER)]
    .filter((match) => TEMPLATE_HOLES.has(match[0]))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))

export const nextPlaceholder = (text, start, end, back) => {
  const spans = placeholderSpans(text)
  if (!spans.length) return null
  if (back) return spans.findLast((span) => span.end <= start) ?? spans.at(-1)
  return spans.find((span) => span.start >= end) ?? spans[0]
}
