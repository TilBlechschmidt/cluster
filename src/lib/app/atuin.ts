import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { generateSecret, obj2env } from '../../helpers';
import { Env, ImagePullPolicy, Ingress, IngressBackend, Secret, Volume } from 'cdk8s-plus-26';
import { Postgres } from '../helpers/db/postgres';

export interface AtuinProps {
    readonly domain: Domain,

    /// Allows creation of new accounts by anyone
    readonly openRegistration: boolean
}

export class Atuin extends Construct {
    constructor(scope: Construct, id: string, props: AtuinProps) {
        super(scope, id);

        const postgres = new Postgres(this, 'pg', {
            database: 'atuin',
            user: 'atuin',
            password: generateSecret(`${id}-pg`, 16),
        });

        const secret = new Secret(this, 'token');
        secret.addStringData('ATUIN_DB_URI', postgres.connectionURI)

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ name: 'atuin', port: 80, targetPort: 3030 }, { name: 'atuin-graph', port: 81, targetPort: 8889 }],
        });

        const statefulset = new kplus.StatefulSet(this, 'app', {
            service,
            securityContext: {
                user: 1000,
                group: 1000,
            }
        });

        const main = statefulset.addContainer({
            image: 'ghcr.io/atuinsh/atuin:16.0',
            args: ['server', 'start'],
            ports: [{ number: 3030 }],
            envFrom: [Env.fromSecret(secret)],
            envVariables: obj2env({
                ATUIN_HOST: '0.0.0.0',
                ATUIN_PORT: '3030',
                ATUIN_OPEN_REGISTRATION: String(props.openRegistration)
            }),
            resources: {}
        });

        const graph = statefulset.addContainer({
            name: 'graph',
            image: 'ghcr.io/tilblechschmidt/atuin-graph:latest',
            ports: [{ number: 8889 }],
            envFrom: [Env.fromSecret(secret)],
            resources: {},
            imagePullPolicy: ImagePullPolicy.ALWAYS
        });

        main.mount('/config', Volume.fromEmptyDir(this, 'config', 'config'));
        graph.mount('/tmp', Volume.fromEmptyDir(this, 'tmp', 'tmp'));

        new Ingress(this, props.domain.fqdn, {
            rules: [
                {
                    host: props.domain.fqdn,
                    backend: IngressBackend.fromService(service, { port: 80 })
                },
                {
                    host: props.domain.fqdn,
                    path: '/graph',
                    backend: IngressBackend.fromService(service, { port: 81 })
                }
            ]
        });
    }
}
