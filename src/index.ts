/**
 * minevlayer — умный TypeScript-слой над Mineflayer.
 *
 * Философия:
 *  - 1 действие = 1 строка (`await bot.break('oak_log')`).
 *  - База (mineflayer) не трогается: она лежит в vendor/mineflayer и подключается
 *    как обычная зависимость (`"mineflayer": "file:vendor/mineflayer"`).
 *  - Весь оригинальный API mineflayer остаётся доступным на том же боте.
 *
 * Использование:
 * ```ts
 * import { createBot } from 'minevlayer'
 * const bot = createBot({ host: 'localhost', username: 'MyBot' })
 * bot.on('spawn', async () => {
 *   await bot.mine('oak_log', 5) // 1 строка: найти, дойти, экипировать, копать
 * })
 * ```
 */

import type { BotOptions } from 'mineflayer'
import type { MinevlayerBot } from './types'
export type { MinevlayerBot, BreakOptions, GotoOptions, FollowOptions, PlaceOptions, CollectOptions } from './types'

// mineflayer — зависимость из vendor (см. package.json)
const mineflayer = require('mineflayer')

import { injectSimple } from './simple'
import { injectLife } from './life'
import { injectActions } from './actions'
import { injectPvp } from './pvp'
import { injectHuman } from './human'
import { wireKnockback } from './physics'
import { TaskManager } from './tasks'
import { Brain } from './brain'
export { TaskManager } from './tasks'
export type { TaskDef } from './tasks'
export { Brain, HOSTILE_MOBS } from './brain'
export type { BrainState, EntityInfo, BrainEvents } from './brain'

const log = (...args: unknown[]): void => console.log('[minevlayer]', ...args)

export interface LegitOptions {
  /** Мастер-флаг «вести себя как настоящий клиент». @default true */
  legit?: boolean
  /** Живой простой: микро-движения головы/тела когда бот ничего не делает. @default true */
  legitIdle?: boolean
}

/**
 * Чистая функция (тестируется без подключения): применяет легит-дефолты к опциям.
 * Каждый бот получает свои настройки — глобального состояния нет, поэтому
 * несколько ботов в одном процессе (хоть через minevlayer, хоть через чистый
 * mineflayer параллельно) друг друга не трогают.
 */
export function applyLegitOptions(options: Partial<BotOptions> & LegitOptions & { autoPathfinder?: boolean } = {}): any {
  const legit = options.legit ?? true
  const out: any = { ...options, legit }
  if (legit) {
    // бренд клиента: как у ванильного клиента, если пользователь не задал свой
    if (out.brand === undefined) out.brand = 'vanilla'
  }
  out.legitIdle = legit && (options.legitIdle ?? true)
  return out
}

/**
 * Создать бота. Внутри — обычный mineflayer-бот + простые методы.
 *
 * Дополнительные опции:
 *  - `autoPathfinder: false` — не грузить mineflayer-pathfinder автоматически.
 *  - `legit: false` — выключить слой «как настоящий клиент» (по умолчанию ВКЛ).
 *  - `legitIdle: false` — выключить живой простой (по умолчанию ВКЛ вместе с legit).
 */
export function createBot(userOptions: Partial<BotOptions> & LegitOptions & { autoPathfinder?: boolean } = {}): MinevlayerBot {
  const options = applyLegitOptions(userOptions)
  const autoPathfinder = options.autoPathfinder ?? true

  const bot = mineflayer.createBot(options) as MinevlayerBot

  // простые методы доступны сразу, даже до 'spawn'
  injectSimple(bot)

  // жизнь: еда, сон, цепочки крафта
  injectLife(bot)

  // универсальные действия: бой, предметы, мир, анти-АФК
  injectActions(bot)

  // ванильное «человеческое» PvP
  injectPvp(bot)

  // «человечность»: живой простой, вотчдозор физики, статус
  injectHuman(bot)

  // мозг: состояние и обстановка в реальном времени
  bot.brain = new Brain(bot)

  // диспетчер задач: мозг решает, что делать сейчас (приоритеты)
  bot.tasks = new TaskManager(bot)

  // физика: обёртка НЕ мешает физике — откаты и падение проигрывает движок,
  // бот ведёт себя как игрок, не отпустивший клавиши (см. physics.ts)
  wireKnockback(bot)

  // слой «как настоящий клиент»: по умолчанию включён для каждого бота,
  // работает только с ЭТИМ ботом (параллельные боты не задевает)
  if (options.legitIdle) {
    bot.once('spawn', () => {
      if (!bot.human.status().idleActive) bot.human.idle()
    })
  }

  // подхватываем опциональные плагины, если они установлены (безопасный no-op, если нет)
  bot.once('inject_allowed', () => {
    if (autoPathfinder) {
      try {
        const { pathfinder } = require('mineflayer-pathfinder')
        if (typeof bot.loadPlugin === 'function' && pathfinder) bot.loadPlugin(pathfinder)
      } catch { /* optional */ }
    }
    try {
      const collectBlock = require('mineflayer-collectblock')
      bot.loadPlugin(collectBlock.plugin || collectBlock)
    } catch { /* optional */ }
    try {
      const pvp = require('mineflayer-pvp')
      bot.loadPlugin(pvp.plugin || pvp)
    } catch { /* optional */ }
    try {
      const autoEat = require('mineflayer-auto-eat')
      if (typeof autoEat === 'function') bot.loadPlugin(autoEat)
      else if (autoEat?.plugin) bot.loadPlugin(autoEat.plugin)
    } catch { /* optional */ }
  })

  // конкретные логи вместо тихих падений
  bot.on('kicked', (reason: string) => log('kicked:', reason))
  bot.on('error', (err: Error) => console.error('[minevlayer] error:', err.stack || err.message))
  bot.on('end', (reason: string) => log('connection ended:', reason))

  return bot
}

/** Версия движка (вендорного mineflayer). */
export const engineVersion: string = require('mineflayer/package.json').version
