import CryptoJS from 'crypto-js';

export function encrypt(data: any, secret: string): string {
    return CryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();
}

export function decrypt(data: string, secret: string): any {
    return JSON.parse(CryptoJS.AES.decrypt(data, secret).toString(CryptoJS.enc.Utf8));
}
