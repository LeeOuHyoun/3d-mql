import type { MqlClient } from './mqlClient';

export type ObjectSummary = { id: string; type: string; name: string; revision: string; current: string };
export type GraphEdge = { id: string; from: string; to: string; label: string };
export type Field = { key: string; value: string };
export type SearchParams = { type?: string; name?: string; revision?: string };
export type Direction = 'from' | 'to';

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

export async function expandObject(client: MqlClient, id: string, direction: Direction) {
  const text = await client.run(
    `expand bus ${checkId(id)} ${direction} relationship "*" select bus type id current select rel type id dump ${quote(separator)}`,
  );
  const nodes: ObjectSummary[] = [];
  const edges: GraphEdge[] = [];
  dumpRows(text, 11).forEach((fields) => {
    const [, relType, , type, name, revision] = fields;
    const rest = fields.slice(6);
    const busFirst = rest[0] === type && rest[3] === relType;
    const [busId, current, relId] = busFirst ? [rest[1], rest[2], rest[4]] : [rest[3], rest[4], rest[1]];
    nodes.push({ id: busId, type, name, revision, current });
    edges.push(
      direction === 'from'
        ? { id: relId, from: id, to: busId, label: relType }
        : { id: relId, from: busId, to: id, label: relType },
    );
  });
  return { nodes, edges };
}

export async function printObject(client: MqlClient, id: string) {
  const text = await client.run(`print bus ${checkId(id)} select ${objectSelects.join(' ')}`);
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

export async function printConnection(client: MqlClient, id: string) {
  const text = await client.run(`print connection ${checkId(id)} select ${connectionSelects.join(' ')}`);
  return splitFields(parseKeyValues(text));
}
