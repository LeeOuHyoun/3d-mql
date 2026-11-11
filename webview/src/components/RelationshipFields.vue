<script setup>
import { ArrowLeftRight, Loader2, TriangleAlert } from '@lucide/vue'
import { cachedRequest } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'
import AttributeField from './AttributeField.vue'
import ComboInput from './ComboInput.vue'

const CHECK_DEBOUNCE_MS = 400

const props = defineProps({
  items: { type: Array, required: true },
  edges: { type: Array, default: () => [] },
  relations: { type: Array, default: () => [] },
})
const isSwapped = defineModel('swapped', { type: Boolean, default: false })
const relType = defineModel('relType', { type: String, default: '' })
const attributes = defineModel('attributes', { type: Object, default: () => ({}) })

const from = computed(() => props.items[isSwapped.value ? 1 : 0])
const to = computed(() => props.items[isSwapped.value ? 0 : 1])
const toggleSwap = useToggle(isSwapped)
const sides = computed(() => [
  { key: 'from', item: from.value },
  { key: 'to', item: to.value },
])

const relName = computed(() => relType.value.trim())
const checkKey = computed(() => (relName.value ? JSON.stringify([relName.value, ...props.items.map((item) => item.type)]) : ''))
const debouncedKey = refDebounced(checkKey, CHECK_DEBOUNCE_MS)

const loadCheck = async () => {
  const [name, ...types] = JSON.parse(debouncedKey.value)
  const [definition, fields, ...typeChains] = await Promise.all([
    cachedRequest('relationship', { id: name }),
    cachedRequest('relationshipAttributes', { id: name }).catch(() => []),
    ...types.map((type) => (type ? cachedRequest('typeChain', { id: type }) : [])),
  ])
  return { definition, fields, chains: Object.fromEntries(types.map((type, index) => [type, typeChains[index]])) }
}

const { data: check, error, isLoading: isChecking } = useLoader(debouncedKey, loadCheck)

watch(relName, () => {
  attributes.value = {}
})

const setAttribute = (name, value) => {
  attributes.value = { ...attributes.value, [name]: value }
}

const allowedTypes = (side) =>
  (check.value.definition[side].type || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

const typeWarning = (side, item) => {
  const allowed = allowedTypes(side)
  const chain = check.value.chains[item.type]
  if (!chain || !allowed.length || allowed.includes('all') || allowed.some((name) => chain.includes(name))) return ''
  return `${side} 쪽에 허용된 type(${allowed.join(', ')})에 ${item.type}이(가) 없습니다.`
}

const warnings = computed(() => {
  if (!check.value) return []
  const { definition } = check.value
  const same = props.edges.filter((e) => e.label === relName.value)
  const isOne = (side) => /^(one|1)$/i.test(definition[side].cardinality || '')
  return [
    typeWarning('from', from.value),
    typeWarning('to', to.value),
    isOne('from') &&
      same.some((e) => e.to === to.value.id) &&
      `from cardinality가 one인데 ${to.value.name}에는 이 관계의 from 객체가 이미 있습니다. (그래프에 보이는 범위)`,
    isOne('to') &&
      same.some((e) => e.from === from.value.id) &&
      `to cardinality가 one인데 ${from.value.name}에는 이 관계의 to 객체가 이미 있습니다. (그래프에 보이는 범위)`,
    definition.preventDuplicates &&
      same.some((e) => e.from === from.value.id && e.to === to.value.id) &&
      '중복 방지 관계인데 같은 연결이 이미 있습니다.',
  ].filter(Boolean)
})

const isUnparsed = computed(() => check.value && !allowedTypes('from').length && !allowedTypes('to').length)

const inputClass =
  'w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]'
</script>

<template>
  <div class="flex items-stretch gap-2">
    <div class="flex-1 min-w-0 flex flex-col gap-2">
      <div
        v-for="side in sides"
        :key="side.key"
        class="px-2 py-1.5 rounded-md border border-gray-200 dark:border-[#3e4451] flex items-center gap-2"
      >
        <span class="w-8 shrink-0 font-bold text-[#4b8bca] dark:text-[#61afef]">{{ side.key }}</span>
        <span class="min-w-0 break-all">
          <span class="font-semibold">{{ side.item.name }} {{ side.item.revision }}</span>
          <span class="text-gray-400"> · {{ side.item.type || '(type 미입력)' }}</span>
          <span v-if="side.item.isPending" class="text-emerald-600 dark:text-emerald-400"> · 생성 예정</span>
        </span>
      </div>
    </div>
    <button
      type="button"
      class="px-2 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-gray-500 hover:text-[#61afef] cursor-pointer"
      title="방향 바꾸기"
      @click="toggleSwap()"
    >
      <ArrowLeftRight :size="14" class="rotate-90" />
    </button>
  </div>
  <label class="flex flex-col gap-1 font-semibold text-gray-500 dark:text-[#5c6370]">
    Relationship
    <ComboInput v-model="relType" :class="inputClass" :options="props.relations" spellcheck="false" />
  </label>
  <div v-if="isChecking" class="flex items-center gap-2 text-gray-400">
    <Loader2 :size="14" class="animate-spin" />
    관계 정의를 확인하는 중...
  </div>
  <div v-else-if="error" class="text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
  <template v-else-if="check">
    <table class="w-full border-collapse">
      <tbody>
        <tr v-for="side in sides" :key="side.key" class="border-b border-gray-100 dark:border-[#3e4451]/60 align-top">
          <td class="w-10 py-1 font-bold text-gray-500">{{ side.key }}</td>
          <td class="py-1 break-all">
            {{ check.definition[side.key].type || check.definition[side.key].relationship || '-' }}
          </td>
          <td class="w-24 py-1 text-gray-500">cardinality {{ check.definition[side.key].cardinality || '-' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="isUnparsed" class="text-gray-400">정의에서 from/to 규칙을 읽지 못해 검사를 건너뜁니다.</div>
    <div v-for="warning in warnings" :key="warning" class="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
      <TriangleAlert :size="14" class="shrink-0 mt-px" />
      <span>{{ warning }}</span>
    </div>
    <div v-if="!isUnparsed && !warnings.length" class="text-emerald-600 dark:text-emerald-400">
      정의와 맞지 않는 점을 찾지 못했습니다.
    </div>
    <div v-if="check.fields.length" class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
      <div class="col-span-2 font-semibold text-gray-500 dark:text-[#5c6370]">관계 속성 ({{ check.fields.length }})</div>
      <template v-for="field in check.fields" :key="field.name">
        <span class="text-gray-500 break-all" :title="field.type">{{ field.name }}</span>
        <AttributeField
          :model-value="attributes[field.name] ?? ''"
          :meta="field"
          optional
          @update:model-value="setAttribute(field.name, $event)"
        />
      </template>
    </div>
  </template>
</template>
