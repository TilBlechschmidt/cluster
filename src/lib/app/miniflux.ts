import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Postgres } from '../helpers/db/postgres';
import { generateSecret } from '../../helpers';
import { Domain } from '../infra/certManager';
import { Authelia } from '../infra/authelia';
import { HttpIngressPathType, Ingress, IngressBackend } from 'cdk8s-plus-26';

export interface MinifluxProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class Miniflux extends Construct {
    ingress: Ingress;

    constructor(scope: Construct, id: string, props: MinifluxProps) {
        super(scope, id);

        const db = 'miniflux';
        const user = 'miniflux';
        const password = generateSecret(`${id}-pg`, 32);

        const postgres = new Postgres(this, 'pg', {
            database: db,
            user,
            password,
        });

        const redirectURI = `https://${props.domain.fqdn}/oauth2/oidc/callback`;

        const clientSecret = props.oidc.registerClient(id, {
            description: 'MiniFlux feed aggregator',
            redirect_uris: [redirectURI]
        });

        const configMap = new kplus.ConfigMap(this, 'config', {
            data: {
                BASE_URL: `https://${props.domain.fqdn}`,
                RUN_MIGRATIONS: "1",
                DISABLE_LOCAL_AUTH: "1",
                FETCH_YOUTUBE_WATCH_TIME: "1",
            }
        });

        const secret = new kplus.Secret(this, 'secrets', {
            stringData: {
                DATABASE_URL: postgres.connectionURI + '?sslmode=disable',

                OAUTH2_PROVIDER: 'oidc',
                OAUTH2_CLIENT_ID: id,
                OAUTH2_CLIENT_SECRET: clientSecret,
                OAUTH2_REDIRECT_URL: redirectURI,
                OAUTH2_OIDC_DISCOVERY_ENDPOINT: props.oidc.discoveryUrl.replace('/.well-known/openid-configuration', ''),
                OAUTH2_OIDC_PROVIDER_NAME: 'Authelia',
                OAUTH2_USER_CREATION: '1'
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8080 }],
        });

        new kplus.StatefulSet(this, 'app', {
            containers: [{
                image: 'miniflux/miniflux:2.2.5',
                portNumber: 8080,
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

        this.ingress = new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(service)
            }]
        });

        // Add a second ingress for the share path which should not be restricted to the local network
        new Ingress(this, 'share', {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service),
                pathType: HttpIngressPathType.PREFIX,
                path: '/share',
            }]
        });
    }
}
