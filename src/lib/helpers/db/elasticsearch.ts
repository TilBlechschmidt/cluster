import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume, obj2env } from '../../../helpers';

export interface ElasticSearchProps {
    /// Password for the instance
    readonly password: string;
}

export class ElasticSearch extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, props: ElasticSearchProps) {
        super(scope, id);

        const secret = new kplus.Secret(this, 'auth', {
            stringData: {
                ELASTIC_PASSWORD: props.password
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 9200 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'db', { service });

        const container = statefulSet.addContainer({
            image: 'elasticsearch:8.9.0',
            portNumber: 9200,
            envFrom: [kplus.Env.fromSecret(secret)],
            envVariables: obj2env({
                ES_JAVA_OPTS: '-Xms512m -Xmx512m',
                'xpack.security.enabled': 'true',
                'discovery.type': 'single-node',
                'path.repo': '/usr/share/elasticsearch/data/snapshot'
            }),
            securityContext: {
                readOnlyRootFilesystem: false
            },
            // TODO Disable ulimits?
            resources: {}
        });

        container.mount('/usr/share/elasticsearch/data', createHostPathVolume(this, `data`));

        this.serviceName = service.name;
    }
}