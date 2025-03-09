import { Duration } from 'cdk8s';
import { Container, ContainerSecurityContextProps, Ingress, IngressBackend, Probe, Service, ServiceType, StatefulSet } from 'cdk8s-plus-26';
import { Construct } from 'constructs';
import { obj2env } from '../../helpers';
import { Domain } from '../infra/certManager';

export interface WebAppProps {
    domain?: Domain;

    image: string;
    port: number;

    command?: string[];
    args?: string[];
    env?: { [key: string]: string };

    unsafeMode?: boolean;
    hostNetwork?: boolean;

    instantTermination?: boolean;
}

export class WebApp extends Construct {
    container: Container
    ingress!: Ingress
    service: Service
    statefulSet: StatefulSet

    constructor(scope: Construct, id: string, props: WebAppProps) {
        super(scope, id);

        const securityContext: ContainerSecurityContextProps = props.unsafeMode ? {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false
        } : {
            user: 1000,
            group: 3000,
        };

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: props.port }],
        });

        this.statefulSet = new StatefulSet(this, 'app', {
            service,
            hostNetwork: props.hostNetwork,
            terminationGracePeriod: props.instantTermination ? Duration.seconds(0) : Duration.seconds(30)
        });

        this.container = this.statefulSet.addContainer({
            image: props.image,
            portNumber: props.port,
            command: props.command,
            args: props.args,
            securityContext,
            envVariables: obj2env(props.env || {}),
            resources: {},
            // Give heavy apps a little more time to do startup things
            startup: Probe.fromTcpSocket({ initialDelaySeconds: Duration.seconds(10) })
        });

        this.service = service;

        if (props.domain) {
            this.ingress = new Ingress(this, props.domain.fqdn, {
                rules: [{
                    host: props.domain.fqdn,
                    backend: IngressBackend.fromService(service)
                }]
            });
        }
    }
}
