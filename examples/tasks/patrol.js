'use strict'

/**
 * КАСТОМНАЯ ЗАДАЧА — файл экспортирует { name, priority, active?, run }.
 * run — ОДИН шаг: мозг будет вызывать его снова и дальше, пока задача активна.
 * Эта задача патрулирует квадрат 20х20 вокруг точки спавна.
 */

let home = null
let angle = 0

module.exports = {
  name: 'patrol',
  priority: 30, // ниже защиты (90) и атаки (80) — их не перебивает

  run: async (bot) => {
    if (!home) home = bot.entity.position.clone()
    angle += Math.PI / 6 // следующий пункт по кругу
    const target = {
      x: home.x + Math.cos(angle) * 10,
      y: home.y,
      z: home.z + Math.sin(angle) * 10
    }
    await bot.goto(target, { range: 1 }).catch(() => {})
  }
}
