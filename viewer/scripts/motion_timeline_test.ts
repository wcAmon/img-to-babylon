import assert from "node:assert/strict";
import {
  frameStepCounts,
  MotionTimelinePlayer,
  validateMotionTimeline,
} from "../src/motionTimeline";

const servoIds = new Set(["servo:head.x", "servo:head.y"]);

const valid = validateMotionTimeline({
  model: "action-figure",
  fps: 24,
  frames: 3,
  tracks: {
    "servo:head.x": [0, 0.1, 0.2],
    "servo:head.y": [0, -0.1, -0.2],
  },
}, "action-figure", servoIds);
assert.deepEqual(valid, {
  model: "action-figure",
  fps: 24,
  frames: 3,
  tracks: {
    "servo:head.x": [0, 0.1, 0.2],
    "servo:head.y": [0, -0.1, -0.2],
  },
});

assert.throws(
  () => validateMotionTimeline({ ...valid, model: "toy-racer" }, "action-figure", servoIds),
  /model.*toy-racer.*action-figure/,
);
assert.throws(
  () => validateMotionTimeline({ ...valid, tracks: { drive: [0, 0, 0] } }, "action-figure", servoIds),
  /drive.*servo actuator/,
);
assert.throws(
  () => validateMotionTimeline({
    ...valid,
    tracks: { "servo:head.x": [0, 0.1] },
  }, "action-figure", servoIds),
  /servo:head.x.*2.*frames.*3/,
);
assert.throws(
  () => validateMotionTimeline({ ...valid, fps: 0 }, "action-figure", servoIds),
  /fps/,
);
assert.throws(
  () => validateMotionTimeline({
    ...valid,
    tracks: { "servo:head.x": [0, Number.NaN, 0] },
  }, "action-figure", servoIds),
  /finite/,
);

assert.deepEqual(frameStepCounts(24, 4), [2, 3, 2, 3]);
assert.deepEqual(frameStepCounts(20, 3), [3, 3, 3]);
assert.equal(frameStepCounts(24, 24).reduce((a, b) => a + b, 0), 60);

const applied: number[] = [];
const player = new MotionTimelinePlayer(valid);
assert.equal(player.start((frame) => applied.push(frame)), true);
assert.deepEqual(applied, [0]);
assert.equal(player.tick(1 / 24, (frame) => applied.push(frame)), false);
assert.deepEqual(applied, [0, 1]);
assert.equal(player.tick(2 / 24, (frame) => applied.push(frame)), true);
assert.deepEqual(applied, [0, 1, 2]);
assert.equal(player.playing, false);

const loopedFrames: number[] = [];
const loopingPlayer = new MotionTimelinePlayer(valid);
loopingPlayer.loop = true;
assert.equal(loopingPlayer.start((frame) => loopedFrames.push(frame)), true);
assert.equal(loopingPlayer.tick(4.5 / 24, (frame) => loopedFrames.push(frame)), false);
assert.equal(loopingPlayer.playing, true);
assert.deepEqual(loopedFrames, [0, 1, 2, 0, 1]);

const nonLoopingPlayer = new MotionTimelinePlayer(valid);
nonLoopingPlayer.loop = false;
nonLoopingPlayer.start(() => undefined);
assert.equal(nonLoopingPlayer.tick(3 / 24, () => undefined), true);
assert.equal(nonLoopingPlayer.playing, false);

player.start((frame) => applied.push(frame));
player.stop();
assert.equal(player.playing, false);

console.log("motion timeline tests: pass");
