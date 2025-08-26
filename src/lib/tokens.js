"use strict";

const storage = require("node-persist");

/**
 * Shared storage for tokens of devices. Keeps a simple JSON file synced
 * with tokens connected to device ids.
 */
class Tokens {
  constructor() {
    this._storage = storage.initSync();
  }

  get(deviceId) {
    return this._storage.getItem(deviceId);
  }

  update(deviceId, token) {
    return this._storage.setItem(deviceId, token);
  }
}

module.exports = new Tokens();
