import { Capability } from "../capability";
import { code, type Code, type CodeInput } from "../values";

/** Emits actions (e.g. a button's `click`): `action` (`{ action, data }`) and `action:<action>` */
export class Actions extends Capability {
  static capability = "actions";
  static initialState: Record<string, unknown> = { actions: [] };

  /**
   * Emits an action.
   *
   * @param action The action
   * @param extra Its data
   */
  emitAction(action: string, extra: Record<string, unknown> = {}) {
    this.emitEvent("action", { action, data: extra }, { multiple: true });
    this.emitEvent(`action:${action}`, extra, { multiple: true });
  }

  actions(): Promise<Code[]> {
    return Promise.resolve(this.getState<Code[]>("actions"));
  }

  /**
   * Updates the available actions. Emits `actionsChanged`.
   *
   * @param actions The actions (see {@link code})
   */
  updateActions(actions: CodeInput[]) {
    const mapped = actions.map((a) => code(a));
    if (this.updateState("actions", mapped)) {
      this.emitEvent("actionsChanged", mapped);
    }
  }
}
