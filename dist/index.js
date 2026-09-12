"use strict";
/**
 * minevlayer — wrapper over mineflayer, 70× simpler.
 * mineflayer stays in vendor/mineflayer (JS, untouched). This layer is TS.
 *
 * Usage:
 *   import { createBot } from 'minevlayer'
 *   const bot = createBot({ host: 'localhost', username: 'VlBot' })
 *   await bot.break("oak_log") // 1 line instead of 15
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mineflayerCore = exports.oldestSupportedVersion = exports.latestSupportedVersion = exports.testedVersions = exports.supportFeature = exports.Particle = exports.BossBar = exports.ScoreBoard = exports.Painting = exports.Location = void 0;
exports.createBot = createBot;
// mineflayer core — vendor in vendor/mineflayer (JS)
const mineflayer = require('../vendor/mineflayer');
const simple_1 = require("./simple");
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
function createBot(options = {}) {
    // Прокидываем скрытую опцию — грузить ли pathfinder автоматом если установлен
    const autoLoadPathfinder = options.autoPathfinder ?? true;
    // Создаём базового mineflayer бота
    const bot = mineflayer.createBot(options);
    // Инжектим простые методы сразу (даже до spawn — чтобы были доступны)
    (0, simple_1.injectSimple)(bot);
    // Пытаемся подгрузить полезные плагины автоматом (если установлены)
    // Это не ломает бота если их нет — просто игнорируем
    bot.once('inject_allowed', () => {
        // pathfinder
        if (autoLoadPathfinder) {
            try {
                const { pathfinder } = require('mineflayer-pathfinder');
                // mineflayer-pathfinder экспортирует плагин как `pathfinder`
                if (typeof bot.loadPlugin === 'function' && pathfinder) {
                    bot.loadPlugin(pathfinder);
                    // console.log('[minevlayer] pathfinder подключен — goto() будет умным')
                }
            }
            catch { }
        }
        // collectblock
        try {
            const collectBlock = require('mineflayer-collectblock');
            const plugin = collectBlock.plugin || collectBlock;
            if (plugin)
                bot.loadPlugin(plugin);
        }
        catch { }
        // pvp
        try {
            const pvp = require('mineflayer-pvp');
            const plugin = pvp.plugin || pvp;
            if (plugin)
                bot.loadPlugin(plugin);
        }
        catch { }
        // auto-eat
        try {
            const autoEat = require('mineflayer-auto-eat');
            // auto-eat обычно использует bot.loadPlugin(autoEat) или loader
            if (typeof autoEat === 'function')
                bot.loadPlugin(autoEat);
            else if (autoEat?.plugin)
                bot.loadPlugin(autoEat.plugin);
        }
        catch { }
    });
    // Логи для новичков
    const origWarn = bot._warn || console.warn;
    bot.on('kicked', (reason) => console.log(`[minevlayer] кикнут: ${reason}`));
    bot.on('error', (err) => console.log(`[minevlayer] ошибка: ${err.message}`));
    return bot;
}
// Ре-экспорт всего из mineflayer для совместимости
// Чтобы можно было делать `import * as minevlayer from 'minevlayer'` и иметь доступ к Location и т.д.
exports.Location = mineflayer.Location;
exports.Painting = mineflayer.Painting;
exports.ScoreBoard = mineflayer.ScoreBoard;
exports.BossBar = mineflayer.BossBar;
exports.Particle = mineflayer.Particle;
exports.supportFeature = mineflayer.supportFeature;
exports.testedVersions = mineflayer.testedVersions;
exports.latestSupportedVersion = mineflayer.latestSupportedVersion;
exports.oldestSupportedVersion = mineflayer.oldestSupportedVersion;
// Также экспортируем сам mineflayer как vendor для продвинутых
exports.mineflayerCore = mineflayer;
// Default export для удобства
exports.default = { createBot };
//# sourceMappingURL=index.js.map