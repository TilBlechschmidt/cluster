import { Size } from "cdk8s";
import { ConfigMap, Env, Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { generateSecret } from "../../helpers";
import { Clickhouse } from "../helpers/db/clickhouse";
import { Postgres } from "../helpers/db/postgres";
import { Domain } from "../infra/certManager";

interface PlausibleProps {
    readonly domain: Domain;
    readonly disableRegistration?: string;
}

export class Plausible extends Construct {
    constructor(scope: Construct, id: string, props: PlausibleProps) {
        super(scope, id);

        const postgres = new Postgres(this, 'pg', {
            database: 'plausible',
            user: 'plausible',
            password: generateSecret(`${id}-pg`, 16),
            storage: Size.gibibytes(1),
            retainClaim: true
        });

        const clickhouse = new Clickhouse(this, 'clickhouse', {
            database: 'plausible',
            user: 'plausible',
            password: generateSecret(`${id}-pg`, 16),
            storage: Size.gibibytes(1),
            retainClaim: true
        });

        const configMap = new ConfigMap(this, 'config');
        const secret = new Secret(this, 'secrets');

        configMap.addData('DISABLE_REGISTRATION', props.disableRegistration || 'invite_only');
        configMap.addData('BASE_URL', `https://${props.domain.fqdn}`);
        secret.addStringData('SECRET_KEY_BASE', generateSecret(`${id}-secret`, 64));
        secret.addStringData('DATABASE_URL', postgres.connectionURI);
        secret.addStringData('CLICKHOUSE_DATABASE_URL', clickhouse.connectionURI);

        const envFrom = [
            Env.fromConfigMap(configMap),
            Env.fromSecret(secret)
        ];

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8000 }],
        });

        new StatefulSet(this, 'app', {
            service,
            initContainers: [{
                image: 'plausible/analytics:latest',
                command: ['/bin/sh', '-c'],
                args: ['/entrypoint.sh db createdb && /entrypoint.sh db migrate'],
                envFrom,
                securityContext: {
                    ensureNonRoot: false
                },
                resources: {}
            }],
            containers: [{
                image: 'plausible/analytics:latest',
                portNumber: 8000,
                envFrom,
                securityContext: {
                    ensureNonRoot: false,
                    readOnlyRootFilesystem: false
                },
                resources: {}
            }]
        });

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}
