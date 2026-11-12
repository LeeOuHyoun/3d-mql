<script setup>
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  label: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'close'])

const options = useStorage(
  '3d-mql-expand-options',
  {
    direction: 'from',
    relType: '*',
    busType: '*',
    recurse: 1,
    recurseMode: 'level',
    limit: 0,
    busWhere: '',
    relWhere: '',
  },
  localStorage,
  { mergeDefaults: true },
)

const directions = [
  { value: 'from', label: 'Expand (From)' },
  { value: 'to', label: 'Where Used (To)' },
  { value: 'both', label: 'Both' },
]

const recurseModes = [
  { value: 'level', label: '단계 지정' },
  { value: 'all', label: '끝까지 (all)' },
  { value: 'end', label: '말단만 (end)' },
]

const handleSubmit = () => {
  const { recurseMode, recurse, ...rest } = options.value
  emit('submit', { ...rest, recurse: recurseMode === 'level' ? recurse : recurseMode })
}

const inputClass =
  'w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]'
const labelClass = 'flex flex-col gap-1 font-semibold text-gray-500 dark:text-[#5c6370]'
</script>

<template>
  <BaseDialog title="Expand 옵션" @close="emit('close')">
    <form class="p-4 flex flex-col gap-3" @submit.prevent="handleSubmit">
      <div class="text-gray-500 break-all">{{ props.label }}</div>
      <div class="flex gap-1">
        <button
          v-for="item in directions"
          :key="item.value"
          type="button"
          class="flex-1 h-7 rounded-md border text-xs font-semibold cursor-pointer transition-colors"
          :class="
            options.direction === item.value
              ? 'border-[#61afef] bg-[#61afef]/15 text-[#4b8bca] dark:text-[#61afef]'
              : 'border-gray-200 dark:border-[#3e4451] bg-transparent text-gray-500'
          "
          @click="options.direction = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <label :class="labelClass">
        Relationship 패턴
        <input v-model="options.relType" :class="inputClass" spellcheck="false" placeholder="*" />
      </label>
      <label :class="labelClass">
        Type 패턴
        <input v-model="options.busType" :class="inputClass" spellcheck="false" placeholder="*" />
      </label>
      <label :class="labelClass">
        객체 Where 조건
        <input v-model="options.busWhere" :class="inputClass" spellcheck="false" placeholder="current=='Released'" />
      </label>
      <label :class="labelClass">
        관계 Where 조건
        <input v-model="options.relWhere" :class="inputClass" spellcheck="false" placeholder="attribute[Quantity]>1" />
      </label>
      <div class="flex gap-3">
        <label :class="[labelClass, 'flex-1']">
          Recurse
          <select v-model="options.recurseMode" :class="inputClass">
            <option v-for="mode in recurseModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
          </select>
        </label>
        <label v-if="options.recurseMode === 'level'" :class="[labelClass, 'flex-1']">
          단계
          <input v-model.number="options.recurse" type="number" min="1" max="10" :class="inputClass" />
        </label>
        <label :class="[labelClass, 'flex-1']">
          Limit (0 = 설정값)
          <input v-model.number="options.limit" type="number" min="0" :class="inputClass" />
        </label>
      </div>
      <div class="text-gray-400">
        방향별로 Limit 건까지만 가져옵니다. 넘는 연결은 객체 ID로 검색해 기준 객체로 열어 보세요.
      </div>
      <div v-if="options.recurseMode === 'end'" class="text-gray-400">
        말단 객체만 조회하고, 기준 객체와는 점선(가상 연결)으로 잇습니다.
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="h-7 px-3 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-xs cursor-pointer"
          @click="emit('close')"
        >
          취소
        </button>
        <button
          type="submit"
          class="h-7 px-3 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer"
        >
          확장
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
