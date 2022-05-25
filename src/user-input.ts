import { question } from 'readline-sync';
import { UserError, UserInput } from './types';

export class TerminalUserInput implements UserInput {
    chooseNewPassword(): string {
        const firstPassword = question('Choose a password: ', { hideEchoBack: true });
        const secondPassword = question('Repeat password: ', { hideEchoBack: true });
        if (firstPassword !== secondPassword) {
            throw new UserError('Passwords do not match');
        }
        return firstPassword;
    }

    enterPassword(): string {
        return question('Password: ', { hideEchoBack: true });
    }
}
