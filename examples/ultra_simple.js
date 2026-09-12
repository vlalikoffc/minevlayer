/**
 * ULTRA SIMPLE — бот на minevlayer.
 * Раньше на mineflayer это было 30+ строк с pathfinder, поиском блока и экипировкой.
 * Теперь — 1 строка на действие: bot.break('oak_log')
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'VlBot'
})

bot.on('spawn', async () => {
  console.log('[minevlayer] заспавнился! Предметов в инвентаре:', bot.inventory.items().length)

  // 1. Сломать дуб: сам найдёт, дойдёт, выберет топор и сломает
  await bot.break('oak_log')
  console.log('Сломал дуб одной строкой!')

  // 2. Накопать 5 блоков камня
  // await bot.mine('stone', 5)

  // 3. Проверить инвентарь
  if (bot.has('oak_log', 1)) {
    console.log('Есть брёвна!')
  }

  // 4. Идти к игроку или координатам
  // await bot.goto('player:Notch')
  // await bot.goto({ x: 100, y: 64, z: 200 })

  // 5. Реакция на чат
  bot.onChat('привет', (username) => {
    bot.chat(`Привет, ${username}! Я бот на minevlayer`)
  })

  // 6. Следовать за игроком
  // bot.onChat('ко мне', (username) => bot.follow(username))
})
