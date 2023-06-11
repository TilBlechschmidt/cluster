import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Namespace } from './namespace';

import { Authelia } from '../lib/infra/authelia';
import { Firezone } from '../lib/infra/firezone';
import { CertManager } from '../lib/infra/certManager';
import { Librespeed } from '../lib/infra/librespeed';

import secrets from '../../secrets.json';
import { Influx } from '../lib/helpers/db/influxdb';
import { generateSecret } from '../helpers';
import { Telegraf } from '../lib/infra/telegraf';

export class Infra extends Chart {
    certManager: CertManager;
    oidc: Authelia;

    constructor(scope: Construct, id: string, props: ChartProps = {}) {
        super(scope, id, props);

        new Namespace(this, id);

        this.certManager = new CertManager(this, 'cert-manager', {
            cloudflareAccountKey: secrets.certManager.cloudflareAccountKey,
            acme: {
                email: "tls.tca@blechschmidt.de",
            }
        });

        this.oidc = new Authelia(this, 'authelia', {
            domain: this.certManager.registerDomain('auth.blechschmidt.dev'),

            users: secrets.authelia.users,

            secrets: {
                smtpPassword: secrets.authelia.smtpPassword,
                oidc: {
                    privateKey: secrets.authelia.oidc.privateKey
                }
            },

            config: {
                defaultRedirectUrl: "blechschmidt.dev",
                domain: "blechschmidt.dev"
            }
        });

        new Firezone(this, 'firezone', {
            domain: this.certManager.registerDomain('vpn.blechschmidt.dev'),
            port: 1194,

            defaultAdminEmail: "til@blechschmidt.de",

            oidc: this.oidc
        });

        const influx = new Influx(this, 'influx', {
            user: 'admin',
            password: generateSecret('infra-influx', 32),
            bucket: 'monitoring',
            org: 'main',
            token: generateSecret('infra-influx-token', 32),
            retention: '1y'
        });

        new Telegraf(this, 'telegraf', {
            influx,
            mountHostFilesystem: true,
            config: TELEGRAF_CONFIG
        })

        new Librespeed(this, 'librespeed', {
            domain: this.certManager.registerDomain('speed.blechschmidt.dev')
        });
    }
}

const TELEGRAF_CONFIG = `
[agent]
interval = "1s"
hostname = "wryhta"

[[inputs.cpu]]
percpu = true
totalcpu = true
collect_cpu_time = false
report_active = false

[[outputs.influxdb_v2]]
urls = ["\${INFLUX_URL}"]
token = "$INFLUX_TOKEN"
organization = "main"
bucket = "monitoring"
`;
