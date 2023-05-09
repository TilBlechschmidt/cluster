import { App, AppProps } from 'cdk8s';

import { Infra } from './chart/infra';
import { Dev } from './chart/dev';
import { Apps } from './chart/apps';
import { Flux } from './chart/flux';

import { Domain } from './lib/infra/certManager';

class Bootstrap extends App {
    constructor(props: AppProps = {}) {
        super(props);

        new Flux(this, 'flux', {
            namespace: 'flux-system',
            disableResourceNameHashes: true,

            registryDomain: new Domain("flux.blechschmidt.dev"),
            image: 'ci',
        });
    }
}

class Cluster extends App {
    constructor(props: AppProps = {}) {
        super(props);

        const infra = new Infra(this, 'infra', {
            disableResourceNameHashes: true,
            namespace: 'infra'
        });

        new Dev(this, 'dev', {
            infra,
            disableResourceNameHashes: true,
            namespace: 'dev'
        });

        new Apps(this, 'apps', {
            infra,
            disableResourceNameHashes: true,
            namespace: 'apps'
        });
    }
}

// TODO:
// - Add ConfigMap/Secret hash values
// - Migrate Dev
//     - BuildKit

if (process.env.BOOTSTRAP == '1')
    new Bootstrap({ outdir: 'dist/bootstrap' }).synth();

new Cluster({ outdir: 'dist/cluster' }).synth();
