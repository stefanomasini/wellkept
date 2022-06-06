import { readFile, writeFile, access } from 'fs';
import { FileSystem } from './types';

export class RealFileSystem implements FileSystem {
    writeVaultFile(filepath: string, encryptedContent: string): Promise<void> {
        return new Promise((resolve, reject) => {
            writeFile(filepath, encryptedContent, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    readVaultFile(filepath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            readFile(filepath, { encoding: 'utf8' }, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    checkFileExists(filepath: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            access(filepath, (err) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }
}
