import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { Redis } from "../helpers/db/redis";
import { EnvValue, HttpIngressPathType, Ingress, IngressBackend } from "cdk8s-plus-26";
import * as kplus from 'cdk8s-plus-26';
import { createHostPathVolume, generateSecret } from "../../helpers";
import { Authelia } from "../infra/authelia";

export interface PaperlessProps {
    readonly domain: Domain;
    readonly oidc: Authelia;

    // While Paperless does support OIDC, setting it up without user interaction
    // inside K8s/Docker is an afterthought. Users created from it do not have
    // any permissions by default and it is not possible to assign admin permissions
    // to a user that is created via OIDC automatically.
    //
    // As a result, we need to first start in a "setup" configuration where:
    //
    //   0. Regular password login is still enabled
    //   1. An admin user is created using `PAPERLESS_ADMIN_USER`
    //   2. OIDC is pre-configured but not active by default (no automatic redirect)
    //
    // This allows us to login using the automatically created admin user, link it
    // with the OIDC provider from the user settings, and finally disable the setup
    // mode again. From that point onwards, our initial user will have admin permissions
    // and is now able to distribute permissions to users which are signing up via OIDC
    // later on. Definitely suboptimal but it works I suppose and only needs to be done once.
    //
    // NOTE: This MUST be set on first startup or else the admin user WILL NOT be created!
    readonly setup?: PaperlessSetupProps;
}

export interface PaperlessSetupProps {
    user: string,
    mail: string,
}

export class Paperless extends WebApp {
    constructor(scope: Construct, id: string, props: PaperlessProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/paperless-ngx/paperless-ngx:2.13',
            port: 8000,
            unsafeMode: true,
            env: {
                PAPERLESS_URL: `https://${props.domain.fqdn}`,
                PAPERLESS_TRUSTED_PROXIES: '10.0.0.0/8',

                PAPERLESS_TIKA_ENABLED: "1",

                PAPERLESS_TASK_WORKERS: "3",
                PAPERLESS_THREADS_PER_WORKER: "4",

                PAPERLESS_TIME_ZONE: 'Europe/Berlin',

                PAPERLESS_OCR_LANGUAGE: 'deu',
                PAPERLESS_OCR_DESKEW: '0',

                PAPERLESS_FILENAME_FORMAT: '{{ created_year }}/{{ correspondent }}/{{ created }} {{ title }}',
                PAPERLESS_FILENAME_FORMAT_REMOVE_NONE: '1',

                PAPERLESS_CONSUMER_ENABLE_BARCODES: '1',
                PAPERLESS_CONSUMER_ENABLE_ASN_BARCODE: '1',

                PAPERLESS_CONSUMER_BARCODE_UPSCALE: '2.0',
                PAPERLESS_CONSUMER_BARCODE_DPI: '600',

                PAPERLESS_NUMBER_OF_SUGGESTED_DATES: '5',
                PAPERLESS_IGNORE_DATES: '28.02.1998',

                USERMAP_UID: "1000",
                USERMAP_GID: "3000",
            }
        });


        // Location where to-be-ingested files should be placed
        this.container.mount('/usr/src/paperless/consume', createHostPathVolume(this, `consume`));

        // Location for documents and thumbnails
        this.container.mount('/usr/src/paperless/media', createHostPathVolume(this, `media`));

        // Internal data path for SQLite, indices, ML models and so on
        this.container.mount('/usr/src/paperless/data', createHostPathVolume(this, `data`));

        // Add a second ingress for the share path which should not be restricted to the local network
        new Ingress(this, 'share', {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(this.service),
                pathType: HttpIngressPathType.PREFIX,
                path: '/share',
            }]
        });

        this.setupAuth(id, props);
        this.setupRedis();
        this.setupTika();
        this.setupGotenberg();
    }

    setupRedis() {
        const redis = new Redis(this, 'redis');
        this.container.env.addVariable("PAPERLESS_REDIS", EnvValue.fromValue(`redis://${redis.serviceName}:6379`));
    }

    setupTika() {
        const tika = new kplus.StatefulSet(this, 'tika', {
            containers: [{
                image: 'docker.io/apache/tika:3.0.0.0',
                portNumber: 9998,
                resources: {},
                securityContext: {
                    readOnlyRootFilesystem: false,
                    user: 1000,
                    group: 3000,
                },
            }]
        });

        this.container.env.addVariable("PAPERLESS_TIKA_ENDPOINT", EnvValue.fromValue(`http://${tika.service.name}:9998`));
    }

    setupGotenberg() {
        const gotenberg = new kplus.StatefulSet(this, 'gotenberg', {
            containers: [{
                image: 'docker.io/gotenberg/gotenberg:8.7',
                portNumber: 3000,
                resources: {},
                securityContext: {
                    readOnlyRootFilesystem: false,
                    user: 1000,
                    group: 3000,
                },
                command: [
                    "gotenberg",
                    "--chromium-disable-javascript=true",
                    "--chromium-allow-list=file:///tmp/.*"
                ]
            }]
        });

        this.container.env.addVariable("PAPERLESS_TIKA_GOTENBERG_ENDPOINT", EnvValue.fromValue(`http://${gotenberg.service.name}:3000`));
    }

    setupAuth(id: string, props: PaperlessProps) {
        let authenticationConfig: object = {
            // Disable regular auth and use OIDC by default
            PAPERLESS_DISABLE_REGULAR_LOGIN: '1',
            PAPERLESS_REDIRECT_LOGIN_TO_SSO: '1',
            PAPERLESS_SOCIAL_AUTO_SIGNUP: '1',
        };

        if (props.setup) {
            // Disable automatic OIDC login and configure a default admin user
            authenticationConfig = {
                PAPERLESS_ADMIN_USER: props.setup.user,
                PAPERLESS_ADMIN_MAIL: props.setup.mail,
                PAPERLESS_ADMIN_PASSWORD: generateSecret(id + 'admin', 64),
            }
        }

        const secret = new kplus.Secret(this, 'secrets', {
            stringData: {
                PAPERLESS_SECRET_KEY: generateSecret(id, 64),

                ...authenticationConfig,

                // OIDC provider configuration
                PAPERLESS_APPS: 'allauth.socialaccount.providers.openid_connect',
                PAPERLESS_SOCIALACCOUNT_DEFAULT_PERMISSIONS: '["view_uisettings", "view_savedview", "add_uisettings", "change_uisettings", "delete_uisettings"]',
                PAPERLESS_SOCIALACCOUNT_PROVIDERS: JSON.stringify({
                    "openid_connect": {
                        "SCOPE": ["openid", "email", "profile", "groups"],
                        "OAUTH_PKCE_ENABLED": true,
                        "APPS": [
                            {
                                "provider_id": "authelia",
                                "name": "Authelia",
                                "client_id": id,
                                "secret": props.oidc.registerClient(id, {
                                    description: 'Document archival software',
                                    redirect_uris: [`https://${props.domain.fqdn}/accounts/oidc/authelia/login/callback/`]
                                }),
                                "settings": {
                                    "server_url": props.oidc.discoveryUrl,
                                }
                            }
                        ]
                    }
                }),
            }
        });

        this.container.env.copyFrom(kplus.Env.fromSecret(secret));
    }
}
