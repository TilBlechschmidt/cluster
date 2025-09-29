import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { createHostPathVolume, obj2env } from '../../helpers';
import { DnsPolicy, Ingress, IngressBackend, Volume } from 'cdk8s-plus-26';

export interface MusicAssistantProps {
    domain: Domain,
}

export class MusicAssistant extends Construct {
    readonly domain: Domain;
    readonly ingress: Ingress;

    constructor(scope: Construct, id: string, props: MusicAssistantProps) {
        super(scope, id);

        this.domain = props.domain;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8095 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            hostNetwork: true,
            dns: { policy: DnsPolicy.CLUSTER_FIRST_WITH_HOST_NET }
        });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/music-assistant/server:2.6.0',
            envVariables: obj2env({
                TZ: 'Europe/Berlin'
            }),
            ports: [{ number: 8095 }],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                privileged: false,
                allowPrivilegeEscalation: false
            },
            resources: {},
        });

        container.mount('/data', createHostPathVolume(this, 'data'));
        container.mount('/media', Volume.fromHostPath(this, 'media', 'media', { path: '/mnt/raid/Media/Music' }), { readOnly: true });

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });
    }
}