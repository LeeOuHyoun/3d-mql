<script setup>
const props = defineProps({
  tooltip: { type: Object, required: true },
})

const rows = computed(() => {
  const d = props.tooltip.data
  return [
    ['Type', d.type],
    ['State', d.current],
    ['ID', d.originalId || d.id],
  ].filter(([, value]) => value)
})
</script>

<template>
  <div
    class="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full -mt-2 font-sans text-xs px-3 py-2 rounded-lg border min-w-40 max-w-72 shadow-xl bg-white dark:bg-[#282c34] text-[#2c3e50] dark:text-[#abb2bf] border-gray-200 dark:border-[#3e4451]"
    :style="{ left: `${props.tooltip.x}px`, top: `${props.tooltip.y}px` }"
  >
    <div class="font-bold text-[13px] mb-1.5 break-all text-[#4b8bca] dark:text-[#61afef]">
      {{ (props.tooltip.data.label || '').replace(/\n/g, ' ') }}
    </div>
    <div v-if="props.tooltip.data.isCluster" class="text-gray-400 dark:text-[#5c6370]">
      Cluster · {{ props.tooltip.data.clusterCount || 0 }} items
    </div>
    <template v-else>
      <div v-for="[key, value] in rows" :key="key" class="flex gap-2 mt-0.5">
        <span class="shrink-0 w-9 text-gray-400 dark:text-[#5c6370]">{{ key }}</span>
        <span class="break-all" :class="key === 'ID' && 'font-mono'">{{ value }}</span>
      </div>
      <div v-if="props.tooltip.data.isRoot" class="mt-2 text-[#e06c75] font-semibold">★ Root Node</div>
    </template>
  </div>
</template>
