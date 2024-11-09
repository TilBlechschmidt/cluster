import { Construct } from 'constructs';
import { ApiObject, JsonPatch, Lazy } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';
import * as yaml from 'js-yaml';
import { createHostPathVolume, generateAutheliaDigest, generateSecret, generateURLSafeSecret } from '../../helpers';
import { Domain } from './certManager';
import { GlAuth } from './glauth';
import { createMiddleware, MiddlewareIdentifier } from '../../network';

interface AutheliaProps {
    readonly secrets: AutheliaSecrets,
    readonly backend: UserList | GlAuth,

    readonly config: {
        readonly defaultRedirectUrl: string;
        readonly domain: string;
        readonly defaultPolicy?: 'two_factor' | 'one_factor';
    },

    readonly domain: Domain;
}

interface UserList {
    users: { [name: string]: AutheliaUser }
}

interface AutheliaUser {
    readonly disabled: boolean,
    readonly displayname: string;
    readonly password: string;
    readonly email: string;
    readonly groups: string[];
}

interface AutheliaSecrets {
    readonly jwtToken?: string;
    readonly encryption?: {
        readonly sessionKey?: string;
        readonly storageKey?: string;
    }
    readonly oidc: {
        readonly hmacSecret?: string,
        readonly privateKey: string
    }
    readonly smtp: {
        readonly host: string,
        readonly port: number,

        readonly user: string,
        readonly pass: string,

        readonly domain: string,
        readonly sender: string
    }
}

export class Authelia extends Construct {
    config: any;
    configMap: kplus.ConfigMap;
    discoveryUrl: string;
    domain: Domain;

    forwardAuth: MiddlewareIdentifier;
    defaultPolicy?: 'two_factor' | 'one_factor';

    constructor(scope: Construct, id: string, props: AutheliaProps) {
        super(scope, id);

        const useLDAP = props.backend instanceof GlAuth;
        const encryption = props.secrets.encryption || {};

        let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        config.default_redirection_url = `https://${props.config.defaultRedirectUrl}`;
        config.totp.issuer = props.config.domain;
        config.session.domain = props.config.domain;
        config.access_control.default_policy = props.config.defaultPolicy || 'two_factor';

        config.notifier.smtp.identifier = props.secrets.smtp.domain;
        config.notifier.smtp.host = props.secrets.smtp.host;
        config.notifier.smtp.port = props.secrets.smtp.port;
        config.notifier.smtp.username = props.secrets.smtp.user;
        config.notifier.smtp.sender = `${props.secrets.smtp.sender}@${props.secrets.smtp.domain}`;
        config.notifier.smtp.startup_check_address = config.notifier.smtp.sender;
        config.notifier.smtp.tls.server_name = props.secrets.smtp.host;

        if (useLDAP) {
            const ldap = props.backend;

            config.authentication_backend.ldap = {
                url: `ldap://${ldap.serviceName}`,
                base_dn: ldap.baseDN,

                user: `cn=${ldap.serviceAccount.id},${ldap.baseDN}`,
                password: ldap.serviceAccountPassword,

                users_filter: '(&({username_attribute}={input})(objectClass=posixAccount))',
                groups_filter: `(&(uniqueMember=cn={input},ou=login,ou=users,dc=tibl,dc=dev)(objectClass=posixGroup))`,

                username_attribute: 'cn',
                display_name_attribute: 'displayName',
                mail_attribute: 'mail',

                group_name_attribute: 'ou',
                additional_groups_dn: ''
            };
        } else {
            config.authentication_backend.file = DEFAULT_FILE_BACKEND;
        }

        const configMap = new kplus.ConfigMap(this, 'config', {
            data: {
                "configuration.yaml": Lazy.any({ produce: () => yaml.dump(this.config) })
            }
        });

        const secretBackend = new kplus.Secret(this, 'backend');

        if (!useLDAP) {
            secretBackend.addStringData("users.yaml", yaml.dump({ users: props.backend.users }));
        }

        const secretKeys = new kplus.Secret(this, 'keys', {
            stringData: {
                SMTP_PASSWORD: props.secrets.smtp.pass,
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
        container.mount("/config", kplus.Volume.fromConfigMap(this, 'mounted-config', configMap));

        if (!useLDAP) {
            container.mount("/backend", kplus.Volume.fromSecret(this, 'mounted-backend', secretBackend));
        }

        ApiObject.of(statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/enableServiceLinks", false));

        new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(statefulSet.service)
            }]
        });

        const forwardAuth = createMiddleware(this, 'fwdauth', {
            forwardAuth: {
                address: `http://${service.name}.${service.metadata.namespace}.svc.cluster.local/api/verify?rd=https%3A%2F%2F${encodeURIComponent(props.domain.fqdn)}%2F`,
                authResponseHeaders: [
                    "Remote-User",
                    "Remote-Name",
                    "Remote-Email",
                    "Remote-Groups"
                ]
            }
        });

        this.config = config;
        this.configMap = configMap;
        this.domain = props.domain;
        this.discoveryUrl = `https://${props.domain.fqdn}/.well-known/openid-configuration`;
        this.forwardAuth = forwardAuth;
        this.defaultPolicy = props.config.defaultPolicy;
    }

    registerClient(id: string, props: ClientRegistrationProps, urlSafeSecret: boolean = false): string {
        const plaintextSecret = urlSafeSecret ? generateURLSafeSecret(`oidc-${id}`, 32) : generateSecret(`oidc-${id}`, 32);
        const scopes = ["openid", "email", "profile", "groups"];

        if (props.allow_refresh) {
            scopes.push("offline_access");
            delete props.allow_refresh;
        }

        const secret = props.public ? {} : { secret: generateAutheliaDigest(plaintextSecret) };

        const client = {
            id,
            scopes,
            grant_types: ["refresh_token", "authorization_code"],
            authorization_policy: this.defaultPolicy,
            ...secret,
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
    userinfo_signing_algorithm?: string

    public?: boolean,
    allow_refresh?: boolean,
    consent_mode?: 'auto' | 'pre-configured' | 'implicit' | 'explicit'
}

const DEFAULT_FILE_BACKEND = {
    "path": "/backend/users.yaml",
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
};

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
            "disable": true,
            "custom_url": ""
        },
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
            "host": "",
            "port": 465,
            "timeout": "15s",
            "username": "",
            "sender": "",
            "identifier": "tibl.dev",
            "subject": "[Authelia] {title}",
            "startup_check_address": "",
            "disable_html_emails": false,
            "disable_require_tls": false,
            "disable_starttls": false,
            "tls": {
                "server_name": "",
                "skip_verify": false,
                "minimum_version": "TLS1.2",
                "maximum_version": "TLS1.3"
            }
        }
    },
    "identity_providers": {
        "oidc": {
            "authorize_code_lifespan": "1m",
            "access_token_lifespan": "24h",
            "id_token_lifespan": "24h",
            "refresh_token_lifespan": "48h",
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
        "default_policy": "two_factor",
        "rules": [{
            domain: "home.tibl.dev",
            policy: "one_factor",
            subject: ["group:home"]
        }]
    }
};
