<script setup>
import { Check, Copy, Loader2, TriangleAlert } from '@lucide/vue'
import { cachedRequest, request } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'
import { toFields, useChangePreview } from '../composables/useChangePreview.js'
import AttributeField from './AttributeField.vue'
import BaseDialog from './BaseDialog.vue'
import ChangeActions from './ChangeActions.vue'
import ComboInput from './ComboInput.vue'
import RelationshipFields from './RelationshipFields.vue'

const LOOKUP_DEBOUNCE_MS = 400
const plmTypePattern = /^PLM(Core|Entity)/

const props = defineProps({
  options: { type: Object, required: true },
  isConnecting: { type: Boolean, default: false },
  isBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'close'])

const { anchor, draft, defaults } = props.options

const optionalFields = [
  { key: 'current', label: 'State', placeholder: '(기본: 첫 state)' },
  { key: 'owner', label: 'Owner', placeholder: defaults.owner ? `(기본: ${defaults.owner})` : '(기본)' },
  { key: 'description', label: 'Description', placeholder: '' },
  { key: 'organization', label: 'Organization', placeholder: '(비워 두면 지정하지 않음)' },
  { key: 'project', label: 'Project', placeholder: '(비워 두면 지정하지 않음)' },
]
const basicFields = [
  { key: 'type', label: 'Type', required: true },
  { key: 'name', label: 'Name', required: true },
  { key: 'revision', label: 'Revision' },
  { key: 'policy', label: 'Policy', required: true },
  { key: 'vault', label: 'Vault', required: true },
  ...optionalFields,
]

const draftField = (key) => draft?.fields.find((field) => field.key === key)?.value ?? ''

const form = reactive({
  type: draft?.type ?? '',
  name: draft?.name ?? '',
  revision: draft?.revision ?? '',
  policy: draft?.policy ?? '',
  vault: draft?.vault ?? defaults.vault ?? '',
  ...Object.fromEntries(optionalFields.map(({ key }) => [key, draftField(key)])),
})
const attributeValues = ref(Object.fromEntries((draft?.attributes ?? []).map(({ key, value }) => [key, value])))

const {
  state: typeNames,
  isLoading: isTypeListLoading,
  error: typeListError,
} = useAsyncState(() => cachedRequest('list', { kind: 'type' }), [])
const { state: vaultNames, error: vaultListError } = useAsyncState(() => cachedRequest('list', { kind: 'vault' }), [])

const listWarning = (kind, error) =>
  error && `${kind} 목록을 불러오지 못했습니다. 창을 다시 열면 다시 불러옵니다. (${error.message})`

const typeName = computed(() => form.type.trim())
const typeSet = computed(() => new Set(typeNames.value))
const isListedType = computed(() => !typeSet.value.size || typeSet.value.has(typeName.value))
const lookupType = computed(() => (!isTypeListLoading.value && isListedType.value ? typeName.value : ''))
const debouncedType = refDebounced(lookupType, LOOKUP_DEBOUNCE_MS)
const {
  data: typeInfo,
  error: typeError,
  isLoading: isTypeLoading,
} = useLoader(debouncedType, () => cachedRequest('typeInfo', { id: debouncedType.value }))
const attributeList = computed(() => typeInfo.value?.attributes ?? [])
const listLoadingText = computed(() => (props.isConnecting ? 'MQL에 연결하는 중...' : 'type 목록을 불러오는 중...'))
const loadingText = computed(() =>
  isTypeListLoading.value ? listLoadingText.value : isTypeLoading.value ? 'type 정보를 조회하는 중...' : '',
)

const isPolicyAuto = ref(!draft?.policy)

watch(typeInfo, (info) => {
  const policy = form.policy.trim()
  if (!info?.policies.length || info.policies.includes(policy)) return
  if (isPolicyAuto.value || !policy) form.policy = info.policies[0]
})

const handleInput = (key) => {
  if (key === 'policy') isPolicyAuto.value = false
}

const policyName = computed(() => form.policy.trim())
const debouncedPolicy = refDebounced(policyName, LOOKUP_DEBOUNCE_MS)
const { data: stateNames } = useLoader(debouncedPolicy, () =>
  cachedRequest('policyStates', { id: debouncedPolicy.value }).catch(() => []),
)

const fieldOptions = computed(() => ({
  type: typeNames.value,
  policy: typeInfo.value?.policies ?? [],
  vault: vaultNames.value,
  current: stateNames.value ?? [],
}))

const tnr = computed(() => ({ type: typeName.value, name: form.name.trim(), revision: form.revision.trim() }))
const tnrKey = computed(() => (lookupType.value && tnr.value.name ? JSON.stringify(tnr.value) : ''))
const debouncedTnr = refDebounced(tnrKey, LOOKUP_DEBOUNCE_MS)

const findDuplicate = async () => {
  const { type, name, revision } = JSON.parse(debouncedTnr.value)
  const { results } = await request('search', { type, name, revision })
  return results.find((item) => item.type === type && item.name === name && item.revision === revision)?.id ?? ''
}

const { data: duplicateId } = useLoader(debouncedTnr, findDuplicate)

const objectSpec = computed(() => ({
  ...tnr.value,
  policy: policyName.value,
  vault: form.vault.trim(),
  fields: optionalFields.map(({ key }) => ({ key, value: form[key].trim() })).filter((field) => field.value),
  attributes: attributeList.value
    .map(({ name }) => ({ key: name, value: attributeValues.value[name] ?? '' }))
    .filter((field) => field.value),
}))

const isSwapped = ref(false)
const relType = ref('')
const linkAttributes = ref({})
const relName = computed(() => relType.value.trim())
const linkItems = computed(
  () => anchor && [anchor, { ...tnr.value, name: tnr.value.name || '(새 객체)', isPending: true }],
)

const linkParams = computed(() => {
  if (!anchor || !relName.value) return null
  const anchorEnd = { id: anchor.id }
  const newEnd = { id: '', object: tnr.value }
  const [from, to] = isSwapped.value ? [newEnd, anchorEnd] : [anchorEnd, newEnd]
  return {
    kind: 'connect',
    from: from.id,
    fromObject: from.object,
    to: to.id,
    toObject: to.object,
    relType: relName.value,
    attributes: toFields(linkAttributes.value),
  }
})

const { statements, error: previewError } = useChangePreview(() => [
  { kind: 'create', object: objectSpec.value },
  ...(linkParams.value ? [linkParams.value] : []),
])
const statementText = computed(() => statements.value.join('\n'))
const { copy, copied } = useClipboard({ legacy: true })

const warnings = computed(() =>
  [
    listWarning('type', typeListError.value),
    listWarning('vault', vaultListError.value),
    typeName.value && !isListedType.value && 'type 목록에 없는 이름입니다. 정확한 type 이름인지 확인하세요.',
    typeInfo.value?.isAbstract && 'abstract type이라 객체를 만들 수 없습니다.',
    typeInfo.value?.chain.some((name) => plmTypePattern.test(name)) &&
      'VPM/PLM 계열 type입니다. CATIA 설계 데이터는 MQL로 만들면 구조가 어긋날 수 있습니다.',
    typeInfo.value && !typeInfo.value.policies.length && '이 type에 쓸 수 있는 policy를 찾지 못했습니다.',
    duplicateId.value && `같은 Type · Name · Revision 객체가 이미 있습니다. (${duplicateId.value})`,
  ].filter(Boolean),
)

const isComplete = computed(
  () =>
    [tnr.value.type, tnr.value.name, objectSpec.value.policy, objectSpec.value.vault].every(Boolean) &&
    (!anchor || !!relName.value),
)
const canSubmit = computed(() => isComplete.value && !previewError.value)

const title = draft
  ? '생성 문장 고치기'
  : anchor
    ? `새 객체 만들어 연결 · ${anchor.name} ${anchor.revision}`
    : '새 객체 만들기'

const handleSubmit = (isImmediate) => {
  if (!canSubmit.value) return
  emit(
    'submit',
    {
      object: objectSpec.value,
      link: anchor
        ? { isAnchorFrom: !isSwapped.value, relType: relName.value, attributes: toFields(linkAttributes.value) }
        : null,
    },
    isImmediate,
  )
}

const inputClass =
  'w-full min-w-0 h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef] placeholder:text-gray-400 dark:placeholder:text-[#5c6370]'
const labelClass = 'text-gray-500 dark:text-[#5c6370] break-all'
const sectionClass = 'font-semibold text-gray-500 dark:text-[#5c6370]'
const codeClass =
  'm-0 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-all text-gray-800 dark:text-[#98c379]'
</script>

<template>
  <BaseDialog :title="title" width-class="w-[44rem]" @close="emit('close')">
    <form class="flex-1 min-h-0 flex flex-col" @submit.prevent="handleSubmit(!draft)">
      <div class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3">
        <div class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
          <template v-for="field in basicFields" :key="field.key">
            <span :class="labelClass">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </span>
            <ComboInput
              v-model="form[field.key]"
              :class="inputClass"
              :options="fieldOptions[field.key]"
              :placeholder="field.placeholder"
              spellcheck="false"
              @update:model-value="handleInput(field.key)"
            />
          </template>
        </div>
        <div v-if="loadingText" class="flex items-center gap-2 text-gray-400">
          <Loader2 :size="14" class="animate-spin" />
          {{ loadingText }}
        </div>
        <div v-else-if="typeError" class="text-red-500 whitespace-pre-wrap break-all">{{ typeError }}</div>
        <div v-if="attributeList.length" class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
          <div :class="[sectionClass, 'col-span-2']">속성 ({{ attributeList.length }})</div>
          <template v-for="attribute in attributeList" :key="attribute.name">
            <span :class="labelClass" :title="attribute.type">{{ attribute.name }}</span>
            <AttributeField v-model="attributeValues[attribute.name]" :meta="attribute" optional />
          </template>
        </div>
        <div v-if="linkItems" class="pt-3 border-t border-gray-200 dark:border-[#3e4451] flex flex-col gap-3">
          <div :class="sectionClass">연결</div>
          <RelationshipFields
            v-model:swapped="isSwapped"
            v-model:rel-type="relType"
            v-model:attributes="linkAttributes"
            :items="linkItems"
            :edges="props.options.edges"
            :relations="props.options.relations"
          />
        </div>
        <div
          v-for="warning in warnings"
          :key="warning"
          class="flex items-start gap-1.5 text-amber-600 dark:text-amber-400"
        >
          <TriangleAlert :size="14" class="shrink-0 mt-px" />
          <span class="break-all">{{ warning }}</span>
        </div>
      </div>
      <div class="px-4 py-3 border-t border-gray-200 dark:border-[#3e4451] flex flex-col gap-2 shrink-0">
        <template v-if="isComplete">
          <div v-if="statements.length" class="relative">
            <pre :class="[codeClass, 'pr-7']">{{ statementText }}</pre>
            <button
              type="button"
              title="MQL 문 복사"
              class="absolute top-0 right-0 p-1 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
              @click="copy(statementText)"
            >
              <Check v-if="copied" :size="13" class="text-green-500" />
              <Copy v-else :size="13" />
            </button>
          </div>
          <div v-if="previewError" class="text-red-500 whitespace-pre-wrap break-all">{{ previewError }}</div>
        </template>
        <div v-else class="text-gray-400">
          * 표시 항목{{ anchor ? '과 Relationship' : '' }}을 채우면 실행 문장 미리보기가 나옵니다.
        </div>
        <div class="flex justify-end gap-2">
          <ChangeActions
            :can-submit="canSubmit"
            :is-busy="props.isBusy"
            :has-immediate="!draft"
            :basket-label="draft ? '바구니 항목 고치기' : '바구니에 담기'"
            @basket="handleSubmit(false)"
            @close="emit('close')"
          />
        </div>
      </div>
    </form>
  </BaseDialog>
</template>
