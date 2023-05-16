import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { Size } from 'cdk8s';

export interface PersistentVolumeClaimProps {
    /**
    * Amount of storage to allocate
    */
    readonly storage: Size;
    /**
     * Whether to keep the claim when deleting via FluxCD
     */
    readonly retain?: boolean;
}

export class PersistentVolumeClaim extends Construct {
    instance: kplus.PersistentVolumeClaim;

    constructor(scope: Construct, id: string, props: PersistentVolumeClaimProps) {
        super(scope, id);

        const claim = new kplus.PersistentVolumeClaim(this, id, {
            storage: props.storage,
            accessModes: [kplus.PersistentVolumeAccessMode.READ_WRITE_ONCE],
        });

        if (props.retain) {
            // This prevents FluxCD from deleting the PVC if it disappears from the manifests.
            // HOWEVER, it does not prevent deletion if the Kustomization itself is deleted.
            // In that case, _all_ related resources including the PVCs will be purged!
            claim.metadata.addLabel("kustomize.toolkit.fluxcd.io/prune", "disabled");
        }

        this.instance = claim;
    }
}
