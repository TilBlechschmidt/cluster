import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume, obj2env } from '../../../helpers';

export interface MariaDbProps {
    /// Password for the root user
    readonly password: string;
}

export class MariaDb extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, props: MariaDbProps) {
        super(scope, id);

        const secret = new kplus.Secret(this, 'user', {
            stringData: {
                MYSQL_ROOT_PASSWORD: props.password
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 3306 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: 'mariadb:10.11',
            portNumber: 3306,
            envFrom: [kplus.Env.fromSecret(secret)],
            envVariables: obj2env({ MYSQL_LOG_CONSOLE: 'true', MARIADB_AUTO_UPGRADE: '1' }),
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        container.mount('/var/lib/mysql', createHostPathVolume(this, `data`));

        this.serviceName = service.name;
    }
}