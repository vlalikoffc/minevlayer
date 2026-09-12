import type { Vec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Brain } from './brain'

/** toss и dig переопределяем (умные версии), поэтому убираем их из типа */
export type MinevlayerBot = Omit<import('mineflayer').Bot, 'toss' | 'dig'> & {
  // === Мозг: состояние и обстановка в реальном времени ===
  /** Состояние бота и мир вокруг: `bot.brain.state()`, `bot.brain.threats()`, `bot.brain.describe()`. */
  brain: Brain

  // === 1 действие = 1 строка ===
  /** Сломать ближайший блок по имени ("oak_log", "stone"). Сам найдёт, дойдёт, выберет инструмент и сломает. */
  break(blockName: string, options?: BreakOptions): Promise<void>
  /** Копать по имени блока: 1 строка вместо 50 в майнфлеере. Если передать Block — работает как оригинальный dig. */
  dig(blockName: string): Promise<void>
  dig(block: Block, force?: boolean): Promise<void>
  /** Накопать N блоков (то же, что break с count). */
  mine(blockName: string, count?: number, options?: BreakOptions): Promise<void>
  /** Собрать ресурс: сломать и подобрать дроп (через collectblock, если установлен). */
  collect(blockName: string, count?: number, options?: CollectOptions): Promise<void>

  /** Идти к координатам / игроку ("player:Notch" или "Notch") / блоку ("chest"). */
  goto(target: Vec3 | { x: number, y: number, z: number } | string | Entity, options?: GotoOptions): Promise<void>
  /** Следовать за игроком/существом. */
  follow(target: string | Entity, options?: FollowOptions): Promise<void>
  /** Полная остановка: движение, следование, охрана, копание. */
  stop(): void

  /** Поставить блок из инвентаря. */
  place(blockName: string, reference?: Block | Vec3 | { x: number, y: number, z: number }, options?: PlaceOptions): Promise<void>
  /** Экипировать лучший инструмент для блока (или предмет по имени). */
  equipBest(blockOrItem?: string | Block): Promise<void>
  /** Хватает ли предмета в инвентаре. */
  has(itemName: string, count?: number): boolean
  /** Выбросить предмет (весь стек или N штук). */
  toss(itemName: string, count?: number): Promise<void>

  /** Скрафтить по первому доступному рецепту. */
  craftSimple(itemName: string, count?: number, craftingTable?: Block | boolean): Promise<void>
  /** Скрафтить с авто-цепочкой: недостающие ингредиенты скрафтятся сами (доски <- брёвна и т.д.). */
  craftChain(itemName: string, count?: number, options?: { table?: Block | 'auto' | false }): Promise<void>

  // === жизнь: базовые потребности одной строкой ===
  /** Поесть: найти лучшую еду в инвентаре и съесть. Вернёт имя съеденного или null если сыт. */
  feed(): Promise<string | null>
  /** Наесться до полного голода, чтобы здоровье восстанавливалось само. */
  heal(): Promise<void>
  /** Найти ближайшую кровать, дойти и лечь спать. */
  sleepNow(): Promise<void>

  // === универсальные действия: любой режим — выживание, SMP, анархия, миниигры ===
  /** Использовать ближайший блок по имени: рычаг, дверь, сундук, верстак. Сам дойдёт и активирует. */
  use(target: string | Block): Promise<any>
  /** Атаковать ближайшую цель: имя ('zombie', 'player', 'Steve') или предикат. Вернёт цель или null. */
  attackNearest(match: string | ((e: Entity) => boolean), radius?: number): Promise<Entity | null>
  /** Дойти до ближайшего дропа, чтобы подобрать его. Вернёт сущность дропа или null. */
  pickup(radius?: number): Promise<Entity | null>
  /** Передать предметы игроку: подойти и выбросить ему под ноги. */
  give(playerName: string, itemName: string, count?: number): Promise<void>
  /** Разовый прыжок. */
  jump(): void
  /** Анти-АФК: прыжки/приседания/повороты с интервалом. Останавливается через stop(). */
  antiAfk(intervalMs?: number): void

  // === ванильное «человеческое» PvP ===
  /** Бой с целью: мувфикс, плавный прицел, кулдаун, криты, дальность <= 3 блоков. */
  fight(target: string | Entity, options?: FightOptions): Promise<void>

  /** Чат-триггер: вызвать callback, когда кто-то напишет сообщение с триггером. */
  onChat(trigger: string | RegExp, callback: (username: string, message: string) => void): void
  /** Подождать N серверных тиков. */
  wait(ticks: number): Promise<void>
  /** Сказать в чат (опционально с задержкой в мс). */
  say(message: string, delayMs?: number): void

  /** Автоматически есть при низком голоде. */
  autoEat(): void
  /** Охранять точку: атаковать мобов в радиусе. */
  guard(position: Vec3 | { x: number, y: number, z: number }, radius?: number): void

  /** Найти ближайший блок по имени. */
  findNearest(blockName: string, maxDistance?: number): Block | null
  /** Найти до N блоков по имени, вернуть координаты. */
  findAll(blockName: string, maxDistance?: number, count?: number): Vec3[]

  /** Алиас для bot.on, чтобы код читался проще. */
  when(event: string, callback: (...args: any[]) => void): void
}

export interface BreakOptions {
  /** Радиус поиска блока. @default 64 */
  maxDistance?: number
  /** Сколько блоков сломать. @default 1 */
  count?: number
  /** Самому выбрать лучший инструмент. @default true */
  autoTool?: boolean
  /** Таймаут на подход к блоку, мс. */
  timeoutMs?: number
  /** Копать даже без подходящего инструмента (блок сломается, но ДРОПА НЕ БУДЕТ). @default false */
  force?: boolean
}

export interface CollectOptions extends BreakOptions {}

export interface GotoOptions {
  /** На каком расстоянии от цели остановиться. @default 1 */
  range?: number
  /** Таймаут, мс. @default 30000 (с pathfinder) / 15000 (без) */
  timeoutMs?: number
  /** Бежать вместо ходьбы (только наивный режим без pathfinder). */
  sprint?: boolean
}

export interface FollowOptions {
  /** Какую дистанцию держать. @default 2 */
  distance?: number
  /** Следовать постоянно (иначе — подойти один раз). @default true */
  continuous?: boolean
}

export interface PlaceOptions {
  /** Грань, на которую ставить. @default (0,1,0) — верхняя */
  face?: Vec3
  /** Самому взять блок из инвентаря в руку. @default true */
  autoEquip?: boolean
}

export interface FightOptions {
  /** Дистанция, на которой стоять в бою. @default 2.8 */
  range?: number
  /** Жёсткий лимит дальности удара (ванила — 3 блока). @default 3.0 */
  maxReach?: number
  /** Пауза между ударами, мс. @default 600 */
  attackMs?: number
  /** Прыжковые криты по ванильным правилам. @default true */
  crits?: boolean
}
