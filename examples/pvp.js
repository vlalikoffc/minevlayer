/**
 * PVP — ванильный боец.
 * Кулдаун атаки, криты прыжком, прицел ДО удара, мувфикс,
 * дальность строго до 3 блоков — ведёт себя как живой игрок.
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'Duelist'
})

bot.on('spawn', () => {
  bot.chat('Готов к дуэли! Напишите "бой <ник>" или "стоп"')
})

// дуэль по команде
bot.onChat('бой ', async (username, message) => {
  const target = message.replace('бой ', '').trim()
  bot.chat(`Атакую ${target}!`)
  await bot.fight(target, { crits: true }) // дерётся до "стоп" или пока цель не пропадёт
})

bot.onChat('стоп', () => {
  bot.stop()
  bot.chat('Выхожу из боя')
})

// самооборона: если рядом враг — вступаем в бой
bot.brain.on('threat', (e) => {
  if (bot._fight) return // уже дерёмся
  bot.chat(`${e.name} напал на меня — отвечаю!`)
  bot.fight(e).catch(() => {}) // цель — сама сущность
})

// мало хп — отходим и едим
bot.brain.on('danger_hp', async () => {
  bot.stop()
  await bot.feed().catch(() => {})
  bot.chat('Отъедаюсь...')
})
