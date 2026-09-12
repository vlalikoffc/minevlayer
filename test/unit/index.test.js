/* eslint-env mocha */
'use strict'

const assert = require('assert')

describe('package entry points', () => {
  it('dist/ exports createBot and the engine version', () => {
    const m = require('../../dist')
    assert.strictEqual(typeof m.createBot, 'function')
    assert.strictEqual(typeof m.engineVersion, 'string')
    assert.match(m.engineVersion, /^\d+\.\d+\.\d+$/)
  })

  it('mineflayer is resolved as a dependency from vendor/', () => {
    const mf = require('mineflayer')
    assert.strictEqual(typeof mf.createBot, 'function')
    assert.ok(Array.isArray(mf.testedVersions))
    const pkg = require('mineflayer/package.json')
    assert.strictEqual(pkg.name, 'mineflayer')
  })

  it('root index.js re-exports the built package', () => {
    const m = require('../../index.js')
    assert.strictEqual(typeof m.createBot, 'function')
  })

  it('vendored mineflayer lives in vendor/mineflayer', () => {
    const path = require.resolve('mineflayer')
    assert.ok(
      path.includes('node_modules/mineflayer') || path.includes('vendor/mineflayer'),
      `unexpected mineflayer location: ${path}`
    )
  })
})
