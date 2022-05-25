import { Secret } from './types';
import { MacKeychainSecrets } from './secrets-mac-keychain';
import { WellKeptSecrets } from './logic';
import { RealFileSystem } from './filesystem';
import { CryptoEncryption } from './encryption';

export async function getSecretsForDomain(domainName: string): Promise<Secret[]> {
    return new WellKeptSecrets(new MacKeychainSecrets(), new RealFileSystem(), new CryptoEncryption()).getSecrets(domainName);
}
