import { Env, Secret, Service, ServiceType, StatefulSet, Volume } from 'cdk8s-plus-26';
import { Construct } from 'constructs';
import { createHash } from 'crypto';

import { generateSecret, resolveNamespace } from '../../helpers';

export interface GlAuthProps {
    readonly host: string,
    readonly tld: string,

    readonly users: User[]
}

export interface User {
    /// Unique textual identifier
    readonly id: string,

    /// Unique numeric identifier
    readonly uid: number,

    /// SHA256 hash of password created using `echo -n "mysecret" | openssl dgst -sha256`
    readonly password: string,

    /// Primary and additional group memberships
    readonly groups: Group[],

    /// E-Mail address
    readonly mail?: string,

    /// Legal name of the person
    readonly name?: {
        readonly first: string,
        readonly last: string,
    }

    readonly capabilities?: Capability[],
}

export interface Group {
    readonly gid: number,
    readonly name: string,
}

export interface Capability {
    readonly action: string,
    readonly object: string
}

export class GlAuth extends Construct {
    serviceAccountPassword: string;
    serviceAccount: User;

    baseDN: string;

    serviceName: string;

    constructor(scope: Construct, id: string, props: GlAuthProps) {
        super(scope, id);

        this.serviceAccountPassword = generateSecret(`${id}-svc`, 64);

        this.serviceAccount = {
            id: 'svc',
            uid: 9999,
            groups: [{ gid: 9999, name: 'svc' }],
            password: GlAuth.hashPassword(this.serviceAccountPassword),
            capabilities: [{ action: 'search', object: '*' }]
        };

        const config = this.generateConfig(props, this.serviceAccount);

        const secret = new Secret(this, 'config');
        secret.addStringData("config.cfg", config);

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [
                { name: 'ldap', port: 389 }, 
                { name: 'ldaps', port: 636 }, 
                { name: 'http', port: 5555 }
            ]
        });

        const statefulset = new StatefulSet(this, 'app', { service });

        const container = statefulset.addContainer({
            image: 'glauth/glauth:v2.2.1',
            envFrom: [Env.fromSecret(secret)],
            ports: [
                { name: 'ldap', number: 389 },
                { name: 'ldaps', number: 636 },
                { name: 'http', number: 5555 }
            ],
            securityContext: {
                user: 1000,
                group: 1000
            },
            resources: {}
        });

        container.mount('/app/config', Volume.fromSecret(this, 'secret-config', secret));

        this.baseDN = `dc=${props.host},dc=${props.tld}`;
        this.serviceName = `${service.name}.${resolveNamespace(service)}`;
    }

    generateConfig(props: GlAuthProps, serviceAccount: User) {
        const baseDN = `dc=${props.host},dc=${props.tld}`;

        // To create passsha256 run `echo -n "mysecret" | openssl dgst -sha256`
        let config = `
debug = true

[api]
  enabled = false
  internals = true
  tls = false
  listen = "0.0.0.0:5555"


[ldap]
  enabled = true
  listen = "0.0.0.0:389"

[ldaps]
  enabled = false
  listen = "0.0.0.0:636"
  cert = "glauth.crt"
  key = "glauth.key"

[backend]
  datastore = "config"
  baseDN = "${baseDN}"
  nameformat = "cn"
  groupformat = "ou"

[behaviors]
  LimitFailedBinds = true
  NumberOfFailedBinds = 3
  PeriodOfFailedBinds = 10
  BlockFailedBindsFor = 60
  PruneSourceTableEvery = 600
  PruneSourcesOlderThan = 600
`;
        let groups: { [key: number]: Group } = {};
        let ids = [];
        let uids = [];

        for (let user of props.users.concat([serviceAccount])) {
            if (ids.indexOf(user.id) > -1 || uids.indexOf(user.uid) > -1) {
                throw 'Multiple users with the same ID or UID!';
            }

            ids.push(user.id);
            uids.push(user.uid);

            // Add the user to the config
            config += `
[[users]]
  name = "${user.id}"
  uidnumber = ${user.uid}
  passsha256 = "${user.password}"\n`

            if (user.mail) {
                config += `  mail = "${user.mail}"\n`;
            }

            // Add primary group membership
            if (user.groups.length > 0) {
                config += `  primarygroup = ${user.groups[0].gid}\n`;
            }

            // Add secondary group memberships
            if (user.groups.length > 1) {
                config += `  otherGroups = [${user.groups.slice(1).map(g => g.gid).join(', ')}]\n`
            }

            for (let capability of user.capabilities ?? []) {
                config += `    [[users.capabilities]]
    action = "${capability.action}"
    object = "${capability.object}"
                `;
            }

            if (user.name) {
                config += `  givenname = "${user.name.first}"\n`;
                config += `  sn = "${user.name.last}"\n`;
                config += `    [[users.customattributes]]\n`
                config += `    displayName = ["${user.name.first} ${user.name.last}"]\n`;
            }

            // Collect the groups that are in-use
            for (let group of user.groups) {
                groups[group.gid] = group;
            }
        }

        for (let group of Object.values(groups)) {
            config += `
[[groups]]
  name = "${group.name}"
  gidnumber = ${group.gid}\n`
        }

        return config;
    }

    static usersFromSecret(secretUsers: SecretUser[]): User[] {
        let gid = 5000;
        const users = [];
        const groups: { [name: string]: Group } = {};

        for (let u of secretUsers) {
            users.push({
                id: u.id,
                uid: u.uid,
                password: u.password,
                mail: u.mail,
                name: u.name,
                capabilities: u.capabilities,
                groups: u.groups.map(name => {
                    if (!groups.hasOwnProperty(name)) {
                        const group = { gid: gid++, name };
                        groups[name] = group;
                    }

                    return groups[name];
                })
            })
        }

        return users;
    }

    static hashPassword(input: string): string {
        return createHash('sha256').update(input).digest('hex');
    }
}

export interface SecretUser {
    /// Unique textual identifier
    readonly id: string,

    /// Unique numeric identifier
    readonly uid: number,

    /// SHA256 hash of password created using `echo -n "mysecret" | openssl dgst -sha256`
    readonly password: string,

    /// Primary and additional group memberships
    readonly groups: string[],

    /// E-Mail address
    readonly mail?: string,

    /// Legal name of the person
    readonly name?: {
        readonly first: string,
        readonly last: string,
    }

    readonly capabilities?: Capability[],
}