import tmp from 'tmp';
import fs from 'fs';
import child_process from 'child_process';
import { TextEditor } from './types';

export class UnixEditorInput implements TextEditor {
    editTextSync(input: string): string {
        const { fd, name, removeCallback } = tmp.fileSync();
        fs.writeSync(fd, input);
        fs.closeSync(fd);

        child_process.spawnSync(process.env.EDITOR || 'vi', [name], { stdio: 'inherit' });

        const output = fs.readFileSync(name).toString();
        removeCallback();
        return output;
    }
}
