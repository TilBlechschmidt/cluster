import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { Env, Ingress, IngressBackend, Secret } from 'cdk8s-plus-26';
import { attachMiddlewares, restrictToLocalNetwork, stripPathPrefix } from '../../network';

export interface ScanServerProps {
    readonly domain: Domain,

    /// WebDAV configuration
    readonly webdav: {
        readonly url: string,
        readonly user: string,
        readonly pass: string
    }

    readonly restrictToLocalNetwork?: boolean;
}

export class ScanServer extends Construct {
    constructor(scope: Construct, id: string, props: ScanServerProps) {
        super(scope, id);

        const secret = new Secret(this, 'token');
        secret.addStringData('WEBDAV_URL', props.webdav.url);
        secret.addStringData('WEBDAV_USER', props.webdav.user);
        secret.addStringData('WEBDAV_PASS', props.webdav.pass);

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
                image: 'ghcr.io/tilblechschmidt/scan-server:sha-cb3b044',
                ports: [{ number: 3030 }],
                envFrom: [Env.fromSecret(secret)],
                resources: {}
            }]
        });

        const ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                path: props.domain.path,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });

        const middlewares = [];
        if (props.restrictToLocalNetwork) middlewares.push(restrictToLocalNetwork(this));
        if (props.domain.path) middlewares.push(stripPathPrefix(this, [props.domain.path]));
        attachMiddlewares(ingress, middlewares);
    }
}