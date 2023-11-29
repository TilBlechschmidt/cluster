import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Concourse } from '../lib/dev/concourse';
import { BuildKitDaemon } from '../lib/dev/buildkitd';

export interface DevProps extends ChartProps {
    readonly infra: Infra;
}

export class Dev extends Chart {
    constructor(scope: Construct, id: string, props: DevProps) {
        super(scope, id, props);

        new Namespace(this, id);

        new Concourse(this, 'concourse', {
            oidc: props.infra.oidc,
            domain: props.infra.certManager.registerDomain('ci.tibl.dev'),
            group: 'admin'
        });

        new BuildKitDaemon(this, 'buildkit');

        // The ducking ClickHouse whatever database uses so insanely much storage for NOTHING, I'm sick of it :D
        // new Plausible(this, 'plausible', {
        //     domain: props.infra.certManager.registerDomain('tracking.tibl.dev'),
        // });

        // new Minio(this, 'minio', {
        //     domain: props.infra.certManager.registerDomain('s3.tibl.dev'),
        //     adminDomain: props.infra.certManager.registerDomain('s3c.tibl.dev'),
        //     // Role permissions based on MinIO policies, assigning a role named after one of those will work
        //     // See: https://min.io/docs/minio/linux/administration/identity-access-management/policy-based-access-control.html#built-in-policies
        //     oidc: props.infra.oidc
        // });
    }
}
