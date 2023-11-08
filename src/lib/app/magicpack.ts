import { ConfigMap, Volume } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { attachMiddlewares, MiddlewareIdentifier } from "../../network";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";

export interface Computer {
    name: string,

    computer: {
        name: string,
        location: string,
        mac: string,
        dns: string
    }
}

export interface MagicPackProps {
    domain: Domain;
    computers: { [key: string]: Computer };
    authMiddleware?: MiddlewareIdentifier;
}

export class MagicPack extends WebApp {
    constructor(scope: Construct, id: string, props: MagicPackProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'alexswki/magicpack:1.2',
            port: 3000,
            unsafeMode: true,
            hostNetwork: true,
            env: {
                NEXT_PUBLIC_URL: `https://${props.domain.fqdn}`,
            }
        });

        const configMap = new ConfigMap(this, 'computers', {
            data: {
                'computers.json': JSON.stringify(props.computers)
            }
        });

        this.container.mount('/magicpack/computers.json', Volume.fromConfigMap(this, 'config', configMap), {
            subPath: 'computers.json'
        });

        if (props.authMiddleware) {
            attachMiddlewares(this.ingress, [props.authMiddleware]);
        }
    }
}
