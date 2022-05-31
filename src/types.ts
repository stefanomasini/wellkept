export type CredentialsInfo = {
    credentialsRecordId: unknown;
    vaultFilepath: string;
    password: string;
    status:
        | 'ok'
        | {
              code: 'broken_credentials' | 'unknown_version';
              errorMessage: string;
          };
};

export interface SecretsStorage {
    listCredentials(): Promise<CredentialsInfo[]>;
    deleteCredentials(credentialsId: unknown): Promise<void>;
    addCredentials(filepath: string, password: string): Promise<void>;
}

export interface EnvchainStorage {
    listEnvchainSecretsForNamespace(namespace: string): Promise<{ key: string; value: string }[]>;
}

export type TextValidator = (text: string) => null | string;

export interface TextEditor {
    editText(input: string, vaultFilepath: string, isValid: TextValidator): Promise<string>;
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
