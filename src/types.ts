export type CredentialsInfo<T> = {
    credentialsRecordId: T;
    vaultFilepath: string;
    password: string;
    status: 'ok' | 'broken_credentials';
};

export interface SecretsStorage<T> {
    listCredentials: () => Promise<CredentialsInfo<T>[]>;
    deleteCredentials: (credentialsId: T) => Promise<void>;
    addCredentials: (filepath: string, password: string) => Promise<void>;
}

export interface TextEditor {
    editTextSync: (input: string) => string;
}

export interface Secret {
    name: string;
    value: string;
}
