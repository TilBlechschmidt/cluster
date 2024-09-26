import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { createHostPathVolume, obj2env } from '../../helpers';
import { Ingress, IngressBackend, Volume } from 'cdk8s-plus-26';

export interface HomeAssistantProps {
    domain: Domain,
}

export class HomeAssistant extends Construct {
    readonly domain: Domain;
    readonly ingress: Ingress;

    constructor(scope: Construct, id: string, props: HomeAssistantProps) {
        super(scope, id);

        this.domain = props.domain;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8123 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', { service, hostNetwork: true });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/home-assistant/home-assistant:stable',
            envVariables: obj2env({
                TZ: 'Europe/Berlin'
            }),
            ports: [{ number: 8123 }],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                privileged: true,
                allowPrivilegeEscalation: true
            },
            resources: {}
        });

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });

        container.mount('/config', createHostPathVolume(this, 'config'));
        container.mount('/run/dbus', Volume.fromHostPath(this, 'dbus', 'dbus', { path: '/run/dbus' }), { readOnly: true });
    }
}