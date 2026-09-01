import type { Observer, Scene } from "@babylonjs/core";
import { PhysicsMotionType, Quaternion, Vector3 } from "@babylonjs/core";

interface PositionOwner {
  position: Vector3;
}

interface SuspensionBody {
  disablePreStep: boolean;
  transformNode: {
    position: Vector3;
    rotationQuaternion: Quaternion | null;
  };
  getMassProperties(): { mass?: number };
  setAngularVelocity(velocity: Vector3): void;
  setLinearVelocity(velocity: Vector3): void;
  setMotionType(motionType: PhysicsMotionType): void;
}

interface InitialTransform {
  position: Vector3;
  rotationQuaternion: Quaternion | null;
}

/** Playground 吊空控制：最大質量 body 是 anchor，lift 永遠相對於初始位置。 */
export class MotionSuspension {
  readonly anchor: SuspensionBody | null;
  private readonly originalPosition: Vector3;
  private readonly bodies: SuspensionBody[];
  private readonly initialTransforms = new Map<SuspensionBody, InitialTransform>();
  private syncObserver: Observer<Scene> | null = null;
  private enabled = false;

  constructor(
    private readonly scene: Scene,
    private readonly root: PositionOwner,
    bodies: Record<string, SuspensionBody>,
    private readonly lift = 0.3,
  ) {
    this.originalPosition = root.position.clone();
    this.bodies = Object.values(bodies);
    this.bodies.forEach((body) => {
      this.initialTransforms.set(body, {
        position: body.transformNode.position.clone(),
        rotationQuaternion: body.transformNode.rotationQuaternion?.clone() ?? null,
      });
    });
    this.anchor = this.bodies.reduce<SuspensionBody | null>((heaviest, body) => {
      const mass = body.getMassProperties().mass ?? 0;
      const heaviestMass = heaviest?.getMassProperties().mass ?? -Infinity;
      return mass > heaviestMass ? body : heaviest;
    }, null);
  }

  get active(): boolean {
    return this.enabled;
  }

  enable(): boolean {
    if (!this.anchor) return false;
    this.syncBodiesToRoot(
      this.originalPosition.add(new Vector3(0, this.lift, 0)),
      () => { this.anchor?.setMotionType(PhysicsMotionType.STATIC); },
      true,
    );
    this.enabled = true;
    return true;
  }

  disable(): void {
    if (!this.enabled || !this.anchor) return;
    this.anchor.setMotionType(PhysicsMotionType.DYNAMIC);
    this.syncBodiesToRoot(this.originalPosition);
    this.enabled = false;
  }

  dispose(): void {
    this.disable();
    this.cancelSync();
    this.bodies.forEach((body) => { body.disablePreStep = true; });
  }

  /** 與 motion_test 相同：所有 body 開兩個 pre-step，讓 Havok 吃到 root 位移。 */
  private syncBodiesToRoot(
    position: Vector3,
    afterSync?: () => void,
    restoreFactoryPose = false,
  ): void {
    this.cancelSync();
    this.bodies.forEach((body) => { body.disablePreStep = false; });
    this.root.position.copyFrom(position);
    if (restoreFactoryPose) {
      this.bodies.forEach((body) => {
        const initial = this.initialTransforms.get(body);
        if (!initial) return;
        body.transformNode.position.copyFrom(initial.position);
        if (initial.rotationQuaternion) {
          body.transformNode.rotationQuaternion ??= Quaternion.Identity();
          body.transformNode.rotationQuaternion.copyFrom(initial.rotationQuaternion);
        } else {
          body.transformNode.rotationQuaternion = null;
        }
        body.setLinearVelocity(Vector3.Zero());
        body.setAngularVelocity(Vector3.Zero());
      });
    }
    let steps = 0;
    this.syncObserver = this.scene.onAfterPhysicsObservable.add(() => {
      steps++;
      if (steps < 2) return;
      this.bodies.forEach((body) => { body.disablePreStep = true; });
      this.cancelSync();
      afterSync?.();
    });
  }

  private cancelSync(): void {
    if (!this.syncObserver) return;
    this.scene.onAfterPhysicsObservable.remove(this.syncObserver);
    this.syncObserver = null;
  }
}
