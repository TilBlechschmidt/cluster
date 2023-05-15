import { Helm, Size } from "cdk8s";
import { Construct } from "constructs";
import { generateSecret } from "../../helpers";
import { Postgres } from "../helpers/db/postgres";
import { Authelia } from "../infra/authelia";
import { Domain } from "../infra/certManager";

interface ConcourseProps {
    readonly domain: Domain;
    readonly oidc: Authelia;

    /// Group that is authenticated for the main team
    readonly group: string;
}

export class Concourse extends Construct {
    constructor(scope: Construct, id: string, props: ConcourseProps) {
        super(scope, id);

        const oidcSecret = props.oidc.registerClient(id, {
            description: "Concourse CI",
            redirect_uris: [`https://${props.domain.fqdn}/sky/issuer/callback`],
        });

        const postgresDb = 'concourse';
        const postgresUser = 'concourse';
        const postgresPassword = generateSecret(`${id}-pg`, 16);

        const postgres = new Postgres(this, 'pg', {
            database: postgresDb,
            user: postgresUser,
            password: postgresPassword,
            storage: Size.gibibytes(1),
            retainClaim: true
        });

        const values = {
            postgresql: {
                enabled: false
            },
            web: {
                ingress: {
                    enabled: true,
                    hosts: [props.domain.fqdn]
                }
            },
            worker: {
                replicas: 1
            },
            secrets: {
                oidcClientId: id,
                oidcClientSecret: oidcSecret,
                postgresUser,
                postgresPassword
            },
            concourse: {
                web: {
                    externalUrl: `https://${props.domain.fqdn}`,
                    postgres: {
                        host: postgres.serviceName,
                        database: postgresDb
                    },
                    localAuth: { enabled: false },
                    auth: {
                        mainTeam: {
                            oidc: {
                                group: props.group
                            }
                        },
                        oidc: {
                            enabled: true,
                            displayName: "Authelia",
                            issuer: `https://${props.oidc.domain.fqdn}`,
                            skipEmailVerifiedValidation: true,
                            userNameKey: 'email',
                            groupsKey: 'groups',
                            scope: 'openid email profile groups'
                        }
                    }
                }
            }
        };

        new Helm(this, id, {
            releaseName: id,
            // TODO Surely accessing a non-typed property is not the right way
            // @ts-ignore
            namespace: scope.namespace,
            chart: "concourse",
            version: "v17.1.1",
            repo: "https://concourse-charts.storage.googleapis.com/",
            values
        });
    }
}
