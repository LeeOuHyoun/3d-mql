<script setup>
import { Loader2, Waypoints } from '@lucide/vue'
import { cachedRequest } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'

const props = defineProps({
  id: { type: String, required: true },
})
const emit = defineEmits(['attach'])

const {
  data: links,
  error,
  isLoading,
} = useLoader(
  () => props.id,
  () => cachedRequest('connectionLinks', { id: props.id }),
)

const ends = computed(() =>
  [
    { side: 'from', id: links.value.fromRel },
    { side: 'to', id: links.value.toRel },
  ].filter((end) => end.id),
)

const endOf = (link, side) => (link[`${side}Rel`] ? `connection ${link[`${side}Rel`]}` : link[side])

const sectionClass =
  'px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]'
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center gap-2 p-4 text-xs text-gray-400">
    <Loader2 :size="14" class="animate-spin" />
    연결된 connection을 조회하는 중...
  </div>
  <div v-else-if="error" class="p-4 text-xs text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
  <div v-else-if="links" class="text-xs">
    <div
      v-for="warning in links.warnings"
      :key="warning"
      class="px-4 py-1.5 text-[11px] text-amber-600 dark:text-amber-400 whitespace-pre-wrap break-all"
    >
      조회 실패 · {{ warning }}
    </div>
    <div :class="sectionClass">끝점이 connection인 경우</div>
    <div v-if="!ends.length" class="px-4 py-2 text-gray-400 italic">양쪽 끝점이 모두 객체입니다.</div>
    <div v-for="end in ends" :key="end.side" class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60">
      <span class="text-gray-500">{{ end.side }}</span>
      <span class="ml-2 font-mono text-[11px]">connection {{ end.id }}</span>
    </div>
    <div :class="sectionClass">이 연결에 붙은 연결 ({{ links.attached.length }})</div>
    <div v-if="!links.attached.length" class="px-4 py-2 text-gray-400 italic">붙은 연결이 없습니다.</div>
    <div
      v-for="link in links.attached"
      :key="link.id"
      class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60 flex flex-col gap-0.5"
    >
      <span class="font-semibold text-gray-800 dark:text-[#abb2bf] break-all">{{ link.label }}</span>
      <span class="font-mono text-[11px] text-gray-400 break-all">{{ link.id }}</span>
      <span class="font-mono text-[11px] text-gray-500 break-all">
        {{ endOf(link, 'from') }} → {{ endOf(link, 'to') }}
      </span>
    </div>
    <div v-if="links.attached.length" class="px-4 py-2">
      <button
        class="w-full flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/40"
        @click="emit('attach')"
      >
        <Waypoints :size="14" />
        그래프에 표시
      </button>
    </div>
  </div>
</template>
