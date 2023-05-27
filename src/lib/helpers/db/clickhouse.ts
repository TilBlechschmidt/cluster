import { Construct } from 'constructs';
import { Env, Secret, Service, ServiceType, StatefulSet } from 'cdk8s-plus-26';
import { createHostPathVolume } from '../../../helpers';

export interface ClickhouseProps {
    /// Name of the database to create
    readonly database: string;

    /// Username to authorize
    readonly user: string;

    /// Password for the authorized user
    readonly password: string;
}

export class Clickhouse extends Construct {
    serviceName: string;

    private props: ClickhouseProps;

    constructor(scope: Construct, id: string, props: ClickhouseProps) {
        super(scope, id);

        this.props = props;

        const secret = new Secret(this, 'user', {
            stringData: {
                CLICKHOUSE_DB: props.database,
                CLICKHOUSE_USER: props.user,
                CLICKHOUSE_PASSWORD: props.password
            }
        });

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 8123 }],
        });

        const statefulSet = new StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: 'yandex/clickhouse-server:22.1.3.7-alpine',
            portNumber: 8123,
            envFrom: [Env.fromSecret(secret)],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        container.mount('/var/lib/clickhouse', createHostPathVolume(this, `data`));

        this.serviceName = service.name;
    }

    get connectionURI() {
        return `http://${this.props.user}:${encodeURIComponent(this.props.password)}@${this.serviceName}:8123/${this.props.database}`;
    }
}