/**
 * Физическая адекватность.
 *
 * Классическая причина киков: бот НЕ подчиняется физике — его откинули,
 * а он продолжает жать «вперёд» и слать невозможные пакеты. Живой игрок
 * в откате летит и ничего не нажимает. Мы делаем так же:
 * получили урон/откидывание -> 350 мс не трогаем управление, пусть физика отработает.
 */

export const KB_WINDOW_MS = 350

/** Вешаем реакцию на откидывание. Вызывается из createBot. */
export function wireKnockback(bot: any): void {
  bot.on('entityHurt', (entity: any) => {
    if (entity && bot.entity && entity === bot.entity) {
      bot._kbUntil = Date.now() + KB_WINDOW_MS
      try { bot.clearControlStates() } catch {}
    }
  })
}

/** Сколько ещё мс бот «в откате» (0 если уже можно действовать). */
export function kbRemaining(bot: any): number {
  return Math.max(0, (bot._kbUntil ?? 0) - Date.now())
}
