import child_process from 'child_process';
import { DomainSecret } from './model';

export function runChildProgramSync(command: string, args: string[], secrets: DomainSecret[]): void {
    const env = { ...process.env };
    for (const secret of secrets) {
        env[secret.name] = secret.value;
    }
    child_process.spawnSync(command, args, { stdio: 'inherit', env, shell: true });
}
