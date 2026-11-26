import { compose } from "../../things/compose";
import { Actions } from "../../things/capabilities/common";

import {
  SubDevice,
  type SubDeviceInfo,
  type SubDeviceParent,
} from "./subdevice";
import { VoltageBattery } from "./voltage";

/** Reports the actions of the sub-device (`emitAction`) for a key of the reported data */
abstract class ActionSubDevice extends compose(SubDevice, Actions) {
  /**
   * @param parent The gateway
   * @param info The sub-device
   * @param model The model
   * @param actions The supported actions
   */
  constructor(
    parent: SubDeviceParent,
    info: SubDeviceInfo,
    model: string,
    actions: string[],
  ) {
    super(parent, info);
    this.miioModel = model;
    this.updateActions(actions);
  }

  /**
   * Emits an action if the data reports it.
   *
   * @param value The reported value
   * @param prefix A prefix for the action (e.g. the button)
   */
  protected reportAction(value: unknown, prefix = "") {
    if (value === undefined) return;
    const action = prefix + String(value);
    this.debug("Action performed:", action);
    this.emitAction(action);
  }
}

/** Wireless wall switch with one button (`lumi.86sw1`) */
export class Switch1 extends ActionSubDevice {
  static get types() {
    return ["controller", "wall-controller"];
  }

  readonly type = "controller";

  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.86sw1", ["click", "double_click"]);
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    this.reportAction(data["channel_0"]);
  }
}

/** Wireless wall switch with two buttons (`lumi.86sw2`) */
export class Switch2 extends ActionSubDevice {
  static get types() {
    return ["controller", "wall-controller"];
  }

  readonly type = "controller";

  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.86sw2", [
      "btn0-click",
      "btn0-double_click",
      "btn1-click",
      "btn1-double_click",
      "both_click",
    ]);
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    this.reportAction(data["channel_0"], "btn0-");
    this.reportAction(data["channel_1"], "btn1-");
    this.reportAction(data["dual_channel"]);
  }
}

/**
 * Cube controller (`lumi.cube`). Emits the actions: `alert` (woken up after being idle), `flip90`, `flip180`, `move`
 * (slid on its surface), `tap_twice`, `shake_air`, `free_fall` and `rotate` (with the `amount`).
 */
export class Cube extends ActionSubDevice {
  static get types() {
    return ["controller"];
  }

  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.cube", [
      "alert",
      "flip90",
      "flip180",
      "move",
      "tap_twice",
      "shake_air",
      "free_fall",
      "rotate",
    ]);
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    this.reportAction(data.status);

    if (typeof data.rotate === "string") {
      const amount = parseInt(
        data.rotate.substring(0, data.rotate.indexOf(",")),
        10,
      );
      this.debug("Action performed:", "rotate", amount);
      this.emitAction("rotate", { amount });
    }
  }
}

/** Wireless button, with a battery (`lumi.switch`, `lumi.switch.v2`) */
abstract class Button extends compose(ActionSubDevice, VoltageBattery) {
  static get types() {
    return ["controller", "button"];
  }

  constructor(
    parent: SubDeviceParent,
    info: SubDeviceInfo,
    model: string,
    actions: string[],
  ) {
    super(parent, info, model, actions);
    this.defineProperty("voltage");
  }

  _report(data: Record<string, unknown>) {
    super._report(data);
    this.reportAction(data.status);
  }
}

/** Wireless button (`lumi.switch`) */
export class Switch extends Button {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.switch", [
      "click",
      "double_click",
      "long_click_press",
      "long_click_release",
    ]);
  }
}

/** Aqara wireless button (`lumi.switch.v2`) */
export class SwitchV2 extends Button {
  constructor(parent: SubDeviceParent, info: SubDeviceInfo) {
    super(parent, info, "lumi.switch.v2", ["click", "double_click"]);
  }
}
