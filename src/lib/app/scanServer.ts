import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { createHostPathVolume } from '../../helpers';
import { Env, EnvValue, Ingress, IngressBackend, Secret } from 'cdk8s-plus-26';
import { attachMiddlewares, restrictToLocalNetwork, stripPathPrefix } from '../../network';

export interface ScanServerProps {
    readonly domain: Domain,

    /// Auth token used to download files
    readonly token: string,

    readonly restrictToLocalNetwork?: boolean;
}

export class ScanServer extends Construct {
    constructor(scope: Construct, id: string, props: ScanServerProps) {
        super(scope, id);

        const secret = new Secret(this, 'token');
        secret.addStringData('AUTH_TOKEN', props.token);

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3030 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            automountServiceAccountToken: true,
            securityContext: {
                user: 1000,
                group: 1000,
            }
        });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/tilblechschmidt/scan-server:sha-4cb48ea',
            ports: [{ number: 3030 }],
            envFrom: [Env.fromSecret(secret)],
            envVariables: {
                STORAGE_PATH: EnvValue.fromValue('/storage')
            },
            resources: {}
        });

        container.mount('/storage', createHostPathVolume(this, 'storage'));

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