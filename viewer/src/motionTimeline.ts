export interface MotionTimeline {
  model: string;
  fps: number;
  frames: number;
  tracks: Record<string, number[]>;
}

/** 驗證 retarget 動作時間線；回傳值保留原資料但已完成 runtime narrowing。 */
export function validateMotionTimeline(
  value: unknown,
  model: string,
  servoActuatorIds: ReadonlySet<string>,
): MotionTimeline {
  if (!value || typeof value !== "object") throw new Error("timeline 必須是 JSON object");
  const candidate = value as Partial<MotionTimeline>;
  if (candidate.model !== model) {
    throw new Error(`timeline model ${String(candidate.model)} 與目前模型 ${model} 不符`);
  }
  if (!Number.isFinite(candidate.fps) || (candidate.fps ?? 0) <= 0) {
    throw new Error("timeline fps 必須是大於 0 的有限數字");
  }
  if (!Number.isInteger(candidate.frames) || (candidate.frames ?? -1) < 0) {
    throw new Error("timeline frames 必須是非負整數");
  }
  if (!candidate.tracks || typeof candidate.tracks !== "object" || Array.isArray(candidate.tracks)) {
    throw new Error("timeline tracks 必須是 object");
  }
  const frames = candidate.frames as number;
  for (const [id, samples] of Object.entries(candidate.tracks)) {
    if (!servoActuatorIds.has(id)) {
      throw new Error(`timeline track ${id} 不是目前模型宣告的 servo actuator id`);
    }
    if (!Array.isArray(samples) || samples.length !== frames) {
      throw new Error(`timeline track ${id} 長度 ${Array.isArray(samples) ? samples.length : "非陣列"}，應等於 frames ${frames}`);
    }
    if (!samples.every(Number.isFinite)) {
      throw new Error(`timeline track ${id} 含非 finite 數值`);
    }
  }
  return candidate as MotionTimeline;
}

/** 以誤差累積法把 timeline 幀換成固定 60Hz 物理步數。 */
export function frameStepCounts(fps: number, frames: number): number[] {
  const result: number[] = [];
  let remainder = 0;
  for (let frame = 0; frame < frames; frame++) {
    remainder += 60 / fps;
    const steps = Math.floor(remainder + Number.EPSILON);
    result.push(steps);
    remainder -= steps;
  }
  return result;
}

/** render-loop 使用的幀時鐘；大幅掉幀時會補送中間幀，不跳過 servo 指令。 */
export class MotionTimelinePlayer {
  private frame = 0;
  private elapsed = 0;
  playing = false;

  constructor(private readonly timeline: MotionTimeline) {}

  start(applyFrame: (frame: number) => void): boolean {
    this.frame = 0;
    this.elapsed = 0;
    this.playing = this.timeline.frames > 0;
    if (this.playing) applyFrame(0);
    return this.playing;
  }

  tick(deltaSeconds: number, applyFrame: (frame: number) => void): boolean {
    if (!this.playing) return false;
    const frameDuration = 1 / this.timeline.fps;
    this.elapsed += Math.max(0, deltaSeconds);
    while (this.elapsed + Number.EPSILON >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frame++;
      if (this.frame >= this.timeline.frames) {
        this.stop();
        return true;
      }
      applyFrame(this.frame);
    }
    return false;
  }

  stop(): void {
    this.playing = false;
    this.frame = 0;
    this.elapsed = 0;
  }
}
