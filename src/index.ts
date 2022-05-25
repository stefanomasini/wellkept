import { program } from 'commander';
import { question } from 'readline-sync';
import chalk from 'chalk';
import { MacKeychainSecrets } from './secrets-mac-keychain';
import {Secret, SecretsStorage, TextEditor} from './types';
import { encrypt, decrypt } from './encryption';
import { checkFileExists, readVaultFile, writeVaultFile } from './filesystem';
import { UnixEditorInput } from './input-unix-editor';
import {runChildProgramSync} from './runner';

type VaultErrorStatus = 'missing' | 'broken_key' | 'cannot_read' | 'cannot_decrypt' | 'cannot_parse';
type VaultStatus = 'ok' | VaultErrorStatus;

type VaultInfo<T> = {
    credentialsRecordId: T;
    vaultFilepath: string;
    password: string;
    status: VaultStatus;
    domainsBundle?: DomainsBundle;
    error?: string;
};

async function listVaults<T>(secretsStorage: SecretsStorage<T>): Promise<VaultInfo<T>[]> {
    return Promise.all(
        (await secretsStorage.listCredentials()).map(async ({ vaultFilepath, status, password, credentialsRecordId }) => {
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

async function deregisterVault<T>(filepath: string, secretsStorage: SecretsStorage<T>): Promise<void> {
    const credentialsRecordIds = (await listVaults(secretsStorage))
        .filter(({ vaultFilepath }) => vaultFilepath === filepath)
        .map(({ credentialsRecordId }) => credentialsRecordId);
    if (credentialsRecordIds.length === 0) {
        throw new UserError(`Vault not found with path ${filepath}`);
    }
    for (const credentialsRecordId of credentialsRecordIds) {
        await secretsStorage.deleteCredentials(credentialsRecordId);
    }
}

async function editVault<T>(filepath: string, secretsStorage: SecretsStorage<T>, textEditor: TextEditor): Promise<boolean> {
    const vaults = (await listVaults(secretsStorage)).filter(({ vaultFilepath }) => vaultFilepath === filepath);
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
    const outputText = textEditor.editTextSync(inputText);
    if (outputText === inputText) {
        return false;
    }
    const updatedDomainsBundle = DomainsBundle.parseINIFormat(DomainsBundle.preProcessINIFormatLines(outputText));
    const encryptedContent = encrypt(updatedDomainsBundle.toJson(), password);
    await writeVaultFile(filepath, encryptedContent);
    return true;
}

async function editDomain<T>(
    domainName: string,
    secretsStorage: SecretsStorage<T>,
    textEditor: TextEditor
): Promise<{ changed: boolean; vaultFilepath?: string }> {
    const vaults = (await listVaults(secretsStorage)).filter(
        ({ domainsBundle }) => domainsBundle && domainsBundle.containsDomain(domainName)
    );
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
    const inputText = domains[0].toINIFormat();
    const outputText = textEditor.editTextSync(inputText);
    if (outputText === inputText) {
        return { changed: false };
    }
    const updatedDomain = Domain.parseINIFormat(DomainsBundle.preProcessINIFormatLines(outputText));
    const updatedDomainsBundle = new DomainsBundle(otherDomains.concat([updatedDomain]));
    const encryptedContent = encrypt(updatedDomainsBundle.toJson(), password);
    await writeVaultFile(filepath, encryptedContent);
    return { changed: true, vaultFilepath: filepath };
}

async function registerVault<T>(filepath: string, secretsStorage: SecretsStorage<T>): Promise<void> {
    const vaults = (await listVaults(secretsStorage)).filter(({ vaultFilepath }) => vaultFilepath === filepath);
    if (vaults.length > 0) {
        throw new UserError(`Vault with path ${filepath} already registered`);
    }
    if (!(await checkFileExists(filepath))) {
        throw new UserError(`File ${filepath} does not exist`);
    }
    const password = enterPassword();
    const vaultReading = await readVault(filepath, password);
    if (vaultReading.status !== 'ok') {
        throw new UserError(`Invalid vault: ${vaultReading.status}${vaultReading.error ? ` ${vaultReading.error}` : ''}`);
    }
    await secretsStorage.addCredentials(filepath, password);
}

async function readVault(
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

async function createVault<T>(filepath: string, secretsStorage: SecretsStorage<T>): Promise<void> {
    const vaults = (await listVaults(secretsStorage)).filter(({ vaultFilepath }) => vaultFilepath === filepath);
    if (vaults.length > 0) {
        throw new UserError(`Vault with path ${filepath} already registered`);
    }
    if (await checkFileExists(filepath)) {
        throw new UserError(`File ${filepath} already exists`);
    }
    const password = chooseNewPassword();
    const encryptedContent = encrypt(new DomainsBundle([]).toJson(), password);
    await writeVaultFile(filepath, encryptedContent);
    await secretsStorage.addCredentials(filepath, password);
}

class UserError extends Error {
    public userError: boolean;

    constructor(message: string) {
        super(message);
        this.userError = true;
    }
}

function chooseNewPassword(): string {
    const firstPassword = question('Choose a password: ', { hideEchoBack: true });
    const secondPassword = question('Repeat password: ', { hideEchoBack: true });
    if (firstPassword !== secondPassword) {
        throw new UserError('Passwords do not match');
    }
    return firstPassword;
}

function enterPassword(): string {
    return question('Password: ', { hideEchoBack: true });
}

async function getSecretsInDomain<T>(vaults: VaultInfo<T>[], domainName: string): Promise<DomainSecret[]> {
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
                    throw new UserError(`No vaults found containing domain "${domainName}"`);  // Should not end up here
                }
            } else {
                return [];
            }
        } else {
            throw new UserError(`Cannot read vault for domain "${domainName}"`);  // Should not end up here
        }
    }
}

async function listSecretNamesInDomain<T>(vaults: VaultInfo<T>[], domainName: string): Promise<void> {
    const secrets = await getSecretsInDomain(vaults, domainName);
    if (secrets.length > 0) {
        for (const secret of secrets) {
            console.log(secret.name);
        }
    } else {
        console.log('No secrets');
    }
}

async function listVaultsAndStats<T>(vaults: VaultInfo<T>[]): Promise<void> {
    if (vaults.length > 0) {
        for (const vault of vaults) {
            const status = (vault.status === 'ok' ? chalk.green : chalk.red)(
                `${vault.status}${vault.error ? ` ${vault.error}` : ''}`
            );
            console.log(`\n${vault.vaultFilepath}: ${status}`);
            if (vault.domainsBundle) {
                if (vault.domainsBundle.domains.length > 0) {
                    for (const domain of vault.domainsBundle.domains) {
                        console.log(`    [${domain.name}]: ${domain.secrets.length} secrets`);
                    }
                } else {
                    console.log('    No secrets');
                }
            }
        }
    } else {
        console.log('No vaults registered');
    }
}

const actionWrapper =
    (fn: (...args: any) => Promise<void>) =>
        (...args: any) => {
            fn(...args).catch((err) => {
                if (err instanceof UserError || (err && (err as any).userError)) {
                    console.error(chalk.red(`Error: ${(err as any).message}`));
                } else {
                    console.error(chalk.red('Unexpected error'));
                    console.error(err);
                }
            });
        };

export async function main() {
    const secretsStorage = new MacKeychainSecrets();
    const textEditor = new UnixEditorInput();

    program
        .command('run <domain> <command> [args...]')
        .description('Run command by passing environment variables taken from the given domain.')
        .action(actionWrapper(async (domainName, command, args) => {
            const vaults = await listVaults(secretsStorage);
            const secrets = await getSecretsInDomain(vaults, domainName);
            runChildProgramSync(command, args, secrets);
        }));

    program
        .command('create <path>')
        .description('Create and register a new empty vault.')
        .action(actionWrapper(async (filepath) => {
            await createVault(filepath, secretsStorage);
            console.log(chalk.green('Vault created'));
        }));

    program
        .command('register <path>')
        .description('Register an existing vault.')
        .action(actionWrapper(async (filepath) => {
            await registerVault(filepath, secretsStorage);
            console.log(chalk.green('Vault registered'));
        }));

    program
        .command('deregister <path>')
        .description('Deregister a vault, leaving the actual file in place. Use "register" to add it back.')
        .action(actionWrapper(async (filepath) => {
            await deregisterVault(filepath, secretsStorage);
            console.log(chalk.green('Vault deregistered'));
        }));

    program
        .command('edit-vault <path>')
        .description('Edits an entire vault.')
        .action(actionWrapper(async (filepath) => {
            const changed = await editVault(filepath, secretsStorage, textEditor);
            if (changed) {
                console.log(chalk.green('Vault updated'));
            } else {
                console.log(chalk.green('No changes applied'));
            }
        }));

    program
        .command('edit <domain>')
        .description('Edits a single domain. Automatically identifies the containing vault and edits the domain inside it.')
        .action(actionWrapper(async (domainName) => {
            const { changed, vaultFilepath } = await editDomain(domainName, secretsStorage, textEditor);
            if (changed) {
                console.log(chalk.green(`Vault ${vaultFilepath} updated`));
            } else {
                console.log(chalk.green('No changes applied'));
            }
        }));

    program
        .command('list [<domain>]')
        .description('List all registered vaults and counters for domains defined therein. If <domain> is specified, list all secret names (but no actual values).')
        .action(
            actionWrapper(async (domainName?: string) => {
                const vaults = await listVaults(secretsStorage);
                if (domainName) {
                    await listSecretNamesInDomain(vaults, domainName);
                } else {
                    await listVaultsAndStats(vaults);
                }
            })
        );

    program.parse();
}

function assertUniqueNameAndSortInPlace<T extends { name: string }>(elements: T[]): void {
    const names: Set<string> = new Set();
    for (const element of elements) {
        if (names.has(element.name)) {
            throw new UserError(`Duplicate name ${element.name}`);
        }
        names.add(element.name);
    }
    elements.sort((a, b) => {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        } else {
            return 0;
        }
    });
}

class DomainsBundle {
    constructor(public domains: Domain[]) {
        assertUniqueNameAndSortInPlace(this.domains);
    }

    static parseJson(data: any): DomainsBundle {
        if (!(data instanceof Object)) {
            throw new Error('DomainsBundle: expected Object');
        }
        if (!data.domains) {
            throw new Error('DomainsBundle: missing "domains"');
        }
        if (!Array.isArray(data.domains)) {
            throw new Error('DomainsBundle: "domains" is not an array');
        }
        return new DomainsBundle(data.domains.map(Domain.parseJson));
    }

    static preProcessINIFormatLines(text: string): string[] {
        return text
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => line.trim());
    }

    static parseINIFormat(lines: string[]): DomainsBundle {
        const blocks: string[][] = [];
        for (const line of lines) {
            if (line.startsWith('[')) {
                blocks.push([]);
            }
            if (blocks.length === 0) {
                blocks.push([]);
            }
            blocks[blocks.length - 1].push(line);
        }
        return new DomainsBundle(blocks.map((lines) => Domain.parseINIFormat(lines)));
    }

    toINIFormat(): string {
        return this.domains.map((domain) => domain.toINIFormat()).join('\n\n') + '\n';
    }

    toJson(): any {
        return {
            domains: this.domains.map((domain) => domain.toJson()),
        };
    }

    containsDomain(domainName: string): boolean {
        for (const domain of this.domains) {
            if (domain.name === domainName) {
                return true;
            }
        }
        return false;
    }
}

class Domain {
    constructor(public name: string, public secrets: DomainSecret[]) {
        assertUniqueNameAndSortInPlace(this.secrets);
    }

    static parseJson(data: any): Domain {
        if (!(data instanceof Object)) {
            throw new UserError('Domain: expected Object');
        }
        if (!data.name) {
            throw new UserError('Domain: missing "name"');
        }
        if (typeof data.name !== 'string') {
            throw new UserError('Domain: "name" is not a string');
        }
        if (!data.secrets) {
            throw new UserError('Domain: missing "secrets"');
        }
        if (!Array.isArray(data.secrets)) {
            throw new UserError('Domain: "secrets" is not an array');
        }
        return new Domain(data.name, data.secrets.map(DomainSecret.parseJson));
    }

    static parseINIFormat(lines: string[]): Domain {
        if (lines.length === 0) {
            throw new UserError('Domain: no lines');
        }
        if (!lines[0].startsWith('[') || !lines[0].endsWith(']')) {
            throw new UserError('Domain: first line should be "[section]"');
        }
        const name = lines[0].slice(1, lines[0].length - 1);
        return new Domain(name, lines.slice(1).map(DomainSecret.parseINIFormat));
    }

    toINIFormat(): string {
        return [`[${this.name}]`].concat(this.secrets.map((secret) => secret.toINIFormat())).join('\n');
    }

    toJson(): any {
        return {
            name: this.name,
            secrets: this.secrets.map((secret) => secret.toJson()),
        };
    }
}

class DomainSecret implements Secret {
    constructor(public name: string, public value: string) {}

    static parseJson(data: any): DomainSecret {
        if (!(data instanceof Object)) {
            throw new Error('Secret: expected Object');
        }
        if (!data.name) {
            throw new Error('Secret: missing "name"');
        }
        if (typeof data.name !== 'string') {
            throw new Error('Secret: "name" is not a string');
        }
        if (typeof data.value !== 'string') {
            throw new Error('Secret: "value" is not a string');
        }
        return new DomainSecret(data.name, data.value);
    }

    static parseINIFormat(line: string): DomainSecret {
        if (line.startsWith('[')) {
            throw new UserError('Domain: invalid character "[" in variable name');
        }
        const equalSignIdx = line.indexOf('=');
        if (equalSignIdx === -1) {
            throw new UserError('Domain: missing "=" sign in variable row');
        }
        return new DomainSecret(line.slice(0, equalSignIdx), line.slice(equalSignIdx + 1));
    }

    toINIFormat(): string {
        return `${this.name}=${this.value}`;
    }

    toJson(): any {
        return {
            name: this.name,
            value: this.value,
        };
    }
}
