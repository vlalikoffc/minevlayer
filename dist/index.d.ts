/**
 * minevlayer — wrapper over mineflayer, 70× simpler.
 * mineflayer stays in vendor/mineflayer (JS, untouched). This layer is TS.
 *
 * Usage:
 *   import { createBot } from 'minevlayer'
 *   const bot = createBot({ host: 'localhost', username: 'VlBot' })
 *   await bot.break("oak_log") // 1 line instead of 15
 */
import type { BotOptions } from '../index';
import type { MinevlayerBot } from './types';
export type { MinevlayerBot, BreakOptions, GotoOptions, FollowOptions, PlaceOptions, CollectOptions } from './types';
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
export declare function createBot(options?: Partial<BotOptions>): MinevlayerBot;
export declare const Location: any;
export declare const Painting: any;
export declare const ScoreBoard: any;
export declare const BossBar: any;
export declare const Particle: any;
export declare const supportFeature: any;
export declare const testedVersions: any;
export declare const latestSupportedVersion: any;
export declare const oldestSupportedVersion: any;
export declare const mineflayerCore: any;
declare const _default: {
    createBot: typeof createBot;
};
export default _default;
//# sourceMappingURL=index.d.ts.map