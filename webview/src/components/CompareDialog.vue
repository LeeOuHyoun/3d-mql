<script setup>
import { Loader2 } from '@lucide/vue'
import { union } from 'lodash-es'
import { request } from '@/api.js'
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  items: { type: Array, required: true },
})
const emit = defineEmits(['close'])

const results = ref([])
const error = ref('')
const isLoading = ref(true)
const onlyDiff = ref(true)

onMounted(async () => {
  try {
    results.value = await Promise.all(props.items.map((item) => request('object', { id: item.id })))
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
})

const sections = [
  { key: 'basics', title: 'Basic' },
  { key: 'attributes', title: 'Attributes' },
]

const rows = computed(() => {
  if (results.value.length < 2) return []
  return sections.flatMap(({ key, title }) => {
    const [left, right] = results.value.map((result) => Object.fromEntries(result[key].map((f) => [f.key, f.value])))
    return union(Object.keys(left), Object.keys(right)).map((field) => {
      const a = left[field] ?? ''
      const b = right[field] ?? ''
      return { id: `${key}-${field}`, section: title, field, a, b, isDiff: a !== b }
    })
  })
})

const diffCount = computed(() => rows.value.filter((row) => row.isDiff).length)
const visibleRows = computed(() => (onlyDiff.value ? rows.value.filter((row) => row.isDiff) : rows.value))
const headers = computed(() => props.items.map((item) => `${item.name} ${item.revision}`))
</script>

<template>
  <BaseDialog title="두 객체 비교" width-class="w-[56rem]" @close="emit('close')">
    <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] flex items-center gap-3 shrink-0">
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input v-model="onlyDiff" type="checkbox" class="accent-[#61afef]" />
        차이만 보기
      </label>
      <span class="text-gray-400">차이 {{ diffCount }}건 / 전체 {{ rows.length }}건</span>
    </div>
    <div class="flex-1 min-h-0 overflow-auto">
      <div v-if="error" class="p-4 text-red-500 whitespace-pre-wrap">{{ error }}</div>
      <div v-else-if="isLoading" class="flex items-center justify-center gap-2 p-6 text-gray-400">
        <Loader2 :size="14" class="animate-spin" />
        불러오는 중...
      </div>
      <table v-else class="w-full border-collapse table-fixed">
        <thead class="sticky top-0 bg-gray-100 dark:bg-[#2c313a] text-gray-500 dark:text-[#5c6370]">
          <tr>
            <th class="w-48 px-3 py-1.5 text-left font-bold">Key</th>
            <th v-for="header in headers" :key="header" class="px-3 py-1.5 text-left font-bold break-all">{{ header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.id"
            class="border-b border-gray-100 dark:border-[#3e4451]/60 align-top"
            :class="row.isDiff && 'bg-amber-50 dark:bg-amber-900/20'"
          >
            <td class="px-3 py-1.5 text-gray-500 dark:text-[#5c6370] break-all">
              <span class="text-[10px] text-gray-400">{{ row.section }}</span> {{ row.field }}
            </td>
            <td class="px-3 py-1.5 whitespace-pre-wrap break-all">{{ row.a || '-' }}</td>
            <td class="px-3 py-1.5 whitespace-pre-wrap break-all">{{ row.b || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseDialog>
</template>
