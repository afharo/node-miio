// Compiled against the published types (`npm run test:types`), the way the plugins use node-miio.
// It isn't run: it only has to type-check.
import * as miio from "node-miio";
import {
  configureLogging,
  isVacuum,
  MiotVacuum,
  Vacuum,
  type ErrorChangedEvent,
  type MiioLogger,
  type StateChangedEvent,
  type VacuumDevice,
  type VacuumMode,
} from "node-miio";

const logger: MiioLogger = { debug: (message: string) => console.log(message) };
configureLogging({ logger });

export async function connect(address: string, token: string) {
  const device = await miio.device({ address, token, logger });
  if (!isVacuum(device)) {
    return undefined;
  }
  return useVacuum(device);
}

async function useVacuum(device: VacuumDevice) {
  const model: string | undefined = device.miioModel;
  device.on("stateChanged", (change: StateChangedEvent) =>
    console.log(model, change.key, change.value),
  );
  device.on("errorChanged", (error: ErrorChangedEvent) =>
    console.log(error?.id, error?.description),
  );
  if (!device.connected) {
    return undefined;
  }

  await device.poll();
  const state: string | undefined = device.property<string>("state");
  const props: Record<string, unknown> = device.properties;
  console.log(state, props, device.matches("type:vaccuum"));

  // Common vacuum API
  const fanSpeeds: VacuumMode[] = await device.fanSpeeds();
  const waterBoxModes: VacuumMode[] = await device.waterBoxModes();
  console.log(fanSpeeds[0]?.value, fanSpeeds[0]?.name, waterBoxModes);
  await device.activateCleaning();
  await device.pause();
  await device.activateCharging();
  await device.find();
  await device.changeFanSpeed(fanSpeeds[0].value);
  await device.cleanRooms([16, 17]);
  const info = await device.getDeviceInfo();
  const serial: string = await device.getSerialNumber();
  console.log(info, serial, await device.getRoomMap(), await device.getTimer());

  // Roborock-only API
  if (device instanceof Vacuum) {
    await device.cleanRooms([16], { repeat: 2 });
    await device.cleanZones([[25500, 25500, 26500, 26500, 1]]);
    await device.sendToLocation(25500, 25500);
    await device.startDustCollection();
    await device.startMopWash();
    await device.startMopDrying();
    const maps: Array<{ id: number; name: string }> = await device.getMaps();
    const waterBoxMode: number | undefined = await device.getWaterBoxMode();
    console.log(maps, waterBoxMode, device.property<boolean>("waterShortage"));
  }

  // MIoT-only API
  if (device instanceof MiotVacuum) {
    const types = await device.cleaningTypes();
    await device.setCleaningType(types[0].value);
  }

  device.destroy();
}

// Roborock app accounts (experimental): list the robots
export async function roborockDevices() {
  const session = await miio.loadRoborockSession();
  if (!session) return [];
  const devices: miio.RoborockDevice[] = await new miio.RoborockWebApi(
    session,
  ).getDevices();
  return devices.map(
    ({ model, protocolVersion }) => `${model} ${protocolVersion}`,
  );
}

// Roborock app robots over the local network (experimental)
export async function roborockStatus(address: string) {
  const session = await miio.loadRoborockSession();
  if (!session) return;
  const home = await new miio.RoborockWebApi(session).getHomeData();
  const [robot] = miio.toDevices(home);
  const mqtt = new miio.RoborockMqttSession(session.userData.rriot);
  const device = await miio.roborockDevice({
    duid: robot.duid,
    localKey: robot.localKey,
    model: robot.model ?? "roborock.vacuum.a296",
    address,
    mqtt,
    localProtocolVersion: "L01",
  });
  if (device instanceof Vacuum) {
    const rooms: miio.RoborockRoom[] = miio.roomNames(
      await device.getRoomMap(),
      home.rooms,
    );
    console.log(await device.batteryLevel(), rooms[0]?.name);
    const map = await miio.roborockApiOf(device)?.getMap();
    console.log(
      map?.currentRoom,
      miio.roborockApiOf(device)?.localProtocolVersion,
    );
  }
  await device.destroy();
  await mqtt.close();
}
