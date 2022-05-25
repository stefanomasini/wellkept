import CryptoJS from 'crypto-js';
import { Encryption } from './types';

export class CryptoEncryption implements Encryption {
    encrypt(data: any, secret: string): string {
        return CryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();
    }

    decrypt(data: string, secret: string): any {
        return JSON.parse(CryptoJS.AES.decrypt(data, secret).toString(CryptoJS.enc.Utf8));
    }
}
