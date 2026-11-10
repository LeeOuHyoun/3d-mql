<script setup>
import { Loader2 } from '@lucide/vue'
import { cachedRequest } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'

const props = defineProps({
  name: { type: String, required: true },
})

const {
  data: definition,
  error,
  isLoading,
} = useLoader(
  () => props.name,
  () => cachedRequest('relationship', { id: props.name }),
)

const sides = ['from', 'to']
const rows = [
  { key: 'type', label: 'type' },
  { key: 'relationship', label: 'relationship' },
  { key: 'cardinality', label: 'cardinality' },
  { key: 'revision', label: 'revision (Revise 시)' },
  { key: 'clone', label: 'clone (Clone 시)' },
]
const isParsed = computed(() => sides.some((side) => Object.keys(definition.value?.[side] ?? {}).length))
const visibleRows = computed(() => rows.filter((row) => sides.some((side) => definition.value[side][row.key])))

const cellClass = 'px-2 py-1.5 align-top break-all border-b border-gray-100 dark:border-[#3e4451]/60'
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center gap-2 p-4 text-xs text-gray-400">
    <Loader2 :size="14" class="animate-spin" />
    관계 정의를 조회하는 중...
  </div>
  <div v-else-if="error" class="p-4 text-xs text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
  <div v-else-if="definition" class="text-xs">
    <template v-if="isParsed">
      <table class="w-full border-collapse table-fixed">
        <thead class="text-left text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]">
          <tr>
            <th class="w-28 px-2 py-1.5"></th>
            <th v-for="side in sides" :key="side" class="px-2 py-1.5 font-bold">{{ side }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.key">
            <td :class="[cellClass, 'text-gray-500 dark:text-[#5c6370]']">{{ row.label }}</td>
            <td v-for="side in sides" :key="side" :class="[cellClass, 'text-gray-800 dark:text-[#abb2bf]']">
              {{ definition[side][row.key] || '-' }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="px-4 py-2 text-gray-500">
        중복 연결: {{ definition.preventDuplicates ? '막음 (preventduplicates)' : '허용' }}
      </div>
    </template>
    <div v-else class="px-4 py-2 text-gray-400">정의에서 from/to 규칙을 읽지 못했습니다. 원문을 확인하세요.</div>
    <details :open="!isParsed" class="px-4 py-2">
      <summary class="cursor-pointer text-gray-500">정의 원문</summary>
      <pre class="m-0 mt-1 font-mono text-[11px] whitespace-pre-wrap break-all text-gray-700 dark:text-[#abb2bf]">{{
        definition.text
      }}</pre>
    </details>
  </div>
</template>
