<script setup>
const props = defineProps({
  canSubmit: { type: Boolean, default: false },
  isBusy: { type: Boolean, default: false },
  blockReason: { type: String, default: '' },
  hasImmediate: { type: Boolean, default: true },
  basketLabel: { type: String, default: '바구니에 담기' },
})
const emit = defineEmits(['basket', 'close'])

const immediateBlock = computed(
  () => props.blockReason || (props.isBusy ? '바구니를 실행하는 동안에는 바로 실행할 수 없습니다.' : ''),
)

const buttonClass = 'h-7 px-3 rounded-md text-xs cursor-pointer disabled:opacity-50 disabled:cursor-default'
const outlineClass = 'border border-gray-200 dark:border-[#3e4451] bg-transparent'
const primaryClass = 'border-none bg-[#61afef] hover:bg-[#4b8bca] text-white font-semibold'
</script>

<template>
  <button type="button" :class="[buttonClass, outlineClass]" @click="emit('close')">취소</button>
  <button
    v-if="props.hasImmediate"
    type="button"
    :disabled="!props.canSubmit"
    title="실행하지 않고 변경 바구니에 담습니다. 여러 건을 트랜잭션으로 묶어 실행할 때 씁니다."
    :class="[buttonClass, outlineClass, 'font-semibold']"
    @click="emit('basket')"
  >
    {{ props.basketLabel }}
  </button>
  <button
    v-if="props.hasImmediate"
    type="submit"
    :disabled="!props.canSubmit || !!immediateBlock"
    :title="immediateBlock || '바구니에 담지 않고 곧바로 실행합니다.'"
    :class="[buttonClass, primaryClass]"
  >
    바로 실행
  </button>
  <button v-else type="submit" :disabled="!props.canSubmit" :class="[buttonClass, primaryClass]">
    {{ props.basketLabel }}
  </button>
</template>
