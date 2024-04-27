import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume } from '../../../helpers';

export interface RedisProps {
    /// Optional image to use
    readonly image?: string;
}

export class Redis extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, props?: RedisProps) {
        super(scope, id);

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 6379 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: props?.image ?? 'redis/redis-stack-server:7.2.0-v2',
            portNumber: 6379,
            securityContext: {
                user: 1000,
                group: 1000
            },
            resources: {}
        });

        container.mount('/data', createHostPathVolume(this, `data`));

        this.serviceName = service.name;
    }
}