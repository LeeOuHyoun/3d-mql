<script setup>
import { BOX_RESIZE_HANDLES } from '../composables/useBoxResize.js'

const emit = defineEmits(['start', 'reset'])

const handlePointerDown = (e, dir) => {
  e.stopPropagation()
  if (e.button === 0) e.currentTarget.setPointerCapture(e.pointerId)
  emit('start', e, dir)
}

const handleDblClick = (e) => {
  e.stopPropagation()
  e.preventDefault()
  emit('reset')
}

const placements = {
  n: 'top-0 left-2 right-2 h-[5px]',
  s: 'bottom-0 left-2 right-2 h-[5px]',
  e: 'top-2 right-0 bottom-2 w-[5px]',
  w: 'top-2 left-0 bottom-2 w-[5px]',
  ne: 'top-0 right-0 size-2.5 z-31',
  nw: 'top-0 left-0 size-2.5 z-31',
  se: 'bottom-0 right-0 size-2.5 z-31',
  sw: 'bottom-0 left-0 size-2.5 z-31',
}
</script>

<template>
  <div
    v-for="handle in BOX_RESIZE_HANDLES"
    :key="handle.dir"
    class="absolute z-30 touch-none"
    :class="placements[handle.dir]"
    :style="{ cursor: handle.cursor }"
    title="끌어서 크기 조정 · 더블클릭: 기본 크기"
    @pointerdown="handlePointerDown($event, handle.dir)"
    @dblclick="handleDblClick"
  ></div>
</template>
