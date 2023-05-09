import { Construct } from 'constructs';
import { Size } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';

import { ServiceAccount } from '../k8s/serviceAccount';
import { Domain } from '../infra/certManager';

export interface LaunchProps {
    domains: Domain[]
}

export class Launch extends Construct {
    constructor(scope: Construct, id: string, _props: LaunchProps) {
        super(scope, id);

        const serviceAccount = new ServiceAccount(this, 'ServiceAccount', {
            verbs: ["delete", "get", "list", "patch", "create", "update"],
            resources: [kplus.ApiResource.INGRESSES]
        }).instance;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            serviceAccount,
            automountServiceAccountToken: true
        });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/tilblechschmidt/launch:sha-f938248',
            ports: [{ number: 80 }, { number: 8088 }],
            envVariables: {
                /// TODO Pass list of allowed domains
                LAUNCH_SERVICE: { value: service.name }
            },
            securityContext: {
                user: 1000,
                group: 1000,
                readOnlyRootFilesystem: false,
            }
        });

        const claim = new kplus.PersistentVolumeClaim(this, 'data', {
            storage: Size.gibibytes(5),
            accessModes: [kplus.PersistentVolumeAccessMode.READ_WRITE_ONCE]
        });

        claim.metadata.addLabel("kustomize.toolkit.fluxcd.io/prune", "disabled");

        container.mount('/var/www/bundles', kplus.Volume.fromPersistentVolumeClaim(this, 'pvc', claim));

        new kplus.Service(this, 'api', {
            type: kplus.ServiceType.NODE_PORT,
            ports: [{
                port: 8088,
                nodePort: 1200
            }],
            selector: statefulSet.toPodSelector()
        });
    }
}