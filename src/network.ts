import { Middleware, MiddlewareSpec } from "./imports/traefik.containo.us";
import { Construct } from 'constructs';
import { resolveId, resolveNamespace } from "./helpers";
import { Ingress } from "cdk8s-plus-26";

type MiddlewareIdentifier = string;

function createMiddleware(scope: Construct, name: string, spec: MiddlewareSpec): MiddlewareIdentifier {
    const namespace = resolveNamespace(scope);
    const constructID = resolveId(scope).reverse();

    new Middleware(scope, name, {
        metadata: {},
        spec
    });

    return [namespace, ...constructID, name].join('-');
}

export function attachMiddlewares(ingress: Ingress, middlewares: MiddlewareIdentifier[]) {
    const value = middlewares.map(m => `${m}@kubernetescrd`).join(',');
    ingress.metadata.addAnnotation("traefik.ingress.kubernetes.io/router.middlewares", value);
}

export function restrictToLocalNetwork(scope: Construct): MiddlewareIdentifier {
    return createMiddleware(scope, 'local-only', {
        ipWhiteList: {
            // The /8 subnet just so happens to cover the cluster pod CIDR as well as the local network
            // Additionally, traffic from localhost is actually mapped to the K3s gateway IP!
            // So technically the localhost range is not even needed ...
            sourceRange: ["127.0.0.1/32", "10.0.0.0/8"]
        }
    });
}

export function stripPathPrefix(scope: Construct, prefixes: string[]): MiddlewareIdentifier {
    return createMiddleware(scope, 'strip-prefix', {
        stripPrefix: { prefixes }
    });
}
