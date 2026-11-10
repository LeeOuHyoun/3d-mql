<script setup>
import { Check, X, CircleArrowUp, CircleArrowDown, Loader2 } from '@lucide/vue'
import { request } from '@/api.js'

const props = defineProps({
  id: { type: String, required: true },
  extra: { type: Object, required: true },
})
const emit = defineEmits(['change'])

const signActions = ['approve', 'reject', 'ignore', 'unsign']

const user = ref('')
const userAccess = shallowRef(null)
const isChecking = ref(false)

const checkAccess = async () => {
  const name = user.value.trim()
  if (!name) return
  isChecking.value = true
  try {
    userAccess.value = { user: name, access: await request('access', { id: props.id, user: name }), error: '' }
  } catch (e) {
    userAccess.value = { user: name, access: [], error: e.message }
  } finally {
    isChecking.value = false
  }
}

watch(
  () => props.id,
  () => {
    userAccess.value = null
  },
)

const sectionClass =
  'px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]'
const actionBtnClass =
  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-gray-700 dark:text-[#abb2bf] cursor-pointer hover:border-[#61afef] hover:text-[#61afef]'
const linkBtnClass = 'px-1 border-none bg-transparent text-[11px] text-[#61afef] hover:underline cursor-pointer'
const chipClass = 'px-1.5 rounded bg-gray-100 dark:bg-white/10 text-[11px] text-gray-600 dark:text-[#abb2bf]'
</script>

<template>
  <div>
    <div class="px-4 py-2 flex gap-2 border-b border-gray-200 dark:border-[#3e4451]">
      <button :class="actionBtnClass" title="변경 바구니에 담습니다." @click="emit('change', { kind: 'promote' })">
        <CircleArrowUp :size="14" />
        Promote 문장
      </button>
      <button :class="actionBtnClass" title="변경 바구니에 담습니다." @click="emit('change', { kind: 'demote' })">
        <CircleArrowDown :size="14" />
        Demote 문장
      </button>
    </div>
    <div
      v-for="(state, index) in props.extra.states"
      :key="state.name"
      class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60 text-xs"
      :class="state.name === props.extra.current && 'bg-emerald-50 dark:bg-emerald-900/20'"
    >
      <div class="flex items-center gap-2">
        <span class="w-5 text-right text-gray-400">{{ index + 1 }}</span>
        <span
          class="flex-1"
          :class="
            state.name === props.extra.current
              ? 'font-bold text-emerald-700 dark:text-emerald-300'
              : 'text-gray-800 dark:text-[#abb2bf]'
          "
        >
          {{ state.name }}
        </span>
        <span class="text-[11px] text-gray-400">{{ state.actual }}</span>
        <span
          v-if="state.name === props.extra.current"
          class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
        >
          CURRENT
        </span>
      </div>
      <div v-for="signature in state.signatures" :key="signature.name" class="mt-1 ml-7 flex items-center gap-1.5">
        <Check v-if="signature.satisfied" :size="12" class="shrink-0 text-emerald-500" />
        <X v-else :size="12" class="shrink-0 text-gray-400" />
        <span class="flex-1 min-w-0 break-all text-gray-600 dark:text-[#abb2bf]">{{ signature.name }}</span>
        <template v-if="state.name === props.extra.current">
          <button
            v-for="kind in signActions"
            :key="kind"
            :class="linkBtnClass"
            :title="`${kind} 문장을 변경 바구니에 담습니다.`"
            @click="emit('change', { kind, signature: signature.name })"
          >
            {{ kind }}
          </button>
        </template>
      </div>
    </div>
    <div :class="sectionClass">Access</div>
    <div class="px-4 py-2 flex flex-col gap-2 text-xs">
      <div class="flex flex-wrap items-center gap-1">
        <span class="text-gray-500">접속 사용자</span>
        <span v-for="access in props.extra.access" :key="access" :class="chipClass">{{ access }}</span>
        <span v-if="!props.extra.access.length" class="text-gray-400 italic">조회하지 못했습니다.</span>
      </div>
      <form class="flex gap-1.5" @submit.prevent="checkAccess">
        <input
          v-model="user"
          placeholder="다른 사용자의 access 확인"
          spellcheck="false"
          class="flex-1 min-w-0 h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
        <button
          type="submit"
          :disabled="isChecking"
          class="h-7 px-2.5 flex items-center gap-1 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          <Loader2 v-if="isChecking" :size="12" class="animate-spin" />
          확인
        </button>
      </form>
      <div v-if="userAccess?.error" class="text-red-500 whitespace-pre-wrap break-all">{{ userAccess.error }}</div>
      <div v-else-if="userAccess" class="flex flex-wrap items-center gap-1">
        <span class="text-gray-500">{{ userAccess.user }}</span>
        <span v-for="access in userAccess.access" :key="access" :class="chipClass">{{ access }}</span>
        <span v-if="!userAccess.access.length" class="text-gray-400 italic">access가 없습니다.</span>
      </div>
      <div
        v-for="warning in props.extra.warnings"
        :key="warning"
        class="text-[11px] text-amber-600 dark:text-amber-400 whitespace-pre-wrap break-all"
      >
        조회 실패 · {{ warning }}
      </div>
    </div>
  </div>
</template>
