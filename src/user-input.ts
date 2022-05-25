import { question } from 'readline-sync';
import { UserError } from './types';

export function chooseNewPassword(): string {
    const firstPassword = question('Choose a password: ', { hideEchoBack: true });
    const secondPassword = question('Repeat password: ', { hideEchoBack: true });
    if (firstPassword !== secondPassword) {
        throw new UserError('Passwords do not match');
    }
    return firstPassword;
}

export function enterPassword(): string {
    return question('Password: ', { hideEchoBack: true });
}
