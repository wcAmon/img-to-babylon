import type {
  Mesh,
  Physics6DoFConstraint,
  PhysicsBody,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

/** M4 可動物件契約：spec 有 actuation 宣告的模型必須逐項掛上對應 actuator。
 * 統一數值介面讓 playground 與 gate 不需認得個別模型：
 *   drive: set(-1..1) = targetSpeed 的比例；steer/servo: set(rad) 目標角（夾限位）；
 *   light: set(0|1)。drive/servo 馬達採惰性啟動——第一次 set 前完全不影響物理
 *   （否則 velocity 馬達目標 0 會鎖死自由滾動、position 馬達會撐住 ragdoll）；
 *   steer 例外：出廠即置中（回正彈簧），自由甩動的前軸會犁地毀掉滾動。 */
export interface Actuator {
  id: string; // "drive" | "steer" | `servo:<bodyB>.<axis>` | `light:<componentId>` | `rupture:<bodyId>` | `pour:<bodyId>` | `collect:<bodyId>`
  kind: "drive" | "steer" | "servo" | "light" | "rupture" | "pour" | "collect";
  label: string;
  min: number;
  max: number;
  set(value: number): void;
  /** Optional physical release for actuators whose motor can be disengaged. */
  release?(): void;
}

export interface StandBalance {
  leanGain: number;
  driftGain: number;
  pitchServos: Array<{
    id: string;
    sign: number;
  }>;
  supportBodyIds?: string[];
  pitch?: StandBalanceAxis;
  roll?: StandBalanceAxis;
  feedforward?: {
    pitch?: StandBalanceFeedforwardAxis;
    roll?: StandBalanceFeedforwardAxis;
  };
}

export interface StandBalanceFeedforwardAxis {
  /** Open-loop COM displacement per radian of actuator command, in world units. */
  gain: number;
  maxOutput: number;
  servos: Array<{
    id: string;
    sign: number;
  }>;
}

export interface StandBalanceAxis {
  proportionalGain: number;
  derivativeGain: number;
  integralGain?: number;
  integralMaxOutput?: number;
  /** 目標移動中的漏積分時間常數（秒）；靜止時不漏。0/未設＝純限幅積分。 */
  integralLeakSeconds?: number;
  leanGain?: number;
  servos: Array<{
    id: string;
    sign: number;
  }>;
  /** Optional asymmetric actuator mix used while the COM error is negative. */
  negativeErrorServos?: Array<{
    id: string;
    sign: number;
  }>;
}

export interface BuiltModel {
  physicsScale: number;
  root: TransformNode;
  nodes: Record<string, TransformNode>;
  meshes: Record<string, Mesh>;
  bodies: Record<string, PhysicsBody>;
  constraints: Physics6DoFConstraint[];
  actuators?: Actuator[];
  balance?: StandBalance;
  factoryPose?: {
    rootPosition: Vector3;
    bodies: Record<string, {
      position: Vector3;
      rotationQuaternion: Quaternion | null;
    }>;
  };
  dispose(): void;
}

export interface ModelOptions {
  physics?: boolean;
  physicsScale?: number;
}

export type ModelFactory = (scene: Scene, opts?: ModelOptions) => BuiltModel;
