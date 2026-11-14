const vscode = acquireVsCodeApi()
const waiters = new Map()
const listeners = new Set()
const cache = new Map()
let seq = 0

window.addEventListener('message', ({ data }) => {
  if (data?.type === 'chunk') {
    waiters.get(data.id)?.onChunk?.(data.text)
    return
  }
  if (data?.type !== 'response') {
    listeners.forEach((listener) => listener(data))
    return
  }
  const waiter = waiters.get(data.id)
  if (!waiter) return
  waiters.delete(data.id)
  if (data.error) waiter.reject(new Error(data.error))
  else waiter.resolve(data.result)
})

export const post = (message) => vscode.postMessage(message)

export const getState = () => vscode.getState()

export const setState = (state) => vscode.setState(state)

export const request = (method, params = {}, onChunk) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    waiters.set(id, { resolve, reject, onChunk })
    post({ type: 'request', id, method, params })
  })

export const cachedRequest = (method, params = {}) => {
  const key = `${method}:${JSON.stringify(params)}`
  if (!cache.has(key)) {
    cache.set(
      key,
      request(method, params).catch((e) => {
        cache.delete(key)
        throw e
      }),
    )
  }
  return cache.get(key)
}

export const clearRequestCache = (isTarget = () => true) => {
  for (const key of [...cache.keys()]) if (isTarget(key.slice(0, key.indexOf(':')))) cache.delete(key)
}

export const onMessage = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
