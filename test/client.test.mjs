import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

function loadPlugin() {
  let factory = null
  const styleTags = []
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => styleTags.push(tag) },
    body: {},
  }
  const window = {
    __ModuleLoader__: {
      load: (entry) => { factory = entry.factory },
    },
    location: { origin: 'http://127.0.0.1:40856' },
  }
  const context = vm.createContext({ window, document, console, URL, fetch: async () => ({ ok: false, status: 503 }) })
  vm.runInContext(source, context)
  assert.equal(typeof factory, 'function')

  const react = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useCallback: (fn) => fn,
  }
  const exports = factory((specifier) => {
    if (specifier === 'react') return react
    if (specifier === 'react-dom') return { createPortal: () => null }
    throw new Error(`unexpected require: ${specifier}`)
  })
  return { exports, styleTags }
}

test('client registers the sidebar footer row and all locale dictionaries', () => {
  const { exports, styleTags } = loadPlugin()
  assert.equal(exports.inject.join(','), 'slots,locale')
  assert.equal(styleTags.length, 1)

  const registrations = []
  const dictionaries = []
  const ctx = {
    effect: (fn) => { fn() },
    locale: {
      register: (namespace, values) => dictionaries.push({ namespace, values }),
    },
    slots: {
      inject: (key, callback) => { assert.equal(key, 'sidebar.footer.action'); callback() },
      register: (options, component) => registrations.push({ options, component }),
    },
  }
  exports.apply(ctx)
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'offpeakIndicator')
  const keySets = Object.values(dictionaries[0].values).map((dictionary) => Object.keys(dictionary).sort().join('|'))
  assert.equal(new Set(keySets).size, 1, 'all locale dictionaries expose the same keys')
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'offpeak-indicator')
  assert.equal(registrations[0].options.locale, 'offpeakIndicator')
  assert.equal(typeof registrations[0].component, 'function')
})
