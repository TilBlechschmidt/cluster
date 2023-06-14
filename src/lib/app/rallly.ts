import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Postgres } from '../helpers/db/postgres';
import { generateSecret } from '../../helpers';
import { Domain } from '../infra/certManager';

export interface RalllyProps {
    readonly domain: Domain;

    readonly allowedEmails: string,
    readonly authRequired: boolean,

    readonly smtp: RalllyMailProps,
}

export interface RalllyMailProps {
    readonly noReply: string;
    readonly support: string;

    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;

    readonly secure: boolean;
    readonly tls: boolean;
}

export class Rallly extends Construct {
    constructor(scope: Construct, id: string, props: RalllyProps) {
        super(scope, id);

        const db = 'rallly';
        const user = 'rallly';
        const password = generateSecret(`${id}-pg`, 32);

        const postgres = new Postgres(this, 'pg', {
            database: db,
            user,
            password,
        });

        const configMap = new kplus.ConfigMap(this, 'config', {
            data: {
                NEXT_PUBLIC_BASE_URL: `https://${props.domain.fqdn}`,
                DISABLE_LANDING_PAGE: 'true',

                AUTH_REQUIRED: props.authRequired.toString(),
                ALLOWED_EMAILS: props.allowedEmails,

                NOREPLY_EMAIL: props.smtp.noReply,
                SUPPORT_EMAIL: props.smtp.support,

                SMTP_HOST: props.smtp.host,
                SMTP_PORT: props.smtp.port.toString(),
                SMTP_USER: props.smtp.user,
                SMTP_SECURE: props.smtp.secure.toString(),
                SMTP_TLS_ENABLED: props.smtp.tls.toString(),
            }
        });

        const secret = new kplus.Secret(this, 'secrets', {
            stringData: {
                SECRET_PASSWORD: generateSecret(`${id}-app`, 32),
                DATABASE_URL: postgres.connectionURI,
                SMTP_PWD: props.smtp.password
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3000 }],
        });

        new kplus.StatefulSet(this, 'app', {
            containers: [{
                image: 'lukevella/rallly:2.11.0',
                portNumber: 3000,
                envFrom: [
                    kplus.Env.fromConfigMap(configMap),
                    kplus.Env.fromSecret(secret)
                ],
                securityContext: {
                    ensureNonRoot: false
                },
                resources: {}
            }],
            service
        });

        new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(service)
            }]
        });
    }
}
