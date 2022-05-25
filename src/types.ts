export type CredentialsInfo = {
    credentialsRecordId: unknown;
    vaultFilepath: string;
    password: string;
    status: 'ok' | 'broken_credentials';
};

export interface SecretsStorage {
    listCredentials: () => Promise<CredentialsInfo[]>;
    deleteCredentials: (credentialsId: unknown) => Promise<void>;
    addCredentials: (filepath: string, password: string) => Promise<void>;
}

export interface TextEditor {
    editTextSync: (input: string) => string;
}

export interface Secret {
    name: string;
    value: string;
}

export class UserError extends Error {
    public userError: boolean;

    constructor(message: string) {
        super(message);
        this.userError = true;
    }
}
