import { checkResult } from "../../check_result.js";
import type { ActionDefinition } from "../../things/action_metadata.js";

import { Vacuum } from "./vacuum.js";

export class MijiaVacuum extends Vacuum {
  static actions: ActionDefinition[] = [
    {
      name: "cleanRooms",
      description: "Cleans the given rooms (segment ids from getRoomMap)",
      arguments: [{ type: "number[]", description: "The segment ids" }],
    },
  ];

  async cleanRooms(listOfRooms) {
    try {
      await super.cleanRooms(listOfRooms);
    } catch (_err) {
      // From https://github.com/rytilahti/python-miio/issues/550#issuecomment-552780952
      return this.call(
        "set_mode_withroom",
        [0, 1, listOfRooms.length].concat(listOfRooms),
        {
          refresh: ["state"],
          refreshDelay: 1000,
        },
      ).then(checkResult);
    }
  }
}
