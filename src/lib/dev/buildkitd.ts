import { ApiObject, JsonPatch } from "cdk8s";
import { Probe, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";

export class BuildKitDaemon extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 1234, targetPort: 1234 }],
        });

        const statefulSet = new StatefulSet(this, 'daemon', {
            service,
            podMetadata: {
                annotations: {
                    'container.apparmor.security.beta.kubernetes.io/buildkit': 'unconfined'
                }
            },
            containers: [{
                name: 'buildkit',
                image: 'moby/buildkit:master-rootless',
                portNumber: 1234,
                args: [
                    '--oci-worker-no-process-sandbox',
                    '--addr', 'unix:///run/user/1000/buildkit/buildkitd.sock',
                    '--addr', 'tcp://0.0.0.0:1234'
                ],
                securityContext: {
                    user: 1000,
                    group: 1000,
                    ensureNonRoot: false,
                    allowPrivilegeEscalation: true,
                    readOnlyRootFilesystem: false
                },
                readiness: Probe.fromCommand(['buildctl', 'debug', 'workers']),
                liveness: Probe.fromCommand(['buildctl', 'debug', 'workers']),
                resources: {}
            }]
        });

        ApiObject.of(statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/containers/0/securityContext/seccompProfile", { type: "Unconfined" }));
    }
}
