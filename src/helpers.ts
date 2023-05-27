import { EnvValue, Volume } from 'cdk8s-plus-26';
import { execSync } from 'child_process';
import { Construct } from 'constructs';
import { pbkdf2Sync } from 'pbkdf2';
import secrets from '../secrets.json';

const SALT = 'uznkf5beRZNGe+BafDxU1MvUYgCrj3M/BxrjPqaZGzhRFwq1/FCxdcemZ8Oo5vN9Kn8LlpBkNqfAs0eS4XM1ew==';
const HOST_PATH = '/var/lib/volumes/';

let registeredHostPaths: string[] = [];

export function generateSecret(id: string, length: number): string {
    return pbkdf2Sync(secrets.key, id + SALT, 100000, length, 'sha512').toString('base64');
}

export function generateAutheliaDigest(password: string): string {
    // TODO Figure out a way to do base64 w/ custom alphabet so we don't have to call into authelia/Docker
    //      https://sourceware.org/git/?p=glibc.git;a=blob;f=crypt/crypt_util.c;h=c9cf9ba59e457656f2eace768c0083c490b44805;hb=refs/heads/master#l250
    const command = `authelia crypto hash generate pbkdf2 --no-confirm --password '${password}'`;
    let output: string;

    try {
        output = execSync(command).toString();
    } catch {
        console.warn('Failed to call authelia, attempting to run it in docker ...');
        output = execSync(`docker run --rm ghcr.io/authelia/authelia:4.37.5 ${command}`).toString();
    }

    if (output.indexOf('Digest: ') != 0) throw 'Authelia returned unexpected digest string: ' + output;
    return output.substring('Digest: '.length).trim();
}

export function obj2env(env: { [name: string]: string }): { [name: string]: EnvValue } {
    const out: { [name: string]: EnvValue } = {};

    Object.keys(env).forEach(name => {
        out[name] = EnvValue.fromValue(env[name]);
    });

    return out;
}

export function createHostPathVolume(scope: Construct, name: string): Volume {
    if (name.indexOf('/') != -1) throw `HostPath volume name may not contain path separators '${name}'`;

    const path = `${HOST_PATH}${resolvePath(scope)}-${name}`;

    if (registeredHostPaths.indexOf(path) != -1) throw `Duplicate HostPath: '${path}'`;
    registeredHostPaths.push(path);

    return Volume.fromHostPath(scope, 'hostPath-' + name, name, { path });
}

function resolvePath(scope: Construct) {
    const namespace = resolveNamespace(scope);
    const id = resolveId(scope).reverse();

    if (id[0] != namespace) return `${namespace}/${id.join('-')}`;
    else return `${namespace}/${id.slice(1).join('-')}`;
}

function resolveId(scope: Construct | undefined): string[] {
    if (!scope || !scope.node || scope.node.id === '') return [];
    return [scope.node.id].concat(resolveId(scope.node.scope));
}

function resolveNamespace(scope: Construct | undefined): string | null {
    // @ts-ignore
    if (!scope || !scope.node) return null;
    // @ts-ignore
    if (scope.namespace) return scope.namespace;
    // @ts-ignore
    return resolveNamespace(scope.node.scope);
}