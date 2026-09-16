import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Entity, World } from 'koota';
import { mat4, quat, vec3, type Mat4 } from 'math';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  PCFShadowMap,
  type DirectionalLight,
} from 'three';
import { createMatrixUpdater } from './matrices';
import { IsRain } from '../rain/traits';
import { Health } from '../enemy/traits';
import { Game } from '../game/traits';
import { recordMeasurement } from '../metrics/actions';
import { Metrics } from '../metrics/traits';
import { Blast, Debris, Projectile } from '../projectile/traits';
import { stepGame } from '../schedule';
import { laneOrigin, padPosition, pathPoint } from '../setup/setups';
import { Scenario } from '../setup/traits';
import { Burning, Slowed } from '../status/traits';
import { TargetGrid } from '../targeting/traits';
import { BuildPads, Tower } from '../tower/traits';
import { Appearance, Children, Position, Velocity, WorldMatrix } from '../transform/traits';

export function GameRenderer({
  world,
  lane,
  speed,
  selected,
  onPad,
  onTower,
}: {
  world: World;
  lane: number;
  speed: number;
  selected?: Entity;
  onPad: (pad: number) => void;
  onTower: (entity: Entity) => void;
}) {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{
        position: [33, 39, 41],
        fov: 42,
        near: 0.1,
        far: 450,
        matrixAutoUpdate: false,
        matrixWorldAutoUpdate: false,
      }}
      gl={{ antialias: true }}
      scene={{ matrixAutoUpdate: false, matrixWorldAutoUpdate: false }}
    >
      <color attach="background" args={['#c5d8d3']} />
      <fog attach="fog" args={['#c5d8d3', 200, 400]} />
      <ambientLight intensity={1.5} />
      <hemisphereLight args={['#e7f8ff', '#85795b', 1.4]} />
      <directionalLight
        castShadow
        position={[-15, 35, 20]}
        intensity={2.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-normalBias={0.04}
      />
      <CameraFraming />
      <ManualMatrices world={world} />
      <Simulation world={world} speed={speed} />
      <Terrain lane={lane} onPad={onPad} />
      <Actors world={world} lane={lane} onTower={onTower} />
      <Rain world={world} />
      <TowerRange world={world} lane={lane} selected={selected} />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI * 0.46}
        minDistance={15}
        maxDistance={220}
        enablePan={false}
        enableDamping
      />
    </Canvas>
  );
}

function CameraFraming() {
  const { camera, size } = useThree();
  useEffect(() => {
    const distance = Math.max(1, 1.1 / (size.width / size.height));
    const position = vec3.fromValues(33 * distance, 39 * distance, 41 * distance);
    const matrix = mat4.targetTo(mat4.create(), position, [0, 0, 0], [0, 1, 0]);
    camera.position.fromArray(position);
    camera.quaternion.fromArray(mat4.getRotation(quat.create(), matrix));
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function ManualMatrices({ world }: { world: World }) {
  const { scene, camera } = useThree();
  const matrices = useMemo(() => createMatrixUpdater(), []);
  useLayoutEffect(() => {
    const releases = [matrices.bindCamera(camera)];
    scene.traverse((object) => {
      if ((object as DirectionalLight).isDirectionalLight)
        releases.push(matrices.bindCamera((object as DirectionalLight).shadow.camera));
    });
    matrices.updateTree(scene);
    return () => {
      for (const release of releases) release();
    };
  }, [scene, camera, matrices]);
  // OrbitControls runs at -1. Rain reads the camera after this synchronization.
  useFrame(() => {
    const measuring = world.get(Metrics)!.enabled;
    const started = measuring ? performance.now() : 0;
    matrices.updateTree(scene);
    matrices.updateTree(camera);
    if (measuring) recordMeasurement(world, 'sync-scene', 'render', performance.now() - started);
  }, -0.75);
  return null;
}

function Simulation({ world, speed }: { world: World; speed: number }) {
  const accumulator = useRef(0);
  useFrame((_, delta) => {
    if (world.get(Game)!.paused || world.get(Game)!.phase !== 'running') {
      accumulator.current = 0;
      return;
    }
    accumulator.current = Math.min(0.25, accumulator.current + delta * speed);
    let steps = 0;
    const started = performance.now();
    while (accumulator.current >= 1 / 60 && steps < 8) {
      if (!stepGame(world)) {
        accumulator.current = 0;
        break;
      }
      accumulator.current -= 1 / 60;
      steps++;
      if (performance.now() - started >= 8) break;
    }
  }, -2);
  return null;
}

function Terrain({ lane, onPad }: { lane: number; onPad: (pad: number) => void }) {
  return (
    <group>
      <mesh receiveShadow position={[0, -1, 0]}>
        <boxGeometry args={[50, 2, 20]} />
        <meshStandardMaterial color="#ad9170" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[50, 0.25, 20]} />
        <meshStandardMaterial color="#e4d3ad" roughness={1} />
      </mesh>
      {Array.from({ length: 64 }, (_, index) => {
        const distance = (index * 44) / 63;
        const point = pathPoint(distance);
        return (
          <group
            key={index}
            position={[point.x, 0.17, point.z]}
            rotation={[0, -Math.atan(Math.cos(distance * 0.19) * 0.665), 0]}
          >
            <mesh receiveShadow>
              <boxGeometry args={[0.91, 0.09, 5.5]} />
              <meshStandardMaterial color={index % 3 === 0 ? '#5e7271' : '#607876'} roughness={1} />
            </mesh>
            {index % 4 === 0 && (
              <mesh position={[0, 0.06, 0]}>
                <boxGeometry args={[0.3, 0.025, 0.08]} />
                <meshBasicMaterial color="#c8d0ad" />
              </mesh>
            )}
          </group>
        );
      })}
      {Array.from({ length: 16 }, (_, pad) => (
        <BuildPad key={`${lane}-${pad}`} pad={pad} onClick={() => onPad(pad)} />
      ))}
      {Array.from({ length: 18 }, (_, index) => {
        const x = -23 + ((index * 7.3) % 46);
        const z = (index % 2 ? -1 : 1) * (7.5 + (index % 3) * 0.5);
        return (
          <mesh
            key={index}
            castShadow
            position={[x, 0.3 + (index % 3) * 0.1, z]}
            rotation={[0, index * 0.6, 0]}
          >
            <boxGeometry args={[0.6 + (index % 3) * 0.25, 0.6 + (index % 2) * 0.3, 0.7]} />
            <meshStandardMaterial color={index % 2 ? '#a9aa83' : '#c1b08b'} roughness={1} />
          </mesh>
        );
      })}
      <group position={[-23, 0.3, 0]}>
        <mesh castShadow position={[0, 1.1, -3.1]}>
          <boxGeometry args={[1.1, 2.4, 0.8]} />
          <meshStandardMaterial color="#654c56" />
        </mesh>
        <mesh castShadow position={[0, 1.1, 3.1]}>
          <boxGeometry args={[1.1, 2.4, 0.8]} />
          <meshStandardMaterial color="#654c56" />
        </mesh>
        <mesh castShadow position={[0, 2.5, 0]}>
          <boxGeometry args={[1.1, 0.6, 7.3]} />
          <meshStandardMaterial color="#654c56" />
        </mesh>
        <mesh position={[-0.1, 1.2, 0]}>
          <boxGeometry args={[0.1, 2.4, 5.8]} />
          <meshBasicMaterial color="#df7b76" transparent opacity={0.55} />
        </mesh>
      </group>
      <group position={[23, 0.3, pathPoint(44).z]}>
        <mesh castShadow position={[0, 0.8, 0]}>
          <boxGeometry args={[2.2, 1.6, 3.6]} />
          <meshStandardMaterial color="#3c6364" />
        </mesh>
        <mesh castShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[1.4, 0.7, 2.8]} />
          <meshStandardMaterial color="#477e76" />
        </mesh>
        <mesh position={[0, 2.7, 0]} rotation={[0, Math.PI / 4, 0]}>
          <octahedronGeometry args={[0.8]} />
          <meshStandardMaterial color="#8bf0ce" emissive="#40b397" emissiveIntensity={0.7} />
        </mesh>
      </group>
      <mesh receiveShadow position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#aabfb8" roughness={1} />
      </mesh>
    </group>
  );
}

function BuildPad({ pad, onClick }: { pad: number; onClick: () => void }) {
  const point = padPosition(pad);
  return (
    <group position={[point.x, 0.19, point.z]}>
      <mesh
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[2.1, 0.15, 2.1]} />
        <meshStandardMaterial color="#a5b5a0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.081, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <ringGeometry args={[0.7, 0.76, 4]} />
        <meshBasicMaterial color="#e5f0cb" />
      </mesh>
    </group>
  );
}

function Actors({
  world,
  lane,
  onTower,
}: {
  world: World;
  lane: number;
  onTower: (entity: Entity) => void;
}) {
  const bodies = useRef<InstancedMesh>(null);
  const projectiles = useRef<InstancedMesh>(null);
  const blasts = useRef<InstancedMesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const owners = useRef<(Entity | undefined)[]>([]);
  const scratch = useMemo(
    () => ({ matrix: mat4.create(), scale: vec3.create(), color: new Color() }),
    []
  );
  const capacity = Math.max(2048, world.get(Scenario)!.enemiesPerLane * 8);
  useEffect(() => {
    for (const ref of [bodies, projectiles, blasts, bars]) {
      ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    }
  }, []);

  useFrame(() => {
    if (!bodies.current || !projectiles.current || !blasts.current || !bars.current) return;
    const measuring = world.get(Metrics)!.enabled;
    const started = measuring ? performance.now() : 0;
    const origin = laneOrigin(world.get(Scenario)!, lane);
    const { matrix, scale, color } = scratch;
    let bodyCount = 0;
    let projectileCount = 0;
    let blastCount = 0;
    let barCount = 0;
    const addBody = (entity: Entity, owner?: Entity) => {
      const appearance = entity.get(Appearance);
      if (!appearance || bodyCount >= capacity) return;
      mat4.scale(
        matrix,
        entity.get(WorldMatrix)!,
        vec3.set(scale, appearance.sx, appearance.sy, appearance.sz)
      );
      matrix[12] -= origin.x;
      matrix[14] -= origin.z;
      bodies.current!.instanceMatrix.array.set(matrix, bodyCount * 16);
      color.set(entity.has(Burning) ? '#ed9453' : entity.has(Slowed) ? '#83cce4' : appearance.color);
      bodies.current!.setColorAt(bodyCount, color);
      owners.current[bodyCount] = owner;
      bodyCount++;
    };
    const visitTower = (entity: Entity, owner: Entity) => {
      addBody(entity, owner);
      for (const child of entity.get(Children)!) visitTower(child, owner);
    };
    const pads = world.get(BuildPads)!;
    for (let pad = 0; pad < 16; pad++) {
      const root = pads.get(lane * 16 + pad);
      if (root !== undefined && world.has(root)) visitTower(root, root);
    }
    const cells = world.get(TargetGrid)!.cells;
    for (let cell = 0; cell < 12; cell++) {
      for (const entity of cells[lane * 12 + cell] ?? []) {
        if (!world.has(entity)) continue;
        addBody(entity);
        const health = entity.get(Health)!;
        const position = entity.get(Position)!;
        mat4.fromScaling(
          matrix,
          vec3.set(scale, Math.max(0.01, health.current / health.maximum) * 0.8, 0.07, 0.08)
        );
        matrix[12] = position.x - origin.x;
        matrix[13] = 1.45;
        matrix[14] = position.z - origin.z;
        if (barCount < capacity) bars.current.instanceMatrix.array.set(matrix, barCount++ * 16);
      }
    }
    world.query(Projectile, Position).readEach(([projectile, position]) => {
      if (projectile.lane !== lane || projectileCount >= capacity) return;
      mat4.fromScaling(matrix, vec3.set(scale, 0.2, 0.2, 0.2));
      matrix[12] = position.x - origin.x;
      matrix[13] = position.y;
      matrix[14] = position.z - origin.z;
      projectiles.current!.instanceMatrix.array.set(matrix, projectileCount * 16);
      projectiles.current!.setColorAt(
        projectileCount++,
        color.set(
          projectile.kind === 'cannon'
            ? '#eaf7b0'
            : projectile.kind === 'flame'
              ? '#ffac57'
              : '#88dafa'
        )
      );
    });
    world.query(Debris, Position).readEach(([debris, position]) => {
      if (
        Math.abs(position.x - origin.x) > 26 ||
        Math.abs(position.z - origin.z) > 11 ||
        projectileCount >= capacity
      )
        return;
      const size = Math.max(0.03, debris.remaining * 0.22);
      mat4.fromScaling(matrix, vec3.set(scale, size, size, size));
      matrix[12] = position.x - origin.x;
      matrix[13] = position.y;
      matrix[14] = position.z - origin.z;
      projectiles.current!.instanceMatrix.array.set(matrix, projectileCount * 16);
      projectiles.current!.setColorAt(projectileCount++, color.set(debris.color));
    });
    world.query(Blast, Position).readEach(([blast, position]) => {
      if (
        Math.abs(position.x - origin.x) > 26 ||
        Math.abs(position.z - origin.z) > 11 ||
        blastCount >= capacity
      )
        return;
      const radius = blast.radius * (0.2 + (blast.age / blast.duration) * 0.8);
      mat4.fromXRotation(matrix, -Math.PI / 2);
      mat4.scale(matrix, matrix, vec3.set(scale, radius, radius, radius));
      matrix[12] = position.x - origin.x;
      matrix[13] = 0.28;
      matrix[14] = position.z - origin.z;
      blasts.current!.instanceMatrix.array.set(matrix, blastCount * 16);
      blasts.current!.setColorAt(
        blastCount++,
        color.set(
          blast.kind === 'cannon' ? '#a9eac1' : blast.kind === 'flame' ? '#f59e5e' : '#96ddf9'
        )
      );
    });
    for (const [mesh, count] of [
      [bodies.current, bodyCount],
      [projectiles.current, projectileCount],
      [blasts.current, blastCount],
      [bars.current, barCount],
    ] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (measuring) recordMeasurement(world, 'sync-actors', 'render', performance.now() - started);
  }, -1);

  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        castShadow
        receiveShadow
        onClick={(event) => {
          const entity = owners.current[event.instanceId ?? -1];
          if (entity !== undefined) {
            event.stopPropagation();
            onTower(entity);
          }
        }}
      >
        <boxGeometry />
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={projectiles} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={blasts} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <ringGeometry args={[0.84, 1, 24]} />
        <meshBasicMaterial transparent opacity={0.65} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={bars} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color="#d2eea2" />
      </instancedMesh>
    </>
  );
}

function Rain({ world }: { world: World }) {
  const ref = useRef<InstancedMesh>(null);
  const capacity = Math.min(world.get(Scenario)!.rainCount, 4096);
  const scratch = useMemo(
    () => ({
      matrix: mat4.create(),
      streak: vec3.create(),
      across: vec3.create(),
      facing: vec3.create(),
    }),
    []
  );
  useEffect(() => {
    ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const measuring = world.get(Metrics)!.enabled;
    const started = measuring ? performance.now() : 0;
    const { matrix, streak, across, facing } = scratch;
    const cameraMatrix = camera.matrixWorld.elements as Mat4;
    vec3.set(facing, cameraMatrix[8], cameraMatrix[9], cameraMatrix[10]);
    vec3.normalize(facing, facing);
    let count = 0;
    // Bound drawing density while every drop still participates in ECS systems.
    drops: for (const {
      stores: [position, velocity],
      indices,
    } of world.query(IsRain, Position, Velocity).getPages()) {
      for (const index of indices) {
        if (count === capacity) break drops;
        vec3.set(
          streak,
          -velocity.x[index] * 0.09,
          -velocity.y[index] * 0.09,
          -velocity.z[index] * 0.09
        );
        vec3.cross(across, streak, facing);
        vec3.normalize(across, across);
        vec3.scale(across, across, 0.085);
        vec3.toBuffer(matrix, across, 0);
        vec3.toBuffer(matrix, streak, 4);
        vec3.toBuffer(matrix, facing, 8);
        matrix[12] = position.x[index] + streak[0] / 2;
        matrix[13] = position.y[index] + streak[1] / 2;
        matrix[14] = position.z[index] + streak[2] / 2;
        ref.current.instanceMatrix.array.set(matrix, count++ * 16);
      }
    }
    ref.current.count = count;
    ref.current.instanceMatrix.needsUpdate = true;
    if (measuring) recordMeasurement(world, 'sync-rain', 'render', performance.now() - started);
  }, -0.5);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
      raycast={() => undefined}
    >
      <planeGeometry />
      <meshBasicMaterial
        color="#4d7794"
        transparent
        opacity={0.65}
        depthWrite={false}
        side={DoubleSide}
      />
    </instancedMesh>
  );
}

function TowerRange({ world, lane, selected }: { world: World; lane: number; selected?: Entity }) {
  const tower = selected !== undefined && world.has(selected) ? selected.get(Tower) : undefined;
  if (!tower || tower.lane !== lane) return null;
  const point = padPosition(tower.pad);
  return (
    <mesh
      position={[point.x, 0.31, point.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => undefined}
    >
      <ringGeometry args={[tower.range - 0.06, tower.range, 96]} />
      <meshBasicMaterial color="#f1fbd4" transparent opacity={0.75} depthWrite={false} />
    </mesh>
  );
}
