import { Chart, ChartProps } from "cdk8s";
import { ConfigMap } from "cdk8s-plus-26";
import { Construct } from "constructs";

export class KubeSystem extends Chart {
    constructor(scope: Construct, id: string, props: ChartProps) {
        super(scope, id, props);

        // Prevent NAT hairpinning for in-cluster services
        //
        // NOTE: Might require a manual restart of `kube-system/coredns`
        new ConfigMap(this, 'coredns-custom', {
            metadata: {
                name: "coredns-custom",
                namespace: "kube-system"
            },
            data: {
                "tibl-dev.server": `
                    tibl.dev:53 {
                      log
                      errors
                      rewrite name regex (.*\.)?tibl.dev traefik.infra.svc.cluster.local answer auto
                      kubernetes cluster.local 10.0.0.0/24
                      forward . /etc/resolv.conf
                      cache 30
                    }
                `
            }
        });
    }
}
