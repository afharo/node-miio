"use strict";

const { Thing } = require("abstract-things");
const {
  Temperature,
  RelativeHumidity,
  PM2_5,
  Illuminance,
  AtmosphericPressure,
  PowerLoad,
  PowerConsumed,
} = require("abstract-things/sensors");

/**
 * Creates a mixin that updates a sensor capability when a property changes.
 *
 * @param {Function} Type The abstract-things sensor capability
 * @param {string} updateName The update method of the capability (e.g. `updateTemperature`)
 * @param {string} property The property that holds the value
 */
function bind(Type, updateName, property) {
  return Thing.mixin(
    (Parent) =>
      class extends Parent.with(Type) {
        propertyUpdated(key, value) {
          if (key === property) {
            this[updateName](value);
          }

          super.propertyUpdated(key, value);
        }
      },
  );
}

module.exports.Temperature = bind(
  Temperature,
  "updateTemperature",
  "temperature",
);
module.exports.Humidity = bind(
  RelativeHumidity,
  "updateRelativeHumidity",
  "humidity",
);
module.exports.Illuminance = bind(
  Illuminance,
  "updateIlluminance",
  "illuminance",
);
module.exports.AQI = bind(PM2_5, "updatePM2_5", "aqi");
module.exports.AtmosphericPressure = bind(
  AtmosphericPressure,
  "updateAtmosphericPressure",
  "atmosphericPressure",
);
module.exports.PowerLoad = bind(PowerLoad, "updatePowerLoad", "powerLoad");
module.exports.PowerConsumed = bind(
  PowerConsumed,
  "updatePowerConsumed",
  "poweConsumed",
);

/**
 * Setup sensor support for a device.
 *
 * @param {object} device The device
 * @param {object} options The sensor options
 */
function mixin(device, options) {
  if (device.capabilities.indexOf("sensor") < 0) {
    device.capabilities.push("sensor");
  }

  device.capabilities.push(options.name);
  Object.defineProperty(device, options.name, {
    get: function () {
      return this.property(options.name);
    },
  });
}

module.exports.extend = mixin;
