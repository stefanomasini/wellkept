import keytar from 'keytar';
import { CredentialsInfo, SecretsStorage } from './types';

const SERVICE_NAME = 'wellkept-secrets';

export class MacKeychainSecrets implements SecretsStorage {
    async listCredentials(): Promise<CredentialsInfo[]> {
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

    async deleteCredentials(credentialsId: unknown): Promise<void> {
        await keytar.deletePassword(SERVICE_NAME, credentialsId as string);
    }

    async addCredentials(filepath: string, password: string): Promise<void> {
        const account: string = JSON.stringify({
            filepath,
        });
        await keytar.setPassword(SERVICE_NAME, account, password);
    }
}
