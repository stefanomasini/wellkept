export type CredentialsInfo = {
    credentialsRecordId: unknown;
    vaultFilepath: string;
    password: string;
    status: 'ok' | 'broken_credentials';
};

export interface SecretsStorage {
    listCredentials(): Promise<CredentialsInfo[]>;
    deleteCredentials(credentialsId: unknown): Promise<void>;
    addCredentials(filepath: string, password: string): Promise<void>;
}

export interface TextEditor {
    editTextSync(input: string): string;
}

export interface Secret {
    name: string;
    value: string;
}

export interface UserInput {
    chooseNewPassword(): string;
    enterPassword(): string;
}

export interface FileSystem {
    writeVaultFile(filepath: string, encryptedContent: string): Promise<void>;
    readVaultFile(filepath: string): Promise<string>;
    checkFileExists(filepath: string): Promise<boolean>;
}

export interface Encryption {
    encrypt(data: any, secret: string): string;
    decrypt(data: string, secret: string): any;
}

export class UserError extends Error {
    public userError: boolean;

    constructor(message: string) {
        super(message);
        this.userError = true;
    }
}
