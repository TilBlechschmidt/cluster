import { Env, Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { Domain } from "../infra/certManager";

interface TelegramNotifierProps {
    readonly domain: Domain;

    /// Telegram bot token
    readonly token: string;

    /// HTTP Bearer token required for incoming requests
    readonly secret: string;
}

export class TelegramNotifier extends Construct {
    constructor(scope: Construct, id: string, props: TelegramNotifierProps) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 3000, targetPort: 3000 }],
        });

        const secret = new Secret(this, 'bearer', {
            stringData: {
                BEARER_TOKEN: props.secret,
                TELOXIDE_TOKEN: props.token
            }
        });

        new StatefulSet(this, 'app', {
            service,
            containers: [{
                name: 'telegram-notifier',
                image: 'ghcr.io/tilblechschmidt/telegram-notifier:sha-baa1b94',
                portNumber: 3000,
                securityContext: {
                    user: 1000,
                    group: 1000,
                },
                envFrom: [Env.fromSecret(secret)],
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
