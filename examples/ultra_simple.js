/**
 * ULTRA SIMPLE — minevlayer бот в 7 строк
 * Раньше на mineflayer нужно 30 строк с pathfinder, поиском блока, экипировкой...
 * Теперь — 1 строка: bot.break("oak_log")
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: 'localhost',
  port: 25565,
  username: 'VlBot'
})

bot.on('spawn', async () => {
  console.log('[minevlayer] заспавнился! Инвентарь:', bot.inventory.items().length)

  // 1. Сломать дерево — 1 строка! Сам найдёт, дойдёт, выберет топор и сломает
  await bot.break('oak_log')
  console.log('Сломал дуб!')

  // 2. Накопать 5 блоков камня — 1 строка
  // await bot.mine('stone', 5)

  // 3. Инвентарь — 1 строка
  if (bot.has('oak_log', 3)) {
    console.log('Есть 3 бревна!')
  }

  // 4. Идти к игроку — 1 строка
  // await bot.goto('player:Notch')
  // await bot.goto({ x: 100, y: 64, z: 200 })

  // 5. Чат — сахар
  bot.onChat('привет', (username) => {
    bot.chat(`Привет, ${username}! Я minevlayer бот 😎`)
  })

  // 6. Следовать за игроком
  // bot.onChat('ко мне', (username) => bot.follow(username))

  bot.chat('Я готов! Напиши "привет" в чат')
})

// Для чайников: обработка ошибок простая
bot.on('kicked', console.log)
bot.on('error', console.log)

/**
 * Как запустить:
 *   1. npm run build
 *   2. node examples/ultra_simple.js localhost 25565
 * 
 * Сравни со старым mineflayer:
 *   // Старо — 15 строк
 *   const block = bot.findBlock({ matching: mcData.blocksByName.oak_log.id, maxDistance: 64 })
 *   const bestTool = ... найти топор ...
 *   await bot.equip(bestTool, 'hand')
 *   await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 2))
 *   await bot.dig(block)
 */
