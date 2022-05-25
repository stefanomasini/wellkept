import { readFile, writeFile, access } from 'fs/promises';

export async function writeVaultFile(filepath: string, encryptedContent: string): Promise<void> {
    await writeFile(filepath, encryptedContent);
}

export async function readVaultFile(filepath: string): Promise<string> {
    return await readFile(filepath, { encoding: 'utf8' });
}

export async function checkFileExists(filepath: string): Promise<boolean> {
    try {
        await access(filepath);
        return true;
    } catch (err) {
        return false;
    }
}
