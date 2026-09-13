import { AssetContainer, LoadAssetContainerAsync, Mesh, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export interface ReferenceSpec { kind: string; url?: string; sha256?: string; data?: Uint8Array; expectedMeshCount?: number }
/** A reference owns its imported assets; never transfers them into the procedural factory. */
export function createReferenceController(scene: Scene, procedural: () => Mesh[], scale: number) {
  let container: AssetContainer | undefined;
  let root: TransformNode | undefined;
  let visibility: Array<[Mesh, boolean]> = [];
  let disposed = false;
  let generation = 0;
  let mode: 'procedural' | 'reference' = 'procedural';
  function release() {
    visibility.forEach(([m, visible]) => { if (!m.isDisposed()) m.isVisible = visible; });
    visibility = [];
    container?.removeAllFromScene(); container?.dispose(); container = undefined;
    root?.dispose(); root = undefined; mode = 'procedural';
  }
  return {
    get mode() { return mode; },
    meshes: () => mode === 'reference' ? container!.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0) : procedural(),
    async switch(spec: ReferenceSpec) {
      const token = ++generation;
      if (disposed) throw new Error('reference controller disposed');
      if (spec.kind === 'procedural') { release(); return; }
      if (spec.kind !== 'glb' || (!spec.url && !spec.data)) throw new Error('GLB reference requires url or data');
      // Loading stays detached. Failure must leave the previous mode/resources intact.
      let data=spec.data;
      if(!data){const response=await fetch(spec.url!);if(!response.ok)throw new Error(`GLB fetch failed: ${response.status}`);data=new Uint8Array(await response.arrayBuffer());}
      if(spec.sha256){const digest=await crypto.subtle.digest('SHA-256',data as Uint8Array<ArrayBuffer>);const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==spec.sha256)throw new Error('GLB browser bytes hash mismatch');}
      const loaded = await LoadAssetContainerAsync(data, scene, { pluginExtension: '.glb' });
      if (disposed || token !== generation) { loaded.dispose(); throw new Error('reference load superseded or disposed'); }
      const meshes = loaded.meshes.filter(m => m.getTotalVertices() > 0);
      if (!meshes.length || (spec.expectedMeshCount !== undefined && meshes.length !== spec.expectedMeshCount)) {
        loaded.dispose(); throw new Error(`reference mesh count mismatch: ${meshes.length}`);
      }
      loaded.animationGroups.forEach(a => a.stop());
      // Imported lights/cameras/environment are not the shared capture look.
      const savedCamera = scene.activeCamera, environment = scene.environmentTexture;
      release();
      container = loaded;
      root = new TransformNode('capture-reference-scale', scene);
      root.scaling.setAll(scale);
      // Babylon AUTO uses R_y(pi)*H_Z = H_X. The native ABI is H_Z, so
      // undo that extra rotation on this isolated wrapper, never on scene/camera.
      if(!scene.useRightHandedSystem)root.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),Math.PI);
      root.metadata={coordinateFrame:'source-rh',nativeConversion:scene.useRightHandedSystem?'identity':'reflect-z'};
      loaded.transformNodes.push(root);
      loaded.rootNodes.forEach(n => { if (n instanceof TransformNode) n.parent = root!; });
      loaded.addAllToScene();
      loaded.lights.forEach(l => l.setEnabled(false));
      scene.activeCamera = savedCamera; scene.environmentTexture = environment;
      visibility = procedural().map(m => [m, m.isVisible]);
      visibility.forEach(([m]) => { m.isVisible = false; });
      mode = 'reference';
      try { await scene.whenReadyAsync(); }
      catch (error) { release(); throw error; }
    },
    dispose() { disposed = true; ++generation; release(); },
  };
}
