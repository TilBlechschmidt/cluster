import { Chart, ChartProps, Helm, Size } from "cdk8s";
import { Construct } from "constructs";
import { generateSecret } from "../../helpers";
import { Postgres } from "../../lib/postgres";
import { Authelia } from "../infra/authelia";
import { Domain } from "../infra/certManager";

interface ConcourseProps extends ChartProps {
    readonly domain: Domain;
    readonly oidc: Authelia;

    /// User that is initially authenticated for the main team
    readonly user: string;
}

export class Concourse extends Chart {
    constructor(scope: Construct, id: string, props: ConcourseProps) {
        super(scope, id, props);

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
                            oidc: { user: props.user }
                        },
                        oidc: {
                            enabled: true,
                            displayName: "Authelia",
                            issuer: `https://${props.oidc.domain.fqdn}`,
                            skipEmailVerifiedValidation: true,
                            userNameKey: 'email',
                            // TODO Group membership does not quite work :(
                            //      This can be verified by using `group` instead of user @ mainTeam
                            groupsKey: 'groups',
                        }
                    }
                }
            }
        };

        new Helm(this, id, {
            releaseName: id,
            namespace: props.namespace,
            chart: "concourse",
            version: "v17.1.1",
            repo: "https://concourse-charts.storage.googleapis.com/",
            values
        });
    }
}
