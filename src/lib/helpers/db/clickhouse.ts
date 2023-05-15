import { Construct } from 'constructs';
import { Size } from 'cdk8s';
import { PersistentVolumeClaim } from '../k8s/pvc';
import { Env, Secret, Service, ServiceType, StatefulSet, Volume } from 'cdk8s-plus-26';

export interface ClickhouseProps {
    /// Name of the database to create
    readonly database: string;

    /// Username to authorize
    readonly user: string;

    /// Password for the authorized user
    readonly password: string;

    /// Storage allocation
    readonly storage: Size;

    /// Whether or not the PVC should be retained by flux
    readonly retainClaim?: boolean;
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

        const claim = new PersistentVolumeClaim(this, 'data', {
            storage: props.storage,
            retain: props.retainClaim
        }).instance;

        if (props.retainClaim) {
            claim.metadata.addLabel("kustomize.toolkit.fluxcd.io/prune", "disabled");
        }

        container.mount('/var/lib/clickhouse', Volume.fromPersistentVolumeClaim(this, 'pvc', claim));

        this.serviceName = service.name;
    }

    get connectionURI() {
        return `http://${this.props.user}:${encodeURIComponent(this.props.password)}@${this.serviceName}:8123/${this.props.database}`;
    }
}