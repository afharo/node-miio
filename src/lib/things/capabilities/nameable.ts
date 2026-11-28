import { Capability } from "../capability.js";
import type { ActionDefinition } from "../action_metadata.js";

/** Its name can be changed. Implement `changeName(name)`. */
export class Nameable extends Capability {
  static capability = "nameable";
  static actions: ActionDefinition[] = [
    {
      name: "setName",
      description: "Changes the name",
      arguments: [{ type: "string", description: "The name" }],
      returns: "string",
    },
  ];

  /**
   * Changes the name.
   *
   * @param name The name
   * @returns The new name
   */
  async setName(name: string): Promise<string | undefined> {
    await this.changeName(name);
    return this.metadata.name;
  }

  /**
   * Changes the name of the device. Implemented by the devices.
   *
   * @param _name The name
   */
  changeName(_name: string): Promise<unknown> {
    throw new Error("changeName has not been implemented");
  }
}
