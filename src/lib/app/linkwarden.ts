import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume, generateSecret } from "../../helpers";
import { Authelia } from "../infra/authelia";
import { Postgres } from "../helpers/db/postgres";
import { EnvValue } from "cdk8s-plus-26";

export interface LinkwardenProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class Linkwarden extends WebApp {
    constructor(scope: Construct, id: string, props: LinkwardenProps) {
        const clientSecret = props.oidc.registerClient(id, {
            description: 'Linkwarden',
            redirect_uris: [`https://${props.domain.fqdn}/api/v1/auth/callback/authentik`]
        });

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/linkwarden/linkwarden:v2.3.0',
            port: 3000,
            env: {
                NEXTAUTH_URL: `https://${props.domain.fqdn}`,
                NEXTAUTH_SECRET: generateSecret(`${id}-nextauth`, 32),

                NEXT_PUBLIC_DISABLE_REGISTRATION: 'false',
                NEXT_PUBLIC_AUTHENTIK_ENABLED: 'true',
                AUTHENTIK_CLIENT_ID: id,
                AUTHENTIK_CLIENT_SECRET: clientSecret,
                AUTHENTIK_ISSUER: `https://${props.oidc.domain.fqdn}`,

                AUTOSCROLL_TIMEOUT: '300'
            },
            // *sigh* NextJS and yarn writing stuff all over the place ...
            unsafeMode: true
        });

        const postgres = new Postgres(this, 'pg', {
            database: 'linkwarden',
            user: 'linkwarden',
            password: generateSecret(`${id}-pg`, 32),
        });

        this.container.mount('/data/data', createHostPathVolume(this, 'data'));
        this.container.env.addVariable('DATABASE_URL', EnvValue.fromValue(postgres.connectionURI));
    }
}
