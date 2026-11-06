const vscode = acquireVsCodeApi()
const waiters = new Map()
const listeners = new Set()
let seq = 0

window.addEventListener('message', ({ data }) => {
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

export const request = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    waiters.set(id, { resolve, reject })
    post({ type: 'request', id, method, params })
  })

export const onMessage = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
