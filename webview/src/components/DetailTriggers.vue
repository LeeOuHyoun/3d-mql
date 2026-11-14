<script setup>
import { Loader2, Crosshair, Copy, Check, FileCode } from '@lucide/vue'
import { groupBy } from 'lodash-es'
import { cachedRequest, request } from '@/api.js'
import { useLoader } from '../composables/useLoader.js'
import { useCopyFeedback } from '../composables/useCopyFeedback.js'

const props = defineProps({
  source: { type: Object, required: true },
  current: { type: String, default: '' },
})
const emit = defineEmits(['openRoot'])

const {
  data: events,
  error,
  isLoading,
} = useLoader(
  () => JSON.stringify(props.source),
  () => cachedRequest('triggers', props.source),
)

const groups = computed(() =>
  Object.values(groupBy(events.value ?? [], (event) => [event.kind, event.name, event.state].join('|'))).map((items) => ({
    key: [items[0].kind, items[0].name, items[0].state].join('|'),
    title: [items[0].kind, items[0].name, items[0].state && `state ${items[0].state}`].filter(Boolean).join(' · '),
    isCurrent: !!items[0].state && items[0].state === props.current,
    events: items,
  })),
)

const actionError = ref('')
let isPerforming = false

const perform = async (method, params) => {
  if (isPerforming) return
  isPerforming = true
  actionError.value = ''
  try {
    return await request(method, params)
  } catch (e) {
    actionError.value = e.message
  } finally {
    isPerforming = false
  }
}

const openJpo = (step) => perform('openJpo', { program: step.program, method: step.method })

const { copy, isCopied } = useCopyFeedback()

const copyAddTrigger = async (event) => {
  const text = await perform('query', { action: 'addTrigger', targets: [event] })
  if (text) copy(text, event)
}

const sectionClass =
  'sticky top-0 px-4 py-1.5 text-[11px] font-bold tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]'
const iconBtnClass = 'p-0.5 flex shrink-0 border-none bg-transparent text-gray-400 hover:text-[#61afef] cursor-pointer'
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center gap-2 p-4 text-xs text-gray-400">
    <Loader2 :size="14" class="animate-spin" />
    트리거를 조회하는 중...
  </div>
  <div v-else-if="error" class="p-4 text-xs text-red-500 whitespace-pre-wrap break-all">{{ error }}</div>
  <div v-else class="text-xs">
    <div v-if="actionError" class="px-4 py-2 text-red-500 whitespace-pre-wrap break-all">{{ actionError }}</div>
    <div v-if="!groups.length" class="p-4 text-gray-400 italic text-center">정의에서 트리거를 찾지 못했습니다.</div>
    <div v-for="group in groups" :key="group.key">
      <div :class="[sectionClass, group.isCurrent && 'text-emerald-700! dark:text-emerald-300!']">
        {{ group.title }}{{ group.isCurrent ? ' · CURRENT' : '' }}
      </div>
      <div
        v-for="event in group.events"
        :key="`${event.event}-${event.program}-${event.input}`"
        class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60"
      >
        <div class="flex items-center gap-1.5">
          <span class="flex-1 min-w-0 break-all font-semibold text-gray-800 dark:text-[#abb2bf]">
            {{ event.event }}
            <span v-if="event.inherited" class="font-normal text-gray-400">(상속)</span>
          </span>
          <button
            v-if="event.steps.length || event.input"
            :class="iconBtnClass"
            title="기존 input을 포함한 트리거 추가 문장 복사"
            @click="copyAddTrigger(event)"
          >
            <Check v-if="isCopied(event)" :size="12" class="text-green-500" />
            <Copy v-else :size="12" />
          </button>
        </div>
        <div v-if="!event.steps.length" class="font-mono text-[11px] text-gray-500 break-all">
          {{ event.program }}({{ event.input }})
        </div>
        <div v-for="step in event.steps" :key="step.id" class="group mt-0.5 flex items-center gap-1.5">
          <span class="w-5 shrink-0 text-right text-gray-400">{{ step.sequence }}</span>
          <button
            class="flex-1 min-w-0 flex items-center gap-1 p-0 border-none bg-transparent font-mono text-[11px] text-left text-[#4b8bca] dark:text-[#61afef] cursor-pointer hover:underline"
            :class="step.current !== 'Active' && 'line-through opacity-60'"
            :title="`${step.name} · ${step.current}\nJPO 소스 열기`"
            @click="openJpo(step)"
          >
            <FileCode :size="12" class="shrink-0" />
            <span class="break-all">{{ step.program }}.{{ step.method }}</span>
          </button>
          <span v-if="step.current !== 'Active'" class="shrink-0 text-[10px] text-gray-400">{{ step.current }}</span>
          <button
            :class="[iconBtnClass, 'invisible group-hover:visible']"
            title="트리거 객체를 기준 객체로 보기"
            @click="emit('openRoot', step.id)"
          >
            <Crosshair :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
