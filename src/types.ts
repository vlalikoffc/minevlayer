import type { Bot, BotOptions } from '../index'
import type { Vec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'

export type MinevlayerBot = Omit<Bot, 'toss'> & {
  // === Ультра-простые методы ===
  /** Сломать ближайший блок по имени (например "oak_log", "stone"). Сам найдёт, дойдёт и сломает. */
  break(blockName: string, options?: BreakOptions): Promise<void>
  /** Накопать N блоков (alias для break с count) */
  mine(blockName: string, count?: number, options?: BreakOptions): Promise<void>
  /** Собрать ресурсы (копать + подобрать дроп) */
  collect(blockName: string, count?: number, options?: CollectOptions): Promise<void>

  /** Идти к координатам / к игроку / к блоку — 1 строка */
  goto(target: Vec3 | { x: number, y: number, z: number } | string | Entity, options?: GotoOptions): Promise<void>
  /** Следовать за игроком/существом */
  follow(target: string | Entity, options?: FollowOptions): Promise<void>
  /** Остановиться */
  stop(): void

  /** Поставить блок — укажи что ставить и куда */
  place(blockName: string, reference?: Block | Vec3, options?: PlaceOptions): Promise<void>
  /** Экипировать лучший инструмент для блока или по имени */
  equipBest(blockOrItem?: string | Block): Promise<void>
  /** Есть ли предмет в инвентаре */
  has(itemName: string, count?: number): boolean
  /** Выбросить предмет */
  toss(itemName: string, count?: number): Promise<void>

  /** Построить (пока заглушка) */
  build(structure: string, options?: any): Promise<void>
  /** Скрафтить */
  craftSimple(itemName: string, count?: number, craftingTable?: Block | boolean): Promise<void>

  /** Чат сахор */
  onChat(trigger: string | RegExp, callback: (username: string, message: string) => void): void
  /** Подождать тиков */
  wait(ticks: number): Promise<void>
  /** Сказать в чат с задержкой */
  say(message: string, delayMs?: number): void

  /** Авто-еда */
  autoEat(): void
  /** Охрана точки */
  guard(position: Vec3 | { x: number, y: number, z: number }, radius?: number): void

  /** Найти ближайший блок */
  findNearest(blockName: string, maxDistance?: number): Block | null
  /** Найти все блоки */
  findAll(blockName: string, maxDistance?: number, count?: number): import('vec3').Vec3[]

  // sugar
  when(event: string, callback: (...args: any[]) => void): void
}

export interface BreakOptions {
  maxDistance?: number // default 64
  count?: number // сколько сломать
  autoTool?: boolean // default true — сам выберет кирку/топор
  timeoutMs?: number // таймаут на один блок
  drop?: boolean
}

export interface CollectOptions extends BreakOptions {}

export interface GotoOptions {
  range?: number // дистанция до цели, default 1
  timeoutMs?: number
  sprint?: boolean
  // если есть pathfinder — передаём напрямую
  pathfinder?: any
}

export interface FollowOptions {
  distance?: number // держать дистанцию, default 2
  continuous?: boolean // следовать постоянно, default true
}

export interface PlaceOptions {
  face?: Vec3 // вектор грани
  autoEquip?: boolean // default true
}
