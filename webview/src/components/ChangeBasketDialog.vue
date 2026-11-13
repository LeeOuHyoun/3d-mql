<script setup>
import { Check, X, Minus, Zap, Trash2, Play, FlaskConical, FileText, Undo2, History } from '@lucide/vue'
import { cachedRequest } from '@/api.js'
import BaseDialog from './BaseDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  basket: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const {
  changes,
  history,
  pendingChanges,
  isApplying,
  transaction,
  removeChange,
  clearChanges,
  clearHistory,
  applyChanges,
  previewChanges,
  exportScript,
  exportRollback,
} = props.basket

const isBusy = computed(() => isApplying.value || !!transaction.value)
const canApply = computed(() => pendingChanges.value.length > 0 && !isBusy.value)

const pendingDeletes = computed(() => pendingChanges.value.filter((change) => change.kind === 'delete'))
const confirmAction = shallowRef(null)

const runWithConfirm = (action) => {
  if (pendingDeletes.value.length) confirmAction.value = action
  else action()
}

const handleConfirm = () => {
  const action = confirmAction.value
  confirmAction.value = null
  action()
}

const statusIcons = {
  done: { icon: Check, class: 'text-emerald-500' },
  failed: { icon: X, class: 'text-red-500' },
}
const statusOf = (change) => statusIcons[change.status] ?? { icon: Minus, class: 'text-gray-400' }

const recentHistory = computed(() => [...history.value].reverse())
const timeOf = (at) => (at ? new Date(at).toLocaleString('sv') : '')

const hints = reactive({})

const describeEvent = (event) =>
  event.steps.length
    ? event.steps.map(
        (step) =>
          `${event.event} #${step.sequence} ${step.program}.${step.method}${step.current === 'Active' ? '' : ` (${step.current})`}`,
      )
    : [`${event.event} ${event.program}(${event.input})`]

const toggleHint = async (change) => {
  if (hints[change.key]) {
    delete hints[change.key]
    return
  }
  const { source, prefix, state } = change.trigger
  hints[change.key] = { text: '트리거를 확인하는 중...' }
  try {
    const events = await cachedRequest('triggers', source)
    const prefixes = [prefix].flat()
    const lines = events
      .filter(
        (event) =>
          prefixes.some((item) => event.event.startsWith(item)) && (!event.state || !state || event.state === state),
      )
      .flatMap(describeEvent)
    hints[change.key] = { text: lines.join('\n') || '이 문장에 걸린 트리거를 찾지 못했습니다.' }
  } catch (e) {
    hints[change.key] = { text: e.message }
  }
}

const actionBtnClass =
  'h-7 px-2.5 flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-xs font-semibold text-gray-700 dark:text-[#abb2bf] cursor-pointer hover:border-[#61afef] hover:text-[#61afef] disabled:opacity-40 disabled:cursor-default disabled:hover:border-gray-200 disabled:hover:text-gray-700'
const iconBtnClass =
  'p-1 flex shrink-0 self-start border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] cursor-pointer disabled:opacity-40 disabled:cursor-default'
const codeClass = 'm-0 font-mono text-[11px] whitespace-pre-wrap break-all'
</script>

<template>
  <BaseDialog title="변경 바구니" width-class="w-[56rem]" @close="emit('close')">
    <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] flex items-center gap-2 shrink-0 flex-wrap">
      <button
        :class="actionBtnClass"
        :disabled="!canApply"
        title="한 문장씩 실행하고 첫 오류에서 멈춥니다. 다시 누르면 실패한 문장부터 이어서 실행합니다."
        @click="runWithConfirm(applyChanges)"
      >
        <Play :size="12" />
        실행 ({{ pendingChanges.length }})
      </button>
      <button
        :class="actionBtnClass"
        :disabled="!canApply"
        title="start transaction 안에서 실행한 뒤, 결과를 보고 Commit 또는 Abort 합니다."
        @click="runWithConfirm(previewChanges)"
      >
        <FlaskConical :size="12" />
        트랜잭션으로 미리보기
      </button>
      <button :class="actionBtnClass" :disabled="!changes.length" @click="exportScript">
        <FileText :size="12" />
        스크립트 내보내기
      </button>
      <button
        :class="actionBtnClass"
        :disabled="!changes.length && !history.length"
        title="실행 기록이 있으면 실행한 문장만, 없으면 바구니 전체를 역순으로 되돌립니다."
        @click="exportRollback"
      >
        <Undo2 :size="12" />
        롤백 스크립트
      </button>
      <div class="flex-1"></div>
      <button :class="actionBtnClass" :disabled="!changes.length || isBusy" @click="clearChanges">
        <Trash2 :size="12" />
        비우기
      </button>
    </div>
    <div
      v-if="transaction"
      class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 shrink-0"
    >
      트랜잭션 미리보기 중입니다. 그래프 위의 Commit 또는 Abort 버튼으로 끝내세요.
    </div>
    <div class="flex-1 min-h-0 overflow-auto">
      <div v-if="!changes.length" class="p-6 text-gray-400 italic text-center">
        바구니가 비어 있습니다. 하단 바의 새 객체 버튼이나 노드 우클릭 메뉴로 생성 · 편집 · 삭제 · 연결 문장을 만들거나, 상세
        패널에서 값 수정 · promote · 연결 해제 문장을 담을 수 있습니다.
      </div>
      <div
        v-for="change in changes"
        :key="change.key"
        class="px-4 py-2 border-b border-gray-100 dark:border-[#3e4451]/60 flex gap-2"
      >
        <component :is="statusOf(change).icon" :size="14" class="shrink-0 mt-0.5" :class="statusOf(change).class" />
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <div class="font-semibold break-all">{{ change.label }}</div>
          <pre :class="[codeClass, 'text-gray-800 dark:text-[#98c379]']">{{ change.forward }}</pre>
          <pre :class="[codeClass, 'text-gray-400']">되돌리기: {{ change.inverse || '(되돌리는 문장 없음)' }}</pre>
          <div v-if="change.note" class="text-gray-400">{{ change.note }}</div>
          <div v-if="change.error" class="text-red-500 whitespace-pre-wrap break-all">{{ change.error }}</div>
          <pre v-if="hints[change.key]" :class="[codeClass, 'text-violet-600 dark:text-violet-300']">{{
            hints[change.key].text
          }}</pre>
        </div>
        <button :class="iconBtnClass" title="이 문장이 실행할 트리거 보기" @click="toggleHint(change)">
          <Zap :size="13" />
        </button>
        <button :class="iconBtnClass" title="바구니에서 빼기" :disabled="isBusy" @click="removeChange(change.key)">
          <Trash2 :size="13" />
        </button>
      </div>
      <details v-if="history.length" class="border-t border-gray-200 dark:border-[#3e4451]">
        <summary class="px-4 py-2 flex items-center gap-2 cursor-pointer select-none text-gray-500">
          <History :size="13" />
          실행 기록 ({{ history.length }})
          <div class="flex-1"></div>
          <button :class="iconBtnClass" title="실행 기록 지우기" @click.prevent="clearHistory">
            <Trash2 :size="13" />
          </button>
        </summary>
        <div
          v-for="change in recentHistory"
          :key="change.key"
          class="px-4 py-2 border-t border-gray-100 dark:border-[#3e4451]/60 flex gap-2 text-gray-500"
        >
          <Check :size="14" class="shrink-0 mt-0.5 text-emerald-500" />
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <div class="font-semibold break-all">{{ change.label }}</div>
            <pre :class="codeClass">{{ change.forward }}</pre>
          </div>
          <span class="shrink-0 tabular-nums">{{ timeOf(change.doneAt) }}</span>
        </div>
      </details>
    </div>
    <Transition name="dialog">
      <ConfirmDialog
        v-if="confirmAction"
        title="객체 삭제 확인"
        :message="`바구니에 객체 삭제 문장 ${pendingDeletes.length}건이 있습니다. 삭제한 객체는 ID · history · 연결까지 되돌릴 수 없습니다. 계속할까요?`"
        :items="pendingDeletes.map((change) => change.label)"
        confirm-label="삭제 포함 실행"
        @confirm="handleConfirm"
        @close="confirmAction = null"
      />
    </Transition>
  </BaseDialog>
</template>
