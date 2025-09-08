declare module "abstract-things" {
  export class Thing {
    constructor(...args: unknown[]);

    id: string | null;
    metadata: Record<string, unknown> & {
      types: string[];
      capabilities: string[];
      addCapabilities(...capabilities: string[]): void;
    };

    constructor(...args: unknown[]);

    init(): Promise<undefined | this>;
    initCallback(): Promise<void>;

    destroy(): Promise<void>;
    destroyCallback(): Promise<void>;

    debug(...parts: unknown[]): void;
    matches(...tags: string[]): boolean;

    propertyUpdated(key: string, value: unknown, oldValue?: unknown): void;

    emitEvent(event: string, data?: unknown, options?: unknown): void;
    // on: InstanceType<typeof EventEmitter>["on"];
    // off: InstanceType<typeof EventEmitter>["off"];
    // onAny: InstanceType<typeof EventEmitter>["onAny"];
    // offAny: InstanceType<typeof EventEmitter>["offAny"];

    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => Thing & T1["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (
      ...args: constructorArgs
    ) => Thing & T1["prototype"] & T2["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
    ): new (
      ...args: constructorArgs
    ) => Thing & T1["prototype"] & T2["prototype"] & T3["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
    ): new (
      ...args: constructorArgs
    ) => Thing &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      T5 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
      t5: T5,
    ): new (
      ...args: constructorArgs
    ) => Thing &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      T5 extends { prototype: unknown },
      T6 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
      t5: T5,
      t6: T6,
    ): new (
      ...args: constructorArgs
    ) => Thing &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      T5 extends { prototype: unknown },
      T6 extends { prototype: unknown },
      T7 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
      t5: T5,
      t6: T6,
      t7: T7,
    ): new (
      ...args: constructorArgs
    ) => Thing &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"];

    static type<U, constructorArgs extends unknown[]>(
      func: (
        Parent: typeof Thing,
      ) => new (...args: constructorArgs) => U & Thing,
    ): new (...args: constructorArgs) => U & Thing;
    static mixin<U, constructorArgs extends unknown[]>(
      func: (
        Parent: typeof Thing,
      ) => new (...args: constructorArgs) => U & Thing,
    ): new (...args: constructorArgs) => U & Thing;
    static mixinDynamic<U, constructorArgs extends unknown[]>(
      func: (
        Parent: typeof Thing,
      ) => new (...args: constructorArgs) => U & Thing,
    ): new (...args: constructorArgs) => U & Thing;

    extendWith<T>(...mixins: T[]): T & Thing;
  }

  export class Polling extends Thing {
    updatePollDuration(duration: number): void;
    updateMaxPollFailures(failures: number): void;
    poll(isInitial: boolean): Promise<void>;
  }

  export class BatteryLevel extends Thing {
    updateBatteryLevel(level: number): void;
  }
  export class ChargingState extends Thing {
    updateCharging(charging: boolean): void;
  }
  export abstract class AutonomousCharging extends Thing {
    abstract activateCharging(): Promise<void>;
  }

  export class Children extends Thing {}
  export class State extends Thing {
    getState<T>(name: string): T;
    updateState<T>(name: string, value: T): boolean;
  }
  export class ErrorState extends State {
    get error(): Promise<string | null>;
    updateError(
      error: { code: string; message?: string } | string | null,
    ): void;
  }
  export class Nameable extends Thing {}
  export class SwitchablePower extends Thing {
    updatePower<T>(value: T): void;
  }
  export class SwitchableMode extends Thing {
    updateMode<T>(value: T): void;
  }
}
