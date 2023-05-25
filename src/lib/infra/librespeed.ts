import { Ingress, IngressBackend, Service, ServiceType, StatefulSet } from 'cdk8s-plus-26';
import { Construct } from 'constructs';

import { obj2env } from '../../helpers';
import { Domain } from '../infra/certManager';

export interface LibrespeedProps {
    readonly domain: Domain;
}

export class Librespeed extends Construct {
    constructor(scope: Construct, id: string, props: LibrespeedProps) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 80 }],
        });

        new StatefulSet(this, 'app', {
            service, containers: [{
                image: 'adolfintel/speedtest',
                portNumber: 80,
                securityContext: {
                    ensureNonRoot: false,
                    readOnlyRootFilesystem: false
                },
                envVariables: obj2env({
                    TITLE: "Speedtest @ Geesthacht",
                    PASSWORD: "supersecret"
                })
            }]
        });

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}
