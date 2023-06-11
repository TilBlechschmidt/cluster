import { Construct } from 'constructs';
import { ConfigMap, DaemonSet, Env, Secret, Volume } from 'cdk8s-plus-26';
import { Influx } from '../helpers/db/influxdb';

export interface TelegrafProps {
    readonly influx?: Influx;

    readonly config: string;

    /// Whether to mount host filesystems like /proc, /sys, /var, or /run
    readonly mountHostFilesystem?: boolean;
}

export class Telegraf extends Construct {
    constructor(scope: Construct, id: string, props: TelegrafProps) {
        super(scope, id);

        const secret = new Secret(this, 'tokens');
        secret.addStringData('HOST_MOUNT_PREFIX', '/hostfs');

        if (props.influx) {
            secret.addStringData('INFLUX_TOKEN', props.influx.token);
            secret.addStringData('INFLUX_URL', `http://${props.influx.serviceName}`);
        }

        const configMap = new ConfigMap(this, 'config', {
            data: { 'telegraf.conf': props.config }
        });

        const daemonSet = new DaemonSet(this, 'app');

        const container = daemonSet.addContainer({
            image: 'telegraf:1.26-alpine',
            envFrom: [Env.fromSecret(secret)],
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        container.mount('/etc/telegraf', Volume.fromConfigMap(this, 'cfg', configMap), { readOnly: true });

        if (props.mountHostFilesystem) {
            container.mount('/hostfs/proc', Volume.fromHostPath(this, 'proc', 'proc', { path: '/proc' }), { readOnly: true });
            container.mount('/hostfs/sys', Volume.fromHostPath(this, 'sys', 'sys', { path: '/sys' }), { readOnly: true });
            container.mount('/hostfs/var', Volume.fromHostPath(this, 'var', 'var', { path: '/sys' }), { readOnly: true });
            container.mount('/hostfs/run', Volume.fromHostPath(this, 'run', 'run', { path: '/run' }), { readOnly: true });
        }
    }
}
