import { UserError } from './types';

function assertUniqueNameAndSortInPlace<T extends { name: string }>(elements: T[]): void {
    const names: Set<string> = new Set();
    for (const element of elements) {
        if (names.has(element.name)) {
            throw new UserError(`Duplicate name ${element.name}`);
        }
        names.add(element.name);
    }
    elements.sort((a, b) => {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        } else {
            return 0;
        }
    });
}

export class DomainsBundle {
    constructor(public domains: Domain[]) {
        assertUniqueNameAndSortInPlace(this.domains);
    }

    static parseJson(data: any): DomainsBundle {
        if (!(data instanceof Object)) {
            throw new Error('DomainsBundle: expected Object');
        }
        if (!data.domains) {
            throw new Error('DomainsBundle: missing "domains"');
        }
        if (!data.v || data.v !== 1) {
            throw new Error('DomainsBundle: unknown version, try upgrading the app');
        }
        if (!Array.isArray(data.domains)) {
            throw new Error('DomainsBundle: "domains" is not an array');
        }
        return new DomainsBundle(data.domains.map(Domain.parseJson));
    }

    static preProcessINIFormatLines(text: string): string[] {
        return text
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => line.trim());
    }

    static parseINIFormat(lines: string[]): DomainsBundle {
        const blocks: string[][] = [];
        for (const line of lines) {
            if (line.startsWith('[')) {
                blocks.push([]);
            }
            if (blocks.length === 0) {
                blocks.push([]);
            }
            blocks[blocks.length - 1].push(line);
        }
        return new DomainsBundle(blocks.map((lines) => Domain.parseINIFormat(lines)));
    }

    toINIFormat(): string {
        return this.domains.map((domain) => domain.toINIFormat()).join('\n\n') + '\n';
    }

    toJson(): any {
        return {
            v: 1,
            domains: this.domains.map((domain) => domain.toJson()),
        };
    }

    containsDomain(domainName: string): boolean {
        for (const domain of this.domains) {
            if (domain.name === domainName) {
                return true;
            }
        }
        return false;
    }
}

export class Domain {
    constructor(public name: string, public secrets: DomainSecret[]) {
        assertUniqueNameAndSortInPlace(this.secrets);
    }

    static parseJson(data: any): Domain {
        if (!(data instanceof Object)) {
            throw new UserError('Domain: expected Object');
        }
        if (!data.name) {
            throw new UserError('Domain: missing "name"');
        }
        if (typeof data.name !== 'string') {
            throw new UserError('Domain: "name" is not a string');
        }
        if (!data.secrets) {
            throw new UserError('Domain: missing "secrets"');
        }
        if (!Array.isArray(data.secrets)) {
            throw new UserError('Domain: "secrets" is not an array');
        }
        return new Domain(data.name, data.secrets.map(DomainSecret.parseJson));
    }

    static parseINIFormat(lines: string[]): Domain {
        if (lines.length === 0) {
            throw new UserError('Domain: no lines');
        }
        if (!lines[0].startsWith('[') || !lines[0].endsWith(']')) {
            throw new UserError('Domain: first line should be "[section]"');
        }
        const name = lines[0].slice(1, lines[0].length - 1);
        return new Domain(name, lines.slice(1).map(DomainSecret.parseINIFormat));
    }

    toINIFormat(): string {
        return [`[${this.name}]`].concat(this.secrets.map((secret) => secret.toINIFormat())).join('\n');
    }

    toJson(): any {
        return {
            name: this.name,
            secrets: this.secrets.map((secret) => secret.toJson()),
        };
    }
}

export class DomainSecret {
    constructor(public name: string, public value: string) {}

    static parseJson(data: any): DomainSecret {
        if (!(data instanceof Object)) {
            throw new Error('Secret: expected Object');
        }
        if (!data.name) {
            throw new Error('Secret: missing "name"');
        }
        if (typeof data.name !== 'string') {
            throw new Error('Secret: "name" is not a string');
        }
        if (typeof data.value !== 'string') {
            throw new Error('Secret: "value" is not a string');
        }
        return new DomainSecret(data.name, data.value);
    }

    static parseINIFormat(line: string): DomainSecret {
        if (line.startsWith('[')) {
            throw new UserError('Domain: invalid character "[" in variable name');
        }
        const equalSignIdx = line.indexOf('=');
        if (equalSignIdx === -1) {
            throw new UserError('Domain: missing "=" sign in variable row');
        }
        return new DomainSecret(line.slice(0, equalSignIdx), line.slice(equalSignIdx + 1));
    }

    toINIFormat(): string {
        return `${this.name}=${this.value}`;
    }

    toJson(): any {
        return {
            name: this.name,
            value: this.value,
        };
    }
}
