import { MacKeychainSecrets } from './secrets-mac-keychain';
import { WellKeptSecrets } from './logic';
import { RealFileSystem } from './filesystem';
import { CryptoEncryption } from './encryption';
import { DomainSecret } from './model';

export async function getSecretsForDomain(domainName: string): Promise<DomainSecret[]> {
    return new WellKeptSecrets(new MacKeychainSecrets(), new RealFileSystem(), new CryptoEncryption()).getSecrets(domainName);
}
