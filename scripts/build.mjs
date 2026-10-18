// Builds the two published bundles from the TypeScript sources.
//
//   src/index.ts  → lib/index.js   ESM, loaded by the Host through Node
//   src/client.ts → lib/client.js  classic script registering window.__ModuleLoader__
//
// Type checking is a separate step (`npm run typecheck`): tsc here only strips
// types, so a build never depends on the checker having passed.
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'lib')

const HOST = {
  target: ts.ScriptTarget.ES2024,
  // `transpileModule` sees one file and no package.json, so ESM has to be spelled
  // out here; NodeNext would fall back to CommonJS and break the package's exports.
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  verbatimModuleSyntax: false,
  sourceMap: false,
  declaration: false,
}

const CLIENT = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  verbatimModuleSyntax: false,
  sourceMap: false,
  declaration: false,
}

/** Compile one entry in memory and return the emitted JavaScript. */
async function emit(entry, options) {
  const file = join(ROOT, 'src', entry)
  const result = ts.transpileModule(await readFile(file, 'utf8'), { fileName: file, compilerOptions: options })
  if (result.diagnostics !== undefined && result.diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => '\n',
    })
    throw new Error(formatted)
  }
  return result.outputText
}

/**
 * Wrap a module body as one classic script.
 *
 * The browser loads client bundles as classic `<script>` elements, several of
 * them concatenated into one combo response, so top-level `const`/`let` would
 * share a single global lexical scope across every plugin (`Identifier 'NS'
 * has already been declared`). Leading `"use strict"` is hoisted out of the
 * wrapper so the directive still applies. The module marker tsc appends is
 * dropped: `export {}` is a syntax error in a classic script, and the bundle's
 * only effect is the `window.__ModuleLoader__` call.
 * @param code - the emitted module text.
 * @returns the same program as one self-contained classic script.
 */
function asClassicScript(code) {
  const body = code.replace(/\n*export \{\};\s*$/, '\n')
  const strict = body.match(/^(["'])use strict\1;\n/) === null ? '' : '"use strict";\n'
  const rest = strict === '' ? body : body.slice('"use strict";\n'.length)
  return `${strict}(() => {\n${rest.trimEnd()}\n})();\n`
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
const built = []
await writeFile(join(OUT, 'index.js'), await emit('index.ts', HOST), 'utf8')
built.push('lib/index.js')
// A package without a browser half (no `dsh.client` declaration) ships only
// the Host bundle; only compile the client entry when its source exists.
if (existsSync(join(ROOT, 'src', 'client.ts'))) {
  await writeFile(join(OUT, 'client.js'), asClassicScript(await emit('client.ts', CLIENT)), 'utf8')
  built.push('lib/client.js')
}
console.log(`built ${built.join(' and ')}`)
