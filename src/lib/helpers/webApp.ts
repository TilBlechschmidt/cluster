import { ContainerSecurityContextProps, Ingress, IngressBackend, Service, ServiceType, StatefulSet } from 'cdk8s-plus-26';
import { Construct } from 'constructs';
import { Domain } from '../infra/certManager';

export interface WebAppProps {
    domain: Domain;

    image: string;
    port: number;
    args?: string[];
}

export class WebApp extends Construct {

    constructor(scope: Construct, id: string, props: WebAppProps) {
        super(scope, id);

        const securityContext: ContainerSecurityContextProps = {
            user: 1000,
            group: 3000,
        };

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: props.port }],
        });

        new StatefulSet(this, 'app', {
            service,
            containers: [{
                image: props.image,
                portNumber: props.port,
                args: props.args,
                securityContext,
                resources: {}
            }]
        });

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}
