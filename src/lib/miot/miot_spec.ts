/**
 * Types and helpers for MIoT specs, as published on https://miot-spec.org/miot-spec-v2/instance?type=<urn>
 *
 * - `services[].iid` is the `siid`
 * - `services[].properties[].iid` is the `piid`
 * - `services[].actions[].iid` is the `aiid`, and `in`/`out` are lists of `piid`s of the same service
 */

export interface MiotValueListItem {
  value: number;
  description: string;
}

export interface MiotProperty {
  iid: number;
  type: string;
  description: string;
  format: string;
  access: string[];
  unit?: string;
  "value-list"?: MiotValueListItem[];
  "value-range"?: [number, number, number];
}

export interface MiotAction {
  iid: number;
  type: string;
  description: string;
  in: number[];
  out: number[];
}

export interface MiotService {
  iid: number;
  type: string;
  description: string;
  properties?: MiotProperty[];
  actions?: MiotAction[];
}

export interface MiotSpec {
  type: string;
  description: string;
  services: MiotService[];
}

/** The namespace of the standard (non vendor-specific) definitions */
export const STANDARD_NAMESPACE = "miot-spec-v2";

export interface ParsedUrn {
  /** e.g. `miot-spec-v2` (standard) or `dreame-spec` (vendor-specific) */
  namespace: string;
  /** e.g. `service`, `property`, `action` or `device` */
  kind: string;
  /** e.g. `vacuum`, `battery-level` */
  name: string;
}

/**
 * Parses a MIoT URN like `urn:miot-spec-v2:property:battery-level:00000014:dreame-p2008:1`.
 *
 * @param urn The URN to parse
 * @returns The namespace, kind and name of the URN
 */
export function parseUrn(urn: string): ParsedUrn {
  const [, namespace = "", kind = "", name = ""] = urn.split(":");
  return { namespace, kind, name };
}

export interface ResolvedProperty {
  siid: number;
  piid: number;
  service: MiotService;
  property: MiotProperty;
}

export interface ResolvedAction {
  siid: number;
  aiid: number;
  service: MiotService;
  action: MiotAction;
}

/**
 * Helper to look up the standard services, properties and actions of a spec by name.
 * Only definitions in the standard namespace are matched, so vendor-specific ones with the same name don't collide.
 */
export class MiotSpecIndex {
  constructor(public readonly spec: MiotSpec) {}

  /**
   * All standard services with the given name (some services, like `brush-cleaner`, can appear more than once).
   *
   * @param serviceName The name of the service (e.g. `vacuum`)
   * @returns The matching services
   */
  services(serviceName: string): MiotService[] {
    return this.spec.services.filter((service) => {
      const urn = parseUrn(service.type);
      return urn.namespace === STANDARD_NAMESPACE && urn.name === serviceName;
    });
  }

  /**
   * Finds a standard property.
   *
   * @param serviceName The name of the service (e.g. `vacuum`)
   * @param propertyName The name of the property (e.g. `status`)
   * @returns The first match, or `undefined`
   */
  property(
    serviceName: string,
    propertyName: string,
  ): ResolvedProperty | undefined {
    for (const service of this.services(serviceName)) {
      const property = service.properties?.find((p) => {
        const urn = parseUrn(p.type);
        return (
          urn.namespace === STANDARD_NAMESPACE && urn.name === propertyName
        );
      });
      if (property) {
        return { siid: service.iid, piid: property.iid, service, property };
      }
    }
    return undefined;
  }

  /**
   * Finds a standard action.
   *
   * @param serviceName The name of the service (e.g. `vacuum`)
   * @param actionName The name of the action (e.g. `start-sweep`)
   * @returns The first match, or `undefined`
   */
  action(serviceName: string, actionName: string): ResolvedAction | undefined {
    for (const service of this.services(serviceName)) {
      const action = service.actions?.find((a) => {
        const urn = parseUrn(a.type);
        return urn.namespace === STANDARD_NAMESPACE && urn.name === actionName;
      });
      if (action) {
        return { siid: service.iid, aiid: action.iid, service, action };
      }
    }
    return undefined;
  }
}

/**
 * Whether the property can be read.
 *
 * @param property The property definition
 * @returns `true` if readable
 */
export function isReadable(property: MiotProperty): boolean {
  return property.access.includes("read");
}

/**
 * Whether the property can be written.
 *
 * @param property The property definition
 * @returns `true` if writable
 */
export function isWritable(property: MiotProperty): boolean {
  return property.access.includes("write");
}

/**
 * Whether a value read from the device is valid for the property: within its `value-range`, and not negative for
 * unsigned formats. Some devices answer `code: 0` with a sentinel (e.g. `-1` for the battery level of
 * `xiaomi.vacuum.d101`) when the value is not available.
 * The `value-list` is not checked, so unknown values (e.g. a new status) can still be reported.
 *
 * @param property The property definition
 * @param value The value read from the device
 * @returns `true` if the value can be used
 */
export function isValidValue(property: MiotProperty, value: unknown): boolean {
  if (typeof value !== "number") return true;
  if (Number.isNaN(value)) return false;
  if (property.format.startsWith("uint") && value < 0) return false;
  const range = property["value-range"];
  if (range && (value < range[0] || value > range[1])) return false;
  return true;
}
