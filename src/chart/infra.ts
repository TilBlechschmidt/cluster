import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Namespace } from './namespace';

import { Authelia } from '../lib/infra/authelia';
import { Firezone } from '../lib/infra/firezone';
import { CertManager } from '../lib/infra/certManager';

import secrets from '../../secrets.json';
import { Librespeed } from '../lib/infra/librespeed';

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

        new Librespeed(this, 'librespeed', {
            domain: this.certManager.registerDomain('speed.blechschmidt.dev')
        });
    }
}