<script setup>
import { OBJECT_ID_PATTERN, splitByPattern, toneParts } from '../console/mqlResult.js'

const props = defineProps({
  text: { type: String, default: '' },
  findRegex: { type: RegExp, default: null },
  tones: { type: Boolean, default: false },
})
const emit = defineEmits(['objectId'])

const toneClasses = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  key: 'text-violet-600 dark:text-[#c678dd]',
}

const pieces = computed(() =>
  (props.tones && !props.findRegex ? toneParts(props.text) : [{ text: props.text, tone: '' }]).flatMap((segment) =>
    splitByPattern(segment.text, OBJECT_ID_PATTERN).flatMap((part) =>
      splitByPattern(part.text, props.findRegex).map((piece) => ({
        text: piece.text,
        tone: segment.tone,
        isMatch: piece.hit,
        objectId: part.hit ? part.text : '',
      })),
    ),
  ),
)

const handleClick = (e, piece) => {
  if (piece.objectId) emit('objectId', e, piece.objectId)
}
</script>

<template>
  <span
    v-for="(piece, index) in pieces"
    :key="index"
    :class="[
      piece.objectId
        ? 'text-[#4b8bca] dark:text-[#61afef] underline decoration-dotted cursor-pointer hover:decoration-solid'
        : toneClasses[piece.tone],
      piece.isMatch && 'rounded-sm bg-yellow-200 dark:bg-yellow-500/40 data-current:bg-orange-300 dark:data-current:bg-orange-500/70',
    ]"
    :title="piece.objectId ? 'Object ID 메뉴 열기' : undefined"
    :data-find-hit="piece.isMatch ? '' : undefined"
    @click="handleClick($event, piece)"
    >{{ piece.text }}</span
  >
</template>
