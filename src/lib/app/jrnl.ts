import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "../infra/authelia";

export interface JrnlProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
    /// Group that has access
    readonly group: string;
}

export class Jrnl extends WebApp {
    constructor(scope: Construct, id: string, props: JrnlProps) {
        const redirectURI = `https://${props.domain.fqdn}/auth/callback`;
        const clientSecret = props.oidc.registerClient(id, {
            description: 'Personal journal app',
            redirect_uris: [redirectURI]
        });

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/tilblechschmidt/jrnl:sha-56098c4',
            port: 8080,
            env: {
                THOUGHT_STORAGE_LOCATION: "/var/lib/jrnl",
                THOUGHT_OIDC_ISSUER_URL: `https://${props.oidc.domain.fqdn}`,
                THOUGHT_OIDC_REDIRECT_URL: redirectURI,
                THOUGHT_OIDC_CLIENT_ID: id,
                THOUGHT_OIDC_CLIENT_SECRET: clientSecret,
                THOUGHT_OIDC_SCOPES: "email profile groups",
                THOUGHT_OIDC_GROUPS: "journal"
            }
        });

        this.container.mount('/var/lib/jrnl', createHostPathVolume(this, 'data'));
    }
}
