import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { Env, Ingress, IngressBackend, Secret } from 'cdk8s-plus-26';

export interface ScanServerProps {
    readonly domain: Domain,

    readonly users: { [user: string]: UserConfig },
}

export interface UserConfig {
    readonly webdav?: {
        readonly url: string,
        readonly user: string,
        readonly pass: string
    }

    readonly paperless?: {
        readonly url: string,
        readonly token: string,
        readonly customFields: { field: number, value: number }[],
    }
}

export class ScanServer extends Construct {
    readonly ingress: Ingress;

    constructor(scope: Construct, id: string, props: ScanServerProps) {
        super(scope, id);

        const secret = new Secret(this, 'token');

        for (let user in props.users) {
            const config = props.users[user];

            if (config.webdav) {
                secret.addStringData(`${user}_WEBDAV_URL`, config.webdav.url);
                secret.addStringData(`${user}_WEBDAV_USER`, config.webdav.user);
                secret.addStringData(`${user}_WEBDAV_PASS`, config.webdav.pass);
            }

            if (config.paperless) {
                secret.addStringData(`${user}_PAPERLESS_URL`, config.paperless.url);
                secret.addStringData(`${user}_PAPERLESS_TOKEN`, config.paperless.token);
                secret.addStringData(`${user}_PAPERLESS_CUSTOM_FIELDS`, JSON.stringify(config.paperless.customFields));
            }
        }

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3030 }],
        });

        new kplus.StatefulSet(this, 'app', {
            service,
            automountServiceAccountToken: true,
            securityContext: {
                user: 1000,
                group: 1000,
            },
            containers: [{
                image: 'ghcr.io/tilblechschmidt/scan-server:sha-e2f8e7b',
                ports: [{ number: 3030 }],
                envFrom: [Env.fromSecret(secret)],
                resources: {}
            }]
        });

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                path: props.domain.path,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });
    }
}