import { MqlSession } from './session';

export type ClientStatus = 'connecting' | 'ready' | 'failed' | 'ended';

type Waiter<T> = { resolve: (value: T) => void; reject: (error: Error) => void };

const startTimeoutMs = 30000;
const promptPattern = /MQL<\d*>\s*$/;
const errorPattern = /^\s*(?:System )?Error:.*$/gm;

export class MqlClient {
  private readonly session: MqlSession;
  private buffer = '';
  private pending: Waiter<string> | undefined;
  private startWaiter: Waiter<void> | undefined;
  private starting: Promise<void> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly contextCommand: () => string,
    private readonly onStatus: (status: ClientStatus, message?: string) => void,
  ) {
    this.session = new MqlSession({
      output: (text) => {
        if (this.pending) this.buffer += text;
      },
      ready: () => this.startWaiter?.resolve(),
      released: () => this.settle(),
      failed: () => this.abort('failed', 'mql을 실행할 수 없습니다. PATH에 mql이 있는지 확인하세요.'),
      ended: (text) => this.abort('ended', text || 'MQL 세션이 종료되었습니다.'),
      batch: () => {},
      prompted: () => {},
    });
  }

  start(): Promise<void> {
    this.starting ??= this.boot().catch((error: Error) => {
      this.starting = undefined;
      this.session.stop();
      this.onStatus('failed', error.message);
      throw error;
    });
    return this.starting;
  }

  restart(): Promise<void> {
    this.session.stop();
    this.rejectAll(new Error('MQL 세션을 다시 시작합니다.'));
    this.starting = undefined;
    return this.start();
  }

  run(command: string): Promise<string> {
    const task = this.queue.then(async () => {
      await this.start();
      return this.exec(command);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  dispose() {
    this.session.stop();
    this.rejectAll(new Error('MQL 세션이 종료되었습니다.'));
    this.starting = undefined;
  }

  private async boot() {
    this.onStatus('connecting');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MQL 세션 시작 시간이 초과되었습니다.')), startTimeoutMs);
      this.startWaiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.session.start();
    });
    this.startWaiter = undefined;
    const command = this.contextCommand().trim();
    if (command) await this.exec(command);
    this.onStatus('ready');
  }

  private exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.session.arm()) {
        reject(new Error('MQL 세션에 명령을 보낼 수 없습니다.'));
        return;
      }
      this.buffer = '';
      this.pending = { resolve, reject };
      const text = command.trim().endsWith(';') ? command.trim() : `${command.trim()};`;
      if (this.session.send(text)) return;
      this.pending = undefined;
      reject(new Error('MQL 명령 전송에 실패했습니다.'));
    });
  }

  private settle() {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    const text = this.buffer.replace(promptPattern, '');
    this.buffer = '';
    const errors = text.match(errorPattern);
    if (errors) pending.reject(new Error(errors.map((line) => line.trim()).join('\n')));
    else pending.resolve(text);
  }

  private abort(status: ClientStatus, message: string) {
    this.starting = undefined;
    this.rejectAll(new Error(message));
    this.onStatus(status, message);
  }

  private rejectAll(error: Error) {
    const pending = this.pending;
    const startWaiter = this.startWaiter;
    this.pending = undefined;
    this.startWaiter = undefined;
    this.buffer = '';
    pending?.reject(error);
    startWaiter?.reject(error);
  }
}
