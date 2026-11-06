// Offline self-test for the browser half. No DOM and no React: the bundle is
// loaded through a fake `window.__ModuleLoader__`, and components are driven by
// a minimal hook runtime — enough to prove the dialog closes before the Host
// answers, that purges run one at a time, and that outcomes reach the Toast.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

let passed = 0
let failed = 0
const check = (label, condition) => {
  condition ? passed++ : failed++
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
}

// --- minimal hook runtime ----------------------------------------------------

const state = []
const deps = []
let cursor = 0
let dirty = false
let effects = []

const React = {
  Fragment: 'Fragment',
  // Real React keeps an explicit `children` prop when no variadic child is
  // supplied; overriding it unconditionally would hide every text label.
  createElement: (type, props, ...children) => ({
    type,
    props: children.length === 0 ? { ...props } : { ...props, children },
  }),
  useState(initial) {
    const slot = cursor++
    if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial
    return [state[slot], (next) => ((state[slot] = next), (dirty = true))]
  },
  useEffect(fn, next) {
    const slot = cursor++
    const previous = deps[slot]
    const changed = previous === undefined || next === undefined || next.length !== previous.length || next.some((value, index) => value !== previous[index])
    if (!changed) return
    deps[slot] = next
    effects.push(fn)
  },
  useSyncExternalStore(_subscribe, get) {
    return get()
  },
}

/** Render one component until its state settles, running pending effects. */
function render(component, props) {
  for (let round = 0; round < 20; round += 1) {
    dirty = false
    cursor = 0
    effects = []
    const element = component(props)
    const pending = effects
    effects = []
    for (const effect of pending) effect()
    if (!dirty) return element
  }
  throw new Error('render did not settle')
}

/** Walk every child-bearing prop, `footer` and `description` included. */
function findAll(element, type) {
  const found = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node !== 'object') return
    if (node.type === type) found.push(node)
    for (const value of Object.values(node.props)) walk(value)
  }
  walk(element)
  return found
}

/** The first node of `type` labelled `label`. */
function find(element, type, label) {
  return findAll(element, type).find((node) => node.props.children === label)
}

// --- fake browser ------------------------------------------------------------

const primitives = { Modal: 'Modal', Button: 'Button', Toast: 'Toast', IconWarningOutlineRegular: 'IconWarningOutlineRegular' }
const localStorage = (() => {
  const entries = new Map()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
  }
})()

/** Every purge the bundle requested, in order. */
const calls = []
let answer = async (body) =>
  body.dryRun === true
    ? { status: 200, data: { ok: true, dryRun: true, subagents: 2 } }
    : { status: 200, data: { ok: true, removed: [body.sessionId], leftover: [] } }

const fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  calls.push(body)
  const reply = await answer(body)
  return { ok: reply.status === 200, status: reply.status, json: async () => reply.data }
}

let registration
const sandbox = { window: { __ModuleLoader__: { load: (value) => (registration = value) } }, fetch, localStorage, console: { warn() {}, error() {} } }
vm.createContext(sandbox)
vm.runInContext(await readFile(join(ROOT, 'lib', 'client.js'), 'utf8'), sandbox)

const bundle = registration.factory((id) => {
  if (id === 'react') return React
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected require: ${id}`)
})

// --- fake client context -----------------------------------------------------

const dictionaries = {}
let menu
const registrations = {}
const ctx = {
  effect: (fn) => fn(),
  get: () => undefined,
  locale: {
    register: (ns, dicts) => ((dictionaries[ns] = dicts), () => {}),
    bind: (ns) => (key, params) =>
      params === undefined
        ? dictionaries[ns].en[key]
        : Object.entries(params).reduce((out, [name, value]) => out.replace(`{${name}}`, String(value)), dictionaries[ns].en[key]),
  },
  inject: (_names, fn) => fn({ contextMenus: { register: (entry) => void (menu = entry) } }),
  slots: {
    inject: (_name, generator) => {
      for (const entry of generator()) registrations[entry.id] = entry
    },
    register: (options, component) => ({ id: options.id, options, component }),
  },
}

bundle.apply(ctx)

check('both overlay seats register', Object.keys(registrations).sort().join(',') === 'dsh-session-purger.confirm,dsh-session-purger.notice')
check('all eight dictionaries register', Object.keys(dictionaries['dsh-session-purger']).length === 8)

const dialogSlot = registrations['dsh-session-purger.confirm']
const toastSlot = registrations['dsh-session-purger.notice']
// The framework adds the locale seat; the fake context binds the same shape.
const t = ctx.locale.bind('dsh-session-purger')
const dialogProps = { ...dialogSlot.options.inject(), t }
const toastProps = { ...toastSlot.options.inject(), t }

// --- the menu entry ----------------------------------------------------------

const entry = menu.resolve({ sessionId: 'A', displayTitle: 'demo' })[0]
check('menu registration sits right below archive', menu.order === 601 && menu.target === 'session')
check('menu entry stays in the footer beside archive', entry.afterContent === true)
check('menu entry is danger-styled', entry.danger === true)
check('menu entry labels come from the dictionary', entry.label === 'Delete session')

entry.run()
check('menu opens the dialog on its target', dialogProps.store.get()?.sessionId === 'A')

// --- confirming closes the dialog before the Host answers --------------------

const held = []
answer = async (body) => {
  if (body.dryRun === true) return { status: 200, data: { ok: true, dryRun: true, subagents: 2 } }
  await new Promise((resolve) => held.push(resolve))
  return { status: 200, data: { ok: true, removed: [body.sessionId], leftover: [] } }
}

let tree = render(dialogSlot.component, dialogProps)
check('dialog renders while a target is pending', tree !== null)
const confirm = find(tree, 'Button', 'Delete permanently')
check('dialog offers the confirm action', confirm !== undefined)

confirm.props.onClick()
check('confirming closes the dialog at once', dialogProps.store.get() === null)
check('the purge is still in flight', calls.filter((call) => call.dryRun !== true).length === 1)

// --- purges run one at a time ------------------------------------------------

menu.resolve({ sessionId: 'B', displayTitle: 'other' })[0].run()
tree = render(dialogSlot.component, dialogProps)
find(tree, 'Button', 'Delete permanently').props.onClick()
check('a second target queues a second purge', calls.filter((call) => call.dryRun !== true).length === 1)

held.shift()()
await new Promise((resolve) => setTimeout(resolve, 0))
check('the queued purge starts once the first settles', calls.filter((call) => call.dryRun !== true).length === 2)
check('both purges target their own session', calls.filter((call) => call.dryRun !== true).map((call) => call.sessionId).join(',') === 'A,B')

// --- outcomes reach the Toast seat -------------------------------------------

held.shift()()
await new Promise((resolve) => setTimeout(resolve, 0))
check('a clean purge raises no Toast', render(toastSlot.component, toastProps) === null)

answer = async () => ({ status: 409, data: { ok: false, reason: 'list-failed', message: 'disk unreadable' } })
menu.resolve({ sessionId: 'C' })[0].run()
tree = render(dialogSlot.component, dialogProps)
find(tree, 'Button', 'Delete permanently').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
const failure = render(toastSlot.component, toastProps)
check('a refused purge raises a Toast', failure !== null && failure.type === 'Toast')
check('the Toast names the reason', failure.props.text === 'Delete failed: disk unreadable')

// A target that vanished between the dry run and the confirm is a success, not
// a failure: someone else already removed it.
answer = async (body) =>
  body.dryRun === true
    ? { status: 200, data: { ok: true, dryRun: true, subagents: 0 } }
    : { status: 409, data: { ok: false, reason: 'not-found' } }
toastProps.notice.dismiss()
menu.resolve({ sessionId: 'Gone' })[0].run()
tree = render(dialogSlot.component, dialogProps)
find(tree, 'Button', 'Delete permanently').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
check('an already-gone session raises no Toast', render(toastSlot.component, toastProps) === null)

toastProps.notice.dismiss()
check('dismissing clears the Toast', render(toastSlot.component, toastProps) === null)

answer = async (body) =>
  body.dryRun === true
    ? { status: 200, data: { ok: true, dryRun: true, subagents: 3 } }
    : { status: 200, data: { ok: true, removed: [body.sessionId], leftover: [body.sessionId] } }
menu.resolve({ sessionId: 'D' })[0].run()
tree = render(dialogSlot.component, dialogProps)
find(tree, 'Button', 'Delete permanently').props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
const leftover = render(toastSlot.component, toastProps)
check('a purge that left files behind raises a Toast', leftover !== null && leftover.props.text.startsWith('Deleted.'))
check('the Toast holds long enough to read', leftover.props.holdMs === 6000)

// --- the subagent count reaches the dialog -----------------------------------

answer = async (body) =>
  body.dryRun === true
    ? { status: 200, data: { ok: true, dryRun: true, subagents: 3 } }
    : { status: 200, data: { ok: true, removed: [body.sessionId], leftover: [] } }
menu.resolve({ sessionId: 'E' })[0].run()
tree = render(dialogSlot.component, dialogProps)
// The dry run is a round trip: the first paint can only say "checking".
check('the dialog reports progress before the dry run answers', tree.props.description === 'Checking for subagent sessions…')
await new Promise((resolve) => setTimeout(resolve, 0))
tree = render(dialogSlot.component, dialogProps)
check('the dialog reports the subagent count it will remove', String(tree.props.description).includes('3 subagent'))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
