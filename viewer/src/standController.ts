import type { Actuator, BuiltModel } from "./types";

/** Opt-in muscle tone for servo-driven ragdolls. */
export class StandController {
  private readonly servos: Actuator[];
  private enabled = false;

  constructor(model: BuiltModel) {
    this.servos = (model.actuators ?? []).filter((actuator) => actuator.kind === "servo");
  }

  get active(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.servos.forEach((servo) => servo.set(0));
    this.enabled = true;
  }

  disable(): void {
    this.servos.forEach((servo) => servo.release?.());
    this.enabled = false;
  }
}
