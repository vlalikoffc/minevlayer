'use strict'

// Пример кастомной задачи: файл экспортирует { name, priority, active?, run }
module.exports = {
  name: 'patrol',
  priority: 30,
  run: async (bot) => {
    bot._patrolled = (bot._patrolled || 0) + 1
  }
}
