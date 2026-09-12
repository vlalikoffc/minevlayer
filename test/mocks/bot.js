'use strict'

/**
 * Мок mineflayer-бота для юнит-тестов простого слоя.
 * Реализует только то, что трогает injectSimple.
 */

const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')

function makeSlots (items) {
  // раскладка инвентаря как в mineflayer: 46 слотов,
  // 5-8 броня, 9-35 основной, 36-44 хотбар
  const slots = new Array(46).fill(null)
  let i = 9
  for (const item of items) {
    slots[i++] = { ...item, enchants: item.enchants || [] }
  }
  return slots
}

function createMockBot (opts = {}) {
  const calls = {
    dig: [],
    equip: [],
    chat: [],
    originalToss: [],
    tossStack: [],
    placeBlock: [],
    craft: [],
    setControlState: [],
    clearControlStates: 0,
    lookAt: [],
    look: [],
    attack: []
  }

  const bot = new EventEmitter()

  bot.username = 'TestBot'
  bot.version = opts.version || '9.9.9' // несуществующая версия: фолбэки на minecraft-data не сработают
  bot.food = opts.food ?? 20
  bot.foodSaturation = opts.saturation ?? 5
  bot.health = opts.health ?? 20
  bot.isRaining = opts.isRaining ?? false
  bot.time = { timeOfDay: opts.timeOfDay ?? 6000 }
  bot.experience = opts.experience ?? { points: 3, progress: 0.5, level: 2 }
  bot.heldItem = opts.heldItem ?? null
  bot.entities = opts.entities || {}
  bot.game = { gameMode: 'survival', dimension: opts.dimension || 'minecraft:overworld' }
  bot.players = opts.players || {}
  bot.entity = {
    position: opts.position ? new Vec3(...opts.position) : new Vec3(0, 64, 0),
    yaw: 0,
    onGround: true
  }

  const registryBlocks = opts.blocks || {}
  const registryItems = opts.items || {}
  bot.registry = { blocksByName: registryBlocks, itemsByName: registryItems }

  const items = opts.inventory || []
  bot.inventory = {
    slots: makeSlots(items),
    items: () => bot.inventory.slots.filter(Boolean).filter((it, idx) => idx >= 0)
  }
  // items() должен возвращать только настоящие предметы инвентаря (не броню/крафт)
  bot.inventory.items = () => {
    const out = []
    for (let i = 9; i < 45; i++) if (bot.inventory.slots[i]) out.push(bot.inventory.slots[i])
    return out
  }

  // жизнь: еда и сон
  bot.consume = opts.consume || (async () => {
    calls.consume = calls.consume || []
    calls.consume.push(true)
    bot.food = Math.min(20, (bot.food ?? 0) + 5)
  })
  bot.isABed = opts.isABed || ((b) => String(b?.name ?? '').includes('bed'))
  bot.sleep = opts.sleep || (async (bed) => { calls.sleep = calls.sleep || []; calls.sleep.push(bed) })

  // мир
  bot._findBlocksImpl = opts.findBlocks || (() => [])
  bot.findBlocks = (o) => bot._findBlocksImpl(o)
  bot._blockAtImpl = opts.blockAt || (() => null)
  bot.blockAt = (pos) => bot._blockAtImpl(pos)
  bot.nearestEntity = opts.nearestEntity || (() => undefined)

  // движение
  bot.controlState = opts.controlState || {}
  bot.lookAt = async (pos) => { calls.lookAt.push(pos) }
  bot.look = async (pitch, yaw) => { calls.look.push([pitch, yaw]) }
  bot.setControlState = (k, v) => { calls.setControlState.push([k, v]) }
  bot.clearControlStates = () => { calls.clearControlStates++ }

  // копание/экипировка
  bot.canDigBlock = opts.canDigBlock || (() => true)
  bot.dig = async (block) => { calls.dig.push(block) }
  bot.stopDigging = () => {}
  bot.equip = async (item, dest) => { calls.equip.push([item, dest]) }

  // выбрасывание: это ОРИГИНАЛЬНЫЙ toss, который простой слой должен сохранить
  bot.toss = async (...args) => { calls.originalToss.push(args) }
  bot.tossStack = async (item) => { calls.tossStack.push(item) }

  // установка блоков
  bot.placeBlock = opts.placeBlock || (async (ref, face) => { calls.placeBlock.push([ref, face]) })

  // крафт
  bot.recipesFor = opts.recipesFor || (() => [])
  bot.craft = async (recipe, count, table) => { calls.craft.push([recipe, count, table]) }

  // прочее
  bot.waitForTicks = async () => {}
  bot.chat = (msg) => { calls.chat.push(msg) }
  bot.attack = (e) => { calls.attack.push(e) }

  bot._calls = calls
  return bot
}

module.exports = { createMockBot }
