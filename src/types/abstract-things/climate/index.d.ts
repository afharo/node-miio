declare module "abstract-things/climate" {
  import { Thing } from "abstract-things";
  export class Vacuum extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => Vacuum & T1["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (
      ...args: constructorArgs
    ) => Vacuum & T1["prototype"] & T2["prototype"];

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
    ) => Vacuum & T1["prototype"] & T2["prototype"] & T3["prototype"];

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
    ) => Vacuum &
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
    ) => Vacuum &
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
    ) => Vacuum &
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
    ) => Vacuum &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"];
  }
  export class AdjustableFanSpeed extends Thing {}
  export class AutonomousCleaning extends Thing {}
  export class SpotCleaning extends Thing {}

  export class AirMonitor extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => AirMonitor & T1["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (
      ...args: constructorArgs
    ) => AirMonitor & T1["prototype"] & T2["prototype"];

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
    ) => AirMonitor & T1["prototype"] & T2["prototype"] & T3["prototype"];

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
    ) => AirMonitor &
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
    ) => AirMonitor &
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
    ) => AirMonitor &
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
    ) => AirMonitor &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"];
  }

  export class AirPurifier extends Thing {
    static with<
      T1 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(t1: T1): new (...args: constructorArgs) => AirMonitor & T1["prototype"];

    static with<
      T1 extends { prototype: unknown },
      T2 extends { prototype: unknown },
      constructorArgs extends unknown[],
    >(
      t1: T1,
      t2: T2,
    ): new (
      ...args: constructorArgs
    ) => AirPurifier & T1["prototype"] & T2["prototype"];

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
    ) => AirPurifier & T1["prototype"] & T2["prototype"] & T3["prototype"];

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
    ) => AirPurifier &
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
    ) => AirPurifier &
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
    ) => AirPurifier &
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
    ) => AirPurifier &
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"];

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
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"] &
      T8["prototype"];

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
      T1["prototype"] &
      T2["prototype"] &
      T3["prototype"] &
      T4["prototype"] &
      T5["prototype"] &
      T6["prototype"] &
      T7["prototype"] &
      T8["prototype"] &
      T9["prototype"];
  }
}
