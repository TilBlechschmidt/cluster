import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Namespace } from './namespace';

import { Authelia } from '../lib/infra/authelia';
import { Firezone } from '../lib/infra/firezone';
import { CertManager } from '../lib/infra/certManager';
import { Librespeed } from '../lib/infra/librespeed';

import secrets from '../../secrets.json';
import { GlAuth } from '../lib/infra/glauth';
import { PiHole } from '../lib/infra/pihole';
import { attachMiddlewares, restrictToLocalNetwork } from '../network';
import { Traefik } from '../lib/infra/traefik';

export class Infra extends Chart {
    certManager: CertManager;
    oidc: Authelia;
    ldap: GlAuth;

    constructor(scope: Construct, id: string, props: ChartProps = {}) {
        super(scope, id, props);

        new Namespace(this, id);

        new Traefik(this, 'traefik');

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

        new Librespeed(this, 'librespeed', {
            domain: this.certManager.registerDomain('speed.tibl.dev')
        });

        const piHole = new PiHole(this, 'pihole', {
            domain: this.certManager.registerDomain('dns.tibl.dev'),

            auth: { middleware: this.oidc.forwardAuth },

            upstreams: [
                '1.1.1.1',
                '1.0.0.1',
                '2606:4700:4700::1111',
                '2606:4700:4700::1001',
                // https://www.joindns4.eu/
                '86.54.11.100',
                '8.8.8.8'
            ],
            router: {
                domain: 'fritz.box',
                ip: '10.0.0.1',
                cidr: '10.0.0.0/24'
            },

            wildcards: { 'tibl.dev': '10.0.0.56', 'v2.tibl.dev': '192.168.64.13' },
            wildcardExclusions: ['backup.tibl.dev']
        });

        for (const app of [piHole]) {
            attachMiddlewares(app.ingress, [restrictToLocalNetwork(app)]);
        }
    }
}