import { BaseTexture, Material, MorphTargetManager, Skeleton, TransformNode } from '@babylonjs/core';
/** Explicit allocations only; never infer ownership from a scene snapshot or a material slot. */
export class OwnedResources {
    readonly materials = new Set<Material>();
    readonly textures = new Set<BaseTexture>();
    readonly skeletons = new Set<Skeleton>();
    readonly morphManagers = new Set<MorphTargetManager>();
    disposed = false;
    constructor(root: TransformNode) {
        root.onDisposeObservable.addOnce(() => this.dispose());
    }
    material<T extends Material>(m: T): T { this.materials.add(m); m.onDisposeObservable.addOnce(() => this.materials.delete(m)); return m; }
    texture<T extends BaseTexture>(t: T): T { this.textures.add(t); t.onDisposeObservable.addOnce(() => this.textures.delete(t)); return t; }
    skeleton<T extends Skeleton>(s: T): T { this.skeletons.add(s); return s; }
    morph<T extends MorphTargetManager>(m: T): T { this.morphManagers.add(m); return m; }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        // Do not recursively dispose textures through material slots: a host may have assigned a shared texture.
        for (const m of [...this.materials]) m.dispose(false, false);
        for (const t of [...this.textures]) t.dispose();
        for (const s of [...this.skeletons]) s.dispose();
        for (const m of this.morphManagers) m.dispose();
        this.materials.clear(); this.textures.clear(); this.skeletons.clear(); this.morphManagers.clear();
    }
}
export function resourceOwner(node: TransformNode): OwnedResources | undefined {
    for (let n: any = node; n; n = n.parent) if (n.metadata?.ownedResources instanceof OwnedResources) return n.metadata.ownedResources;
    return undefined;
}
