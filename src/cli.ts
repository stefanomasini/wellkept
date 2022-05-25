import { program } from 'commander';
import chalk from 'chalk';
import { TextEditor, UserError } from './types';
import { encrypt } from './encryption';
import { checkFileExists, writeVaultFile } from './filesystem';
import { UnixEditorInput } from './input-unix-editor';
import { runChildProgramSync } from './runner';
import { Domain, DomainsBundle } from './model';
import { readVault, WellKeptSecrets } from './index';
import { chooseNewPassword, enterPassword } from './user-input';

class WellKeptSecretsCli extends WellKeptSecrets {
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
        const outputText = textEditor.editTextSync(inputText);
        if (outputText === inputText) {
            return false;
        }
        const updatedDomainsBundle = DomainsBundle.parseINIFormat(DomainsBundle.preProcessINIFormatLines(outputText));
        const encryptedContent = encrypt(updatedDomainsBundle.toJson(), password);
        await writeVaultFile(filepath, encryptedContent);
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

    async registerVault(filepath: string): Promise<void> {
        const vaults = (await this.listVaults()).filter(({ vaultFilepath }) => vaultFilepath === filepath);
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
        await this.secretsStorage.addCredentials(filepath, password);
    }

    async createVault(filepath: string): Promise<void> {
        const vaults = (await this.listVaults()).filter(({ vaultFilepath }) => vaultFilepath === filepath);
        if (vaults.length > 0) {
            throw new UserError(`Vault with path ${filepath} already registered`);
        }
        if (await checkFileExists(filepath)) {
            throw new UserError(`File ${filepath} already exists`);
        }
        const password = chooseNewPassword();
        const encryptedContent = encrypt(new DomainsBundle([]).toJson(), password);
        await writeVaultFile(filepath, encryptedContent);
        await this.secretsStorage.addCredentials(filepath, password);
    }

    async getVaultsAndStats(): Promise<VaultStats[]> {
        const vaults = await this.listVaults();
        const stats: VaultStats[] = [];
        for (const vault of vaults) {
            const status = (vault.status === 'ok' ? chalk.green : chalk.red)(`${vault.status}${vault.error ? ` ${vault.error}` : ''}`);
            const domains: { name: string; numSecrets: number }[] = [];
            if (vault.domainsBundle) {
                if (vault.domainsBundle.domains.length > 0) {
                    for (const domain of vault.domainsBundle.domains) {
                        domains.push({ name: domain.name, numSecrets: domain.secrets.length });
                    }
                }
            }
            stats.push({ vaultFilepath: vault.vaultFilepath, status, domains });
        }
        return stats;
    }
}

type VaultStats = { vaultFilepath: string; status: string; domains: { name: string; numSecrets: number }[] };

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
    const api = new WellKeptSecretsCli();
    const textEditor = new UnixEditorInput();

    program
        .command('run <domain> <command> [args...]')
        .description('Run command by passing environment variables taken from the given domain.')
        .action(
            actionWrapper(async (domainName, command, args) => {
                const secrets = await api.getSecrets(domainName);
                runChildProgramSync(command, args, secrets);
            })
        );

    program
        .command('create <path>')
        .description('Create and register a new empty vault.')
        .action(
            actionWrapper(async (filepath) => {
                await api.createVault(filepath);
                console.log(chalk.green('Vault created'));
            })
        );

    program
        .command('register <path>')
        .description('Register an existing vault.')
        .action(
            actionWrapper(async (filepath) => {
                await api.registerVault(filepath);
                console.log(chalk.green('Vault registered'));
            })
        );

    program
        .command('deregister <path>')
        .description('Deregister a vault, leaving the actual file in place. Use "register" to add it back.')
        .action(
            actionWrapper(async (filepath) => {
                await api.deregisterVault(filepath);
                console.log(chalk.green('Vault deregistered'));
            })
        );

    program
        .command('edit-vault <path>')
        .description('Edits an entire vault.')
        .action(
            actionWrapper(async (filepath) => {
                const changed = await api.editVault(filepath, textEditor);
                if (changed) {
                    console.log(chalk.green('Vault updated'));
                } else {
                    console.log(chalk.green('No changes applied'));
                }
            })
        );

    program
        .command('edit <domain>')
        .description('Edits a single domain. Automatically identifies the containing vault and edits the domain inside it.')
        .action(
            actionWrapper(async (domainName) => {
                const { changed, vaultFilepath } = await api.editDomain(domainName, textEditor);
                if (changed) {
                    console.log(chalk.green(`Vault ${vaultFilepath} updated`));
                } else {
                    console.log(chalk.green('No changes applied'));
                }
            })
        );

    program
        .command('list [<domain>]')
        .description(
            'List all registered vaults and counters for domains defined therein. If <domain> is specified, list all secret names (but no actual values).'
        )
        .action(
            actionWrapper(async (domainName?: string) => {
                if (domainName) {
                    const secrets = await api.getSecrets(domainName);
                    if (secrets.length > 0) {
                        for (const secret of secrets) {
                            console.log(secret.name);
                        }
                    } else {
                        console.log('No secrets');
                    }
                } else {
                    const stats = await api.getVaultsAndStats();
                    if (stats.length === 0) {
                        console.log('No vaults registered');
                    } else {
                        for (const { vaultFilepath, status, domains } of stats) {
                            console.log(`\n${vaultFilepath}: ${status}`);
                            if (domains.length === 0) {
                                console.log('    No secrets');
                            } else {
                                for (const { name, numSecrets } of domains) {
                                    console.log(`    [${name}]: ${numSecrets} secrets`);
                                }
                            }
                        }
                    }
                }
            })
        );

    program.parse();
}
