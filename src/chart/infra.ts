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
import { Grafana } from '../lib/infra/grafana';
import { GlAuth } from '../lib/infra/glauth';

export class Infra extends Chart {
    certManager: CertManager;
    oidc: Authelia;
    ldap: GlAuth;

    constructor(scope: Construct, id: string, props: ChartProps = {}) {
        super(scope, id, props);

        new Namespace(this, id);

        this.certManager = new CertManager(this, 'cert-manager', {
            cloudflareAccountKey: secrets.certManager.cloudflareAccountKey,
            acme: {
                email: "tls.tca@blechschmidt.de",
            }
        });

        this.ldap = new GlAuth(this, 'ldap', {
            host: 'tibl',
            tld: 'dev',
            users: GlAuth.usersFromSecret(secrets.ldap.users)
        });

        this.oidc = new Authelia(this, 'authelia', {
            domain: this.certManager.registerDomain('auth.tibl.dev'),

            backend: this.ldap,

            secrets: {
                smtp: secrets.smtp,
                oidc: {
                    privateKey: secrets.authelia.oidc.privateKey
                }
            },

            config: {
                defaultRedirectUrl: "tibl.dev",
                domain: "tibl.dev"
            }
        });

        new Firezone(this, 'firezone', {
            domain: this.certManager.registerDomain('vpn.tibl.dev'),
            port: 1194,

            defaultAdminEmail: "til@blechschmidt.de",

            oidc: this.oidc
        });

        new Influx(this, 'influx', {
            user: 'admin',
            password: generateSecret('infra-influx', 32),
            bucket: 'monitoring',
            org: 'main',
            token: generateSecret('infra-influx-token', 32),
            retention: '4w',
            nodePort: 1202
        });

        new Grafana(this, 'grafana', {
            domain: this.certManager.registerDomain('grafana.tibl.dev'),
            oidc: this.oidc
        });

        new Librespeed(this, 'librespeed', {
            domain: this.certManager.registerDomain('speed.tibl.dev')
        });
    }
}