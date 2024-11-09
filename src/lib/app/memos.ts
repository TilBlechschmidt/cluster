import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "../infra/authelia";

export interface MemosProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class Memos extends WebApp {
    constructor(scope: Construct, id: string, props: MemosProps) {
        const redirectURI = `https://${props.domain.fqdn}/auth/callback`;
        // @ts-ignore
        const clientSecret = props.oidc.registerClient(id, {
            description: 'Memos note app',
            redirect_uris: [redirectURI]
        });

        super(scope, id, {
            domain: props.domain,
            image: 'neosmemo/memos:0.22.0',
            port: 5230,
        });

        this.container.mount('/var/opt/memos', createHostPathVolume(this, 'data'));
    }
}
