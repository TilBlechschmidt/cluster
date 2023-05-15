import { App, AppProps } from 'cdk8s';

import { Infra } from './chart/infra';
import { Dev } from './chart/dev';
import { Apps } from './chart/apps';
import { Flux } from './chart/flux';
import { Testing } from './chart/testing';

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
    infra: Infra;

    constructor(props: AppProps = {}) {
        super(props);

        const infra = new Infra(this, 'infra', {
            namespace: 'infra',
            disableResourceNameHashes: true,
        });

        new Dev(this, 'dev', {
            infra,
            namespace: 'dev',
            disableResourceNameHashes: true
        });

        new Apps(this, 'apps', {
            infra,
            namespace: 'apps',
            disableResourceNameHashes: true,
        });

        this.infra = infra;
    }
}

interface TestProps extends AppProps {
    infra: Infra
}

class Test extends App {
    constructor(props: TestProps) {
        super(props);

        new Testing(this, 'testing', {
            infra: props.infra,
            namespace: 'testing',
            disableResourceNameHashes: true
        });
    }
}

// TODO:
// - Add ConfigMap/Secret hash values
// - Migrate Dev
//     - BuildKit

if (process.env.BOOTSTRAP == '1')
    new Bootstrap({ outdir: 'dist/bootstrap' }).synth();

const cluster = new Cluster({ outdir: 'dist/cluster' });
cluster.synth();

if (process.env.TEST == '1')
    new Test({
        infra: cluster.infra,
        outdir: 'dist/test'
    }).synth();
