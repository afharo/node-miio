declare module "abstract-things/climate" {
  /** The instance type of a class (or of a constructor type, e.g. a mixin) */
  type Proto<T> = T extends abstract new (...args: never[]) => infer I
    ? I
    : T extends { prototype: infer P }
      ? P
      : never;

  import { Thing, ErrorState } from "abstract-things";
  export class Vacuum extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => Vacuum & Proto<T1>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (...args: constructorArgs) => Vacuum & Proto<T1> & Proto<T2>;

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
    ) => Vacuum & Proto<T1> & Proto<T2> & Proto<T3>;

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
    ) => Vacuum & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4>;

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
    ) => Vacuum & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4> & Proto<T5>;

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
    ) => Vacuum &
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
    ) => Vacuum &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7>;
  }
  export class AdjustableFanSpeed extends Thing {
    fanSpeed(): Promise<number>;
    updateFanSpeed(speed: unknown): void;
  }
  export class CleaningState extends ErrorState {
    cleaning(): Promise<boolean>;
    updateCleaning(cleaning: boolean): void;
  }
  export class AutonomousCleaning extends CleaningState {}
  export class SpotCleaning extends Thing {}

  export class AirMonitor extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => AirMonitor & Proto<T1>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (...args: constructorArgs) => AirMonitor & Proto<T1> & Proto<T2>;

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
    ) => AirMonitor & Proto<T1> & Proto<T2> & Proto<T3>;

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
    ) => AirMonitor & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4>;

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
    ) => AirMonitor & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4> & Proto<T5>;

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
    ) => AirMonitor &
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
    ) => AirMonitor &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7>;
  }

  export class AirPurifier extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => AirMonitor & Proto<T1>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (...args: constructorArgs) => AirPurifier & Proto<T1> & Proto<T2>;

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
    ) => AirPurifier & Proto<T1> & Proto<T2> & Proto<T3>;

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
    ) => AirPurifier & Proto<T1> & Proto<T2> & Proto<T3> & Proto<T4>;

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
    ) => AirPurifier &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5>;

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
    ) => AirPurifier &
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
    ) => AirPurifier &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      T5 extends { prototype: unknown },
      T6 extends { prototype: unknown },
      T7 extends { prototype: unknown },
      T8 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
      t5: T5,
      t6: T6,
      t7: T7,
      t8: T8,
    ): new (
      ...args: constructorArgs
    ) => AirPurifier &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7> &
      Proto<T8>;

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      T3 extends { prototype: unknown },
      T4 extends { prototype: unknown },
      T5 extends { prototype: unknown },
      T6 extends { prototype: unknown },
      T7 extends { prototype: unknown },
      T8 extends { prototype: unknown },
      T9 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
      t3: T3,
      t4: T4,
      t5: T5,
      t6: T6,
      t7: T7,
      t8: T8,
      t9: T9,
    ): new (
      ...args: constructorArgs
    ) => AirPurifier &
      Proto<T1> &
      Proto<T2> &
      Proto<T3> &
      Proto<T4> &
      Proto<T5> &
      Proto<T6> &
      Proto<T7> &
      Proto<T8> &
      Proto<T9>;
  }
}
