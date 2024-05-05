import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { ServiceAccount } from '../helpers/k8s/serviceAccount';
import { Domain } from '../infra/certManager';
import { createHostPathVolume, obj2env } from '../../helpers';
import { Ingress, IngressBackend, Volume } from 'cdk8s-plus-26';

export interface JellyfinProps {
    domain: Domain,
    media: { [name: string]: string },
    readOnlyMedia?: { [name: string]: string },
}

export class Jellyfin extends Construct {
    readonly domain: Domain;

    constructor(scope: Construct, id: string, props: JellyfinProps) {
        super(scope, id);

        this.domain = props.domain;

        const envVariables = obj2env({
            JELLYFIN_PublishedServerUrl: `https://${props.domain.fqdn}`,
            JELLYFIN_CONFIG_DIR: '/config',
            JELLYFIN_CACHE_DIR: '/cache',
            JELLYFIN_DATA_DIR: '/data',
            // JELLYFIN_LOG_DIR: '/logs'
        });

        const serviceAccount = new ServiceAccount(this, 'ServiceAccount', {
            verbs: ["delete", "get", "list", "patch", "create", "update"],
            resources: [kplus.ApiResource.INGRESSES]
        }).instance;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8096 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            serviceAccount,
            automountServiceAccountToken: true
        });

        const container = statefulSet.addContainer({
            image: 'jellyfin/jellyfin:10.8.13',
            envVariables,
            ports: [{ number: 8096 }],
            securityContext: {
                // TODO We probably have to change this
                // user: 1000,
                // group: 1000,
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                privileged: true,
                allowPrivilegeEscalation: true
            },
            resources: {}
        });

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });

        container.mount('/data', createHostPathVolume(this, 'data'));
        container.mount('/config', createHostPathVolume(this, 'config'));
        container.mount('/cache', createHostPathVolume(this, 'cache'));
        container.mount('/dev/dri', Volume.fromHostPath(this, 'igpu', 'igpu', { path: '/dev/dri' }));

        for (let key in props.media) {
            const path = props.media[key];

            container.mount(`/media/${key}`, Volume.fromHostPath(this, `media-${key}`, `media-${key}`, { path }));
        }

        if (props.readOnlyMedia) {
            for (let key in props.readOnlyMedia) {
                const path = props.readOnlyMedia[key];

                container.mount(`/media/${key}`, Volume.fromHostPath(this, `media-${key}`, `media-${key}`, { path }), {
                    readOnly: true
                });
            }
        }
    }
}