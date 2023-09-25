import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { obj2env } from '../../helpers';
import { Env, Secret, Volume } from 'cdk8s-plus-26';
import { TubeArchivist } from './tubeArchivist';
import { Jellyfin } from './jellyfin';

export interface TubeArchivistJellyfinIntegrationProps {
    readonly tubeArchivist: TubeArchivist,
    readonly jellyfin: Jellyfin,

    readonly tubeArchivistToken: string,
    readonly jellyfinToken: string,
}

export class TubeArchivistJellyfinIntegration extends Construct {
    constructor(scope: Construct, id: string, props: TubeArchivistJellyfinIntegrationProps) {
        super(scope, id);
        
        const secret = new Secret(this, 'tokens');
        secret.addStringData('TA_TOKEN', props.tubeArchivistToken);
        secret.addStringData('JF_TOKEN', props.jellyfinToken);

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8001 }],
        });

        const statefulset = new kplus.StatefulSet(this, 'app', { service });

        const container = statefulset.addContainer({
            image: 'bbilly1/tubearchivist-jf:v0.1.1',
            ports: [{ number: 8001 }],
            envFrom: [Env.fromSecret(secret)],
            envVariables: obj2env({
                TA_URL: `https://${props.tubeArchivist.domain.fqdn}`,
                JF_URL: `https://${props.jellyfin.domain.fqdn}`
            }),
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        container.mount('/youtube', Volume.fromHostPath(scope, 'hostPath-tajf-media', 'media', {
            path: props.tubeArchivist.hostPath,
        }));
    }
}
