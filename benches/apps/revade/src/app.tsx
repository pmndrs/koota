// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import {Environment, OrthographicCamera, PerspectiveCamera, shaderMaterial, Stars, Trail} from '@react-three/drei';
import {Canvas, extend, useFrame} from '@react-three/fiber';
import {Entity} from 'koota';
import {useObserve, useQuery, useQueryFirst, useWorld} from 'koota/react';
import {memo, StrictMode, useEffect, useLayoutEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {Color, Mesh, ShaderMaterial} from 'three';
import {useActions} from './actions';
import {schedule} from './systems/schedule';
import {Bullet, Explosion, Input, IsEnemy, IsPlayer, IsShieldVisible, Movement, Transform,} from './traits';
import {between} from './utils/between';
import {useStats} from './utils/use-stats';
import {BlackHole} from "./traits/black-hole.ts";
import {TMesh} from "./traits/mesh-trait.ts";
import {Bloom, EffectComposer, Outline, SMAA} from "@react-three/postprocessing";
import {Spaceship} from "./assets/Spaceship.tsx";
import {Score} from "./traits/score.ts";
import NumberFlow from "@number-flow/react";

export function App() {


  return (
    <>

      <Canvas gl={{antialias: false}}>
        <StrictMode>
          <color attach="background" args={['#000000']}/>
          <directionalLight position={[10, 10, -10]} intensity={0.3}/>

          <PerspectiveCamera position={[0, 0, 50]} makeDefault far={10000}/>

          <group>
            <Player/>
            <Enemies/>
            <Bullets/>
            <Explosions/>
            <BlackHoleRenderer/>
          </group>



          <Stars radius={100} depth={500} count={5000} factor={10} saturation={0} fade speed={0.1}/>

          <Environment preset={"night"}/>
          <PostProcessing/>

          <Simulation/>

        </StrictMode>
      </Canvas>

      <GameUI/>
    </>
  );
}

function GameUI() {
  const player = useQueryFirst(Score, IsPlayer);
  return (player) ? <GameUIDisplay player={player}/> : null
}

function GameUIDisplay({player}: { player: Entity }) {
  const score = useObserve(player, Score)!;

  return (
    <div style={{
      position: "absolute",
      bottom: 100,
      right: 50,
      border: "1px solid red",
      color: "white",
      display: "flex",
      fontSize: "2rem",
      justifyContent: "space-between",
      alignItems: "center"
    }}>

      <div>Score:</div>
      <NumberFlow value={score?.current}/>
    </div>
  )
}


function PostProcessing() {
  //const outlined = useQuery(TMesh);
  //const selection = outlined.map(entity => entity.get(TMesh));
  //const outlineRef = useRef<any>();


  return (
    <EffectComposer multisampling={1}>
      <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.8} height={100} mipmapBlur intensity={0.4}/>
      <SMAA/>

      {/*<Outline
        ref={outlineRef}
        selection={selection} // selection of objects that will be outlined
        //edgeStrength={2.5} // the edge strength
        //visibleEdgeColor={0xffff00} // the color of visible edges
        //hiddenEdgeColor={0xffff00} // the color of hidden edges
        xRay={true} // indicates whether X-Ray outlines are enabled
      />*/}

    </EffectComposer>
  )
}

function Enemies() {
  const enemies = useQuery(IsEnemy, Transform);
  return (
    <>
      {enemies.map((enemy) => (
        <EnemyRenderer key={enemy} entity={enemy}/>
      ))}
    </>
  );
}

const EnemyRenderer = memo(({entity}: { entity: Entity }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    // Set initial position and orientation
    meshRef.current.position.set(between(-50, 50), between(-50, 50), 0);
    meshRef.current.quaternion.random();

    // Sync transform with the trait
    entity.set(Transform, {
      position: meshRef.current.position,
      rotation: meshRef.current.rotation,
      quaternion: meshRef.current.quaternion,
      scale: meshRef.current.scale
    });

    entity.add(TMesh(meshRef.current));

    entity.set(Movement, {maxSpeed: between(5, 10)});
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const progress = Math.min(scaleRef.current + delta * 2, 1);
    // Apply easing - this uses cubic easing out
    const eased = 1 - Math.pow(1 - progress, 3);
    scaleRef.current = progress;
    //meshRef.current.scale.setScalar(eased);
  });

  return (
    <mesh ref={meshRef} scale={0.66}>
      <dodecahedronGeometry/>
      <meshStandardMaterial color="white" metalness={.5} roughness={0.25}/>
    </mesh>
  );
});

function Player() {
  const player = useQueryFirst(IsPlayer, Transform);
  const {spawnPlayer} = useActions();

  useLayoutEffect(() => {
    const entity = spawnPlayer();
    return () => entity?.destroy();
  }, [spawnPlayer]);


  return <>
    {player && <PlayerRenderer entity={player}/>}
  </>;
}


const PlayerRenderer = memo(({entity}: { entity: Entity }) => {
  const ref = useRef<THREE.Group>(null);
  const world = useWorld();

  // Thrusting state
  const [isThrusting, setIsThrusting] = useState(false);
  const input = useObserve(entity, Input);

  useEffect(() => {
    const unsub = world.onChange(Input, (e) => {
      if (e.id() !== entity.id()) return;
      if (e.get(Input).direction.length() > 0) setIsThrusting(true);
      else setIsThrusting(false);
    });
    return () => {
      unsub();
    };
  }, []);

  // Shield visibility state
  const isShieldVisible = useObserve(entity, IsShieldVisible);

  useLayoutEffect(() => {
    if (!ref.current) return;

    entity.set(Transform, {
      position: ref.current.position,
      rotation: ref.current.rotation,
      quaternion: ref.current.quaternion,
      scale: ref.current.scale,
    });
    entity.set(Movement, {maxSpeed: 50, damping: 0.99, thrust: 2});
  }, [entity]);

  return (
    <group ref={ref}>
      {/*<Spaceship position={[0, -5, 3]} />
      */}


      <pointLight intensity={70} position-z={2} color={"lightblue"}/>
      <pointLight intensity={input?.isFiring ? 180 : 0} position-z={2.2} position-y={5} color={"hotpink"}/>


      <Trail
        width={25} // Width of the line
        color={new Color("orangered").multiplyScalar(10)} // Color of the line
        length={7} // Length of the line
        decay={13} // How fast the line fades away
        local={false} // Wether to use the target's world or local positions
        stride={0} // Min distance between previous and current point
        //interval={1} // Number of frames to wait before next calculation
        attenuation={(width) => width} // A function to define the width in each point along it.
      >

        <Spaceship entity={entity} rotation-y={Math.PI / 2} rotation-x={Math.PI / 2} scale={[.2, .2, .2]}/>

      </Trail>


      {/*
      <mesh position-z={1}>
        <boxGeometry/>
        <meshBasicMaterial color="orange" wireframe/>
      </mesh>
      */}
      {isThrusting && <ThrusterRenderer/>}
      {isShieldVisible && <ShieldRenderer/>}
    </group>
  );
});

function ShieldRenderer() {
  return (
    <mesh scale={2}>
      <sphereGeometry args={[1.1, 8, 8]}/>
      <meshBasicMaterial color={new Color("blue").multiplyScalar(5)} wireframe/>
    </mesh>
  );
}

function ThrusterRenderer() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({clock}) => {
    if (!meshRef.current) return;
    // Create a pulsing effect by using sin wave
    const scale = 0.8 + Math.sin(clock.elapsedTime * 10) * 0.2;
    meshRef.current.scale.setY(scale);
    meshRef.current.position.y = -(1 - scale) / 2;
  });

  return (
    <group position={[0, -1, 0]} rotation={[0, 0, 3.14]}>
      <mesh ref={meshRef}>
        <coneGeometry args={[0.3, 1, 8]}/>
        <meshBasicMaterial color="#ff4400" wireframe/>
      </mesh>
    </group>
  );
}

function Explosions() {
  const explosions = useQuery(Explosion, Transform);

  return (
    <>
      {explosions.map((explosion) => (
        <ExplosionRenderer key={explosion.id()} entity={explosion}/>
      ))}
    </>
  );
}

function ExplosionRenderer({entity}: { entity: Entity }) {
  const groupRef = useRef<THREE.Group>(null);
  const particleCount = entity.get(Explosion).count;

  useLayoutEffect(() => {
    if (!groupRef.current) return;

    // Position the explosion group
    groupRef.current.position.copy(entity.get(Transform).position);

    // Set particle velocities with random offset
    const velocities = entity.get(Explosion).velocities;
    const randomOffset = Math.random() * Math.PI * 2; // Random starting angle

    for (let i = 0; i < particleCount; i++) {
      const angle = randomOffset + (i / particleCount) * Math.PI * 2;
      velocities.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
    }

    return () => {
      velocities.length = 0;
    };
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const {duration, current} = entity.get(Explosion);
    const progress = current / duration;

    const velocities = entity.get(Explosion).velocities;
    const particles = groupRef.current.children as THREE.Mesh[];

    for (let i = 0; i < particleCount; i++) {
      const particle = particles[i];
      if (!particle) continue;
      particle.position.add(velocities[i].clone().multiplyScalar(delta * 40));

      // Update scale and opacity
      const scale = Math.max(0, 1 - progress);
      particle.scale.setScalar(scale);
      (particle.material as THREE.MeshBasicMaterial).opacity = scale;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({length: particleCount}).map((_, i) => {
        return (
          <mesh key={i}>
            <sphereGeometry args={[0.2, 8, 8]}/>
            <meshBasicMaterial color={explosionColor} transparent/>
          </mesh>
        );
      })}
    </group>
  );
}

function Bullets() {
  const bullets = useQuery(Bullet, Transform);
  return (
    <>
      {bullets.map((bullet) => (
        <BulletRenderer key={bullet.id()} entity={bullet}/>
      ))}
    </>
  );
}


const bulletColor = new Color("hotpink");
bulletColor.multiplyScalar(50);

const explosionColor = new Color("orangered");
explosionColor.multiplyScalar(50);

const BulletRenderer = memo(({entity}: { entity: Entity }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    // Copy current values
    const {position, rotation, quaternion} = entity.get(Transform);
    meshRef.current.position.copy(position);
    meshRef.current.rotation.copy(rotation);
    meshRef.current.quaternion.copy(quaternion);

    // Sync transform with the trait
    entity.set(Transform, {
      position: meshRef.current.position,
      rotation: meshRef.current.rotation,
      quaternion: meshRef.current.quaternion,
      scale: meshRef.current.scale
    });
  }, []);

  return (
    <mesh ref={meshRef} scale={0.2}>
      <capsuleGeometry args={[0.5, 2.5, 4, 4]}/>
      <meshBasicMaterial color={bulletColor}/>
    </mesh>
  );
});

// Simulation runs a schedule.
function Simulation() {
  const world = useWorld();
  const statsApi = useStats({
    enemies: () => world.query(IsEnemy).length,
  });

  useFrame(() => {
    statsApi.measure(() => {
      schedule.run({world});
    });
    statsApi.updateStats();
  });

  return null;
}


// Define the custom shader material with your shader code
const CustomShaderMaterial = shaderMaterial(
  /*
  * Attribution:
  * BlackHole (swirl, portal)
  * Shader by ShaderToy user "misterprada"
  * https://www.shadertoy.com/view/lcfyDj
  * original reference: https://x.com/cmzw_/status/1787147460772864188 (celestianmaze)
  * */
  {
    iResolution: new THREE.Vector3(),
    iTime: 0,
    transparent: true, // Enable transparency
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader (Your full GLSL shader code here)
  `
uniform vec3 iResolution;
uniform float iTime;
varying vec2 vUv;

// Functions provided in the GLSL shader code
vec4 permute_3d(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt3d(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float simplexNoise3d(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0 );
    vec4 p = permute_3d( permute_3d( permute_3d(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt3d(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm3d(vec3 x, const in int it) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100);
    for (int i = 0; i < 32; ++i) {
        if (i < it) {
            v += a * simplexNoise3d(x);
            x = x * 2.0 + shift;
            a *= 0.5;
        }
    }
    return v;
}

vec3 rotateZ(vec3 v, float angle) {
    float cosAngle = cos(angle);
    float sinAngle = sin(angle);
    return vec3(
        v.x * cosAngle - v.y * sinAngle,
        v.x * sinAngle + v.y * cosAngle,
        v.z
    );
}

float facture(vec3 vector) {
    vec3 normalizedVector = normalize(vector);
    return max(max(normalizedVector.x, normalizedVector.y), normalizedVector.z);
}

vec3 emission(vec3 color, float strength) {
    return color * strength;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    vec3 color = vec3(uv.xy, 0.0);
    color.z += 0.5;
    color = normalize(color);
    color -= 0.2 * vec3(0.0, 0.0, iTime);
    float angle = -log2(length(uv));
    color = rotateZ(color, angle);
    
    float frequency = 1.4;
    float distortion = 0.01;
    color.x = fbm3d(color * frequency + 0.0, 5) + distortion;
    color.y = fbm3d(color * frequency + 1.0, 5) + distortion;
    color.z = fbm3d(color * frequency + 2.0, 5) + distortion;

    vec3 noiseColor = color;
    noiseColor *= 2.0;
    noiseColor -= 0.1;
    noiseColor *= 0.188;
    noiseColor += vec3(uv.xy, 0.0);

    float noiseColorLength = length(noiseColor);
    noiseColorLength = 0.770 - noiseColorLength;
    noiseColorLength *= 4.2;
    noiseColorLength = pow(noiseColorLength, 1.0);

    vec3 emissionColor = emission(vec3(0.961, 0.592, 0.078), noiseColorLength * 0.4);
    float fac = length(uv) - facture(color + 0.32);
    fac += 0.1;
    fac *= 3.0;
    color = mix(emissionColor, vec3(fac), fac + 1.2);
    
 
 
    
    vec2 center = vec2(0, 0); // center of the screen
    float dist = distance(uv, center); // distance from center (normalized)
    float radialFade = 1.0 - 1.3 * dist;//pow(dist, 0.89);
    
    float alpha = fac > 0.26 ? 0.0 : 1.0; // Adjust threshold as needed
    fragColor = vec4(color, alpha * radialFade);
}

void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec4 fragColor;
    mainImage(fragColor, fragCoord);
    gl_FragColor = fragColor;
}
  `
);

// Register the material with Three.js
extend({CustomShaderMaterial});

function BlackHoleRenderer() {
  const world = useWorld();
  const meshRef = useRef<Mesh>(null!);

  useLayoutEffect(() => {
    const entity = world.spawn(
      BlackHole,
      Transform({
        position: meshRef.current.position,
        rotation: meshRef.current.rotation,
        quaternion: meshRef.current.quaternion,
        scale: meshRef.current.scale,
      }),
      TMesh(meshRef.current)
    );
    return () => entity.destroy();
  }, [world]);


  const materialRef = useRef<ShaderMaterial>(null!);

  useFrame(({clock, viewport}) => {
    materialRef.current.iResolution.set(viewport.width, viewport.height, 1);
    materialRef.current.iTime = clock.getElapsedTime();
  });

  return (
    <mesh ref={meshRef} renderOrder={99}>
      <planeGeometry args={[16 * 1.5, 9 * 1.5, 1, 1]}/>
      <customShaderMaterial ref={materialRef}/>
    </mesh>
  )
}







