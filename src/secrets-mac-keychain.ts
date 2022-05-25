import keytar from 'keytar';
import { CredentialsInfo, SecretsStorage } from './types';

const SERVICE_NAME = 'aramis-secrets';

export class MacKeychainSecrets implements SecretsStorage<string> {
    async listCredentials(): Promise<CredentialsInfo<string>[]> {
        return Promise.all(
            (await keytar.findCredentials(SERVICE_NAME)).map(async ({ account, password }) => {
                let data: any;
                try {
                    data = JSON.parse(account);
                } catch (err) {
                    return { vaultFilepath: account, password, credentialsRecordId: account, status: 'broken_credentials' };
                }
                if (!data.filepath || typeof data.filepath !== 'string') {
                    return { vaultFilepath: account, password, credentialsRecordId: account, status: 'broken_credentials' };
                }
                return { status: 'ok', vaultFilepath: data.filepath, credentialsRecordId: account, password };
            })
        );
    }

    async deleteCredentials(credentialsId: string): Promise<void> {
        await keytar.deletePassword(SERVICE_NAME, credentialsId);
    }

    async addCredentials(filepath: string, password: string): Promise<void> {
        const account: string = JSON.stringify({
            filepath,
        });
        await keytar.setPassword(SERVICE_NAME, account, password);
    }
}
