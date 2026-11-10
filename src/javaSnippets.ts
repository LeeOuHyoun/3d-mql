import type { MqlClient } from './mqlClient';
import {
  buildQueryText,
  expandStatement,
  printObject,
  relationshipAttributeNames,
  symbolicsByName,
  type ExpandOptions,
  type QueryTarget,
} from './mqlCommands';

export type JavaTarget = ExpandOptions & {
  id: string;
  label?: string;
  from?: string;
  to?: string;
  fromType?: string;
  toType?: string;
  virtual?: boolean;
  fromRel?: string;
  toRel?: string;
  clusterKey?: string;
  path?: string;
  isEdge?: boolean;
  attribute?: string;
  value?: string;
  direction?: Direction;
};

export type JavaConstants = {
  className: string;
  importPath: string;
  fields: Record<string, string>;
  selects: Record<string, string>;
};

type Kind = 'type' | 'relationship' | 'attribute';
type Direction = 'from' | 'to' | 'both';
type Ref = { code: string; literal?: string };
type Snippet = { title: string; body: string[]; extras?: string[] };
type Namer = ReturnType<typeof createNamer>;
type Related = {
  title: string;
  id: string;
  relType?: string;
  busType?: string;
  direction: Direction;
  options?: ExpandOptions;
};

export const constantsClass = 'cncConstants';

const guideUrl = 'https://leeouhyoun.github.io/sampleCodesAndMemos/jpo/domain-object';
const kindPrefixes: Record<Kind, string> = { type: 'TYPE_', relationship: 'RELATIONSHIP_', attribute: 'ATTRIBUTE_' };
const kindLabels: Record<Kind, string> = { type: '타입', relationship: '관계', attribute: '속성' };
const basicKeys = ['TYPE', 'NAME', 'REVISION', 'CURRENT'];
const commentColumn = 36;
const importPaths: [RegExp, string][] = [
  [/\bMap\b/, 'java.util.Map'],
  [/\bDomainConstants\b/, 'com.matrixone.apps.domain.DomainConstants'],
  [/\bDomainObject\b/, 'com.matrixone.apps.domain.DomainObject'],
  [/\bDomainRelationship\b/, 'com.matrixone.apps.domain.DomainRelationship'],
  [/\bMapList\b/, 'com.matrixone.apps.domain.util.MapList'],
  [/\bPropertyUtil\b/, 'com.matrixone.apps.domain.util.PropertyUtil'],
  [/\bStringList\b/, 'matrix.util.StringList'],
];

const javaString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const preview = (value = '') => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

function concat(parts: (string | Ref)[]) {
  const pieces: string[] = [];
  let text: string | undefined;
  parts.forEach((part) => {
    const literal = typeof part === 'string' ? part : part.literal;
    if (literal !== undefined) {
      text = (text ?? '') + literal;
      return;
    }
    if (text !== undefined) pieces.push(javaString(text));
    text = undefined;
    pieces.push((part as Ref).code);
  });
  if (text !== undefined) pieces.push(javaString(text));
  return pieces.join(' + ');
}

export function parseConstants(source: string, className: string): JavaConstants {
  const text = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1];
  const literals: Record<string, string> = {};
  for (const [, field, symbolic] of text.matchAll(/String\s+(\w+)\s*=\s*"([a-z]+_[^"]+)"\s*;/g)) {
    literals[field] = symbolic;
  }
  const fields: Record<string, string> = {};
  for (const [, field, symbolic, ref] of text.matchAll(
    /String\s+(\w+)\s*=\s*PropertyUtil\.getSchemaProperty\(\s*(?:"([a-z]+_[^"]+)"|(\w+))\s*\)/g,
  )) {
    const key = symbolic ?? literals[ref];
    if (key) fields[key] ??= field;
  }
  const selects: Record<string, string> = {};
  for (const [, select, field] of text.matchAll(/String\s+(\w+)\s*=\s*DomainObject\.getAttributeSelect\(\s*(\w+)\s*\)/g)) {
    selects[field] = select;
  }
  return { className, importPath: packageName ? `${packageName}.${className}` : className, fields, selects };
}

function createNamer(symbolics: Record<string, string> | undefined, constants?: JavaConstants) {
  const holder = constants?.className ?? 'DomainConstants';
  const customPrefix = constants?.className.replace(/Constants$/, '').toLowerCase() ?? '';
  const seen = new Set<string>();
  const unregistered: string[] = [];
  const ootb: string[] = [];
  const suggestions: string[] = [];

  const remember = (kind: Kind, name: string, symbolic?: string) => {
    const label = `${kindLabels[kind]} ${name}`;
    if (seen.has(label)) return;
    seen.add(label);
    if (!symbolic) {
      if (symbolics) unregistered.push(label);
      return;
    }
    if (!constants) return;
    const base = symbolic.slice(symbolic.indexOf('_') + 1);
    if (!customPrefix || !base.toLowerCase().startsWith(customPrefix)) {
      ootb.push(label);
      return;
    }
    const field = kindPrefixes[kind] + base.replace(/\W/g, '').toUpperCase();
    suggestions.push(`public static final String ${field} = PropertyUtil.getSchemaProperty(${javaString(symbolic)});`);
    if (kind === 'attribute') {
      suggestions.push(`public static final String SELECT_${field} = DomainObject.getAttributeSelect(${field});`);
    }
  };

  const ref = (kind: Kind, name: string): Ref => {
    const symbolic = symbolics?.[`${kind} ${name}`];
    const field = symbolic ? constants?.fields[symbolic] : undefined;
    if (field) return { code: `${holder}.${field}` };
    remember(kind, name, symbolic);
    if (symbolic) return { code: `PropertyUtil.getSchemaProperty(context, ${javaString(symbolic)})` };
    return { code: javaString(name), literal: name };
  };

  const pattern = (kind: Kind, value = '') => {
    const names = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!names.length) return javaString('*');
    return concat(names.flatMap((name, index) => [...(index ? [','] : []), /[*?]/.test(name) ? name : ref(kind, name)]));
  };

  const attributeSelect = (name: string) => {
    const symbolic = symbolics?.[`attribute ${name}`];
    const field = symbolic ? constants?.fields[symbolic] : undefined;
    const select = field ? constants?.selects[field] : undefined;
    return select ? `${holder}.${select}` : `DomainObject.getAttributeSelect(${ref('attribute', name).code})`;
  };

  const basic = (key: string) => `${holder}.SELECT_${key}`;

  const notes = () => {
    const lines = [
      !symbolics && '심볼릭 이름 목록을 조회하지 못해 실제 이름을 그대로 적었습니다.',
      unregistered.length && `심볼릭 이름이 등록되지 않아 실제 이름을 그대로 적음: ${unregistered.join(', ')}`,
      ootb.length &&
        `${holder} 에 상수가 없어 getSchemaProperty 로 적음 (OOTB 이름이면 DomainConstants 에 상수가 있을 수 있습니다): ${ootb.join(', ')}`,
      suggestions.length &&
        `${holder} 에 상수가 없어 getSchemaProperty 로 적음. ${holder} 에 아래 줄을 추가하면 상수로 쓸 수 있습니다:`,
      ...suggestions.map((line) => `  ${line}`),
    ].filter((line): line is string => typeof line === 'string');
    return lines.length ? ['// 이름 표기:', ...lines.map((line) => `//   ${line}`)] : [];
  };

  return { ref, pattern, attributeSelect, basic, notes };
}

function callLines(head: string, args: [string, string][]) {
  const texts = args.map(([code], index) => `${code}${index === args.length - 1 ? ');' : ','}`);
  const width = Math.min(Math.max(...texts.map((text) => text.length)), commentColumn);
  return [head, ...texts.map((text, index) => `        ${text.padEnd(width)}  // ${args[index][1]}`)];
}

const objectLines = (id: string) => [
  `String objectId = ${javaString(id)}; // TODO 실제 코드에서는 programMap.get("objectId") 처럼 JPO 인자로 받은 id 를 쓰세요`,
  'DomainObject dobj = DomainObject.newInstance(context, objectId);',
];

function attributeVariables(names: string[]) {
  const used = new Set<string>();
  return names.map((name) => {
    const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const base = `attr${words.map((word) => word[0].toUpperCase() + word.slice(1)).join('')}`;
    let variable = base;
    for (let index = 2; used.has(variable); index++) variable = `${base}${index}`;
    used.add(variable);
    return variable;
  });
}

const uncommentHint = (what: string) => `// TODO ${what}이 필요하면 아래 줄과 값을 읽는 줄, 두 곳의 주석을 함께 푸세요`;

async function objectSnippet(client: MqlClient, namer: Namer, { id }: JavaTarget): Promise<Snippet> {
  const { summary, attributes } = await printObject(client, id);
  const selects = attributes.map((field) => namer.attributeSelect(field.key));
  const variables = attributeVariables(attributes.map((field) => field.key));
  return {
    title: `${summary.type} ${summary.name} ${summary.revision} 값 읽기 (getInfo)`,
    body: [
      ...objectLines(id),
      'StringList slBusSel = new StringList();',
      ...basicKeys.map((key) => `slBusSel.add(${namer.basic(key)});`),
      ...(selects.length ? [uncommentHint('속성'), ...selects.map((select) => `// slBusSel.add(${select});`)] : []),
      'Map info = dobj.getInfo(context, slBusSel); // 키는 넣은 select 문자열 그대로입니다',
      ...basicKeys.map((key) => `String ${key.toLowerCase()} = (String) info.get(${namer.basic(key)});`),
      ...selects.map(
        (select, index) =>
          `// String ${variables[index]} = (String) info.get(${select}); // 지금 값: ${preview(attributes[index].value)}`,
      ),
      '// TODO 읽은 값으로 할 일을 적으세요',
    ],
    extras: ['// 값 확인 MQL:', `//   ${buildQueryText('printBus', [{ id } as QueryTarget])}`],
  };
}

async function relatedSnippet(
  client: MqlClient,
  namer: Namer,
  { title, id, relType = '*', busType = '*', direction, options = {} }: Related,
): Promise<Snippet> {
  const relAttributes: string[] = /[,*?]/.test(relType)
    ? []
    : await relationshipAttributeNames(client, relType).catch(() => []);
  const selects = relAttributes.map((name) => namer.attributeSelect(name));
  const variables = attributeVariables(relAttributes);
  const isEnd = options.recurse === 'end';
  const level = isEnd || options.recurse === 'all' ? 0 : Math.max(1, Math.floor(Number(options.recurse) || 1));
  const limit = Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : 0;
  const whereOf = (value?: string) => (value?.trim() ? javaString(value.trim()) : 'null');
  const objectKeys = ['ID', ...basicKeys];
  const sides: ('from' | 'to')[] = direction === 'both' ? ['from', 'to'] : [direction];
  return {
    title,
    body: [
      ...objectLines(id),
      'StringList slBusSel = new StringList();',
      ...objectKeys.map((key) => `slBusSel.add(${namer.basic(key)});`),
      'StringList slRelSel = new StringList();',
      `slRelSel.add(${namer.basic('RELATIONSHIP_ID')});`,
      ...(selects.length ? [uncommentHint('관계 속성'), ...selects.map((select) => `// slRelSel.add(${select});`)] : []),
      ...(isEnd
        ? ['// TODO Expand 옵션의 "말단만(end)" 은 getRelatedObjects 에 맞는 인자가 없어 끝까지(0)로 적었습니다. 결과에서 말단 객체만 골라 쓰세요']
        : []),
      ...callLines('MapList ml = dobj.getRelatedObjects(context,', [
        [namer.pattern('relationship', relType), '관계 이름. 여러 개는 쉼표, 전부는 "*"'],
        [namer.pattern('type', busType), '가져올 객체 타입. 여러 개는 쉼표, 전부는 "*"'],
        ['slBusSel', '결과 Map 에 담을 객체 값'],
        ['slRelSel', '결과 Map 에 담을 관계 값'],
        [String(direction !== 'from'), 'getTo: true 면 이 객체가 to 쪽인 관계를 따라감 (부모 방향)'],
        [String(direction !== 'to'), 'getFrom: true 면 이 객체가 from 쪽인 관계를 따라감 (자식 방향)'],
        [`(short) ${level}`, '단계: 1 바로 아래, 0 끝까지'],
        [whereOf(options.busWhere), '객체 where 조건. 없으면 null'],
        [whereOf(options.relWhere), '관계 where 조건. 없으면 null'],
        [String(limit), '개수 제한: 0 이면 제한 없음'],
      ]),
      'for (Object o : ml) {',
      '    Map m = (Map) o;',
      ...objectKeys.map((key) => `    String ${key.toLowerCase()} = (String) m.get(${namer.basic(key)});`),
      `    String relId = (String) m.get(${namer.basic('RELATIONSHIP_ID')});`,
      ...(level !== 1 ? ['    String level = (String) m.get("level"); // 기준 객체로부터 몇 단계 떨어졌는지 ("1", "2" ...)'] : []),
      ...selects.map((select, index) => `    // String ${variables[index]} = (String) m.get(${select});`),
      '    // TODO 한 행씩 할 일을 적으세요',
      '}',
    ],
    extras: [
      '// 같은 조건의 MQL (MQL 콘솔에서 실행해 결과 건수를 비교해 볼 수 있습니다):',
      ...sides.map((side) => `//   ${expandStatement(id, side, { ...options, relType, busType })};`),
    ],
  };
}

async function pathSnippet(_client: MqlClient, namer: Namer, target: JavaTarget): Promise<Snippet> {
  const segments = [...(target.path ?? '').matchAll(/(from|to)\[([^\]]+)\]\.(to|from)/g)];
  if (!segments.length) throw new Error(`경로 select 식을 해석할 수 없습니다: ${target.path}`);
  const select = concat([
    ...segments.flatMap(([, side, rel, end], index) => [
      `${index ? '.' : ''}${side}[`,
      namer.ref('relationship', rel),
      `].${end}`,
    ]),
    '.id',
  ]);
  return {
    title: '경로 따라 값 읽기 (getInfoList)',
    body: [
      ...objectLines(target.id),
      `StringList slIds = dobj.getInfoList(context, ${select}); // 경로 끝 객체들의 id. 값이 하나여도 StringList 로 옵니다`,
      '// TODO 끝의 .id 를 .name 이나 .attribute[속성] 으로 바꾸면 다른 값을 읽습니다',
      'for (Object o : slIds) {',
      '    String id = (String) o;',
      '    // TODO 할 일을 적으세요',
      '}',
    ],
    extras: ['// 같은 값을 읽는 MQL:', `//   ${buildQueryText('pathPrint', [target as unknown as QueryTarget])}`],
  };
}

const attributeSnippet =
  (isWrite: boolean) =>
  async (_client: MqlClient, namer: Namer, { id, isEdge, attribute = '', value = '' }: JavaTarget): Promise<Snippet> => {
    const args: [string, string][] = [
      [namer.ref('attribute', attribute).code, '속성 이름'],
      ...(isWrite ? [[javaString(value), '저장할 값. TODO 실제 값으로 바꾸세요'] as [string, string]] : []),
    ];
    const head = isWrite ? '' : 'String value = ';
    const call = isEdge
      ? [
          `String relId = ${javaString(id)}; // TODO 실제 코드에서는 paramMap.get("relId") 처럼 JPO 인자로 받은 관계 id 를 쓰세요`,
          ...callLines(`${head}DomainRelationship.${isWrite ? 'set' : 'get'}AttributeValue(context,`, [
            ['relId', '관계(connection) id'],
            ...args,
          ]),
        ]
      : [...objectLines(id), ...callLines(`${head}dobj.${isWrite ? 'set' : 'get'}AttributeValue(context,`, args)];
    return {
      title: `${isEdge ? '관계' : '객체'} 속성 ${attribute} ${isWrite ? '쓰기 (setAttributeValue)' : '읽기 (getAttributeValue)'}`,
      body: [
        ...call,
        isWrite
          ? '// 참고: 로그인 사용자 권한으로 저장합니다. 여러 값을 함께 바꿀 때는 setAttributeValues(context, Map) 와 트랜잭션을 검토하세요'
          : `// 지금 값: ${preview(value)}`,
      ],
    };
  };

function edgeOf(target: JavaTarget) {
  const { from, to, label, virtual, fromRel, toRel } = target;
  if (virtual || fromRel || toRel || !from || !to || !label) {
    throw new Error('객체 사이의 실제 관계가 아니라서 Java 코드를 만들 수 없습니다. (가상 연결 또는 관계에 붙은 관계)');
  }
  return { ...target, from, to, label };
}

const builders: Record<string, (client: MqlClient, namer: Namer, target: JavaTarget) => Promise<Snippet>> = {
  javaObject: objectSnippet,
  javaChildren: (client, namer, target) => {
    const { from, label, toType } = edgeOf(target);
    return relatedSnippet(client, namer, {
      title: `${label} 따라 to 쪽 객체 찾기 (getRelatedObjects)`,
      id: from,
      relType: label,
      busType: toType || '*',
      direction: 'from',
    });
  },
  javaParents: (client, namer, target) => {
    const { to, label, fromType } = edgeOf(target);
    return relatedSnippet(client, namer, {
      title: `${label} 따라 from 쪽 객체 찾기 (getRelatedObjects)`,
      id: to,
      relType: label,
      busType: fromType || '*',
      direction: 'to',
    });
  },
  javaCluster: (client, namer, { id, clusterKey = '' }) => {
    const [anchorId, relType] = clusterKey.split('::');
    return relatedSnippet(client, namer, {
      title: `${relType} 묶음 객체 찾기 (getRelatedObjects)`,
      id: anchorId,
      relType,
      direction: id.startsWith('cluster-rev') ? 'to' : 'from',
    });
  },
  javaExpand: (client, namer, { id, direction = 'from', relType, busType, ...options }) =>
    relatedSnippet(client, namer, {
      title: 'Expand 옵션 조건으로 객체 찾기 (getRelatedObjects)',
      id,
      relType,
      busType,
      direction,
      options,
    }),
  pathJava: pathSnippet,
  javaAttributeGet: attributeSnippet(false),
  javaAttributeSet: attributeSnippet(true),
};

function render({ title, body, extras = [] }: Snippet, namer: Namer, constants?: JavaConstants) {
  const code = body.join('\n');
  const used = code
    .replace(/(\S)\s+\/\/ .*$/gm, '$1')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') || line.trim().endsWith(';'))
    .join('\n');
  const paths: [RegExp, string][] = constants
    ? [...importPaths, [new RegExp(`\\b${constants.className}\\b`), constants.importPath]]
    : importPaths;
  return [
    `// ===== 3d-mql 가이드 코드: ${title} =====`,
    '// 붙여 넣으면 바로 실행되는 출발점입니다. TODO 표시를 상황에 맞게 고치세요.',
    `// 참고 문서: ${guideUrl}`,
    '// 필요한 import:',
    ...paths.filter(([pattern]) => pattern.test(used)).map(([, path]) => `//   import ${path};`),
    ...(!constants && /PropertyUtil\.getSchemaProperty/.test(used)
      ? [`// ${constantsClass}.java 를 워크스페이스에서 찾지 못해 상수 대신 PropertyUtil.getSchemaProperty 로 적었습니다.`]
      : []),
    ...namer.notes(),
    ...extras,
    code,
  ].join('\n');
}

export const isJavaAction = (action: string) => Object.hasOwn(builders, action);

export async function buildJavaText(client: MqlClient, action: string, targets: JavaTarget[], constants?: JavaConstants) {
  const symbolics = await symbolicsByName(client);
  const texts = await Promise.all(
    targets.map(async (target) => {
      const namer = createNamer(symbolics, constants);
      return render(await builders[action](client, namer, target), namer, constants);
    }),
  );
  return texts.join('\n\n');
}
