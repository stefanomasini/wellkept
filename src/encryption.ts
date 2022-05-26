import CryptoJS from 'crypto-js';
import { Encryption, UserError } from './types';

export class CryptoEncryption implements Encryption {
    encrypt(data: any, secret: string): string {
        return 'A' + CryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();
    }

    decrypt(data: string, secret: string): any {
        if (data.length === 0 || data.slice(0, 1) !== 'A') {
            throw new UserError('Unknown encryption version, try upgrading the app');
        }
        return JSON.parse(CryptoJS.AES.decrypt(data.slice(1), secret).toString(CryptoJS.enc.Utf8));
    }
}
