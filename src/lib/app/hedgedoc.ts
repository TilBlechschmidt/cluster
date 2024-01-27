import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "../infra/authelia";

export interface HedgeDocProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class HedgeDoc extends WebApp {
    constructor(scope: Construct, id: string, props: HedgeDocProps) {
        const redirectURI = `https://${props.domain.fqdn}/auth/oauth2/callback`;
        const clientSecret = props.oidc.registerClient(id, {
            description: 'HedgeDoc note taking app',
            redirect_uris: [redirectURI]
        });

        super(scope, id, {
            domain: props.domain,
            image: 'quay.io/hedgedoc/hedgedoc:1.9.9',
            port: 3000,
            env: {
                CMD_DOMAIN: props.domain.fqdn,
                CMD_URL_ADDPORT: "false",
                CMD_PROTOCOL_USESSL: "true",

                CMD_DB_URL: 'sqlite:/mount/db/hedgedoc.db',

                CMD_ALLOW_ANONYMOUS: "false",
                CMD_ALLOW_ANONYMOUS_EDITS: "true",

                CMD_EMAIL: 'false',
                CMD_ALLOW_EMAIL_REGISTER: 'false',

                CMD_OAUTH2_PROVIDERNAME: "Authelia",
                CMD_OAUTH2_CLIENT_ID: id,
                CMD_OAUTH2_CLIENT_SECRET: clientSecret,
                CMD_OAUTH2_SCOPE: "openid email profile",
                CMD_OAUTH2_USER_PROFILE_USERNAME_ATTR: "sub",
                CMD_OAUTH2_USER_PROFILE_DISPLAY_NAME_ATTR: "name",
                CMD_OAUTH2_USER_PROFILE_EMAIL_ATTR: "email",
                CMD_OAUTH2_USER_PROFILE_URL: `https://${props.oidc.domain.fqdn}/api/oidc/userinfo`,
                CMD_OAUTH2_TOKEN_URL: `https://${props.oidc.domain.fqdn}/api/oidc/token`,
                CMD_OAUTH2_AUTHORIZATION_URL: `https://${props.oidc.domain.fqdn}/api/oidc/authorize`
            }
        });

        this.container.mount('/hedgedoc/public/uploads', createHostPathVolume(this, 'uploads'));
        this.container.mount('/mount/db', createHostPathVolume(this, 'db'));
    }
}
