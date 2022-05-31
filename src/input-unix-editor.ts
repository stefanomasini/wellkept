import { TextEditor, TextValidator } from './types';
import { terminal, TextBuffer, ScreenBuffer } from 'terminal-kit';

export class UnixEditorInput implements TextEditor {
    async editText(input: string, vaultFilepath: string, isValid: TextValidator): Promise<string> {
        return await editOnScreen(`Vault: ${vaultFilepath}`, isValid, input);
    }
}

const STATUS_BAR_TEXT = 'Ctrl+S:Save  ESC:Discard changes';

type Timer = ReturnType<typeof setTimeout>;

async function editOnScreen(title: string, isValid: TextValidator, text: string): Promise<string> {
    let statusBarTimer: Timer | undefined = undefined;
    let resizeTimer: Timer | undefined = undefined;
    let captureKeys = true;
    let saveCallback: ((text: string) => void) | undefined = undefined;

    const screenBuffer = new ScreenBuffer({
        dst: terminal,
        height: terminal.height - 2,
        y: 2,
    });
    const textBuffer = new TextBuffer({
        dst: screenBuffer,
    });
    textBuffer.setText('');

    captureKeys = true;
    terminal.on('resize', onResize);
    terminal.on('key', onKey);

    terminal.fullscreen(true);
    textBuffer.moveTo(0, 0);
    screenBuffer.moveTo(0, 0);
    terminal.grabInput();
    drawStatusBar();
    drawTitleBar();
    textBuffer.moveTo(0, 0);
    textBuffer.setText('');
    textBuffer.insert(text);
    textBuffer.moveTo(0, 0);
    draw();

    return new Promise((resolve) => {
        saveCallback = resolve;
    });

    function getText() {
        return textBuffer.getText();
    }

    function drawBar(pos: { x: number; y: number }, message: string, invert = false) {
        if (invert) {
            terminal.moveTo(pos.x, pos.y).styleReset.white.bold.eraseLine(' ' + message);
        } else {
            terminal.moveTo(pos.x, pos.y).styleReset.bgWhite.black.bold.eraseLine(' ' + message);
        }
    }

    function drawPrompt(prompt: string) {
        drawBar(
            {
                x: 0,
                y: terminal.height,
            },
            prompt + ' ',
            true
        );
        if (statusBarTimer) {
            clearTimeout(statusBarTimer);
        }
    }

    function drawStatusBar(message = STATUS_BAR_TEXT, timeout = -1) {
        drawBar(
            {
                x: 0,
                y: terminal.height,
            },
            message
        );

        textBuffer.draw();
        screenBuffer.draw({
            delta: true,
        });
        textBuffer.drawCursor();
        screenBuffer.drawCursor();

        if (statusBarTimer) {
            clearTimeout(statusBarTimer);
        }

        if (timeout >= 0) {
            statusBarTimer = setTimeout(() => {
                drawStatusBar();
            }, timeout);
        }
    }

    function drawTitleBar() {
        drawBar(
            {
                x: 1,
                y: 1,
            },
            title
        );
    }

    async function exit(save: boolean) {
        const editedText = getText();
        const textChanged: boolean = editedText !== text;

        if (save) {
            const errorMessage: null | string = textChanged ? isValid(editedText) : null;
            if (errorMessage) {
                showError(errorMessage, 4000);
            } else {
                unloadEditor(editedText);
            }
        } else {
            if (!textChanged || (await yesNoQuestion('Do you want to exit and discard the changes?'))) {
                unloadEditor(null);
            }
        }
    }

    function showError(message: string, timeout: number) {
        drawPrompt(message);
        setTimeout(() => {
            drawStatusBar();
        }, timeout);
    }

    async function yesNoQuestion(question: string): Promise<boolean> {
        captureKeys = false;
        return new Promise((resolve, reject) => {
            drawPrompt(`${question} [Y|n]`);
            terminal.yesOrNo({ yes: ['y', 'ENTER'], no: ['n'] }, (err: unknown, result: boolean) => {
                captureKeys = true;
                drawStatusBar();
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    function unloadEditor(editedText: null | string) {
        terminal.grabInput(false);
        terminal.fullscreen(false);
        saveCallback && saveCallback(editedText || text!);
        saveCallback = undefined;
    }

    function onResize(width: number, height: number) {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(() => {
            screenBuffer.resize({
                x: 0,
                y: 2,
                width: width,
                height: height - 2,
            });
            drawStatusBar();
            drawTitleBar();
            draw();
        }, 150);
    }

    function onKey(key: string, matches: any, data: any) {
        if (!captureKeys) {
            return;
        }

        switch (key) {
            case 'CTRL_C':
            case 'ESCAPE':
                exit(false).catch((err) => {
                    console.log(err);
                });
                break;
            case 'CTRL_S':
                exit(true).catch((err) => {
                    console.log(err);
                });
                break;
            case 'UP':
                up();
                break;
            case 'DOWN':
                down();
                break;
            case 'LEFT':
                left();
                break;
            case 'RIGHT':
                right();
                break;
            case 'HOME':
            case 'CTRL_LEFT':
            case 'CTRL_A':
                startOfLine();
                break;
            case 'END':
            case 'CTRL_RIGHT':
            case 'CTRL_E':
                endOfLine();
                break;
            case 'TAB':
                tab();
                break;
            case 'DELETE':
                deleteChar();
                break;
            case 'BACKSPACE':
                backspace();
                break;
            case 'ENTER':
                newLine();
                break;
            default:
                if (data.isCharacter) {
                    textBuffer.insert(key);
                    draw();
                }
        }
    }

    function draw(delta = true) {
        textBuffer.draw();
        screenBuffer.draw({
            delta: delta,
        }); //{delta: delta});
        drawCursor();
    }

    function drawCursor() {
        let new_buffer_x = textBuffer.x;
        let new_buffer_y = textBuffer.y;

        if (textBuffer.x < -textBuffer.cx) {
            new_buffer_x = Math.min(0, -textBuffer.cx + Math.floor(screenBuffer.width / 2));
        } else if (textBuffer.x > -textBuffer.cx + screenBuffer.width - 1) {
            new_buffer_x = screenBuffer.width / 2 - textBuffer.cx;
        }

        if (textBuffer.y < -textBuffer.cy) {
            new_buffer_y = Math.min(0, -textBuffer.cy + Math.floor(screenBuffer.height / 2));
        } else if (textBuffer.y > -textBuffer.cy + screenBuffer.height - 1) {
            new_buffer_y = screenBuffer.height / 2 - textBuffer.cy;
        }

        if (new_buffer_y != textBuffer.y || new_buffer_x != textBuffer.x) {
            textBuffer.x = new_buffer_x;
            textBuffer.y = new_buffer_y;
            textBuffer.draw();
            screenBuffer.draw({
                delta: true,
            });
        }

        textBuffer.drawCursor();
        screenBuffer.drawCursor();
    }

    function up() {
        textBuffer.moveUp();
        if (textBuffer.cx > textBuffer.buffer[textBuffer.cy].length - 1) {
            textBuffer.moveToEndOfLine();
        }
        drawCursor();
    }

    function down() {
        if (textBuffer.getContentSize().height - 1 > textBuffer.cy) {
            textBuffer.moveDown();

            if (textBuffer.cx > textBuffer.buffer[textBuffer.cy].length - 1) {
                textBuffer.moveToEndOfLine();
            }
            drawCursor();
        }
    }

    function left() {
        textBuffer.moveBackward();
        drawCursor();
    }

    function right() {
        if (textBuffer.cx < getLine().length) {
            textBuffer.moveRight();
        } else if (textBuffer.getContentSize().height - 1 > textBuffer.cy) {
            textBuffer.moveTo(0, textBuffer.cy + 1);
        }
        drawCursor();
    }

    function getLine() {
        return textBuffer.buffer[textBuffer.cy].reduce((acc: any, curr: any) => {
            acc += curr.char.trim();
            return acc;
        }, '');
    }

    function startOfLine() {
        textBuffer.moveToColumn(0);
        drawCursor();
    }

    function endOfLine() {
        textBuffer.moveToEndOfLine();
        drawCursor();
    }

    function deleteChar() {
        textBuffer.delete(1);
        draw();
    }

    function backspace() {
        textBuffer.backDelete(1);
        draw();
    }

    function newLine() {
        textBuffer.newLine();
        draw();
    }

    function tab() {
        textBuffer.insert('\t');
        draw();
    }
}
