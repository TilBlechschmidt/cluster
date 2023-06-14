import { Ingress, IngressBackend, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume } from "../../helpers";
import { Domain } from "./certManager";

export interface GrafanaProps {
    readonly domain: Domain;
}

export class Grafana extends Construct {
    constructor(scope: Construct, id: string, props: GrafanaProps) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3000 }],
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'grafana/grafana:9.1.0',
            portNumber: 3000,
            securityContext: {
                group: 472
            },
            resources: {}
        });

        container.mount('/var/lib/grafana', createHostPathVolume(this, 'data'));

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}