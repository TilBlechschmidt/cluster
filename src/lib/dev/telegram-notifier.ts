import { Env, Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { attachMiddlewares, restrictToLocalNetwork, stripPathPrefix } from "../../network";
import { Domain } from "../infra/certManager";

interface TelegramNotifierProps {
    readonly domain: Domain;

    /// Telegram bot token
    readonly token: string;

    /// Identifier for the default chat
    readonly chatID: string;

    readonly restrictToLocalNetwork?: boolean;
}

export class TelegramNotifier extends Construct {
    constructor(scope: Construct, id: string, props: TelegramNotifierProps) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 3000, targetPort: 3000 }],
        });

        const secret = new Secret(this, 'tokens', {
            stringData: {
                TELOXIDE_TOKEN: props.token,
                DEFAULT_CHAT_ID: props.chatID
            }
        });

        new StatefulSet(this, 'app', {
            service,
            containers: [{
                name: 'telegram-notifier',
                image: 'ghcr.io/tilblechschmidt/telegram-notifier:sha-059df26',
                portNumber: 3000,
                securityContext: {
                    user: 1000,
                    group: 1000,
                },
                envFrom: [Env.fromSecret(secret)],
                resources: {}
            }]
        });

        const ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                path: props.domain.path,
                backend: IngressBackend.fromService(service)
            }]
        });

        const middlewares = [];
        if (props.restrictToLocalNetwork) middlewares.push(restrictToLocalNetwork(this));
        if (props.domain.path) middlewares.push(stripPathPrefix(this, [props.domain.path]));
        attachMiddlewares(ingress, middlewares);
    }
}
