import { MacKeychainSecrets } from './secrets-mac-keychain';
import { Secret, SecretsStorage, UserError } from './types';
import { DomainsBundle, DomainSecret } from './model';
import { checkFileExists, readVaultFile } from './filesystem';
import { decrypt } from './encryption';

type VaultErrorStatus = 'missing' | 'broken_key' | 'cannot_read' | 'cannot_decrypt' | 'cannot_parse';
type VaultStatus = 'ok' | VaultErrorStatus;

type VaultInfo = {
    credentialsRecordId: unknown;
    vaultFilepath: string;
    password: string;
    status: VaultStatus;
    domainsBundle?: DomainsBundle;
    error?: string;
};

export class WellKeptSecrets {
    protected secretsStorage: SecretsStorage;

    constructor() {
        this.secretsStorage = new MacKeychainSecrets();
    }

    public async getSecrets(domainName: string): Promise<Secret[]> {
        const vaults = await this.listVaults();
        return await this.getSecretsInDomain(vaults, domainName);
    }

    protected async listVaults(): Promise<VaultInfo[]> {
        return Promise.all(
            (await this.secretsStorage.listCredentials()).map(async ({ vaultFilepath, status, password, credentialsRecordId }) => {
                if (status === 'broken_credentials') {
                    return { vaultFilepath, credentialsRecordId, password, status: 'broken_key' };
                }
                const vaultReading = await readVault(vaultFilepath, password);
                return {
                    credentialsRecordId,
                    vaultFilepath,
                    password,
                    status: vaultReading.status,
                    domainsBundle: vaultReading.status === 'ok' ? vaultReading.domainsBundle : undefined,
                    error: vaultReading.status === 'ok' ? undefined : vaultReading.error,
                };
            })
        );
    }

    private async getSecretsInDomain(vaults: VaultInfo[], domainName: string): Promise<DomainSecret[]> {
        const filteredVaults = vaults.filter(
            (vault) => vault.status === 'ok' && vault.domainsBundle && vault.domainsBundle.containsDomain(domainName)
        );
        if (filteredVaults.length === 0) {
            throw new UserError(`No vaults found containing domain "${domainName}"`);
        } else if (filteredVaults.length > 1) {
            throw new UserError(`More than one vault found containing domain "${domainName}"`);
        } else {
            const vault = filteredVaults[0];
            if (vault.domainsBundle) {
                if (vault.domainsBundle.domains.length > 0) {
                    const domains = vault.domainsBundle.domains.filter((domain) => domain.name === domainName);
                    if (domains.length === 1) {
                        return domains[0].secrets;
                    } else {
                        throw new UserError(`No vaults found containing domain "${domainName}"`); // Should not end up here
                    }
                } else {
                    return [];
                }
            } else {
                throw new UserError(`Cannot read vault for domain "${domainName}"`); // Should not end up here
            }
        }
    }
}

export async function readVault(
    filepath: string,
    password: string
): Promise<{ status: 'ok'; domainsBundle: DomainsBundle } | { status: VaultErrorStatus; error?: string; domainsBundle?: DomainsBundle }> {
    if (!(await checkFileExists(filepath))) {
        return { status: 'missing' };
    }
    let encryptedContent: string;
    let content: any;
    try {
        encryptedContent = await readVaultFile(filepath);
    } catch (err) {
        return { status: 'cannot_read' };
    }
    try {
        content = decrypt(encryptedContent, password);
    } catch (err) {
        return { status: 'cannot_decrypt' };
    }
    let domainsBundle: DomainsBundle;
    try {
        domainsBundle = DomainsBundle.parseJson(content);
    } catch (err) {
        if (err && (err as any).message) {
            return { status: 'cannot_parse', error: (err as any).message };
        } else {
            return { status: 'cannot_parse' };
        }
    }
    return { status: 'ok', domainsBundle };
}
