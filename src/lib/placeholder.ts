"use strict";

import { Thing } from "abstract-things";

import { MiioApi } from "./device";
import type { DeviceHandle } from "./management";

export class Placeholder extends Thing.with(MiioApi) {
  static get type() {
    return "placeholder";
  }

  constructor(public readonly handle: DeviceHandle) {
    super(handle);
  }
}
