import type { MqlClient } from './mqlClient';

export type ObjectSummary = { id: string; type: string; name: string; revision: string; current: string };
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  reverse: boolean;
  virtual?: boolean;
  fromRel?: string;
  toRel?: string;
};
export type Field = { key: string; value: string };
export type SearchParams = { type?: string; name?: string; revision?: string; where?: string };
export type Direction = 'from' | 'to' | 'both';
export type ExpandOptions = {
  relType?: string;
  busType?: string;
  recurse?: number | 'all' | 'end';
  limit?: number;
  busWhere?: string;
  relWhere?: string;
};
export type QueryTarget = {
  id: string;
  type: string;
  name: string;
  revision: string;
  from: string;
  to: string;
  label: string;
  clusterKey: string;
  childNodeIds: string[];
  path: string;
  pathTo: string;
  kind: string;
  state: string;
  event: string;
  input: string;
};
export type BusName = { type: string; name: string; revision: string };
export type ObjectSpec = BusName & { policy: string; vault: string; fields: Field[]; attributes: Field[] };
export type ModifyField = { key: string; isAttribute: boolean; value: string; oldValue: string };
export type AttributeInfo = { name: string; type: string; default: string; ranges: string[] };
export type ChangeParams = {
  kind: string;
  target: string;
  id: string;
  from: string;
  to: string;
  fromRel: string;
  toRel: string;
  relType: string;
  fromObject?: BusName;
  toObject?: BusName;
  fields: ModifyField[];
  signature: string;
  attributes: Field[];
  object: ObjectSpec;
  connections: number;
};
export type Change = { forward: string; inverse: string; note: string };
export type TriggerSource = { type?: string; policy?: string; relationship?: string };
export type TriggerStep = {
  id: string;
  name: string;
  revision: string;
  current: string;
  program: string;
  method: string;
  sequence: string;
};
export type TriggerEvent = {
  kind: string;
  name: string;
  state: string;
  event: string;
  program: string;
  input: string;
  inherited: boolean;
  steps: TriggerStep[];
};
type Symbolics = { byName: Record<string, string>; bySymbolic: Record<string, string> };

const separator = '|~|';
const idPattern = /^[\w.]+$/;
const triggerPattern = /(\w+):([\w.$-]+)\(([^)]*)\)/g;
const symbolicPattern = /^(\S+)\s+on\s+program\s+\S+\s+to\s+(\w+)\s+(.+?)\s*$/;
const triggerManager = 'emxTriggerManager';
const triggerType = 'eService Trigger Program Parameters';
const triggerAttributes = ['eService Program Name', 'eService Method Name', 'eService Sequence Number'];
const mappingProgram = 'eServiceSchemaVariableMapping.tcl';
const lifecycleSelects = ['state.actual', 'state.signature.satisfied', 'current.access'];
const linkSelects = ['fromrel.id torel.id', 'frommid.id tomid.id'];
const basicFields = ['description', 'owner'];
const renameFields = ['name', 'revision'];
const modifyFields = [...renameFields, ...basicFields];
const createFields = ['current', 'owner', 'description', 'organization', 'project'];
const listKinds = [
  'type',
  'person',
  'policy',
  'attribute',
  'relationship',
  'program',
  'vault',
  'role',
  'group',
  'association',
  'command',
  'menu',
  'form',
  'table',
  'channel',
  'portal',
  'page',
];
const ownershipSelects = 'organization project';
const rangeOperatorPattern = /^(?:!=|<|>|~|!~|match|nmatch|smatch|nsmatch|program|between)/i;
const quotedTextPattern = /'[^']*'|"[^"]*"/g;
const commentLinePattern = /^\s*#.*$/gm;
const deletePattern = /^\s*del(?:ete)?\s/i;
const destructivePatterns = [
  deletePattern,
  /^\s*(?:disconnect|demote)\s/i,
  /^\s*mod(?:ify)?\s[\s\S]*\bremove\b/i,
  /^\s*clear\s+(?:vault|all)\b/i,
];
const secretPattern = /'[^']*'|"[^"]*"|(\bpassword\s+)('[^']*'|"[^"]*"|[^\s;'"]+)/gi;
const transactionStartPattern = /^start transaction(?: (?:read|write))?$/i;
const transactionEndPattern = /^(?:commit|abort) transaction$/i;
const objectSelects = [
  'type',
  'name',
  'revision',
  'current',
  'policy',
  'vault',
  'owner',
  'originated',
  'modified',
  'description',
  'id',
  'physicalid',
  'attribute.value',
];
const connectionSelects = [
  'type',
  'id',
  'from.type',
  'from.name',
  'from.revision',
  'from.id',
  'to.type',
  'to.name',
  'to.revision',
  'to.id',
  'originated',
  'modified',
  'attribute.value',
];

const quote = (value: string) => {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new Error(`작은따옴표와 큰따옴표가 함께 들어 있어 MQL 문장으로 만들 수 없습니다: ${value}`);
};

const selectable = (name: string) => (/\s/.test(name) ? quote(name) : name);

const whereClause = (expression?: string) => (expression?.trim() ? ` where ${quote(expression.trim())}` : '');

const dumpRows = (text: string, minLength: number) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.includes(separator))
    .map((line) => line.trim().split(separator))
    .filter((fields) => fields.length >= minLength);

const checkId = (id: string) => {
  if (!idPattern.test(id)) throw new Error(`올바르지 않은 객체 ID입니다: ${id}`);
  return id;
};

const busName = ({ type, name, revision }: BusName) => [type, name, revision].map(quote).join(' ');

const busRef = (id: string, object?: BusName) => (object ? busName(object) : checkId(id));

const printBusCommand = (id: string) => `print bus ${checkId(id)} select ${objectSelects.join(' ')}`;

const printConnectionCommand = (id: string) => `print connection ${checkId(id)} select ${connectionSelects.join(' ')}`;

const recurseClause = (recurse: ExpandOptions['recurse']) => {
  if (recurse === 'all' || recurse === 'end') return `recurse to ${recurse}`;
  return Number(recurse) > 1 && `recurse to ${Math.floor(Number(recurse))}`;
};

const expandCommand = (id: string, direction: 'from' | 'to', { relType, busType, recurse }: ExpandOptions = {}) =>
  [
    `expand bus ${checkId(id)} ${direction} relationship ${quote(relType?.trim() || '*')}`,
    busType?.trim() && `type ${quote(busType.trim())}`,
    recurseClause(recurse),
  ]
    .filter(Boolean)
    .join(' ');

const expandCopy = (id: string, direction: 'from' | 'to', relType?: string) =>
  `${expandCommand(id, direction, { relType })} select bus id current select rel id;`;

const queryBuilders: Record<string, (target: QueryTarget) => string> = {
  id: ({ id }) => id,
  tnr: busName,
  printBus: ({ id }) => `${printBusCommand(id)};`,
  expandFrom: ({ id }) => expandCopy(id, 'from'),
  expandTo: ({ id }) => expandCopy(id, 'to'),
  revisions: ({ type, name }) => `temp query bus ${quote(type)} ${quote(name)} * select id current;`,
  printConnection: ({ id }) => `${printConnectionCommand(id)};`,
  expandRel: ({ from, label }) => expandCopy(from, 'from', label),
  queryConnection: ({ from, to, label }) =>
    `query connection type ${quote(label)} where ${quote(`from.id==${checkId(from)} && to.id==${checkId(to)}`)} select id;`,
  memberIds: ({ childNodeIds }) => childNodeIds.join('\n'),
  expandCluster: ({ id, clusterKey }) => {
    const [anchorId, relType] = clusterKey.split('::');
    return expandCopy(anchorId, id.startsWith('cluster-rev') ? 'to' : 'from', relType);
  },
  pathExpr: ({ path }) => path,
  pathPrint: ({ id, path }) => `print bus ${checkId(id)} select ${selectable(`${path}.id`)};`,
  pathColumn: ({ path }) => `$<${path}.name>`,
  pathWhere: ({ path, pathTo }) => `${path}.id==${checkId(pathTo)}`,
  addTrigger: ({ kind, name, state, event, input }) => {
    const [, action, phase] = /^(\w+?)(Check|Action|Override)$/.exec(event) ?? [];
    if (!action) throw new Error(`트리거 이벤트를 해석할 수 없습니다: ${event}`);
    const names = `${input}${input.includes(',') ? ',' : ' '}NEW_TRIGGER_NAME`;
    return [
      `mod ${kind} ${quote(name)}`,
      state && `state ${quote(state)}`,
      `add trigger ${action.toLowerCase()} ${phase.toLowerCase()} ${triggerManager} input ${quote(names)};`,
    ]
      .filter(Boolean)
      .join(' ');
  },
};

export function buildQueryText(action: string, targets: QueryTarget[]) {
  const build = queryBuilders[action];
  if (!build) throw new Error(`알 수 없는 쿼리 항목입니다: ${action}`);
  return targets.map(build).join('\n');
}

function parseKeyValues(text: string): Field[] {
  const fields: Field[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const match = /^\s{4}(\S.*?) =(?: (.*))?$/.exec(line);
    if (match) fields.push({ key: match[1], value: match[2] ?? '' });
    else if (fields.length && line.trim()) fields[fields.length - 1].value += `\n${line.trim()}`;
  });
  return fields;
}

function splitFields(fields: Field[]) {
  const basics: Field[] = [];
  const attributes: Field[] = [];
  fields.forEach(({ key, value }) => {
    const match = /^attribute\[(.+)\]\.value$/.exec(key);
    if (match) attributes.push({ key: match[1], value });
    else basics.push({ key, value });
  });
  return { basics, attributes };
}

export async function searchObjects(client: MqlClient, params: SearchParams, limit: number): Promise<ObjectSummary[]> {
  const type = await actualType(client, params.type?.trim() ?? '');
  const pattern = [type, params.name, params.revision].map((value) => quote(value?.trim() || '*')).join(' ');
  const text = await client.run(
    `temp query bus ${pattern} limit ${limit}${whereClause(params.where)} select id current dump ${quote(separator)}`,
  );
  return dumpRows(text, 5).map(([type, name, revision, id, current]) => ({ id, type, name, revision, current }));
}

export async function expandObject(
  client: MqlClient,
  id: string,
  direction: Direction,
  options: ExpandOptions,
  defaultLimit: number,
) {
  const limit = Math.floor(Number(options.limit)) > 0 ? Math.floor(Number(options.limit)) : defaultLimit;
  const directions: ('from' | 'to')[] = direction === 'both' ? ['from', 'to'] : [direction];
  const results = await Promise.all(directions.map((item) => expandDirection(client, id, item, options, limit)));
  return {
    nodes: results.flatMap((item) => item.nodes),
    edges: results.flatMap((item) => item.edges),
    truncated: results.some((item) => item.truncated),
    limit,
  };
}

async function expandDirection(
  client: MqlClient,
  id: string,
  direction: 'from' | 'to',
  options: ExpandOptions,
  limit: number,
) {
  const busSelect = `select bus type id current${whereClause(options.busWhere)}`;
  const relSelect = `select rel type id${whereClause(options.relWhere)}`;
  const text = await client.run(
    `${expandCommand(id, direction, options)} ${busSelect} ${relSelect} dump ${quote(separator)} limit ${limit + 1}`,
  );
  const rows = dumpRows(text, 11);
  const isEnd = options.recurse === 'end';
  const nodes: ObjectSummary[] = [];
  const edges: GraphEdge[] = [];
  const parents = [id];
  rows.slice(0, limit).forEach((fields) => {
    const [levelText, relType, , type, name, revision] = fields;
    const level = isEnd ? 1 : Math.max(1, Number(levelText) || 1);
    const parentId = parents[level - 1] ?? id;
    const rest = fields.slice(6);
    const busFirst = rest[0] === type && rest[3] === relType;
    const [busId, current, relId] = busFirst ? [rest[1], rest[2], rest[4]] : [rest[3], rest[4], rest[1]];
    const [from, to] = direction === 'from' ? [parentId, busId] : [busId, parentId];
    parents.length = level;
    parents.push(busId);
    nodes.push({ id: busId, type, name, revision, current });
    edges.push({
      id: isEnd ? `end:${direction}:${id}:${busId}` : relId,
      from,
      to,
      label: relType,
      reverse: direction === 'to',
      ...(isEnd && { virtual: true }),
    });
  });
  return { nodes, edges, truncated: rows.length > limit };
}

export async function printObject(client: MqlClient, id: string) {
  const [text, ownership] = await Promise.all([
    client.run(printBusCommand(id)),
    runOptional(client, `print bus ${checkId(id)} select ${ownershipSelects}`),
  ]);
  const { basics, attributes } = splitFields([...parseKeyValues(text), ...fieldsOf(ownership)]);
  const valueOf = (key: string) => basics.find((field) => field.key === key)?.value ?? '';
  const summary: ObjectSummary = {
    id: valueOf('id') || id,
    type: valueOf('type'),
    name: valueOf('name'),
    revision: valueOf('revision'),
    current: valueOf('current'),
  };
  return { summary, basics, attributes };
}

const accessOf = (fields: Field[]) =>
  (fields.find((field) => field.key === 'current.access')?.value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const runOptional = (client: MqlClient, command: string) => client.run(command).catch((error: Error) => error);

const failuresOf = (selects: string[], results: (string | Error)[]) =>
  results.flatMap((result, index) => (result instanceof Error ? [`${selects[index]}: ${result.message}`] : []));

const fieldsOf = (result: string | Error) => (result instanceof Error ? [] : parseKeyValues(result));

export async function printObjectExtra(client: MqlClient, id: string) {
  const [base, optional] = await Promise.all([
    client.run(`print bus ${checkId(id)} select current state history`),
    Promise.all(lifecycleSelects.map((select) => runOptional(client, `print bus ${id} select ${select}`))),
  ]);
  const fields = parseKeyValues(base);
  const extras = optional.flatMap(fieldsOf);
  const valuesOf = (key: string) => fields.filter((field) => field.key === key).map((field) => field.value);
  const states = valuesOf('state').map((name) => ({
    name,
    actual: extras.find((field) => field.key === `state[${name}].actual`)?.value ?? '',
    signatures: extras.flatMap(({ key, value }) => {
      const match = /^state\[(.+?)\]\.signature\[(.+)\]\.satisfied$/.exec(key);
      return match?.[1] === name ? [{ name: match[2], satisfied: /^true$/i.test(value) }] : [];
    }),
  }));
  return {
    current: valuesOf('current')[0] ?? '',
    states,
    history: valuesOf('history'),
    access: accessOf(extras),
    warnings: failuresOf(lifecycleSelects, optional),
  };
}

export async function printAccess(client: MqlClient, id: string, user: string) {
  const text = await client.run(
    `push context user ${quote(user)}; print bus ${checkId(id)} select current.access; pop context;`,
  );
  return accessOf(parseKeyValues(text));
}

export async function printConnection(client: MqlClient, id: string) {
  const text = await client.run(printConnectionCommand(id));
  return splitFields(parseKeyValues(text));
}

export async function countConnections(client: MqlClient, id: string) {
  const fields = parseKeyValues(await client.run(`print bus ${checkId(id)} select from.id to.id`));
  return new Set(fields.filter((field) => /^(from|to)(\[.*\])?\.id$/.test(field.key)).map((field) => field.value)).size;
}

async function connectionEnds(client: MqlClient, id: string): Promise<GraphEdge> {
  const fields = parseKeyValues(
    await client.run(`print connection ${checkId(id)} select type from.id to.id fromrel.id torel.id`),
  );
  const valueOf = (key: string) => fields.find((field) => field.key === key)?.value ?? '';
  return {
    id,
    from: valueOf('from.id'),
    to: valueOf('to.id'),
    label: valueOf('type'),
    reverse: false,
    fromRel: valueOf('fromrel.id'),
    toRel: valueOf('torel.id'),
  };
}

export async function printConnectionLinks(client: MqlClient, id: string) {
  const results = await Promise.all(
    linkSelects.map((selects) => runOptional(client, `print connection ${checkId(id)} select ${selects}`)),
  );
  const [ends, mids] = results.map(fieldsOf);
  const valueOf = (key: string) => ends.find((field) => field.key === key)?.value ?? '';
  const attachedIds = mids.filter((field) => /^(from|to)mid(\[.*\])?\.id$/.test(field.key)).map((field) => field.value);
  const attached = await Promise.all([...new Set(attachedIds)].map((attachedId) => connectionEnds(client, attachedId)));
  return {
    fromRel: valueOf('fromrel.id'),
    toRel: valueOf('torel.id'),
    attached,
    warnings: failuresOf(linkSelects, results),
  };
}

const endClause = (side: 'from' | 'to', id: string, relId: string) =>
  relId ? `${side}rel ${checkId(relId)}` : `${side} ${checkId(id)}`;

const valueClause = (key: string, value: string, isAttribute: boolean, skipped?: string[]) => {
  try {
    return [`${isAttribute ? quote(key) : key} ${quote(value)}`];
  } catch (error) {
    if (!skipped) throw error;
    skipped.push(key);
    return [];
  }
};

const fieldClauses = (fields: Field[], isAttribute: boolean, skipped?: string[]) =>
  fields
    .filter(({ value }) => value || (isAttribute && skipped))
    .flatMap(({ key, value }) => valueClause(key, value, isAttribute, skipped));

const skippedNote = (skipped: string[]) => skipped.length && `따옴표 때문에 복원 문장에서 뺀 항목: ${skipped.join(', ')}`;

function addBusStatement(object: ObjectSpec, skipped?: string[]) {
  const { policy, vault, fields, attributes } = object;
  if (![object.type, object.name, policy, vault].every((value) => value.trim())) {
    throw new Error('Type · Name · Policy · Vault는 비워 둘 수 없습니다.');
  }
  return [
    `add bus ${busName(object)} policy ${quote(policy)} vault ${quote(vault)}`,
    ...fieldClauses(
      fields.filter(({ key }) => createFields.includes(key)),
      false,
      skipped,
    ),
    ...fieldClauses(attributes, true, skipped),
  ].join(' ');
}

function modifyClauses(fields: ModifyField[], pick: 'value' | 'oldValue', skipped?: string[]) {
  const isRename = (field: ModifyField) => !field.isAttribute && renameFields.includes(field.key);
  const renames = fields.filter(isRename);
  if (renames.length && renames.length !== renameFields.length) throw new Error('name과 revision은 함께 넘겨야 합니다.');
  const rename = renameFields
    .map((key) => `${key} ${quote(renames.find((field) => field.key === key)?.[pick] ?? '')}`)
    .join(' ');
  return [
    ...(renames.length ? [rename] : []),
    ...fields
      .filter((field) => !isRename(field))
      .flatMap((field) => valueClause(field.key, field[pick], field.isAttribute, skipped)),
  ];
}

const stateChange =
  (kind: string, opposite: string) =>
  ({ id }: ChangeParams): Change => ({
    forward: `${kind} bus ${checkId(id)};`,
    inverse: `${opposite} bus ${checkId(id)};`,
    note: '트리거가 만든 변경과 서명 상태는 되돌리는 문장으로 복구되지 않습니다.',
  });

const signatureChange =
  (kind: string) =>
  ({ id, signature }: ChangeParams): Change => ({
    forward: `${kind} bus ${checkId(id)} signature ${quote(signature)};`,
    inverse: kind === 'unsign' ? '' : `unsign bus ${checkId(id)} signature ${quote(signature)};`,
    note: kind === 'unsign' ? '서명을 취소하기 전 상태로 되돌리는 문장은 만들 수 없습니다.' : '',
  });

const changeBuilders: Record<string, (params: ChangeParams) => Change> = {
  connect: ({ from, to, relType, fromObject, toObject, attributes = [] }) => {
    const ends = `bus ${busRef(from, fromObject)} relationship ${quote(relType)} to ${busRef(to, toObject)}`;
    return {
      forward: `${[`connect ${ends}`, ...fieldClauses(attributes, true)].join(' ')};`,
      inverse: `disconnect ${ends};`,
      note: '',
    };
  },
  disconnect: ({ id, from, to, fromRel, toRel, relType, attributes }) => {
    const skipped: string[] = [];
    const values = fieldClauses(attributes, true, skipped);
    const ends = `${endClause('from', from, fromRel)} ${endClause('to', to, toRel)}`;
    return {
      forward: `delete connection ${checkId(id)};`,
      inverse: `${[`add connection ${quote(relType)} ${ends}`, ...values].join(' ')};`,
      note: ['다시 연결하면 connection ID와 history는 새로 만들어집니다.', skippedNote(skipped)].filter(Boolean).join(' '),
    };
  },
  modify: ({ target, id, fields }) => {
    const isConnection = target === 'connection';
    const invalid = fields.find((field) => !field.isAttribute && (isConnection || !modifyFields.includes(field.key)));
    if (invalid) throw new Error(`수정 문장을 만들 수 없는 항목입니다: ${invalid.key}`);
    if (!fields.length) throw new Error('바뀐 값이 없습니다.');
    const head = `modify ${isConnection ? 'connection' : 'bus'} ${checkId(id)}`;
    const skipped: string[] = [];
    const restored = modifyClauses(fields, 'oldValue', skipped);
    return {
      forward: `${[head, ...modifyClauses(fields, 'value')].join(' ')};`,
      inverse: restored.length ? `${[head, ...restored].join(' ')};` : '',
      note: skippedNote(skipped) || '',
    };
  },
  create: ({ object }) => ({
    forward: `${addBusStatement(object)} select id dump;`,
    inverse: `delete bus ${busName(object)};`,
    note: object.fields.some(({ key, value }) => key === 'current' && value)
      ? 'State를 지정하면 promote 트리거와 서명을 거치지 않고 그 state에서 시작합니다.'
      : '',
  }),
  delete: ({ id, object, connections }) => {
    const skipped: string[] = [];
    const inverse = addBusStatement(object, skipped);
    return {
      forward: `delete bus ${checkId(id)};`,
      inverse: `${inverse};`,
      note: [
        `다시 만들면 ID · history${connections ? ` · 연결 ${connections}건` : ''}은 복원되지 않고 첫 state에서 시작합니다.`,
        skippedNote(skipped),
      ]
        .filter(Boolean)
        .join(' '),
    };
  },
  promote: stateChange('promote', 'demote'),
  demote: stateChange('demote', 'promote'),
  approve: signatureChange('approve'),
  reject: signatureChange('reject'),
  ignore: signatureChange('ignore'),
  unsign: signatureChange('unsign'),
};

export function buildChange(params: ChangeParams) {
  const build = changeBuilders[params.kind];
  if (!build) throw new Error(`알 수 없는 변경 항목입니다: ${params.kind}`);
  return build(params);
}

const statementsOf = (command: string) => {
  const bare = command.replace(quotedTextPattern, "''");
  return [...bare.split(';'), ...bare.split(/\r?\n/)];
};

export const isDestructive = (command: string) =>
  statementsOf(command).some((statement) => destructivePatterns.some((pattern) => pattern.test(statement)));

export const hasDelete = (command: string) => statementsOf(command).some((statement) => deletePattern.test(statement));

export const hasUnbalancedQuote = (command: string) =>
  /['"]/.test(command.replace(commentLinePattern, '').replace(quotedTextPattern, ''));

export const maskSecret = (text: string) => text.replace(secretPattern, (match: string, head?: string) => (head ? `${head}****` : match));

export const transactionAfter = (command: string, active: boolean) =>
  command.split(';').reduce((state, statement) => {
    const text = statement.trim().replace(/\s+/g, ' ');
    if (transactionStartPattern.test(text)) return true;
    return transactionEndPattern.test(text) ? false : state;
  }, active);

function parseRelationship(text: string) {
  const sides: Record<'from' | 'to', Record<string, string>> = { from: {}, to: {} };
  let side: 'from' | 'to' | undefined;
  let indent = 0;
  text.split(/\r?\n/).forEach((line) => {
    const depth = line.search(/\S/);
    const [key, ...rest] = line.trim().split(/\s+/);
    if (depth < 0) return;
    if ((key === 'from' || key === 'to') && !rest.length) {
      side = key;
      indent = depth;
      return;
    }
    if (side && depth <= indent) side = undefined;
    if (side) sides[side][key] = rest.join(' ');
  });
  return { ...sides, preventDuplicates: /^\s*preventduplicates\b/im.test(text) };
}

export async function printRelationship(client: MqlClient, name: string) {
  const text = await client.run(`print relationship ${quote(name)}`);
  return { name, ...parseRelationship(text), text: text.trim() };
}

export async function typeChain(client: MqlClient, name: string) {
  const chain = [name];
  while (chain.length < 20) {
    const text = await client.run(`print type ${quote(chain[chain.length - 1])} select derived dump`).catch(() => '');
    const parent = text.split(/\r?\n/).find((line) => line.trim())?.trim();
    if (!parent || chain.includes(parent)) break;
    chain.push(parent);
  }
  return chain;
}

const selectValues = (result: string | Error, key: string) =>
  result instanceof Error
    ? []
    : result.split(/\r?\n/).flatMap((line) => {
        const match = /^\s*([\w.]+) =(?: (.*))?$/.exec(line);
        return match?.[1] === key ? [(match[2] ?? '').trim()] : [];
      });

const rangeChoices = (value: string) => {
  const exact = /^=\s*(.*)$/.exec(value);
  if (exact) return [exact[1]];
  return !value || rangeOperatorPattern.test(value) ? [] : [value];
};

export async function attributeInfo(client: MqlClient, names: string[]): Promise<AttributeInfo[]> {
  const results = await Promise.all(
    names.map((name) => runOptional(client, `print attribute ${quote(name)} select type default range`)),
  );
  return names.map((name, index) => ({
    name,
    type: selectValues(results[index], 'type')[0] ?? '',
    default: selectValues(results[index], 'default')[0] ?? '',
    ranges: selectValues(results[index], 'range').flatMap(rangeChoices),
  }));
}

export async function typeInfo(client: MqlClient, name: string) {
  const [text, abstract, chain] = await Promise.all([
    client.run(`print type ${quote(name)} select policy attribute`),
    runOptional(client, `print type ${quote(name)} select abstract`),
    typeChain(client, name),
  ]);
  return {
    policies: selectValues(text, 'policy'),
    attributes: await attributeInfo(client, selectValues(text, 'attribute')),
    isAbstract: /^true$/i.test(selectValues(abstract, 'abstract')[0] ?? ''),
    chain,
  };
}

export async function policyStates(client: MqlClient, name: string) {
  return selectValues(await client.run(`print policy ${quote(name)} select state`), 'state');
}

export async function relationshipAttributes(client: MqlClient, name: string) {
  const text = await client.run(`print relationship ${quote(name)} select attribute`);
  return attributeInfo(client, selectValues(text, 'attribute'));
}

export async function listNames(client: MqlClient, kind: string) {
  if (!listKinds.includes(kind)) throw new Error(`목록을 조회할 수 없는 항목입니다: ${kind}`);
  const text = await client.run(`list ${kind}`);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

const inputNames = (input: string) => input.split(/[\s,]+/).filter(Boolean);

const triggerKey = ({ kind, name, state, event, program, input }: TriggerEvent) =>
  [kind, kind === 'type' ? '' : name, state, event, program, input].join('|');

function parseTriggers(text: string) {
  const events: { state: string; event: string; program: string; input: string; inherited: boolean }[] = [];
  let state = '';
  text.split(/\r?\n/).forEach((line) => {
    state = /^\s+state\s+(.+?)\s*$/.exec(line)?.[1] ?? state;
    for (const [, event, program, input] of line.matchAll(triggerPattern)) {
      events.push({ state, event, program, input: input.trim(), inherited: /\binherited\b/i.test(line) });
    }
  });
  return events;
}

async function triggerSteps(client: MqlClient, events: TriggerEvent[]) {
  const managed = events.filter((event) => event.program === triggerManager);
  const names = [...new Set(managed.flatMap((event) => inputNames(event.input)))];
  if (!names.length) return [];
  const selects = ['id', 'current', ...triggerAttributes.map((name) => quote(`attribute[${name}]`))].join(' ');
  const text = await client
    .run(`temp query bus ${quote(triggerType)} ${quote(names.join(','))} * select ${selects} dump ${quote(separator)}`)
    .catch(() => '');
  return dumpRows(text, 8)
    .map(([, name, revision, id, current, program, method, sequence]): TriggerStep => ({
      id,
      name,
      revision,
      current,
      program,
      method,
      sequence,
    }))
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

export async function printTriggers(client: MqlClient, { type, policy, relationship }: TriggerSource) {
  const types = type ? await typeChain(client, type) : [];
  const sources = [
    ...types.map((name, index) => ({ kind: 'type', name, inherited: index > 0 })),
    ...(policy ? [{ kind: 'policy', name: policy, inherited: false }] : []),
    ...(relationship ? [{ kind: 'relationship', name: relationship, inherited: false }] : []),
  ];
  const texts = await Promise.all(sources.map(({ kind, name }) => client.run(`print ${kind} ${quote(name)}`)));
  const parsed: TriggerEvent[] = sources.flatMap((source, index) =>
    parseTriggers(texts[index]).map((event) => ({
      ...source,
      ...event,
      inherited: source.inherited || event.inherited,
      steps: [],
    })),
  );
  const events = parsed.filter(
    (event, index) => !parsed.slice(index + 1).some((other) => triggerKey(other) === triggerKey(event)),
  );
  const steps = await triggerSteps(client, events);
  return events.map((event) => ({
    ...event,
    steps: event.program === triggerManager ? steps.filter((step) => inputNames(event.input).includes(step.name)) : [],
  }));
}

const symbolicCache = new WeakMap<MqlClient, Promise<Symbolics>>();

function parseSymbolics(text: string) {
  const symbolics: Symbolics = { byName: {}, bySymbolic: {} };
  text.split(/\r?\n/).forEach((line) => {
    const [, symbolic, adminType, rest] = symbolicPattern.exec(line.trim()) ?? [];
    if (!symbolic) return;
    const name = rest.replace(/\s+system$/, '').replace(/^(['"])(.*)\1$/, '$2');
    symbolics.byName[`${adminType} ${name}`] = symbolic;
    symbolics.bySymbolic[symbolic] = name;
  });
  return symbolics;
}

function symbolicNames(client: MqlClient) {
  const cached = symbolicCache.get(client) ?? client.run(`list property on program ${mappingProgram}`).then(parseSymbolics);
  symbolicCache.set(client, cached);
  cached.catch(() => symbolicCache.delete(client));
  return cached;
}

export function forgetSymbolics(client: MqlClient) {
  symbolicCache.delete(client);
}

const bySymbolicOf = (client: MqlClient) =>
  symbolicNames(client).then(
    ({ bySymbolic }) => bySymbolic,
    (): Record<string, string> => ({}),
  );

async function actualType(client: MqlClient, value: string) {
  if (!/^type_\S+$/.test(value)) return value;
  return (await bySymbolicOf(client))[value] ?? value;
}

export async function lookupSymbolics(client: MqlClient, names: string[]) {
  const { byName } = await symbolicNames(client);
  return Object.fromEntries(names.filter((name) => byName[name]).map((name) => [name, byName[name]]));
}
