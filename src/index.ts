/**
 * minevlayer — wrapper over mineflayer, 70× simpler.
 * mineflayer stays in vendor/mineflayer (JS, untouched). This layer is TS.
 *
 * Usage:
 *   import { createBot } from 'minevlayer'
 *   const bot = createBot({ host: 'localhost', username: 'VlBot' })
 *   await bot.break("oak_log") // 1 line instead of 15
 */

import type { BotOptions } from '../index'
import type { MinevlayerBot } from './types'
export type { MinevlayerBot, BreakOptions, GotoOptions, FollowOptions, PlaceOptions, CollectOptions } from './types'

// mineflayer core — vendor in vendor/mineflayer (JS)
const mineflayer: any = require('../vendor/mineflayer')
import { injectSimple } from './simple'

/**
 * Создать бота minevlayer. Внутри — обычный mineflayer бот, но с сахаром.
 * 
 * Пример для чайника (7 строк — и бот готов):
 * ```ts
 * import { createBot } from 'minevlayer'
 * const bot = createBot({ host: 'localhost', username: 'MyBot' })
 * bot.on('spawn', async () => {
 *   await bot.mine("oak_log", 5) // добудь 5 брёвен
 *   bot.chat("Готово!")
 * })
 * ```
 */
export function createBot(options: Partial<BotOptions> = {}): MinevlayerBot {
  // Прокидываем скрытую опцию — грузить ли pathfinder автоматом если установлен
  const autoLoadPathfinder = (options as any).autoPathfinder ?? true

  // Создаём базового mineflayer бота
  const bot = mineflayer.createBot(options) as MinevlayerBot

  // Инжектим простые методы сразу (даже до spawn — чтобы были доступны)
  injectSimple(bot)

  // Пытаемся подгрузить полезные плагины автоматом (если установлены)
  // Это не ломает бота если их нет — просто игнорируем
  bot.once('inject_allowed', () => {
    // pathfinder
    if (autoLoadPathfinder) {
      try {
        const { pathfinder } = require('mineflayer-pathfinder')
        // mineflayer-pathfinder экспортирует плагин как `pathfinder`
        if (typeof bot.loadPlugin === 'function' && pathfinder) {
          bot.loadPlugin(pathfinder)
          // console.log('[minevlayer] pathfinder подключен — goto() будет умным')
        }
      } catch {}
    }
    // collectblock
    try {
      const collectBlock = require('mineflayer-collectblock')
      const plugin = collectBlock.plugin || collectBlock
      if (plugin) bot.loadPlugin(plugin)
    } catch {}
    // pvp
    try {
      const pvp = require('mineflayer-pvp')
      const plugin = pvp.plugin || pvp
      if (plugin) bot.loadPlugin(plugin)
    } catch {}
    // auto-eat
    try {
      const autoEat = require('mineflayer-auto-eat')
      // auto-eat обычно использует bot.loadPlugin(autoEat) или loader
      if (typeof autoEat === 'function') bot.loadPlugin(autoEat)
      else if (autoEat?.plugin) bot.loadPlugin(autoEat.plugin)
    } catch {}
  })

  // Логи для новичков
  const origWarn = (bot as any)._warn || console.warn
  bot.on('kicked', (reason: string) => console.log(`[minevlayer] кикнут: ${reason}`))
  bot.on('error', (err: Error) => console.log(`[minevlayer] ошибка: ${err.message}`))

  return bot
}

// Ре-экспорт всего из mineflayer для совместимости
// Чтобы можно было делать `import * as minevlayer from 'minevlayer'` и иметь доступ к Location и т.д.
export const Location = mineflayer.Location
export const Painting = mineflayer.Painting
export const ScoreBoard = mineflayer.ScoreBoard
export const BossBar = mineflayer.BossBar
export const Particle = mineflayer.Particle
export const supportFeature = mineflayer.supportFeature
export const testedVersions = mineflayer.testedVersions
export const latestSupportedVersion = mineflayer.latestSupportedVersion
export const oldestSupportedVersion = mineflayer.oldestSupportedVersion

// Также экспортируем сам mineflayer как vendor для продвинутых
export const mineflayerCore = mineflayer

// Default export для удобства
export default { createBot }
