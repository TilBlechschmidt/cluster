import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { attachMiddlewares, MiddlewareIdentifier } from "../../network";

export interface PartDBProps {
    readonly domain: Domain;
    readonly instance_name: string;
    readonly providers?: { digikey?: DigikeyProviderProps, lcsc?: boolean };
    readonly authMiddleware?: MiddlewareIdentifier;
}

export interface DigikeyProviderProps {
    id: string;
    secret: string;
}

export class PartDB extends WebApp {
    constructor(scope: Construct, id: string, props: PartDBProps) {
        const providerEnv: { [key: string]: string } = {};
        const digikey = props.providers?.digikey;

        if (digikey?.id && digikey?.secret) {
            providerEnv['PROVIDER_DIGIKEY_CLIENT_ID'] = digikey?.id;
            providerEnv['PROVIDER_DIGIKEY_SECRET'] = digikey?.secret;
        }

        if (props.providers?.lcsc) {
            providerEnv['PROVIDER_LCSC_ENABLED'] = '1';
        }

        super(scope, id, {
            domain: props.domain,
            image: 'jbtronics/part-db1:v1.11.3',
            port: 80,
            unsafeMode: true,
            env: {
                DATABASE_URL: "sqlite:///%kernel.project_dir%/var/db/app.db",

                APP_ENV: "docker",
                CHECK_FOR_UPDATES: "0",

                DEFAULT_LANG: "en",
                DEFAULT_TIMEZONE: "Europe/Berlin",
                BASE_CURRENCY: "EUR",

                DEFAULT_URI: `https://${props.domain.fqdn}/`,
                TRUSTED_PROXIES: '10.0.0.0/8',

                INSTANCE_NAME: props.instance_name,

                ...providerEnv
            }
        });

        this.container.mount('/var/www/html/var/db', createHostPathVolume(this, 'db'));
        this.container.mount('/var/www/html/public/media', createHostPathVolume(this, 'media'));
        this.container.mount('/var/www/html/uploads', createHostPathVolume(this, 'uploads'));

        if (props.authMiddleware) {
            attachMiddlewares(this.ingress, [props.authMiddleware]);
        }
    }
}
