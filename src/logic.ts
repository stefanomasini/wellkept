import { Encryption, EnvchainStorage, FileSystem, SecretsStorage, TextEditor, UserError, UserInput } from './types';
import { Domain, DomainsBundle, DomainSecret } from './model';

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
    constructor(protected secretsStorage: SecretsStorage, protected fileSystem: FileSystem, protected encryption: Encryption) {}

    public async getSecrets(domainName: string): Promise<DomainSecret[]> {
        const vaults = await this.listVaults();
        return await this.getSecretsInDomain(vaults, domainName);
    }

    protected async listVaults(): Promise<VaultInfo[]> {
        return Promise.all(
            (await this.secretsStorage.listCredentials()).map(async ({ vaultFilepath, status, password, credentialsRecordId }) => {
                if (status !== 'ok') {
                    return { vaultFilepath, credentialsRecordId, password, status: 'broken_key', error: status.errorMessage };
                }
                const vaultReading = await this.readVault(vaultFilepath, password);
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

    protected async readVault(
        filepath: string,
        password: string
    ): Promise<
        { status: 'ok'; domainsBundle: DomainsBundle } | { status: VaultErrorStatus; error?: string; domainsBundle?: DomainsBundle }
    > {
        if (!(await this.fileSystem.checkFileExists(filepath))) {
            return { status: 'missing' };
        }
        let encryptedContent: string;
        let content: any;
        try {
            encryptedContent = await this.fileSystem.readVaultFile(filepath);
        } catch (err) {
            return { status: 'cannot_read' };
        }
        try {
            content = this.encryption.decrypt(encryptedContent, password);
        } catch (err) {
            return { status: 'cannot_decrypt', error: (err as any).message };
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
}

export class WellKeptSecretsCli extends WellKeptSecrets {
    constructor(secretsStorage: SecretsStorage, fileSystem: FileSystem, encryption: Encryption, private userInput: UserInput) {
        super(secretsStorage, fileSystem, encryption);
    }

    async deregisterVault(filepath: string): Promise<void> {
        const credentialsRecordIds = (await this.listVaults())
            .filter(({ vaultFilepath }) => vaultFilepath === filepath)
            .map(({ credentialsRecordId }) => credentialsRecordId);
        if (credentialsRecordIds.length === 0) {
            throw new UserError(`Vault not found with path ${filepath}`);
        }
        for (const credentialsRecordId of credentialsRecordIds) {
            await this.secretsStorage.deleteCredentials(credentialsRecordId);
        }
    }

    async editVault(filepath: string, textEditor: TextEditor): Promise<boolean> {
        const vaults = (await this.listVaults()).filter(({ vaultFilepath }) => vaultFilepath === filepath);
        if (vaults.length === 0) {
            throw new UserError(`Vault not found with path ${filepath}`);
        }
        if (vaults.length !== 1) {
            throw new UserError(`Multiple vaults found with path ${filepath}`);
        }
        const password = vaults[0].password;
        const { status, error, domainsBundle } = vaults[0];
        // const vaultReading = await readVault(filepath, password);
        if (status !== 'ok') {
            throw new UserError(`Invalid vault: ${status}${error ? ` ${error}` : ''}`);
        }
        if (!domainsBundle) {
            throw new UserError(`Cannot read vault: ${filepath}`); // Shouldn't end up here
        }
        const inputText = domainsBundle.toINIFormat();
        function isValid(text: string): null | string {
            try {
                DomainsBundle.parseINIFormat(DomainsBundle.preProcessINIFormatLines(text));
                return null;
            } catch (err) {
                return (err as any).message;
            }
        }
        const outputText = await textEditor.editText(inputText, filepath, isValid);
        if (outputText === inputText) {
            return false;
        }
        const updatedDomainsBundle = DomainsBundle.parseINIFormat(DomainsBundle.preProcessINIFormatLines(outputText));
        const encryptedContent = this.encryption.encrypt(updatedDomainsBundle.toJson(), password);
        await this.fileSystem.writeVaultFile(filepath, encryptedContent);
        return true;
    }

    async editDomain(domainName: string, textEditor: TextEditor): Promise<{ changed: boolean; vaultFilepath?: string }> {
        const vaults = (await this.listVaults()).filter(({ domainsBundle }) => domainsBundle && domainsBundle.containsDomain(domainName));
        if (vaults.length === 0) {
            throw new UserError(`No vault contains domain ${domainName}`);
        }
        if (vaults.length !== 1) {
            throw new UserError(`Multiple vaults contain domain ${domainName}`);
        }
        const { password, vaultFilepath: filepath, status, error, domainsBundle } = vaults[0];
        if (status !== 'ok') {
            throw new UserError(`Invalid vault: ${status}${error ? ` ${error}` : ''}`);
        }
        if (!domainsBundle) {
            throw new UserError(`Cannot read vault: ${filepath}`); // Shouldn't end up here
        }
        const domains = domainsBundle.domains.filter((domain) => domain.name === domainName);
        const otherDomains = domainsBundle.domains.filter((domain) => domain.name !== domainName);
        if (domains.length === 0) {
            throw new UserError(`No domain ${domainName} found`); // Shouldn't end up here
        }
        if (domains.length > 1) {
            throw new UserError(`More than one domain with name ${domainName} found`); // Shouldn't end up here
        }
        function isValid(text: string): null | string {
            try {
                Domain.parseINIFormat(DomainsBundle.preProcessINIFormatLines(text));
                return null;
            } catch (err) {
                return (err as any).message;
            }
        }
        const inputText = domains[0].toINIFormat();
        const outputText = await textEditor.editText(inputText, filepath, isValid);
        if (outputText === inputText) {
            return { changed: false };
        }
        const updatedDomain = Domain.parseINIFormat(DomainsBundle.preProcessINIFormatLines(outputText));
        const updatedDomainsBundle = new DomainsBundle(otherDomains.concat([updatedDomain]));
        const encryptedContent = this.encryption.encrypt(updatedDomainsBundle.toJson(), password);
        await this.fileSystem.writeVaultFile(filepath, encryptedContent);
        return { changed: true, vaultFilepath: filepath };
    }

    async registerVault(filepath: string): Promise<void> {
        const vaults = (await this.listVaults()).filter(({ vaultFilepath }) => vaultFilepath === filepath);
        if (vaults.length > 0) {
            throw new UserError(`Vault with path ${filepath} already registered`);
        }
        if (!(await this.fileSystem.checkFileExists(filepath))) {
            throw new UserError(`File ${filepath} does not exist`);
        }
        const password = this.userInput.enterPassword();
        const vaultReading = await this.readVault(filepath, password);
        if (vaultReading.status !== 'ok') {
            throw new UserError(`Invalid vault: ${vaultReading.status}${vaultReading.error ? ` ${vaultReading.error}` : ''}`);
        }
        await this.secretsStorage.addCredentials(filepath, password);
    }

    async createVault(filepath: string): Promise<void> {
        await this._createVault(filepath, new DomainsBundle([]));
    }

    private async _createVault(filepath: string, domainsBundle: DomainsBundle): Promise<void> {
        const vaults = (await this.listVaults()).filter(({ vaultFilepath }) => vaultFilepath === filepath);
        if (vaults.length > 0) {
            throw new UserError(`Vault with path ${filepath} already registered`);
        }
        if (await this.fileSystem.checkFileExists(filepath)) {
            throw new UserError(`File ${filepath} already exists`);
        }
        const password = this.userInput.chooseNewPassword();
        const encryptedContent = this.encryption.encrypt(domainsBundle.toJson(), password);
        await this.fileSystem.writeVaultFile(filepath, encryptedContent);
        await this.secretsStorage.addCredentials(filepath, password);
    }

    async importFromEnvchain(filepath: string, namespaces: string[], envchainStorage: EnvchainStorage): Promise<void> {
        const domains = await Promise.all(
            namespaces.map(async (namespace) => {
                return new Domain(
                    namespace,
                    (await envchainStorage.listEnvchainSecretsForNamespace(namespace)).map(({ key, value }) => new DomainSecret(key, value))
                );
            })
        );
        await this._createVault(filepath, new DomainsBundle(domains));
    }

    async getVaultsAndStats(): Promise<VaultStats[]> {
        const vaults = await this.listVaults();
        const stats: VaultStats[] = [];
        for (const vault of vaults) {
            const status = `${vault.status}${vault.error ? ` ${vault.error}` : ''}`;
            const domains: { name: string; numSecrets: number }[] = [];
            if (vault.domainsBundle) {
                if (vault.domainsBundle.domains.length > 0) {
                    for (const domain of vault.domainsBundle.domains) {
                        domains.push({ name: domain.name, numSecrets: domain.secrets.length });
                    }
                }
            }
            stats.push({ vaultFilepath: vault.vaultFilepath, ok: vault.status === 'ok', status, domains });
        }
        return stats;
    }
}

type VaultStats = { vaultFilepath: string; ok: boolean; status: string; domains: { name: string; numSecrets: number }[] };
