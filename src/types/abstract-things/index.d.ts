declare module "abstract-things" {
  /** The instance type of a class (or of a constructor type, e.g. a mixin) */
  type Proto<T> = T extends abstract new (...args: never[]) => infer I
    ? I
    : T extends { prototype: infer P }
      ? P
      : never;

  export class Thing {
    constructor(...args: unknown[]);

    id: string | null;
    metadata: Record<string, unknown> & {
      types: string[];
      capabilities: string[];
      addCapabilities(...capabilities: string[]): void;
    };

    init(): Promise<undefined | this>;
    initCallback(): Promise<void>;

    destroy(): Promise<void>;
    destroyCallback(): Promise<void>;

    debug(...parts: unknown[]): void;
    matches(...tags: string[]): boolean;

    propertyUpdated(key: string, value: unknown, oldValue?: unknown): void;

    emitEvent(event: string, data?: unknown, options?: unknown): void;
    on(event: string, listener: (...args: never[]) => void): unknown;
    off(event: string, listener: (...args: never[]) => void): unknown;
    // on: InstanceType<typeof EventEmitter>["on"];
    // off: InstanceType<typeof EventEmitter>["off"];
    // onAny: InstanceType<typeof EventEmitter>["onAny"];
    // offAny: InstanceType<typeof EventEmitter>["offAny"];

    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => Thing & Proto<T1>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (...args: constructorArgs) => Thing & Proto<T1> & Proto<T2>;

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
    ) => Thing & Proto<T1> & Proto<T2> & Proto<T3>;

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
    ) => Thing & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4>;

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
    ) => Thing & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4> & Proto<T5>;

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
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6>;

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
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7>;

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
    poll(isInitial?: boolean): Promise<void>;
  }

  export class BatteryLevel extends Thing {
    batteryLevel(): Promise<number>;
    updateBatteryLevel(level: number): void;
  }
  export class ChargingState extends Thing {
    get charging(): Promise<boolean>;
    updateCharging(charging: boolean): void;
  }
  export abstract class AutonomousCharging extends Thing {
    abstract activateCharging(): Promise<void>;
  }

  export class Children extends Thing {}
  export class State extends Thing {
    state(): Promise<Record<string, unknown>>;
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
