/*

Model: Space Ranger SR1 by Rlab
License: Creative Commons Attribution (CC BY 4.0)
https://www.fab.com/listings/fd6a9c48-1f01-4bf3-9b78-eadca660ed97
*/

import * as THREE from 'three'
import {Mesh} from 'three'

import {useGLTF} from '@react-three/drei'
import path from "././spaceship-transformed.glb?url";
import {useEffect, useRef} from "react";
import {Entity} from 'koota'
import {TMesh} from "../traits/mesh-trait.ts";


type GLTFResult = {
  nodes: {
    Object_2: THREE.Mesh
    Object_3: THREE.Mesh
  }
  materials: {
    Body: THREE.MeshStandardMaterial
    Weapons: THREE.MeshStandardMaterial
  }
}

export function Spaceship(props: JSX.IntrinsicElements['group'] & { entity: Entity }) {
  const {nodes, materials} = useGLTF(path) as unknown as GLTFResult;
  const ref = useRef<Mesh>(null!);

  useEffect(() => {
    materials.Body.emissiveIntensity = 80;
    materials.Body.toneMapped = false;
  }, []);

  useEffect(() => {
    props.entity.add(TMesh(ref.current));
  }, [props.entity]);


  return (
    <group {...props} dispose={null}>
      <mesh ref={ref} geometry={nodes.Object_2.geometry} material={materials.Body} position={[-11.599, 0, 3.047]}
            rotation={[-Math.PI / 2, 0, 0]}/>
      <mesh geometry={nodes.Object_3.geometry} material={materials.Weapons} position={[-11.599, 0, 3.047]}
            rotation={[-Math.PI / 2, 0, 0]}/>
      {props.children}
    </group>
  )
}

useGLTF.preload(path);
