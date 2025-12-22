import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { createHostPathVolume, obj2env } from '../../helpers';
import { DnsPolicy, Handler, HostPathVolumeType, Ingress, IngressBackend, Volume } from 'cdk8s-plus-26';

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

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            hostNetwork: true,
            dns: { policy: DnsPolicy.CLUSTER_FIRST_WITH_HOST_NET }
        });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/home-assistant/home-assistant:2025.12.4',
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
            lifecycle: {
                postStart: Handler.fromCommand(["apk", "add", "openldap-clients"])
            },
            resources: {},
        });

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });

        container.mount('/config', createHostPathVolume(this, 'config'));
        container.mount('/run/dbus', Volume.fromHostPath(this, 'dbus', 'dbus', { path: '/run/dbus' }), { readOnly: true });
        container.mount('/dev/ttyUSB0', Volume.fromHostPath(this, 'zigbee', 'zigbee', { path: '/dev/ttyUSB0', type: HostPathVolumeType.CHAR_DEVICE }));

        this.deployWhisper();
        this.deployPiper();
    }

    deployWhisper() {
        const service = new kplus.Service(this, 'wyoming-whisper', {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 10300 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'whisper', { service });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/linuxserver/faster-whisper:2.4.0',
            envVariables: obj2env({
                PUID: '1000',
                PGID: '1000',
                TZ: 'Etc/UTC',
                WHISPER_MODEL: 'base-int8',
                WHISPER_BEAM: '1',
                WHISPER_LANG: 'en'
            }),
            ports: [{ number: 10300 }],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                privileged: true,
                allowPrivilegeEscalation: true,
            },
        });

        container.mount('/config', createHostPathVolume(this, 'whisper-model'));
    }

    deployPiper() {
        const service = new kplus.Service(this, 'wyoming-piper', {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 10200 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'piper', { service });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/linuxserver/piper:1.4.0',
            envVariables: obj2env({
                PUID: '1000',
                PGID: '1000',
                TZ: 'Etc/UTC',
                PIPER_VOICE: 'en_US-lessac-medium',
                PIPER_LENGTH: '1.0',
                PIPER_NOISE: '0.667',
                PIPER_NOISEW: '0.333',
                PIPER_SPEAKER: '0',
                PIPER_PROCS: '1',
            }),
            ports: [{ number: 10200 }],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                privileged: true,
                allowPrivilegeEscalation: true,
            },
        });

        container.mount('/config', createHostPathVolume(this, 'piper-model'));
    }
}