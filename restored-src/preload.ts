/**
 * preload.ts — Runs before the main CLI entry point.
 *
 * 1. Sets up the MACRO global object
 * 2. Registers Bun.plugin() for virtual/proprietary modules
 * 3. Fixes path issues from source map recovery
 */

import { resolve, dirname } from 'path'

// ============================================================
// 1. MACRO global
// ============================================================

;(globalThis as any).MACRO = {
  VERSION: '0.1.0',
  BUILD_TIME: '',
  PACKAGE_URL: '',
  NATIVE_PACKAGE_URL: null as string | null,
  VERSION_CHANGELOG: '',
}

// ============================================================
// 2. Shim contents (virtual namespace)
// ============================================================

const SHIM_CONTENTS: Record<string, string> = {
  'bun-bundle': `export function feature() { return false; }`,
}

// ============================================================
// 3. Bun.plugin()
// ============================================================

Bun.plugin({
  name: 'runtime-shims',
  setup(build) {
    build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => ({
      contents: SHIM_CONTENTS[args.path] ?? 'export {}',
      loader: 'ts',
    }))

    // bun:bundle — feature flag system
    build.onResolve({ filter: /^bun:bundle$/ }, () => ({
      path: 'bun-bundle',
      namespace: 'shim',
    }))
  },
})
