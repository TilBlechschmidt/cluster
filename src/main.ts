import { App, AppProps } from 'cdk8s';
import { Construct } from 'constructs';
import { Group, GroupProps } from './group';

import { Authelia } from './chart/infra/authelia';
import { Firezone } from './chart/infra/firezone';
import { CertManager } from './chart/infra/certManager';

import { Rallly } from './chart/app/rallly';
import { Launch } from './chart/app/launch';

import secrets from '../secrets.json';
import { Concourse } from './chart/dev/concourse';
import { Flux } from './chart/flux';

class Infra extends Group {
    certManager: CertManager;
    oidc: Authelia;

    constructor(scope: Construct, id: string, props: GroupProps = {}) {
        super(scope, id, props);

        this.certManager = new CertManager(scope, this.genId('cert-manager'), {
            ...this.props,

            cloudflareAccountKey: secrets.certManager.cloudflareAccountKey,
            acme: {
                email: "tls.tca@blechschmidt.de",
            }
        });

        this.oidc = new Authelia(scope, this.genId('authelia'), {
            ...this.props,

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

        new Firezone(scope, this.genId('firezone'), {
            ...this.props,

            domain: this.certManager.registerDomain('vpn.blechschmidt.dev'),
            port: 1194,

            defaultAdminEmail: "til@blechschmidt.de",

            oidc: this.oidc
        });
    }
}

interface AppsProps extends GroupProps {
    readonly infra: Infra;
}

class Dev extends Group {
    constructor(scope: Construct, id: string, props: AppsProps) {
        super(scope, id, props);

        new Concourse(scope, this.genId('concourse'), {
            ...this.props,

            oidc: props.infra.oidc,
            domain: props.infra.certManager.registerDomain('ci.blechschmidt.dev'),
            user: 'tibl'
        });
    }
}

class Apps extends Group {
    constructor(scope: Construct, id: string, props: AppsProps) {
        super(scope, id, props);

        new Launch(scope, this.genId('launch'), {
            ...this.props,

            domains: [
                props.infra.certManager.registerDomain('blechschmidt.dev'),
                props.infra.certManager.registerDomain('blechschmidt.de'),
                props.infra.certManager.registerDomain('groundtrack.app'),
            ]
        });

        new Rallly(scope, this.genId('rallly'), {
            ...this.props,

            domain: props.infra.certManager.registerDomain('time.blechschmidt.de'),

            allowedEmails: '*@blechschmidt.de$',
            authRequired: true,

            smtp: {
                noReply: 'noreply@blechschmidt.de',
                support: 'rallly.tca@blechschmidt.de',

                host: 'smtp.migadu.com',
                port: 465,
                user: 'noreply@blechschmidt.de',
                password: secrets.rallly.smtpPassword,

                secure: true,
                tls: true
            }
        });
    }
}

class Cluster extends App {
    constructor(props: AppProps = {}) {
        super(props);

        const infra = new Infra(this, 'infra', {
            disableResourceNameHashes: true
        });

        new Dev(this, 'dev', {
            infra,
            disableResourceNameHashes: true
        });

        new Apps(this, 'apps', {
            infra,
            disableResourceNameHashes: true
        });
    }
}

class Bootstrap extends App {
    constructor(props: AppProps = {}) {
        super(props);

        new Flux(this, 'flux', {
            namespace: 'flux-system',
            disableResourceNameHashes: true
        });
    }
}

// TODO:
// - Add ConfigMap/Secret hash values
// - Migrate Dev
//     - BuildKit

new Bootstrap({ outdir: 'dist/bootstrap' }).synth();
new Cluster({ outdir: 'dist/cluster' }).synth();
