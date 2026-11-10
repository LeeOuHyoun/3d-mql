<script setup>
import { Loader2 } from '@lucide/vue'
import { request } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  item: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const {
  data: trace,
  error,
  isLoading,
} = useLoader(
  () => props.item.id,
  () => request('trace', { id: props.item.id, type: props.item.type }),
)

const preview = shallowRef(null)
const previewError = ref('')
const isPreviewLoading = ref(false)
const isRawShown = ref(false)

watch(trace, (value) => {
  preview.value = value?.preview ?? null
})

const loadPreview = async (kind, name) => {
  isPreviewLoading.value = true
  previewError.value = ''
  try {
    preview.value = await request('preview', { id: props.item.id, kind, name })
  } catch (e) {
    previewError.value = e.message
  } finally {
    isPreviewLoading.value = false
  }
}

const targetsOf = (entry) => ['form', 'table'].filter((kind) => entry[kind]).map((kind) => ({ kind, name: entry[kind] }))

const sectionClass =
  'sticky top-0 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]'
const cellClass = 'px-3 py-1.5 align-top break-all'
const chipClass =
  'mr-1 px-1.5 rounded border-none bg-[#61afef]/15 text-[#4b8bca] dark:text-[#61afef] font-semibold cursor-pointer hover:bg-[#61afef]/30'
</script>

<template>
  <BaseDialog
    :title="`웹 화면 추적 · ${props.item.name} ${props.item.revision}`"
    width-class="w-[60rem]"
    @close="emit('close')"
  >
    <div v-if="isLoading" class="flex items-center justify-center gap-2 p-6 text-gray-400">
      <Loader2 :size="14" class="animate-spin" />
      메뉴와 폼 정의를 따라가는 중...
    </div>
    <div v-else-if="error" class="p-4 text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
    <template v-else-if="trace">
      <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] flex flex-col gap-1 shrink-0">
        <div>
          <span class="text-gray-400">Type 상속</span>
          {{ trace.chain.join(' → ') }}
        </div>
        <div v-if="trace.menu">
          <span class="text-gray-400">Tree 메뉴</span>
          <span class="font-semibold"> {{ trace.menu.name }}</span>
          <button
            v-for="target in targetsOf(trace.menu)"
            :key="target.kind"
            :class="[chipClass, 'ml-2']"
            @click="loadPreview(target.kind, target.name)"
          >
            {{ target.kind }}: {{ target.name }}
          </button>
        </div>
        <div v-else class="text-amber-600 dark:text-amber-400">
          이 type과 상위 type의 심볼릭 이름으로 된 Tree 메뉴(type_…)를 찾지 못했습니다.
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-auto">
        <template v-if="trace.menu">
          <div :class="sectionClass">메뉴 항목 ({{ trace.menu.children.length }})</div>
          <table class="w-full border-collapse table-fixed">
            <tbody>
              <tr
                v-for="child in trace.menu.children"
                :key="`${child.kind}-${child.name}`"
                class="border-b border-gray-100 dark:border-[#3e4451]/60"
              >
                <td :class="[cellClass, 'w-20 text-gray-400']">{{ child.kind }}</td>
                <td :class="[cellClass, 'w-56 font-semibold']">{{ child.name }}</td>
                <td :class="[cellClass, 'w-56 text-gray-500']">{{ child.label || '-' }}</td>
                <td :class="cellClass">
                  <button
                    v-for="target in targetsOf(child)"
                    :key="target.kind"
                    :class="chipClass"
                    @click="loadPreview(target.kind, target.name)"
                  >
                    {{ target.kind }}: {{ target.name }}
                  </button>
                  <span v-if="child.program" class="text-gray-500">program: {{ child.program }}</span>
                  <span v-if="!targetsOf(child).length && !child.program" class="text-gray-400">{{ child.href || '-' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
        <div :class="[sectionClass, 'flex items-center gap-2']">
          <span class="flex-1 normal-case">
            {{ preview ? `${preview.kind} ${preview.name} · 이 객체로 평가한 값` : '미리보기' }}
          </span>
          <Loader2 v-if="isPreviewLoading" :size="12" class="animate-spin" />
          <label v-if="preview" class="flex items-center gap-1 normal-case font-normal cursor-pointer">
            <input v-model="isRawShown" type="checkbox" class="accent-[#61afef]" />
            정의 원문
          </label>
        </div>
        <div v-if="previewError" class="p-4 text-red-500 whitespace-pre-wrap break-all">{{ previewError }}</div>
        <div v-else-if="!preview" class="p-4 text-gray-400 italic text-center">
          위의 form · table 표시를 누르면 그 정의의 필드를 이 객체로 평가해 보여 줍니다.
        </div>
        <pre v-else-if="isRawShown || !preview.fields.length" class="m-0 p-4 font-mono text-[11px] whitespace-pre-wrap break-all">{{
          preview.text
        }}</pre>
        <table v-else class="w-full border-collapse table-fixed">
          <thead class="text-left text-gray-500 dark:text-[#5c6370]">
            <tr>
              <th :class="[cellClass, 'w-44']">Field</th>
              <th :class="[cellClass, 'w-64']">Expression</th>
              <th :class="cellClass">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(field, index) in preview.fields"
              :key="index"
              class="border-b border-gray-100 dark:border-[#3e4451]/60"
              :title="field.settings"
            >
              <td :class="cellClass">
                <div class="font-semibold">{{ field.name || '-' }}</div>
                <div class="text-[11px] text-gray-400">{{ field.label }}</div>
              </td>
              <td :class="[cellClass, 'font-mono text-[11px] text-gray-500']">
                {{ field.expression || '(프로그램 · 기타 필드)' }}
              </td>
              <td :class="[cellClass, 'whitespace-pre-wrap']">{{ field.value || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BaseDialog>
</template>
