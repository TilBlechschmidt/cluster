import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume, generateSecret } from "../../helpers";
import { Authelia } from "../infra/authelia";
import { EnvValue } from "cdk8s-plus-26";
import { MariaDb } from "../helpers/db/mariadb";

export interface BookloreProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class Booklore extends WebApp {
    constructor(scope: Construct, id: string, props: BookloreProps) {
        const dbPassword = generateSecret(`${id}-booklore-mariadb`, 32);

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/booklore-app/booklore:v1.13.2',
            port: 6060,
            unsafeMode: true,
            env: {
                // USER_ID: "1000",
                // GROUP_ID: "1000",

                TZ: "Etc/UTC",
                BOOKLORE_PORT: "6060",

                DATABASE_USERNAME: "booklore",
                DATABASE_PASSWORD: dbPassword,
            },
        });

        const db = new MariaDb(this, 'sql', {
            password: generateSecret(`${id}-booklore-root-mariadb`, 32),
            user: {
                name: "booklore",
                password: dbPassword,
                database: "booklore",
            }
        });

        this.container.env.addVariable("DATABASE_URL", EnvValue.fromValue(`jdbc:mariadb://${db.serviceName}:3306/booklore`));

        this.container.mount('/app/data', createHostPathVolume(this, 'data'));
        this.container.mount('/books', createHostPathVolume(this, 'books'));
        this.container.mount('/bookdrop', createHostPathVolume(this, 'bookdrop'));
    }
}
