/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const {
  getBlockId, getItemId, findBestTool, toVec3, isEntity,
  findBlocksForName, withTimeout
} = require('../../dist/helpers')

describe('helpers', () => {
  describe('toVec3', () => {
    it('converts {x,y,z}', () => {
      const v = toVec3({ x: 1, y: 2, z: 3 })
      assert.deepStrictEqual([v.x, v.y, v.z], [1, 2, 3])
    })
    it('converts [x,y,z]', () => {
      const v = toVec3([4, 5, 6])
      assert.deepStrictEqual([v.x, v.y, v.z], [4, 5, 6])
    })
    it('passes Vec3 through', () => {
      const v = new Vec3(7, 8, 9)
      assert.strictEqual(toVec3(v), v)
    })
    it('throws on garbage', () => {
      assert.throws(() => toVec3('nope'), /Cannot convert to Vec3/)
    })
  })

  describe('isEntity', () => {
    it('true for entity-like objects', () => {
      assert.strictEqual(isEntity({ position: new Vec3(0, 0, 0), type: 'mob', id: 1 }), true)
    })
    it('false for plain objects and null', () => {
      assert.strictEqual(isEntity({}), false)
      assert.strictEqual(isEntity(null), false)
    })
  })

  describe('getBlockId / getItemId', () => {
    const bot = {
      version: '9.9.9', // такой версии нет — фолбэк на minecraft-data не сработает
      registry: {
        blocksByName: { stone: { id: 1 } },
        itemsByName: { bread: { id: 297 } }
      }
    }
    it('resolves via registry', () => {
      assert.strictEqual(getBlockId(bot, 'stone'), 1)
      assert.strictEqual(getItemId(bot, 'bread'), 297)
    })
    it('is case-insensitive', () => {
      assert.strictEqual(getBlockId(bot, 'STONE'), 1)
    })
    it('returns null for unknown names', () => {
      assert.strictEqual(getBlockId(bot, 'unobtainium'), null)
      assert.strictEqual(getItemId(bot, 'unobtainium'), null)
    })
    it('getItemId falls back to block ids', () => {
      assert.strictEqual(getItemId(bot, 'stone'), 1)
    })
  })

  describe('findBestTool', () => {
    it('picks the fastest tool and ignores armor slots', () => {
      const block = {
        digTime: (type) => {
          if (type === 100) return 10 // медленный
          if (type === 200) return 1 // быстрый
          return 9999
        }
      }
      const slots = new Array(46).fill(null)
      slots[5] = { type: 200, enchants: [] } // броня — должна игнорироваться
      slots[9] = { type: 100, enchants: [] }
      slots[10] = { type: 200, enchants: [] }
      const bot = { inventory: { slots } }
      assert.strictEqual(findBestTool(bot, block), 10)
    })
    it('returns null when inventory is empty', () => {
      const bot = { inventory: { slots: new Array(46).fill(null) } }
      assert.strictEqual(findBestTool(bot, { digTime: () => 1 }), null)
    })
  })

  describe('findBlocksForName', () => {
    it('uses id matcher when name is known', () => {
      const seen = []
      const bot = {
        registry: { blocksByName: { dirt: { id: 3 } } },
        findBlocks: (o) => { seen.push(o); return [new Vec3(1, 2, 3)] }
      }
      const out = findBlocksForName(bot, 'dirt', 32, 4)
      assert.strictEqual(out.length, 1)
      assert.strictEqual(seen[0].maxDistance, 32)
      assert.strictEqual(seen[0].count, 4)
      assert.strictEqual(seen[0].matching({ type: 3 }), true)
      assert.strictEqual(seen[0].matching({ type: 4 }), false)
    })
    it('falls back to name matcher for unknown names', () => {
      const bot = {
        registry: { blocksByName: {} },
        version: '9.9.9',
        findBlocks: (o) => {
          assert.strictEqual(o.matching({ type: 0, name: 'mystery_ore', displayName: 'Mystery Ore' }), true)
          assert.strictEqual(o.matching({ type: 0, name: 'stone', displayName: 'Stone' }), false)
          return []
        }
      }
      findBlocksForName(bot, 'mystery_ore')
    })
    it('returns [] when findBlocks throws', () => {
      const bot = { registry: { blocksByName: {} }, version: '9.9.9', findBlocks: () => { throw new Error('boom') } }
      assert.deepStrictEqual(findBlocksForName(bot, 'x'), [])
    })
  })

  describe('withTimeout', () => {
    it('resolves with the promise', async () => {
      assert.strictEqual(await withTimeout(Promise.resolve(42), 100, 'x'), 42)
    })
    it('rejects on timeout', async () => {
      await assert.rejects(
        () => withTimeout(new Promise(() => {}), 20, 'timed out!'),
        /timed out!/
      )
    })
  })
})
