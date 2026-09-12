/**
 * ULTRA SIMPLE — TS версия
 * Тип который кодить не умеет — обязан за час написать бота!
 */

import { createBot } from '../src' // в npm будет: from 'minevlayer'

const bot = createBot({
  host: process.argv[2] ?? 'localhost',
  port: parseInt(process.argv[3] ?? '25565'),
  username: 'VlBotTS'
})

bot.on('spawn', async () => {
  console.log('[minevlayer:TS] заспавнился на', bot.version)

  // 1 строка — сломать блок
  await bot.break('oak_log')
  console.log('✅ Сломал дуб в 1 строку!')

  // 1 строка — накопать 5
  await bot.mine('stone', 3)
  console.log('✅ Накопал камня!')

  // 1 строка — идти куда угодно
  // await bot.goto({ x: 100, y: 64, z: 100 })
  // await bot.goto('player:Steve')

  // 1 строка — следовать
  // await bot.follow('Steve')

  // 1 строка — чат триггер
  bot.onChat('дай дерево', async (username) => {
    await bot.mine('oak_log', 1)
    bot.chat(`Держи, ${username}!`)
  })

  bot.chat('TS бот готов! Напиши "дай дерево"')
})

bot.on('kicked', console.log)
bot.on('error', console.log)
