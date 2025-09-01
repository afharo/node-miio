import storage from "node-persist";

/**
 * Shared storage for tokens of devices. Keeps a simple JSON file synced
 * with tokens connected to device ids.
 */
class Tokens {
  private initialized = false;

  async get(deviceId: string): Promise<Buffer> {
    if (!this.initialized) {
      this.initialized = true;
      await storage.init();
    }
    return storage.getItem(deviceId);
  }

  async update(deviceId: string, token: Buffer) {
    if (!this.initialized) {
      this.initialized = true;
      await storage.init();
    }
    return storage.setItem(deviceId, token);
  }
}

export const tokens = new Tokens();
