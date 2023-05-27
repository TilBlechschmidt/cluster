import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { ServiceAccount } from '../helpers/k8s/serviceAccount';
import { Domain } from '../infra/certManager';
import { createHostPathVolume } from '../../helpers';

export interface LaunchProps {
    domains: Domain[]
}

export class Launch extends Construct {
    constructor(scope: Construct, id: string, _props: LaunchProps) {
        super(scope, id);

        const serviceAccount = new ServiceAccount(this, 'ServiceAccount', {
            verbs: ["delete", "get", "list", "patch", "create", "update"],
            resources: [kplus.ApiResource.INGRESSES]
        }).instance;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', {
            service,
            serviceAccount,
            automountServiceAccountToken: true
        });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/tilblechschmidt/launch:sha-9ee6175',
            ports: [{ number: 80 }, { number: 8088 }],
            envVariables: {
                /// TODO Pass list of allowed domains
                LAUNCH_SERVICE: { value: service.name }
            },
            securityContext: {
                user: 1000,
                group: 1000,
                readOnlyRootFilesystem: false,
            }
        });

        container.mount('/var/www/bundles', createHostPathVolume(this, 'bundles'));

        new kplus.Service(this, 'api', {
            type: kplus.ServiceType.NODE_PORT,
            ports: [{
                port: 8088,
                nodePort: 1200
            }],
            selector: statefulSet.toPodSelector()
        });
    }
}