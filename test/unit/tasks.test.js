/* eslint-env mocha */
'use strict'

const assert = require('assert')
const path = require('path')
const { Vec3 } = require('vec3')
const { TaskManager } = require('../../dist/tasks')
const { wireKnockback, sinceKnockback } = require('../../dist/physics')
const { createMockBot } = require('../mocks/bot')

function taskBot (opts = {}) {
  const bot = createMockBot(opts)
  // минимум «взрослого» бота для стандартных задач
  bot.health = opts.health ?? 20
  bot.goto = async () => {}
  bot.mine = async (...args) => { bot._mineCalls = (bot._mineCalls || []); bot._mineCalls.push(args) }
  bot.pickup = async () => { bot._pickupCalls = (bot._pickupCalls || 0) + 1; return opts.pickupResult ?? null }
  return bot
}

describe('tasks: dispatcher', () => {
  it('runs the most authoritative active task', async () => {
    const bot = taskBot()
    const tasks = new TaskManager(bot)
    let low = 0
    let high = 0
    tasks.custom({ name: 'low', priority: 10, run: async () => { low++ } })
    tasks.custom({ name: 'high', priority: 90, run: async () => { high++ } })
    tasks.start(10)
    await new Promise(resolve => setTimeout(resolve, 60))
    tasks.stop()
    assert.ok(high >= 2, 'high priority task must run')
    assert.strictEqual(low, 0, 'low priority task must wait')
  })

  it('falls back to lower priority when top task is inactive', async () => {
    const bot = taskBot()
    const tasks = new TaskManager(bot)
    let ran = 0
    tasks.custom({ name: 'sleeping', priority: 99, active: () => false, run: async () => {} })
    tasks.custom({ name: 'worker', priority: 10, run: async () => { ran++ } })
    tasks.start(10)
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.strictEqual(tasks.current, 'worker')
    tasks.stop()
    assert.ok(ran >= 2)
  })

  it('emits switch when the task changes', async () => {
    const bot = taskBot()
    const tasks = new TaskManager(bot)
    const switches = []
    tasks.on('switch', (e) => switches.push(e))
    let gate = false
    tasks.custom({ name: 'first', priority: 90, active: () => gate, run: async () => {} })
    tasks.custom({ name: 'second', priority: 10, run: async () => {} })
    tasks.start(10)
    await new Promise(resolve => setTimeout(resolve, 30))
    gate = true
    await new Promise(resolve => setTimeout(resolve, 40))
    tasks.stop()
    assert.deepStrictEqual(switches.map(s => s.to), ['second', 'first'])
  })

  it('load() registers a custom task from a file', async () => {
    const bot = taskBot()
    const tasks = new TaskManager(bot)
    const def = tasks.load(path.join(__dirname, '..', 'fixtures', 'customTask.js'))
    assert.strictEqual(def.name, 'patrol')
    assert.strictEqual(tasks.get('patrol').priority, 30)
    await def.run(bot)
    assert.strictEqual(bot._patrolled, 1)
  })
})

describe('tasks: standard set', () => {
  it('defend: retreats and heals at low hp', async () => {
    const bot = taskBot({ health: 4 })
    bot.brain = { isSafe: () => false, threats: () => [{ position: new Vec3(2, 64, 0) }] }
    bot.feed = async () => { bot._fed = true; return 'bread' }
    bot.goto = async () => { bot._retreated = true }
    const tasks = new TaskManager(bot)
    const def = tasks.defend()
    assert.strictEqual(def.active(bot), true)
    await def.run(bot)
    assert.ok(bot._retreated, 'must retreat from the threat')
    assert.ok(bot._fed, 'must try to heal')
  })

  it('defend: fights back at healthy hp', async () => {
    const threat = { position: new Vec3(1, 64, 0) }
    const bot = taskBot({ health: 20 })
    bot.brain = { isSafe: () => false, threats: () => [threat] }
    const tasks = new TaskManager(bot)
    const def = tasks.defend()
    await def.run(bot)
    assert.strictEqual(bot._calls.attack.length, 1, 'one human-like swing per step')
  })

  it('mine: digs step by step, finishes and unregisters', async () => {
    const bot = taskBot()
    const tasks = new TaskManager(bot)
    let done = null
    tasks.on('done', (e) => { done = e.task })
    const def = tasks.mine('stone', { count: 2 })
    assert.strictEqual(def.active(bot), true)
    await def.run(bot)
    assert.strictEqual(tasks.get('mine:stone') !== undefined, true)
    await def.run(bot)
    assert.strictEqual(done, 'mine:stone')
    assert.strictEqual(tasks.get('mine:stone'), undefined)
    assert.strictEqual(bot._mineCalls.length, 2)
  })

  it('attack: swings only within vanilla reach', async () => {
    const steve = { position: new Vec3(10, 64, 10) }
    const bot = taskBot({ players: { Steve: { entity: steve } } })
    const tasks = new TaskManager(bot)
    const def = tasks.attack('Steve')
    assert.strictEqual(def.active(bot), true)
    await def.run(bot) // цель далеко — должен подойти, а не бить издалека
    assert.strictEqual(bot._calls.attack.length, 0)
    steve.position = new Vec3(1, 64, 0) // подошёл
    await def.run(bot)
    assert.strictEqual(bot._calls.attack.length, 1)
  })

  it('gather: picks drops up', async () => {
    const bot = taskBot({ pickupResult: { id: 1 } })
    const tasks = new TaskManager(bot)
    const def = tasks.gather({ count: 1 })
    await def.run(bot)
    assert.strictEqual(bot._pickupCalls, 1)
    assert.strictEqual(tasks.get('gather'), undefined, 'done after count reached')
  })
})

describe('physics: knockback compliance', () => {
  it('on hurt the bot records knockback and KEEPS its inputs (like a real player)', () => {
    const bot = createMockBot()
    wireKnockback(bot)
    bot.setControlState('forward', true) // игрок шёл и зажимал W
    const clearsBefore = bot._calls.clearControlStates
    bot.emit('entityHurt', bot.entity)
    assert.ok(bot._lastKnockback > 0, 'knockback moment recorded')
    assert.strictEqual(bot._calls.clearControlStates, clearsBefore,
      'inputs must NOT be released — the player keeps holding their keys')
    assert.strictEqual(sinceKnockback(bot) < 100, true)
  })

  it('ignores other entities getting hurt', () => {
    const bot = createMockBot()
    wireKnockback(bot)
    bot.emit('entityHurt', { id: 99 })
    assert.strictEqual(bot._lastKnockback, undefined)
  })
})
