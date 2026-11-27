import { MiioApi } from "../device";
import { compose } from "../things/compose";
import { MiioThing } from "../things/thing";
import { Children } from "../things/capabilities/children";
import { SwitchablePower } from "../things/capabilities/power";
import { Light } from "../things/capabilities/lights/light";
import { Dimmable } from "../things/capabilities/lights/brightness";
import { percentage } from "../things/values";
import type { ActionDefinition } from "../things/action_metadata";

import { Dimmable as MiioDimmable } from "./capabilities/dimmable";
import { Power as MiioPower } from "./capabilities/power";

/** The ambient (secondary) light of the lamp */
class AmbientLight extends compose(
  MiioThing,
  Light,
  Dimmable,
  SwitchablePower,
) {
  constructor(private readonly parent: EyecareLamp2) {
    super();
    this.id = parent.id + ":ambient";
  }

  changePower(power: boolean) {
    return this.parent.setAmbientPower(power);
  }

  changeBrightness(brightness: number) {
    return this.parent.setAmbientBrightness(brightness);
  }
}

export class EyecareLamp2 extends compose(
  MiioApi,
  Light,
  MiioPower,
  MiioDimmable,
  Children,
) {
  static actions: ActionDefinition[] = [
    {
      name: "eyeCare",
      description: "Whether eye care is on",
      returns: "boolean",
    },
    {
      name: "setEyeCare",
      description: "Switches eye care on or off",
      arguments: [{ type: "boolean", description: "Whether to switch it on" }],
    },
    {
      name: "setAmbientPower",
      description: "Switches the ambient light on or off",
      arguments: [{ type: "boolean", description: "Whether to switch it on" }],
    },
    {
      name: "setAmbientBrightness",
      description: "Changes the brightness of the ambient light",
      arguments: [{ type: "percentage", description: "The brightness" }],
    },
  ];

  static get type() {
    return "miio:eyecare-lamp2";
  }

  readonly ambient: AmbientLight;

  constructor(handle: ConstructorParameters<typeof MiioApi>[0]) {
    super(handle);

    this.defineProperty("power", {
      name: "power",
      mapper: (v: string) => v === "on",
    });

    this.defineProperty("bright", {
      name: "brightness",
      mapper: (v: string) => parseInt(v, 10),
    });

    // Get if the
    this.defineProperty("notifystatus", {
      name: "notifyStatus",
      mapper: (v: string) => v === "on",
    });

    // Power of the secondary light
    this.defineProperty("ambstatus", {
      name: "ambientPower",
      mapper: (v: string) => v === "on",
    });

    // Brightness of the secondary light
    this.defineProperty("ambvalue", {
      name: "ambientBrightness",
      mapper: (v: string) => parseInt(v, 10),
    });

    // If the main light is on
    this.defineProperty("eyecare", {
      name: "eyeCare",
      mapper: (v: string) => v === "on",
    });

    // The current user-defined scene
    this.defineProperty("scene_num", {
      name: "userScene",
      mapper: (v: number) => {
        switch (v) {
          case 1:
            return "study";
          case 2:
            return "reading";
          case 3:
            return "phone";
        }
      },
    });

    this.defineProperty("bls", {
      name: "bls",
      mapper: (v: string) => v === "on",
    });

    this.defineProperty("dvalue", {
      name: "dvalue",
      mapper: (v: string) => parseInt(v, 10),
    });

    this.ambient = new AmbientLight(this);
    this.addChild(this.ambient);
  }

  changePower(power: boolean) {
    return this.call("set_power", [power ? "on" : "off"], {
      refresh: true,
    });
  }

  changeBrightness(brightness: number) {
    return this.call("set_bright", [brightness], {
      refresh: true,
    }).then(MiioApi.checkOk);
  }

  /**
   * Is eyeCare active?
   */
  eyeCare() {
    return Promise.resolve(this.property("eyeCare"));
  }

  /**
   * Enable the eyeCare
   *
   * @param enable Whether to enable it
   */
  setEyeCare(enable: boolean) {
    return this.call("set_eyecare", [enable ? "on" : "off"], {
      refresh: true,
    }).then(() => null);
  }

  /*
   * Set the current eyeCare mode (not ported yet)
   *
	changeMode(mode) {
   
		switch (mode) {
			case 'study':
				mode = 1;
				break;
			case 'reading':
				mode = 2;
				break;
			case 'phone':
				mode = 3;
				break;
			default:
				return Promise.reject(new Error('Invalid EyeCare Mode: ' + mode));
		}
		return this.call('set_user_scene', [mode], {
			refresh: true
		});
	}
   */

  setAmbientPower(power: boolean) {
    return this.call("enable_amb", [power ? "on" : "off"], {
      refresh: ["ambientPower"],
    }).then(MiioApi.checkOk);
  }

  setAmbientBrightness(brightness: number | string) {
    const value = percentage(brightness, { min: 0, max: 100 });

    return this.call("set_amb_bright", [value], {
      refresh: ["ambientBrightness"],
    }).then(MiioApi.checkOk);
  }

  propertyUpdated(key: string, value: unknown, oldValue?: unknown) {
    super.propertyUpdated(key, value, oldValue);

    switch (key) {
      case "ambientPower":
        this.ambient.updatePower(value as boolean);
        break;
      case "ambientBrightness":
        this.ambient.updateBrightness(value as number);
        break;
    }
  }
}
