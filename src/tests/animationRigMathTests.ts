import { solveTwoBoneIK } from '../modes/animation/IKSolver';
import { aimBoneQuaternion, quaternionFromTo } from '../modes/animation/QuaternionAim';
import { evaluateRigWorldTransforms, rotateByQuaternion } from '../modes/animation/RigTransformEvaluator';
import type { AnimationRig } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
function near(a: number, b: number, epsilon = 1e-6): boolean { return Math.abs(a - b) <= epsilon; }
function nearVec(a: [number, number, number], b: [number, number, number], epsilon = 1e-6): boolean { return near(a[0], b[0], epsilon) && near(a[1], b[1], epsilon) && near(a[2], b[2], epsilon); }
async function test(name: string, fn: () => void | Promise<void>): Promise<Result> { try { await fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

const pose = (position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0]) => ({ position, rotation, scale: [1, 1, 1] as [number, number, number] });

export async function runAnimationRigMathTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Quaternion aim maps the native +Y bone axis onto target direction', () => {
    const quaternion = aimBoneQuaternion([0, 0, 0], [1, 0, 0]);
    assert(quaternion, 'aim quaternion missing');
    const direction = rotateByQuaternion([0, 1, 0], quaternion!);
    assert(nearVec(direction, [1, 0, 0]), `unexpected aimed direction ${direction.join(',')}`);
  }));

  results.push(await test('Quaternion from-to handles anti-parallel vectors deterministically', () => {
    const quaternion = quaternionFromTo([0, 1, 0], [0, -1, 0]);
    assert(quaternion, 'anti-parallel quaternion missing');
    const direction = rotateByQuaternion([0, 1, 0], quaternion!);
    assert(nearVec(direction, [0, -1, 0]), `anti-parallel rotation failed ${direction.join(',')}`);
  }));

  results.push(await test('Two-bone IK preserves maximum reach for a distant target', () => {
    const solved = solveTwoBoneIK({ root: [0, 0, 0], target: [10, 0, 0], upperLength: 2, lowerLength: 3 });
    assert(!solved.reachable, 'distant target should be unreachable');
    assert(near(Math.hypot(...solved.end), 5), 'end must clamp to maximum chain reach');
    assert(near(Math.hypot(solved.joint[0], solved.joint[1], solved.joint[2]), 2), 'upper bone length changed');
  }));

  results.push(await test('Two-bone IK preserves minimum reach for a near target', () => {
    const solved = solveTwoBoneIK({ root: [0, 0, 0], target: [0.1, 0, 0], upperLength: 3, lowerLength: 1 });
    assert(!solved.reachable, 'near target inside minimum reach should be unreachable');
    assert(near(Math.hypot(...solved.end), 2), 'end must clamp to minimum chain reach');
  }));

  results.push(await test('Pole target controls the IK bend side', () => {
    const positive = solveTwoBoneIK({ root: [0, 0, 0], target: [3, 0, 0], pole: [0, 1, 0], upperLength: 2, lowerLength: 2 });
    const negative = solveTwoBoneIK({ root: [0, 0, 0], target: [3, 0, 0], pole: [0, -1, 0], upperLength: 2, lowerLength: 2 });
    assert(positive.joint[1] > 0 && negative.joint[1] < 0, 'pole target should flip the bend plane');
  }));

  results.push(await test('Rig hierarchy composes parent quaternion into connected child world transform', () => {
    const rig: AnimationRig = {
      id: 'rig', name: 'Rig', objectId: 'object', bones: [
        { id: 'root', name: 'Root', length: 2, connected: false, ikFk: 'FK', pose: pose([0, 0, 0], [0, 0, Math.PI / 2]) },
        { id: 'child', name: 'Child', parentId: 'root', length: 1, connected: true, ikFk: 'FK', pose: pose() },
      ],
    };
    const world = evaluateRigWorldTransforms(rig);
    assert(nearVec(world.bones.root.tail, [-2, 0, 0]), `root tail mismatch ${world.bones.root.tail.join(',')}`);
    assert(nearVec(world.bones.child.head, world.bones.root.tail), 'connected child must start at parent tail');
    assert(nearVec(world.bones.child.tail, [-3, 0, 0]), `child did not inherit parent orientation ${world.bones.child.tail.join(',')}`);
  }));

  results.push(await test('Rig evaluator rejects hierarchy cycles', () => {
    const rig: AnimationRig = {
      id: 'cycle', name: 'Cycle', objectId: 'object', bones: [
        { id: 'a', name: 'A', parentId: 'b', length: 1, connected: true, ikFk: 'FK', pose: pose() },
        { id: 'b', name: 'B', parentId: 'a', length: 1, connected: true, ikFk: 'FK', pose: pose() },
      ],
    };
    let rejected = false;
    try { evaluateRigWorldTransforms(rig); } catch { rejected = true; }
    assert(rejected, 'cycle must be rejected explicitly');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
