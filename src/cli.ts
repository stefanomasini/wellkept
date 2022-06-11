import { program } from 'commander';
import chalk from 'chalk';
import { UserError } from './types';
import { UnixEditorInput } from './input-unix-editor';
import { runChildProgramSync } from './runner';
import { WellKeptSecretsCli } from './logic';
import { MacKeychainSecrets } from './secrets-mac-keychain';
import { RealFileSystem } from './filesystem';
import { CryptoEncryption } from './encryption';
import { TerminalUserInput } from './user-input';

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
    const macKeychainSecrets = new MacKeychainSecrets();
    const api = new WellKeptSecretsCli(macKeychainSecrets, new RealFileSystem(), new CryptoEncryption(), new TerminalUserInput());
    const textEditor = new UnixEditorInput();

    if (process.argv.length >= 2 && process.argv[1].endsWith('/envchain')) {
        program
            .enablePositionalOptions(true)
            .argument('domain')
            .argument('command')
            .argument('[args...]')
            .passThroughOptions(true)
            .action(
                actionWrapper(async (domainName, command, args) => {
                    const secrets = await api.getSecrets(domainName);
                    runChildProgramSync(command, args, secrets);
                })
            );
        program.parse();
        return;
    }
    program
        .enablePositionalOptions(true)
        .command('run <domain> <command> [args...]')
        .passThroughOptions(true)
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
                    console.log(chalk.dim('No changes applied'));
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
                            console.log(secret.toINIFormat());
                        }
                    } else {
                        console.log('No secrets');
                    }
                } else {
                    const stats = await api.getVaultsAndStats();
                    if (stats.length === 0) {
                        console.log('No vaults registered');
                    } else {
                        for (const { vaultFilepath, ok, status, domains } of stats) {
                            console.log(`\n${vaultFilepath}`);
                            if (!ok) {
                                console.log(chalk.red(`    ${status}`));
                            } else {
                                if (domains.length === 0) {
                                    console.log(chalk.dim('    No secrets'));
                                } else {
                                    for (const { name, numSecrets } of domains) {
                                        console.log(`    ${name}${chalk.dim(`: ${numSecrets} secrets`)}`);
                                    }
                                }
                            }
                        }
                    }
                }
            })
        );

    program
        .command('import-envchain <path> [namespaces...]')
        .description('Create new vault by importing namespaces from envchain')
        .action(
            actionWrapper(async (path: string, envchain: string[]) => {
                await api.importFromEnvchain(path, envchain, macKeychainSecrets);
                console.log(chalk.green('Vault created'));
            })
        );

    program.parse();
}
