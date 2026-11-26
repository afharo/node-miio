import { Capability } from "../capability";

/** Its name can be changed. Implement `changeName(name)`. */
export class Nameable extends Capability {
  static capability = "nameable";

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
