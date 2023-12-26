import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { attachMiddlewares, MiddlewareIdentifier } from "../../network";

export interface SlashProps {
    readonly domain: Domain;
    readonly authMiddleware: MiddlewareIdentifier;
}

export class Slash extends WebApp {
    constructor(scope: Construct, id: string, props: SlashProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'yourselfhosted/slash:0.5.1',
            port: 5231
        });

        this.container.mount('/var/opt/slash', createHostPathVolume(this, 'data'));

        // Since anyone can create an account, we have to restrict access
        attachMiddlewares(this.ingress, [props.authMiddleware]);
    }
}
