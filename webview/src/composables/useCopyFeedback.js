export function useCopyFeedback() {
  const { copy: copyText, copied } = useClipboard({ legacy: true })
  const copiedKey = shallowRef(null)

  const copy = (text, key = null) => {
    copiedKey.value = key
    return copyText(text)
  }

  const isCopied = (key) => copied.value && copiedKey.value === key

  return { copy, isCopied }
}
