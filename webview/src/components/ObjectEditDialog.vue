<script setup>
import { Loader2 } from '@lucide/vue'
import { pick } from 'lodash-es'
import { cachedRequest, request } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'
import { useChangePreview } from '../composables/useChangePreview.js'
import AttributeField from './AttributeField.vue'
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  target: { type: Object, required: true },
})
const emit = defineEmits(['submit', 'close'])

const renameKeys = ['name', 'revision']
const isConnection = props.target.target === 'connection'
const editableBasics = isConnection ? [] : [...renameKeys, 'owner', 'description']
const shownBasics = ['type', 'policy', 'vault', 'current', 'organization', 'project']
const isStaged = !!props.target.key

const loadTarget = async () => {
  const { basics, attributes } = await request(isConnection ? 'connection' : 'object', { id: props.target.id })
  const metas = await cachedRequest('attributes', { names: attributes.map((field) => field.key) }).catch(() => [])
  return {
    basics: Object.fromEntries(basics.map((field) => [field.key, field.value])),
    attributes: attributes.map((field, index) => ({ ...metas[index], name: field.key, value: field.value })),
  }
}

const { data, error, isLoading } = useLoader(() => props.target.id, loadTarget)

const endOf = (basics, side) =>
  ['type', 'name', 'revision']
    .map((key) => basics[`${side}.${key}`])
    .filter(Boolean)
    .join(' ')

const readonlyRows = computed(() => {
  const basics = data.value?.basics ?? {}
  if (isConnection) {
    return [
      { label: 'relationship', value: basics.type },
      { label: 'from', value: endOf(basics, 'from') },
      { label: 'to', value: endOf(basics, 'to') },
    ]
  }
  return shownBasics.filter((key) => key in basics).map((key) => ({ label: key, value: basics[key] }))
})

const fieldId = (field) => (field.isAttribute ? `@${field.key}` : field.key)

const fields = computed(() =>
  data.value
    ? [
        ...editableBasics.map((key) => ({ id: key, key, isAttribute: false, meta: {} })),
        ...data.value.attributes.map((attribute) => ({
          id: fieldId({ key: attribute.name, isAttribute: true }),
          key: attribute.name,
          isAttribute: true,
          meta: attribute,
        })),
      ]
    : [],
)
const basicFields = computed(() => fields.value.filter((field) => !field.isAttribute))
const attributeFields = computed(() => fields.value.filter((field) => field.isAttribute))

const origin = computed(
  () =>
    data.value && {
      ...Object.fromEntries(editableBasics.map((key) => [key, data.value.basics[key] ?? ''])),
      ...Object.fromEntries(data.value.attributes.map((attribute) => [`@${attribute.name}`, attribute.value])),
    },
)
const values = ref({})
const formRef = ref(null)

const focusField = () => {
  const focus = props.target.focus
  const id = focus ? fieldId(focus) : fields.value[0]?.id
  if (id) formRef.value?.querySelector(`[data-key="${CSS.escape(id)}"]`)?.focus()
}

watch(origin, async (value) => {
  if (!value) return
  const staged = Object.fromEntries(props.target.staged.map((field) => [fieldId(field), field.value]))
  values.value = { ...value, ...pick(staged, Object.keys(value)) }
  await nextTick()
  focusField()
})

const isChanged = (field) => values.value[field.id] !== origin.value[field.id]
const isRename = (field) => !field.isAttribute && renameKeys.includes(field.key)

const changedFields = computed(() => {
  if (!origin.value) return []
  const isRenamed = fields.value.some((field) => isRename(field) && isChanged(field))
  return fields.value
    .filter((field) => isChanged(field) || (isRenamed && isRename(field)))
    .map(({ id, key, isAttribute }) => ({ key, isAttribute, value: values.value[id] ?? '', oldValue: origin.value[id] }))
})

const invalid = computed(() =>
  !isConnection && origin.value && !String(values.value.name ?? '').trim() ? 'Name은 비워 둘 수 없습니다.' : '',
)

const { statements, error: previewError } = useChangePreview(() =>
  changedFields.value.length
    ? [{ kind: 'modify', target: props.target.target, id: props.target.id, fields: changedFields.value }]
    : [],
)

const canSubmit = computed(() => !invalid.value && !previewError.value && (changedFields.value.length > 0 || isStaged))
const submitLabel = computed(() => {
  if (!isStaged) return '바구니에 담기'
  return changedFields.value.length ? '바구니 항목 고치기' : '바구니에서 빼기'
})

const handleSubmit = () => {
  if (canSubmit.value) emit('submit', { fields: changedFields.value })
}

const labelClass = 'text-gray-500 dark:text-[#5c6370] break-all'
const changedClass = 'font-semibold text-amber-600! dark:text-amber-400!'
const codeClass =
  'm-0 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-all text-gray-800 dark:text-[#98c379]'
</script>

<template>
  <BaseDialog :title="`편집 · ${props.target.title}`" width-class="w-[40rem]" @close="emit('close')">
    <div v-if="isLoading" class="flex items-center justify-center gap-2 p-6 text-gray-400">
      <Loader2 :size="14" class="animate-spin" />
      불러오는 중...
    </div>
    <div v-else-if="error" class="p-4 text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
    <form v-else-if="data" ref="formRef" class="flex-1 min-h-0 flex flex-col" @submit.prevent="handleSubmit">
      <div class="flex-1 min-h-0 overflow-auto p-4 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
        <template v-for="row in readonlyRows" :key="row.label">
          <span :class="labelClass">{{ row.label }}</span>
          <span class="break-all text-gray-500">{{ row.value || '-' }}</span>
        </template>
        <template v-for="field in basicFields" :key="field.id">
          <span :class="[labelClass, isChanged(field) && changedClass]">{{ field.key }}</span>
          <AttributeField v-model="values[field.id]" :meta="field.meta" :data-key="field.id" />
        </template>
        <div v-if="attributeFields.length" class="col-span-2 pt-1 font-semibold text-gray-500 dark:text-[#5c6370]">
          속성 ({{ attributeFields.length }})
        </div>
        <div v-else-if="isConnection" class="col-span-2 text-gray-400 italic">이 관계에는 속성이 없습니다.</div>
        <template v-for="field in attributeFields" :key="field.id">
          <span :class="[labelClass, isChanged(field) && changedClass]" :title="field.meta.type">{{ field.key }}</span>
          <AttributeField v-model="values[field.id]" :meta="field.meta" :data-key="field.id" />
        </template>
      </div>
      <div class="px-4 py-3 border-t border-gray-200 dark:border-[#3e4451] flex flex-col gap-2 shrink-0">
        <pre v-if="statements.length" :class="codeClass">{{ statements.join('\n') }}</pre>
        <div v-else-if="!previewError" class="text-gray-400">바뀐 값이 없습니다.</div>
        <div v-if="invalid || previewError" class="text-red-500 whitespace-pre-wrap break-all">
          {{ invalid || previewError }}
        </div>
        <div class="flex items-center justify-end gap-2">
          <span class="flex-1 text-gray-400">바뀐 항목 {{ changedFields.length }}개</span>
          <button
            type="button"
            class="h-7 px-3 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-xs cursor-pointer"
            @click="emit('close')"
          >
            취소
          </button>
          <button
            type="submit"
            :disabled="!canSubmit"
            class="h-7 px-3 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {{ submitLabel }}
          </button>
        </div>
      </div>
    </form>
  </BaseDialog>
</template>
