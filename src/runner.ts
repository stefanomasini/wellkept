import child_process from 'child_process';
import {Secret} from './types';

export function runChildProgramSync(command: string, args: string[], secrets: Secret[]): void {
    const env = {...process.env};
    for (const secret of secrets) {
        env[secret.name] = secret.value;
    }
    child_process.spawnSync(command, args, { stdio: 'inherit', env, shell: true });
}
