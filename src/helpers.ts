import { execSync } from 'child_process';
import { pbkdf2Sync } from 'pbkdf2';
import secrets from '../secrets.json';

const SALT = 'uznkf5beRZNGe+BafDxU1MvUYgCrj3M/BxrjPqaZGzhRFwq1/FCxdcemZ8Oo5vN9Kn8LlpBkNqfAs0eS4XM1ew==';

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
