/* eslint-env mocha */
'use strict'

/**
 * Синхронность вендора и корневого пакета.
 *
 * Движок ставится потребителям через "file:vendor/mineflayer", но npm
 * НЕ устанавливает транзитивные зависимости file:-цели из опубликованного
 * пакета. Поэтому все зависимости вендорного mineflayer должны быть объявлены
 * и в корневом package.json — этот тест ловит рассинхрон при ре-вендоринге.
 */

const assert = require('assert')
const root = require('../../package.json')
const vendor = require('../../vendor/mineflayer/package.json')

describe('vendor <-> root sync', () => {
  it('every mineflayer dependency is declared in the root package', () => {
    const missing = []
    for (const [name, range] of Object.entries(vendor.dependencies)) {
      if (!(name in root.dependencies)) missing.push(`${name}@${range}`)
    }
    assert.deepStrictEqual(
      missing, [],
      `add these to root package.json "dependencies": ${missing.join(', ')}`
    )
  })

  it('dependency ranges match the vendored ones', () => {
    const drifted = []
    for (const [name, range] of Object.entries(vendor.dependencies)) {
      if (name in root.dependencies && root.dependencies[name] !== range) {
        drifted.push(`${name}: root=${root.dependencies[name]} vendor=${range}`)
      }
    }
    assert.deepStrictEqual(drifted, [], `version drift: ${drifted.join('; ')}`)
  })

  it('root depends on the vendored mineflayer via file:', () => {
    assert.strictEqual(root.dependencies.mineflayer, 'file:vendor/mineflayer')
  })

  it('vendor package.json names and versions stay consistent', () => {
    assert.strictEqual(vendor.name, 'mineflayer')
    assert.match(vendor.version, /^\d+\.\d+\.\d+$/)
  })
})
