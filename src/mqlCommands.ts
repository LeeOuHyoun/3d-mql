import type { MqlClient } from './mqlClient';

export type ObjectSummary = { id: string; type: string; name: string; revision: string; current: string };
export type GraphEdge = { id: string; from: string; to: string; label: string; reverse: boolean };
export type Field = { key: string; value: string };
export type SearchParams = { type?: string; name?: string; revision?: string };
export type Direction = 'from' | 'to' | 'both';
export type ExpandOptions = { relType?: string; busType?: string; recurse?: number; limit?: number };
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
};

const separator = '|~|';
const idPattern = /^[\w.]+$/;
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

const quote = (value: string) => (value.includes('"') ? `'${value}'` : `"${value}"`);

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

const printBusCommand = (id: string) => `print bus ${checkId(id)} select ${objectSelects.join(' ')}`;

const printConnectionCommand = (id: string) => `print connection ${checkId(id)} select ${connectionSelects.join(' ')}`;

const expandCommand = (id: string, direction: 'from' | 'to', { relType, busType, recurse }: ExpandOptions = {}) =>
  [
    `expand bus ${checkId(id)} ${direction} relationship ${quote(relType?.trim() || '*')}`,
    busType?.trim() && `type ${quote(busType.trim())}`,
    Number(recurse) > 1 && `recurse to ${Math.floor(Number(recurse))}`,
  ]
    .filter(Boolean)
    .join(' ');

const expandCopy = (id: string, direction: 'from' | 'to', relType?: string) =>
  `${expandCommand(id, direction, { relType })} select bus id current select rel id;`;

const queryBuilders: Record<string, (target: QueryTarget) => string> = {
  id: ({ id }) => id,
  tnr: ({ type, name, revision }) => [type, name, revision].map(quote).join(' '),
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
  const pattern = [params.type, params.name, params.revision].map((value) => quote(value?.trim() || '*')).join(' ');
  const text = await client.run(`temp query bus ${pattern} limit ${limit} select id current dump ${quote(separator)}`);
  return dumpRows(text, 5).map(([type, name, revision, id, current]) => ({ id, type, name, revision, current }));
}

export async function expandObject(client: MqlClient, id: string, direction: Direction, options: ExpandOptions = {}) {
  if (direction !== 'both') return expandDirection(client, id, direction, options);
  const results = await Promise.all([
    expandDirection(client, id, 'from', options),
    expandDirection(client, id, 'to', options),
  ]);
  return { nodes: results.flatMap((item) => item.nodes), edges: results.flatMap((item) => item.edges) };
}

async function expandDirection(client: MqlClient, id: string, direction: 'from' | 'to', options: ExpandOptions) {
  const limit = Number(options.limit) > 0 ? ` limit ${Math.floor(Number(options.limit))}` : '';
  const text = await client.run(
    `${expandCommand(id, direction, options)} select bus type id current select rel type id dump ${quote(separator)}${limit}`,
  );
  const nodes: ObjectSummary[] = [];
  const edges: GraphEdge[] = [];
  const parents = [id];
  dumpRows(text, 11).forEach((fields) => {
    const [levelText, relType, , type, name, revision] = fields;
    const level = Math.max(1, Number(levelText) || 1);
    const parentId = parents[level - 1] ?? id;
    const rest = fields.slice(6);
    const busFirst = rest[0] === type && rest[3] === relType;
    const [busId, current, relId] = busFirst ? [rest[1], rest[2], rest[4]] : [rest[3], rest[4], rest[1]];
    parents.length = level;
    parents.push(busId);
    nodes.push({ id: busId, type, name, revision, current });
    edges.push(
      direction === 'from'
        ? { id: relId, from: parentId, to: busId, label: relType, reverse: false }
        : { id: relId, from: busId, to: parentId, label: relType, reverse: true },
    );
  });
  return { nodes, edges };
}

export async function printObject(client: MqlClient, id: string) {
  const text = await client.run(printBusCommand(id));
  const { basics, attributes } = splitFields(parseKeyValues(text));
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

export async function printObjectExtra(client: MqlClient, id: string) {
  const fields = parseKeyValues(await client.run(`print bus ${checkId(id)} select current state history`));
  const valuesOf = (key: string) => fields.filter((field) => field.key === key).map((field) => field.value);
  return { current: valuesOf('current')[0] ?? '', states: valuesOf('state'), history: valuesOf('history') };
}

export async function printConnection(client: MqlClient, id: string) {
  const text = await client.run(printConnectionCommand(id));
  return splitFields(parseKeyValues(text));
}
