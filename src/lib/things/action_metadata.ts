/** An argument of an action */
export interface ActionArgument {
  /** Its type, e.g. `boolean`, `percentage`, `mode`, `color`, `string` */
  type: string;
  optional?: boolean;
  description?: string;
}

/**
 * An action a capability (or a device class) offers: a method that can be called from outside, e.g. with
 * `node-miio control <device> <action> [args]`. `node-miio inspect` lists them, grouped by capability.
 *
 * Declare them with `static actions = [...]` on the class that adds the method. A class that overrides a method with
 * different arguments declares it again.
 */
export interface ActionDefinition {
  name: string;
  description?: string;
  arguments?: ActionArgument[];
  /** What it resolves to, e.g. `boolean` */
  returns?: string;
}

/** An action of a thing, as `metadata.actions` lists it */
export interface ActionMetadata {
  name: string;
  description?: string;
  arguments: ActionArgument[];
  returns?: string;
  /** The capabilities and types that declare it (`cap:switchable-power`, `type:miio`…) */
  tags: string[];
}

/**
 * Adds the actions a class declares to the ones collected so far. An action declared again (by a class that overrides
 * it) takes the new definition and keeps the previous tags.
 *
 * @param actions The actions collected so far, by name
 * @param definitions The actions the class declares
 * @param tags The tags of the class (`cap:<capability>`, `type:<type>`)
 */
export function addActions(
  actions: Map<string, ActionMetadata>,
  definitions: readonly ActionDefinition[],
  tags: readonly string[],
) {
  for (const definition of definitions) {
    const previous = actions.get(definition.name);
    actions.set(definition.name, {
      ...definition,
      arguments: definition.arguments ?? [],
      tags: [...new Set([...(previous?.tags ?? []), ...tags])],
    });
  }
}
