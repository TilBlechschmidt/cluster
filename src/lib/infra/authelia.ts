import { Construct } from 'constructs';
import { ApiObject, JsonPatch, Lazy } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';
import * as yaml from 'js-yaml';
import { Middleware } from '../../imports/traefik.containo.us';
import { createHostPathVolume, generateAutheliaDigest, generateSecret } from '../../helpers';
import { Domain } from './certManager';

interface AutheliaProps {
    readonly secrets: AutheliaSecrets,
    readonly users: { [name: string]: AutheliaUser },

    readonly config: {
        readonly defaultRedirectUrl: string;
        readonly domain: string;
        readonly defaultPolicy?: 'two_factor' | 'one_factor';
    },

    readonly domain: Domain;
}

interface AutheliaUser {
    readonly disabled: boolean,
    readonly displayname: string;
    readonly password: string;
    readonly email: string;
    readonly groups: string[];
}

interface AutheliaSecrets {
    readonly smtpPassword: string;
    readonly jwtToken?: string;
    readonly encryption?: {
        readonly sessionKey?: string;
        readonly storageKey?: string;
    }
    readonly oidc: {
        readonly hmacSecret?: string,
        readonly privateKey: string
    }
}

export class Authelia extends Construct {
    config: any;
    configMap: kplus.ConfigMap;
    discoveryUrl: string;
    domain: Domain;

    constructor(scope: Construct, id: string, props: AutheliaProps) {
        super(scope, id);

        const encryption = props.secrets.encryption || {};

        let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        config.default_redirection_url = `https://${props.config.defaultRedirectUrl}`;
        config.totp.issuer = props.config.domain;
        config.session.domain = props.config.domain;
        config.access_control.default_policy = props.config.defaultPolicy || 'two_factor';

        const configMap = new kplus.ConfigMap(this, 'config', {
            data: {
                "configuration.yaml": Lazy.any({ produce: () => yaml.dump(this.config) })
            }
        });

        const secretUsers = new kplus.Secret(this, 'users');
        secretUsers.addStringData("users.yaml", yaml.dump({ users: props.users }));

        const secretKeys = new kplus.Secret(this, 'keys', {
            stringData: {
                SMTP_PASSWORD: props.secrets.smtpPassword,
                JWT_TOKEN: props.secrets.jwtToken || generateSecret(`authelia-${id}-jwt`, 48),
                SESSION_ENCRYPTION_KEY: encryption.sessionKey || generateSecret(`authelia-${id}-encr-session`, 48),
                STORAGE_ENCRYPTION_KEY: encryption.storageKey || generateSecret(`authelia-${id}-encr-storage`, 48),
                OIDC_HMAC_SECRET: props.secrets.oidc.hmacSecret || generateSecret(`authelia-${id}-oidc-hmac`, 48),
                OIDC_PRIVATE_KEY: props.secrets.oidc.privateKey
            }
        });

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 9091 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'ghcr.io/authelia/authelia:4.37.5',
            args: ["--config=/config/configuration.yaml"],
            command: ["authelia"],
            portNumber: 9091,
            liveness: kplus.Probe.fromHttpGet("/api/health"),
            readiness: kplus.Probe.fromHttpGet("/api/health"),
            envVariables: {
                "AUTHELIA_SERVER_DISABLE_HEALTHCHECK": { value: "true" },
                "AUTHELIA_JWT_SECRET_FILE": { value: "/secrets/JWT_TOKEN" },
                "AUTHELIA_SESSION_SECRET_FILE": { value: "/secrets/SESSION_ENCRYPTION_KEY" },
                "AUTHELIA_NOTIFIER_SMTP_PASSWORD_FILE": { value: "/secrets/SMTP_PASSWORD" },
                "AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE": { value: "/secrets/STORAGE_ENCRYPTION_KEY" },
                "AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET_FILE": { value: "/secrets/OIDC_HMAC_SECRET" },
                "AUTHELIA_IDENTITY_PROVIDERS_OIDC_ISSUER_PRIVATE_KEY_FILE": { value: "/secrets/OIDC_PRIVATE_KEY" }
            },
            securityContext: {
                ensureNonRoot: false
            },
            resources: {}
        });

        container.mount("/data", createHostPathVolume(this, 'db'));
        container.mount("/secrets", kplus.Volume.fromSecret(this, 'mounted-secrets', secretKeys));
        container.mount("/users", kplus.Volume.fromSecret(this, 'mounted-users', secretUsers));
        container.mount("/config", kplus.Volume.fromConfigMap(this, 'mounted-config', configMap));

        ApiObject.of(statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/enableServiceLinks", false));

        new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(statefulSet.service)
            }]
        });

        new Middleware(this, 'forwardAuth', {
            metadata: {},
            spec: {
                forwardAuth: {
                    address: `http://${service.name}.${service.metadata.namespace}.svc.cluster.local/api/verify?rd=https%3A%2F%2F${encodeURIComponent(props.domain.fqdn)}%2F`,
                    authResponseHeaders: [
                        "Remote-User",
                        "Remote-Name",
                        "Remote-Email",
                        "Remote-Groups"
                    ]
                }
            }
        });

        this.config = config;
        this.configMap = configMap;
        this.domain = props.domain;
        this.discoveryUrl = `https://${props.domain.fqdn}/.well-known/openid-configuration`;
    }

    registerClient(id: string, props: ClientRegistrationProps): string {
        const plaintextSecret = generateSecret(`oidc-${id}`, 32);

        const client = {
            id,
            secret: generateAutheliaDigest(plaintextSecret),
            scopes: ["openid", "email", "profile", "groups"],
            grant_types: ["refresh_token", "authorization_code"],
            ...props
        };

        this.config.identity_providers.oidc.clients.push(client);

        return plaintextSecret;
    }
}

export interface ClientRegistrationProps {
    description: string,
    redirect_uris: string[],

    scopes?: string[],
    grants?: string[],

    authorization_policy?: string,
}

const DEFAULT_CONFIG = {
    "theme": "dark",
    "default_redirection_url": "",
    "default_2fa_method": "",
    "server": {
        "host": "0.0.0.0",
        "port": 9091,
        "asset_path": "",
        "headers": {
            "csp_template": ""
        },
        "buffers": {
            "read": 4096,
            "write": 4096
        },
        "timeouts": {
            "read": "6s",
            "write": "6s",
            "idle": "30s"
        },
        "enable_pprof": false,
        "enable_expvars": false
    },
    "log": {
        "level": "info",
        "format": "text",
        "file_path": "",
        "keep_stdout": true
    },
    "totp": {
        "disable": false,
        "issuer": "",
        "algorithm": "sha1",
        "digits": 6,
        "period": 30,
        "skew": 1,
        "secret_size": 32
    },
    "webauthn": {
        "disable": false,
        "display_name": "Authelia",
        "attestation_conveyance_preference": "indirect",
        "user_verification": "preferred",
        "timeout": "60s"
    },
    "ntp": {
        "address": "time.cloudflare.com:123",
        "version": 4,
        "max_desync": "3s",
        "disable_startup_check": false,
        "disable_failure": false
    },
    "authentication_backend": {
        "password_reset": {
            "disable": false,
            "custom_url": ""
        },
        "file": {
            "path": "/users/users.yaml",
            "watch": true,
            "search": {
                "email": false,
                "case_insensitive": false
            },
            "password": {
                "algorithm": "argon2",
                "argon2": {
                    "variant": "argon2id",
                    "iterations": 3,
                    "memory": 65536,
                    "parallelism": 4,
                    "key_length": 32,
                    "salt_length": 16
                },
                "scrypt": {
                    "iterations": 16,
                    "block_size": 8,
                    "parallelism": 1,
                    "key_length": 32,
                    "salt_length": 16
                },
                "pbkdf2": {
                    "variant": "sha512",
                    "iterations": 310000,
                    "salt_length": 16
                },
                "sha2crypt": {
                    "variant": "sha512",
                    "iterations": 50000,
                    "salt_length": 16
                },
                "bcrypt": {
                    "variant": "standard",
                    "cost": 12
                }
            }
        }
    },
    "password_policy": {
        "standard": {
            "enabled": false,
            "min_length": 8,
            "max_length": 0,
            "require_uppercase": true,
            "require_lowercase": true,
            "require_number": true,
            "require_special": true
        },
        "zxcvbn": {
            "enabled": false,
            "min_score": 0
        }
    },
    "session": {
        "name": "authelia_session",
        "domain": "",
        "same_site": "lax",
        "expiration": "1h",
        "inactivity": "5m",
        "remember_me_duration": "1M"
    },
    "regulation": {
        "ban_time": "5m",
        "find_time": "2m",
        "max_retries": 3
    },
    "storage": {
        "local": {
            "path": "/data/db.sqlite3"
        }
    },
    "notifier": {
        "disable_startup_check": false,
        "smtp": {
            "host": "smtp.migadu.com",
            "port": 465,
            "timeout": "15s",
            "username": "auth@blechschmidt.dev",
            "sender": "auth@blechschmidt.dev",
            "identifier": "blechschmidt.dev",
            "subject": "[Authelia] {title}",
            "startup_check_address": "auth@blechschmidt.dev",
            "disable_html_emails": false,
            "disable_require_tls": false,
            "disable_starttls": false,
            "tls": {
                "server_name": "smtp.migadu.com",
                "skip_verify": false,
                "minimum_version": "TLS1.2",
                "maximum_version": "TLS1.3"
            }
        }
    },
    "identity_providers": {
        "oidc": {
            "access_token_lifespan": "1h",
            "authorize_code_lifespan": "1m",
            "id_token_lifespan": "1h",
            "refresh_token_lifespan": "90m",
            "enforce_pkce": "public_clients_only",
            "enable_pkce_plain_challenge": false,
            "enable_client_debug_messages": false,
            "minimum_parameter_entropy": 8,
            "cors": {
                "allowed_origins_from_client_redirect_uris": true
            },
            "clients": []
        }
    },
    "access_control": {
        "default_policy": "two_factor"
    }
};
