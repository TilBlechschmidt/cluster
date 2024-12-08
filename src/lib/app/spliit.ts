import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { generateSecret } from "../../helpers";
import { Postgres } from "../helpers/db/postgres";
import { Env, Secret } from "cdk8s-plus-26";

export interface SpliitProps {
    domain: Domain;
}

export class Spliit extends WebApp {
    constructor(scope: Construct, id: string, props: SpliitProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/crazy-max/spliit:1.14.1',
            port: 3000,
            env: {
                TZ: 'Europe/Berlin',
            }
        });

        const postgres = new Postgres(this, 'pg', {
            database: 'spliit',
            user: 'spliit',
            password: generateSecret(`${id}-pg`, 16),
        });

        const credentials = new Secret(this, 'pg-credentials', {
            stringData: {
                POSTGRES_HOST: postgres.serviceName,
                POSTGRES_DB: postgres.database,
                POSTGRES_USER: postgres.user,
                POSTGRES_PASSWORD: postgres.password,
            }
        });

        this.container.env.copyFrom(Env.fromSecret(credentials));
    }
}
