import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume } from '../../../helpers';

export interface PostgresProps {
    /// Name of the database to create
    readonly database: string;

    /// Username to authorize
    readonly user: string;

    /// Password for the authorized user
    readonly password: string;

    /// Optional image to use
    readonly image?: string;

    /// Optional args to use
    readonly args?: string[];

    /// Additional container security context values
    readonly securityContext?: kplus.ContainerSecurityContextProps;
}

export class Postgres extends Construct {
    serviceName: string;

    private props: PostgresProps;

    constructor(scope: Construct, id: string, props: PostgresProps) {
        super(scope, id);

        this.props = props;

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
            image: props.image ?? 'postgres:15.2-alpine3.17',
            portNumber: 5432,
            args: props.args,
            envFrom: [kplus.Env.fromSecret(secret)],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false,
                ...props.securityContext
            },
            resources: {}
        });

        container.mount('/var/lib/postgresql/data', createHostPathVolume(this, `data`));

        this.serviceName = service.name;
    }

    get database() {
        return this.props.database;
    }

    get user() {
        return this.props.user;
    }

    get password() {
        return this.props.password;
    }

    get connectionURI() {
        return `postgres://${this.props.user}:${encodeURIComponent(this.props.password)}@${this.serviceName}:5432/${this.props.database}`;
    }
}