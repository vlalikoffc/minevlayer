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

const log = (...args: unknown[]): void => console.log('[minevlayer]', ...args)

/**
 * Создать бота. Внутри — обычный mineflayer-бот + простые методы.
 *
 * Дополнительные опции:
 *  - `autoPathfinder: false` — не грузить mineflayer-pathfinder автоматически.
 */
export function createBot(options: Partial<BotOptions> & { autoPathfinder?: boolean } = {}): MinevlayerBot {
  const autoPathfinder = options.autoPathfinder ?? true

  const bot = mineflayer.createBot(options) as MinevlayerBot

  // простые методы доступны сразу, даже до 'spawn'
  injectSimple(bot)

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
