import { EnvValue, Ingress, IngressBackend, Service, ServiceType, StatefulSet } from 'cdk8s-plus-26';
import { Construct } from 'constructs';

import { Domain } from '../infra/certManager';

export interface ExcalidrawProps {
    readonly domain: Domain;
}

export class Excalidraw extends Construct {
    constructor(scope: Construct, id: string, props: ExcalidrawProps) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [
                { port: 80, name: 'web' },
                { port: 81, name: 'collab' }
            ],
        });

        new StatefulSet(this, 'app', {
            service,
            containers: [
                {
                    image: 'excalidraw/excalidraw@sha256:55af4d844c13a8578a21f66f21e945ac12bb5269ae68a35cecaffce80d147ec2',
                    portNumber: 80,
                    envVariables: {
                        REACT_APP_WS_SERVER_URL: EnvValue.fromValue(`https://${props.domain.fqdn}/collab`)
                    },
                    securityContext: {
                        ensureNonRoot: false,
                        // TODO Use EmptyDir: /var/cache/nginx/client_temp
                        readOnlyRootFilesystem: false
                    },
                    resources: {}
                },
                {
                    name: 'collab',
                    image: 'excalidraw/excalidraw-room@sha256:ad67411b328c70d10f093782da46102bb768ea51ebc4349abd638255cf37d97e',
                    portNumber: 81,
                    envVariables: {
                        PORT: EnvValue.fromValue('81')
                    },
                    securityContext: {
                        ensureNonRoot: false,
                        // TODO Use EmptyDir: /usr/local/share/.cache/yarn
                        readOnlyRootFilesystem: false,
                    },
                    resources: {}
                }
            ]
        });

        new Ingress(this, props.domain.fqdn, {
            rules: [
                {
                    path: '/collab',
                    host: props.domain.fqdn,
                    backend: IngressBackend.fromService(service, { port: 81 })
                },
                {
                    host: props.domain.fqdn,
                    backend: IngressBackend.fromService(service, { port: 80 })
                }
            ]
        });
    }
}
