import { readFile, writeFile, access } from 'fs/promises';
import { FileSystem } from './types';

export class RealFileSystem implements FileSystem {
    async writeVaultFile(filepath: string, encryptedContent: string): Promise<void> {
        await writeFile(filepath, encryptedContent);
    }

    async readVaultFile(filepath: string): Promise<string> {
        return await readFile(filepath, { encoding: 'utf8' });
    }

    async checkFileExists(filepath: string): Promise<boolean> {
        try {
            await access(filepath);
            return true;
        } catch (err) {
            return false;
        }
    }
}
