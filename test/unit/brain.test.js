/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { Brain } = require('../../dist/brain')
const { createMockBot } = require('../mocks/bot')

function entity (id, name, type, pos, extra = {}) {
  return { id, name, type, position: new Vec3(...pos), ...extra }
}

describe('brain', () => {
  describe('state()', () => {
    it('returns a full realtime snapshot in one call', () => {
      const bot = createMockBot({
        position: [10, 64, -20],
        health: 14,
        food: 18,
        heldItem: { name: 'iron_pickaxe' },
        dimension: 'minecraft:the_nether'
      })
      const brain = new Brain(bot)
      const s = brain.state()
      assert.strictEqual(s.hp, 14)
      assert.strictEqual(s.food, 18)
      assert.deepStrictEqual(s.position, { x: 10, y: 64, z: -20 })
      assert.strictEqual(s.dimension, 'minecraft:the_nether')
      assert.strictEqual(s.gameMode, 'survival')
      assert.strictEqual(s.heldItem, 'iron_pickaxe')
      assert.strictEqual(s.timeOfDay, 6000)
      assert.deepStrictEqual(s.xp, { points: 3, progress: 0.5, level: 2 })
      assert.strictEqual(s.playersNearby, 0)
      assert.strictEqual(s.threatsNearby, 0)
    })

    it('describe() gives a readable one-liner', () => {
      const bot = createMockBot({ health: 7, food: 3 })
      const brain = new Brain(bot)
      const line = brain.describe()
      assert.match(line, /HP 7\/20/)
      assert.match(line, /food 3\/20/)
      assert.match(line, /threats: 0/)
    })
  })

  describe('nearby()', () => {
    it('lists entities sorted by distance, excluding self, within radius', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      bot.entity.id = 1
      bot.entities = {
        1: bot.entity, // сам бот — должен быть исключён
        2: entity(2, 'Steve', 'player', [3, 64, 4]), // dist 5
        3: entity(3, 'zombie', 'mob', [1, 64, 0]), // dist 1
        4: entity(4, 'cow', 'mob', [30, 64, 40]) // dist 50 — вне радиуса
      }
      const brain = new Brain(bot)
      const around = brain.nearby(16)
      assert.deepStrictEqual(around.map(e => e.name), ['zombie', 'Steve'])
      assert.ok(around[0].distance <= around[1].distance)
      assert.strictEqual(around[0].isHostile, true)
      assert.strictEqual(around[1].kind, 'player')
    })

    it('players(), mobs(), who()', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      bot.entities = {
        2: entity(2, 'Steve', 'player', [2, 64, 0]),
        3: entity(3, 'zombie', 'mob', [3, 64, 0])
      }
      const brain = new Brain(bot)
      assert.strictEqual(brain.players().length, 1)
      assert.strictEqual(brain.mobs().length, 1)
      assert.strictEqual(brain.who('steve').name, 'Steve')
      assert.strictEqual(brain.who('Nobody'), null)
      assert.strictEqual(brain.nearestPlayer().name, 'Steve')
    })
  })

  describe('threats()', () => {
    it('counts hostile mobs only, within threat radius', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      bot.entities = {
        2: entity(2, 'zombie', 'mob', [2, 64, 0]), // угроза
        3: entity(3, 'cow', 'mob', [3, 64, 0]), // не угроза
        4: entity(4, 'Steve', 'player', [4, 64, 0]), // игрок — не угроза
        5: entity(5, 'creeper', 'mob', [100, 64, 100]) // угроза, но далеко
      }
      const brain = new Brain(bot)
      const t = brain.threats()
      assert.deepStrictEqual(t.map(e => e.name), ['zombie'])
      assert.strictEqual(brain.isSafe(), false)
      assert.strictEqual(brain.state().threatsNearby, 1)
    })

    it('isSafe() when no hostiles around', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      bot.entities = { 3: entity(3, 'cow', 'mob', [3, 64, 0]) }
      const brain = new Brain(bot)
      assert.strictEqual(brain.isSafe(), true)
    })
  })

  describe('events', () => {
    it('emits health with prev values on damage', () => {
      const bot = createMockBot({ health: 20, food: 20 })
      const brain = new Brain(bot)
      const seen = []
      brain.on('health', (e) => seen.push(e))
      bot.health = 13
      bot.emit('health')
      assert.deepStrictEqual(seen, [{ hp: 13, food: 20, prev: { hp: 20, food: 20 } }])
    })

    it('emits danger_hp once when hp drops to critical', () => {
      const bot = createMockBot({ health: 10 })
      const brain = new Brain(bot)
      let danger = 0
      brain.on('danger_hp', () => { danger++ })
      bot.health = 5
      bot.emit('health') // 10 -> 5: критично
      bot.health = 4
      bot.emit('health') // 5 -> 4: уже было критично, повторно не зовём
      assert.strictEqual(danger, 1)
    })

    it('emits hungry when food drops to critical', () => {
      const bot = createMockBot({ food: 8 })
      const brain = new Brain(bot)
      let hungry = null
      brain.on('hungry', (v) => { hungry = v })
      bot.food = 5
      bot.emit('health')
      assert.strictEqual(hungry, 5)
    })

    it('emits threat when a hostile spawns within threatRadius', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      const brain = new Brain(bot)
      const threats = []
      brain.on('threat', (e) => threats.push(e.name))
      bot.emit('entitySpawn', entity(9, 'creeper', 'mob', [3, 64, 0]))
      bot.emit('entitySpawn', entity(10, 'cow', 'mob', [3, 64, 0])) // не враг
      bot.emit('entitySpawn', entity(11, 'skeleton', 'mob', [200, 64, 200])) // враг, но далеко
      assert.deepStrictEqual(threats, ['creeper'])
    })

    it('emits playerJoined / playerLeft / death', () => {
      const bot = createMockBot()
      const brain = new Brain(bot)
      const log = []
      brain.on('playerJoined', (n) => log.push('join:' + n))
      brain.on('playerLeft', (n) => log.push('left:' + n))
      brain.on('death', () => log.push('dead'))
      bot.emit('playerJoined', { username: 'Steve' })
      bot.emit('playerLeft', { username: 'Steve' })
      bot.emit('death')
      assert.deepStrictEqual(log, ['join:Steve', 'left:Steve', 'dead'])
    })

    it('off() unsubscribes', () => {
      const bot = createMockBot()
      const brain = new Brain(bot)
      let count = 0
      const cb = () => { count++ }
      brain.on('death', cb)
      bot.emit('death')
      brain.off('death', cb)
      bot.emit('death')
      assert.strictEqual(count, 1)
    })
  })

  describe('survival awareness', () => {
    it('isNight() knows the day cycle', () => {
      assert.strictEqual(new Brain(createMockBot({ timeOfDay: 13000 })).isNight(), true)
      assert.strictEqual(new Brain(createMockBot({ timeOfDay: 6000 })).isNight(), false)
    })

    it('tools() reports durability, worst first', () => {
      const bot = createMockBot({
        inventory: [
          { type: 257, name: 'iron_pickaxe', maxDurability: 250, durabilityUsed: 240 }, // 4% жив
          { type: 267, name: 'iron_sword', maxDurability: 250, durabilityUsed: 0 }, // целый
          { type: 297, name: 'bread' } // не инструмент — игнор
        ]
      })
      const brain = new Brain(bot)
      const tools = brain.tools()
      assert.deepStrictEqual(tools, [
        { name: 'iron_pickaxe', durability: 0.04 },
        { name: 'iron_sword', durability: 1 }
      ])
      assert.strictEqual(brain.worstTool().name, 'iron_pickaxe')
    })

    it('todo() builds a prioritized survival checklist', () => {
      const bot = createMockBot({
        position: [0, 64, 0],
        health: 5,
        food: 5,
        timeOfDay: 13000,
        entities: { 9: entity(9, 'zombie', 'mob', [3, 64, 0]) },
        inventory: [
          { type: 257, name: 'iron_pickaxe', maxDurability: 250, durabilityUsed: 245 }
        ]
      })
      const brain = new Brain(bot)
      assert.deepStrictEqual(brain.todo(), ['eat', 'heal', 'fight_or_flee', 'sleep', 'replace_tool'])
    })

    it('droppedItems() / nearestDrop() see item entities', () => {
      const bot = createMockBot({ position: [0, 64, 0] })
      bot.entities = {
        2: { id: 2, name: 'item', position: new Vec3(5, 64, 0) },
        3: { id: 3, name: 'item', position: new Vec3(2, 64, 0) },
        4: { id: 4, name: 'zombie', type: 'mob', position: new Vec3(1, 64, 0) } // не дроп
      }
      const brain = new Brain(bot)
      const drops = brain.droppedItems()
      assert.deepStrictEqual(drops.map(d => d.id), [3, 2]) // от ближайшего
      assert.strictEqual(brain.nearestDrop().id, 3)
      assert.strictEqual(brain.nearestDrop(1), null)
    })

    it('todo() is empty when life is good', () => {
      const bot = createMockBot({ position: [0, 64, 0], timeOfDay: 6000 })
      assert.deepStrictEqual(new Brain(bot).todo(), [])
    })
  })

  describe('reportEvery()', () => {
    it('logs state on an interval until stopped', async () => {
      const bot = createMockBot({ health: 9 })
      const brain = new Brain(bot)
      const lines = []
      brain.reportEvery(10, (line) => lines.push(line))
      await new Promise(resolve => setTimeout(resolve, 35))
      brain.stopReporting()
      const before = lines.length
      assert.ok(before >= 2, `expected at least 2 reports, got ${before}`)
      assert.match(lines[0], /HP 9\/20/)
      await new Promise(resolve => setTimeout(resolve, 25))
      assert.strictEqual(lines.length, before, 'no reports after stopReporting()')
    })
  })
})
