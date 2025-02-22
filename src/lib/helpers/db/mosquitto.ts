import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume } from '../../../helpers';
import { Volume } from 'cdk8s-plus-26';

export interface MosquittoProps {
    /// Optional image to use
    readonly image?: string;
}

export class Mosquitto extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, props?: MosquittoProps) {
        super(scope, id);

        const config = new kplus.Secret(this, 'config', {
            stringData: {
                // 'pwfile': `test:test`,
                'mosquitto.conf': `
listener 1883 0.0.0.0
listener 9001 0.0.0.0
protocol websockets
allow_anonymous true

#password_file /mosquitto/config/pwfile

#persistence false
#persistence_file mosquitto.db
#persistence_location /mosquitto/data/`
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 1883, name: 'mqtt' }, { port: 9001, name: 'mqtt-ws' }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: props?.image ?? 'eclipse-mosquitto:2.0.18',
            ports: [
                { number: 1883, name: 'mqtt', hostPort: 1883 },
                { number: 9001, name: 'mqtt-ws', hostPort: 9001 }
            ],
            securityContext: {
                user: 1000,
                group: 1000
            },
            resources: {}
        });

        container.mount('/mosquitto/data', createHostPathVolume(this, `data`));
        container.mount('/mosquitto/log', createHostPathVolume(this, `log`));
        container.mount('/mosquitto/config', Volume.fromSecret(this, 'config-vol', config));

        this.serviceName = service.name;
    }
}
