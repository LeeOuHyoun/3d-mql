<script setup>
import { uniq } from 'lodash-es'

const props = defineProps({
  meta: { type: Object, default: () => ({}) },
  optional: { type: Boolean, default: false },
})
const value = defineModel({ type: String, default: '' })

const dataType = computed(() => props.meta.type ?? '')
const fallback = computed(() => props.meta.default ?? '')

const choices = computed(() => {
  const ranges = props.meta.ranges ?? []
  const list = ranges.length ? ranges : /^boolean$/i.test(dataType.value) ? ['TRUE', 'FALSE'] : []
  return list.length ? uniq([...list, value.value].filter(Boolean)) : null
})

const isMultiline = value.value.includes('\n')
const placeholder = computed(() => fallback.value || (/^(date|timestamp)$/i.test(dataType.value) ? 'MM/DD/YYYY' : ''))
const inputMode = computed(() => (/^(integer|real)$/i.test(dataType.value) ? 'decimal' : undefined))
const emptyLabel = computed(() => {
  if (!props.optional) return '(빈 값)'
  return fallback.value ? `(기본: ${fallback.value})` : '(기본)'
})

const inputClass =
  'w-full min-w-0 h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]'
</script>

<template>
  <select v-if="choices" v-model="value" :class="inputClass">
    <option v-if="props.optional || !value" value="">{{ emptyLabel }}</option>
    <option v-for="choice in choices" :key="choice" :value="choice">{{ choice }}</option>
  </select>
  <textarea
    v-else-if="isMultiline"
    v-model="value"
    rows="3"
    spellcheck="false"
    :class="[inputClass, 'h-auto py-1 resize-y']"
  ></textarea>
  <input
    v-else
    v-model="value"
    :class="inputClass"
    :placeholder="placeholder"
    :inputmode="inputMode"
    spellcheck="false"
    autocomplete="off"
  />
</template>
