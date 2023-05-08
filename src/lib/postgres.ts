import { Construct } from 'constructs';
import { Size } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';
import { PersistentVolumeClaim } from './pvc';

export interface PostgresProps {
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

export class Postgres extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, props: PostgresProps) {
        super(scope, id);

        const secret = new kplus.Secret(this, 'user', {
            stringData: {
                POSTGRES_DB: props.database,
                POSTGRES_USER: props.user,
                POSTGRES_PASSWORD: props.password
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 5432 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: 'postgres:15.2-alpine3.17',
            portNumber: 5432,
            envFrom: [kplus.Env.fromSecret(secret)],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            }
        });

        const claim = new PersistentVolumeClaim(this, 'data', {
            storage: props.storage,
            retain: props.retainClaim
        }).instance;

        if (props.retainClaim) {
            claim.metadata.addLabel("kustomize.toolkit.fluxcd.io/prune", "disabled");
        }

        container.mount('/var/lib/postgresql/data', kplus.Volume.fromPersistentVolumeClaim(this, 'pvc', claim));

        this.serviceName = service.name;
    }
}