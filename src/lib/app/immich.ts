import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Postgres } from '../helpers/db/postgres';
import { createHostPathVolume, generateSecret, obj2env } from '../../helpers';
import { Domain } from '../infra/certManager';
import { Volume } from 'cdk8s-plus-26';
import { Redis } from '../helpers/db/redis';
import { Authelia } from '../infra/authelia';

export interface ImmichProps {
    readonly domain: Domain;
    readonly oidc: Authelia;

    readonly uploadPath: string;
    readonly passwordLoginEnabled?: boolean;
}

export class Immich extends Construct {
    ingress: kplus.Ingress;

    constructor(scope: Construct, id: string, props: ImmichProps) {
        super(scope, id);

        const version = 'v1.130.3';

        const db = 'immich';
        const user = 'immich';
        const password = generateSecret(`${id}-pg`, 32);

        const postgres = new Postgres(this, 'pg', {
            database: db,
            user,
            password,
            image: 'tensorchord/pgvecto-rs:pg14-v0.2.0@sha256:90724186f0a3517cf6914295b5ab410db9ce23190a2d9d0b9dd6463e3fa298f0',
            args: ["postgres", "-c", "shared_preload_libraries=vectors.so", "-c", 'search_path="$$user", public, vectors', "-c", "logging_collector=on", "-c", "max_wal_size=2GB", "-c", "shared_buffers=512MB", "-c", "wal_compression=on"],
            securityContext: {
                ensureNonRoot: true,
                user: 1000,
                group: 1000
            }
        });

        const redis = new Redis(this, 'redis', {
            image: 'redis:6.2-alpine@sha256:e3b17ba9479deec4b7d1eeec1548a253acc5374d68d3b27937fcfe4df8d18c7e'
        });

        const ml = new kplus.StatefulSet(this, 'ml', {
            containers: [{
                image: `ghcr.io/immich-app/immich-machine-learning:${version}`,
                portNumber: 3003,
                resources: {},
                securityContext: {
                    user: 1000,
                    group: 1000,
                    readOnlyRootFilesystem: false,
                }
            }]
        });

        const config = DEFAULT_CONFIG;
        config.server.externalDomain = `https://${props.domain.fqdn}`;
        config.machineLearning.url = `http://${ml.service.name}:3003`;

        config.passwordLogin.enabled = props.passwordLoginEnabled || false;
        config.oauth.issuerUrl = props.oidc.discoveryUrl;
        config.oauth.clientId = id;
        config.oauth.clientSecret = props.oidc.registerClient(id, {
            description: 'Photo storage server',
            redirect_uris: [
                'app.immich:///oauth-callback',
                `https://${props.domain.fqdn}/auth/login`,
                `https://${props.domain.fqdn}/user-settings`
            ],
            authorization_policy: 'one_factor'
        });

        const configSecret = new kplus.Secret(this, 'config', {
            stringData: {
                'immich.json': JSON.stringify(config)
            }
        });

        const secret = new kplus.Secret(this, 'secrets', {
            stringData: {
                DB_URL: postgres.connectionURI,
            }
        });

        const server = new kplus.StatefulSet(this, 'server', {
            containers: [{
                image: `ghcr.io/immich-app/immich-server:${version}`,
                command: ["/bin/bash", "./start.sh"],
                portNumber: 2283,
                resources: {},
                securityContext: {
                    user: 1000,
                    group: 1000,
                    readOnlyRootFilesystem: false
                },
                envFrom: [kplus.Env.fromSecret(secret)],
                envVariables: obj2env({
                    REDIS_HOSTNAME: redis.serviceName,
                    IMMICH_CONFIG_FILE: '/custom-config/immich.json',
                })
            }]
        });

        ml.containers[0].mount('/cache', createHostPathVolume(this, 'ml-cache'));

        server.containers[0].mount('/custom-config', Volume.fromSecret(this, 'config-mount', configSecret));
        server.containers[0].mount(`/usr/src/app/upload`, createHostPathVolume(this, 'data'));
        server.containers[0].mount(`/usr/src/app/upload/upload`, Volume.fromHostPath(this, `upload-server`, `upload-server`, { path: props.uploadPath }));

        server.containers[0].mount('/dev/dri', Volume.fromHostPath(this, 'igpu', 'igpu', { path: '/dev/dri' }));

        // TODO The permissions of the files inside this folder are root-only ... thus acceleration fails.
        //      We should figure out how to relax those permissions without just setting it globally with eudev.
        // server.containers[0].mount('/dev/dri', Volume.fromHostPath(this, 'igpu', 'igpu', { path: '/dev/dri' }));

        // server.containers[0].mount('/external-assets/family-archive', Volume.fromHostPath(this, 'family-archive', 'family-archive', {
        //     path: '/mnt/raid/Media/Photos'
        // }), {
        //     readOnly: true,
        // });

        this.ingress = new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(server.service)
            }]
        });
    }
}

const DEFAULT_CONFIG = {
    "logging": {
        "enabled": true,
        "level": "log"
    },
    "server": {
        "externalDomain": "",
        "loginPageMessage": ""
    },
    "newVersionCheck": {
        "enabled": true
    },
    "reverseGeocoding": {
        "enabled": true
    },
    "map": {
        "enabled": true
    },
    "theme": {
        "customCss": ""
    },
    "user": {
        "deleteDelay": 7
    },
    "trash": {
        "enabled": true,
        "days": 30
    },
    "passwordLogin": {
        "enabled": true
    },
    "oauth": {
        "autoLaunch": true,
        "autoRegister": true,
        "buttonText": "Login with Authelia",
        "clientId": "",
        "clientSecret": "",
        "defaultStorageQuota": 0,
        "enabled": true,
        "issuerUrl": "",
        "mobileOverrideEnabled": false,
        "mobileRedirectUri": "",
        "scope": "openid email profile",
        "signingAlgorithm": "RS256",
        "profileSigningAlgorithm": "none",
        "storageLabelClaim": "preferred_username",
        "storageQuotaClaim": "immich_quota"
    },
    "notifications": {
        "smtp": {
            "enabled": false,
            "from": "",
            "replyTo": "",
            "transport": {
                "ignoreCert": false,
                "host": "",
                "port": 587,
                "username": "",
                "password": ""
            }
        }
    },
    "library": {
        "scan": {
            "enabled": true,
            "cronExpression": "0 0 * * *"
        },
        "watch": {
            "enabled": false
        }
    },
    "storageTemplate": {
        "enabled": false,
        "hashVerificationEnabled": true,
        "template": "{{y}}/{{y}}-{{MM}}-{{dd}}/{{filename}}"
    },
    "image": {
        "thumbnail": {
            "format": "webp",
            "size": 250,
            "quality": 80,
        },
        "preview": {
            "format": "jpeg",
            "size": 1440,
            "quality": 80,
        },
        "colorspace": "p3",
        "extractEmbedded": false
    },
    "machineLearning": {
        "enabled": true,
        "url": "",
        "clip": {
            "enabled": true,
            "modelName": "ViT-B-16-SigLIP2__webli"
        },
        "duplicateDetection": {
            "enabled": true,
            "maxDistance": 0.01
        },
        "facialRecognition": {
            "enabled": true,
            "modelName": "buffalo_l",
            "minScore": 0.7,
            "maxDistance": 0.5,
            "minFaces": 3
        }
    },
    "ffmpeg": {
        "crf": 23,
        "threads": 0,
        "preset": "ultrafast",
        "targetVideoCodec": "h264",
        "acceptedVideoCodecs": [
            "h264"
        ],
        "targetAudioCodec": "aac",
        "acceptedAudioCodecs": [
            "aac",
            "mp3",
            "libopus"
        ],
        "acceptedContainers": [
            "mov",
            "ogg",
            "webm"
        ],
        "targetResolution": "1080",
        "maxBitrate": "0",
        "bframes": -1,
        "refs": 0,
        "gopSize": 0,
        "npl": 0,
        "temporalAQ": false,
        "cqMode": "auto",
        "twoPass": false,
        "preferredHwDevice": "auto",
        "transcode": "required",
        "tonemap": "hable",
        "accel": "disabled",
        "accelDecode": false
    },
    "job": {
        "backgroundTask": {
            "concurrency": 5
        },
        "smartSearch": {
            "concurrency": 2
        },
        "metadataExtraction": {
            "concurrency": 5
        },
        "faceDetection": {
            "concurrency": 2
        },
        "search": {
            "concurrency": 5
        },
        "sidecar": {
            "concurrency": 5
        },
        "library": {
            "concurrency": 5
        },
        "migration": {
            "concurrency": 5
        },
        "thumbnailGeneration": {
            "concurrency": 5
        },
        "videoConversion": {
            "concurrency": 1
        }
    }
};