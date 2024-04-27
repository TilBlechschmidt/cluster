import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Postgres } from '../helpers/db/postgres';
import { createHostPathVolume, generateSecret, obj2env } from '../../helpers';
import { Domain } from '../infra/certManager';
import { Volume } from 'cdk8s-plus-26';
import { Redis } from '../helpers/db/redis';

export interface ImmichProps {
    readonly domain: Domain;
    readonly uploadPath: string;
}

export class Immich extends Construct {
    constructor(scope: Construct, id: string, props: ImmichProps) {
        super(scope, id);

        const db = 'immich';
        const user = 'immich';
        const password = generateSecret(`${id}-pg`, 32);

        const postgres = new Postgres(this, 'pg', {
            database: db,
            user,
            password,
            image: 'tensorchord/pgvecto-rs:pg14-v0.1.11@sha256:0335a1a22f8c5dd1b697f14f079934f5152eaaa216c09b61e293be285491f8ee'
        });

        const redis = new Redis(this, 'redis', {
            image: 'redis:6.2-alpine@sha256:afb290a0a0d0b2bd7537b62ebff1eb84d045c757c1c31ca2ca48c79536c0de82'
        });

        const secret = new kplus.Secret(this, 'secrets', {
            stringData: {
                DB_URL: postgres.connectionURI,
            }
        });

        const ml = new kplus.StatefulSet(this, 'ml', {
            containers: [{
                image: 'ghcr.io/immich-app/immich-machine-learning:v1.94.1',
                portNumber: 3003,
                resources: {},
                securityContext: {
                    user: 1000,
                    group: 1000,
                    readOnlyRootFilesystem: false,
                }
            }]
        });

        const common = {
            image: 'ghcr.io/immich-app/immich-server:v1.94.1',
            resources: {},
            securityContext: {
                user: 1000,
                group: 1000,
                readOnlyRootFilesystem: false
            },
            envFrom: [kplus.Env.fromSecret(secret)],
            envVariables: obj2env({
                REDIS_HOSTNAME: redis.serviceName,
                IMMICH_MACHINE_LEARNING_URL: `http://${ml.service.name}:3003`
            })
        };

        const microservices = new kplus.StatefulSet(this, 'microservices', {
            containers: [{
                command: ["/bin/sh", "./start-microservices.sh"],
                portNumber: 3002,
                ...common
            }]
        });

        const server = new kplus.StatefulSet(this, 'server', {
            containers: [{
                command: ["/bin/sh", "./start-server.sh"],
                portNumber: 3001,
                ...common
            }]
        });

        ml.containers[0].mount('/cache', createHostPathVolume(this, 'ml-cache'));

        let dataVolume = createHostPathVolume(this, 'data');
        microservices.containers[0].mount(`/usr/src/app/upload`, dataVolume);
        server.containers[0].mount(`/usr/src/app/upload`, dataVolume);

        microservices.containers[0].mount(`/usr/src/app/upload/upload`, Volume.fromHostPath(this, `upload-microservices`, `upload-microservices`, { path: props.uploadPath }));
        server.containers[0].mount(`/usr/src/app/upload/upload`, Volume.fromHostPath(this, `upload-server`, `upload-server`, { path: props.uploadPath }));

        new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(server.service)
            }]
        });

        // const configMap = new kplus.ConfigMap(this, 'config', {
        //     data: {
        //         NEXT_PUBLIC_BASE_URL: `https://${props.domain.fqdn}`,
        //         DISABLE_LANDING_PAGE: 'true',

        //         AUTH_REQUIRED: props.authRequired.toString(),
        //         ALLOWED_EMAILS: props.allowedEmails,

        //         NOREPLY_EMAIL: `${props.smtp.sender}@${props.smtp.domain}`,
        //         SUPPORT_EMAIL: `${props.smtp.sender}@${props.smtp.domain}`,

        //         SMTP_HOST: props.smtp.host,
        //         SMTP_PORT: props.smtp.port.toString(),
        //         SMTP_USER: props.smtp.user,
        //         SMTP_SECURE: true.toString(),
        //         SMTP_TLS_ENABLED: true.toString(),
        //     }
        // });

        // const service = new kplus.Service(this, id, {
        //     type: kplus.ServiceType.CLUSTER_IP,
        //     ports: [{ port: 80, targetPort: 3000 }],
        // });

        // new kplus.StatefulSet(this, 'app', {
        //     containers: [{
        //         image: 'lukevella/rallly:2.11.0',
        //         portNumber: 3000,
        //         envFrom: [
        //             kplus.Env.fromConfigMap(configMap),
        //             kplus.Env.fromSecret(secret)
        //         ],
        //         securityContext: {
        //             ensureNonRoot: false
        //         },
        //         resources: {}
        //     }],
        //     service
        // });
    }
}
