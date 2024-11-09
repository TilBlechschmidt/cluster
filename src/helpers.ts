import { EnvValue, Volume } from 'cdk8s-plus-26';
import { Construct } from 'constructs';
import { createHash } from 'crypto';
import { pbkdf2Sync } from 'pbkdf2';
import { hash, argon2id } from 'argon2';
import sp from 'synchronized-promise'
import secrets from '../secrets.json';

const syncHash = sp(hash);

const SALT = 'uznkf5beRZNGe+BafDxU1MvUYgCrj3M/BxrjPqaZGzhRFwq1/FCxdcemZ8Oo5vN9Kn8LlpBkNqfAs0eS4XM1ew==';
const HOST_PATH = '/var/lib/volumes/';

let registeredHostPaths: string[] = [];

export function generateSecret(id: string, length: number): string {
    return pbkdf2Sync(secrets.key, id + SALT, 100000, length, 'sha512').toString('base64');
}

export function generateURLSafeSecret(id: string, length: number): string {
    const secret = generateSecret(id, length);
    return encodeURIComponent(secret).replace(/%/g, '');
}

export function generateAutheliaDigest(password: string): string {
    return syncHash(password, {
        type: argon2id,
    });
}

export function obj2env(env: { [name: string]: string }): { [name: string]: EnvValue } {
    const out: { [name: string]: EnvValue } = {};

    Object.keys(env).forEach(name => {
        out[name] = EnvValue.fromValue(env[name]);
    });

    return out;
}

export function createHostPathVolume(scope: Construct, name: string): Volume {
    return Volume.fromHostPath(scope, 'hostPath-' + name, name, {
        path: buildHostPath(scope, name),
    });
}

export function buildHostPath(scope: Construct, name: string): string {
    if (name.indexOf('/') != -1) throw `HostPath volume name may not contain path separators '${name}'`;

    const path = `${HOST_PATH}${resolvePath(scope)}-${name}`;

    if (registeredHostPaths.indexOf(path) != -1) throw `Duplicate HostPath: '${path}'`;
    registeredHostPaths.push(path);

    return path;
}

function resolvePath(scope: Construct) {
    const namespace = resolveNamespace(scope);
    const id = resolveId(scope).reverse();

    if (id[0] != namespace) return `${namespace}/${id.join('-')}`;
    else return `${namespace}/${id.slice(1).join('-')}`;
}

export function resolveId(scope: Construct | undefined): string[] {
    if (!scope || !scope.node || scope.node.id === '') return [];
    return [scope.node.id].concat(resolveId(scope.node.scope));
}

export function resolveNamespace(scope: Construct | undefined): string | undefined {
    // @ts-ignore
    if (!scope || !scope.node) return undefined;
    // @ts-ignore
    if (scope.namespace) return scope.namespace;
    // @ts-ignore
    return resolveNamespace(scope.node.scope);
}

export function sha256(content: string) {
    return createHash('sha256').update(content).digest('hex')
}

