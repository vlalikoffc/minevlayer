import type { Bot } from '../index';
import type { Vec3 } from 'vec3';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
export type MinevlayerBot = Omit<Bot, 'toss'> & {
    /** Сломать ближайший блок по имени (например "oak_log", "stone"). Сам найдёт, дойдёт и сломает. */
    break(blockName: string, options?: BreakOptions): Promise<void>;
    /** Накопать N блоков (alias для break с count) */
    mine(blockName: string, count?: number, options?: BreakOptions): Promise<void>;
    /** Собрать ресурсы (копать + подобрать дроп) */
    collect(blockName: string, count?: number, options?: CollectOptions): Promise<void>;
    /** Идти к координатам / к игроку / к блоку — 1 строка */
    goto(target: Vec3 | {
        x: number;
        y: number;
        z: number;
    } | string | Entity, options?: GotoOptions): Promise<void>;
    /** Следовать за игроком/существом */
    follow(target: string | Entity, options?: FollowOptions): Promise<void>;
    /** Остановиться */
    stop(): void;
    /** Поставить блок — укажи что ставить и куда */
    place(blockName: string, reference?: Block | Vec3, options?: PlaceOptions): Promise<void>;
    /** Экипировать лучший инструмент для блока или по имени */
    equipBest(blockOrItem?: string | Block): Promise<void>;
    /** Есть ли предмет в инвентаре */
    has(itemName: string, count?: number): boolean;
    /** Выбросить предмет */
    toss(itemName: string, count?: number): Promise<void>;
    /** Построить (пока заглушка) */
    build(structure: string, options?: any): Promise<void>;
    /** Скрафтить */
    craftSimple(itemName: string, count?: number, craftingTable?: Block | boolean): Promise<void>;
    /** Чат сахор */
    onChat(trigger: string | RegExp, callback: (username: string, message: string) => void): void;
    /** Подождать тиков */
    wait(ticks: number): Promise<void>;
    /** Сказать в чат с задержкой */
    say(message: string, delayMs?: number): void;
    /** Авто-еда */
    autoEat(): void;
    /** Охрана точки */
    guard(position: Vec3 | {
        x: number;
        y: number;
        z: number;
    }, radius?: number): void;
    /** Найти ближайший блок */
    findNearest(blockName: string, maxDistance?: number): Block | null;
    /** Найти все блоки */
    findAll(blockName: string, maxDistance?: number, count?: number): import('vec3').Vec3[];
    when(event: string, callback: (...args: any[]) => void): void;
};
export interface BreakOptions {
    maxDistance?: number;
    count?: number;
    autoTool?: boolean;
    timeoutMs?: number;
    drop?: boolean;
}
export interface CollectOptions extends BreakOptions {
}
export interface GotoOptions {
    range?: number;
    timeoutMs?: number;
    sprint?: boolean;
    pathfinder?: any;
}
export interface FollowOptions {
    distance?: number;
    continuous?: boolean;
}
export interface PlaceOptions {
    face?: Vec3;
    autoEquip?: boolean;
}
//# sourceMappingURL=types.d.ts.map