import { MqlSession, type Pipe } from './session';

export type ClientStatus = 'connecting' | 'ready' | 'failed' | 'ended';

type Timer = ReturnType<typeof setTimeout>;
type Chunk = (text: string) => void;
type Pending = { resolve: (text: string) => void; reject: (error: Error) => void };
type Waiter = Pending & {
  command: string;
  at: number;
  lines: string[];
  streamed: number;
  onChunk?: Chunk;
  discard?: boolean;
};
type Signal = { resolve: () => void; reject: (error: Error) => void };
type Learning = Pending & {
  command: string;
  at: number;
  lines: string[];
  sent: number;
  candidate?: string[];
  verifyFrom: number;
  timer: Timer;
};

const startTimeoutMs = 30000;
const learnTimeoutMs = 120000;
const responseTimeoutMs = 60000;
const learnQuietMs = 100;
const trailingQuietMs = 30;
const markerCommand = 'print context;';
const promptsPattern = /MQL<\d*>/g;
const errorLinePattern =
  /^\s*(?:(?:System\s+|MQL\s+|Connect\s+|Syntax\s+|Parse\s+|Database\s+|Severe\s+|Fatal\s+)?Error(?:\s*:|\s+#\d+)|#\d{4,}\s*:)/i;
const passwordPromptPattern = /^\s*(?:Enter\s+)?Password\s*:\s*$/i;
const quotedPattern = /"[^"]*"|'[^']*'/g;
const contextPattern = /(^|;)\s*(set|push|pop)\b|\bcont/i;
const contextStatementPattern = /(?:^|;)\s*(?:set|push|pop)\s+context\b/i;
const setContextPattern = /(?:^|;)\s*(set\s+context\b[^;]*)/gi;
const pipes = ['out', 'err'] as const;

const withSemicolon = (command: string) => {
  const text = command.trim();
  return !text || text.endsWith(';') ? text : `${text};`;
};

const changesContext = (command: string) => contextPattern.test(command.replace(quotedPattern, '""'));

const cleanLine = (line: string) => line.replace(promptsPattern, '');

const valuesOf = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

const sameBlock = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

function lastValues(lines: string[], count: number) {
  const values: string[] = [];
  for (let index = lines.length - 1; index >= 0 && values.length < count; index--) {
    const value = lines[index].trim();
    if (value) values.unshift(value);
  }
  return values;
}

function doubledTail(values: string[]) {
  for (let size = 1; size <= Math.min(10, Math.floor(values.length / 2)); size++) {
    const tail = values.slice(-size);
    if (sameBlock(values.slice(-size * 2, -size), tail)) return tail;
  }
  return undefined;
}

function countBlocks(values: string[], block: string[]) {
  let count = 0;
  for (let index = 0; index + block.length <= values.length; ) {
    if (sameBlock(values.slice(index, index + block.length), block)) {
      count++;
      index += block.length;
    } else index++;
  }
  return count;
}

function stripBlocks(lines: string[], block: string[], count: number) {
  let end = lines.length;
  for (let removed = 0; removed < count; removed++) {
    let index = end;
    let matched = block.length;
    while (index > 0 && matched > 0) {
      index--;
      const value = lines[index].trim();
      if (!value) continue;
      if (value !== block[matched - 1]) return lines.slice(0, end);
      matched--;
    }
    if (matched) return lines.slice(0, end);
    end = index;
  }
  return lines.slice(0, end);
}

function heldLines(lines: string[], marker: string[]) {
  const values: { value: string; index: number }[] = [];
  for (let index = lines.length - 1; index >= 0 && values.length < marker.length; index--) {
    const value = lines[index].trim();
    if (value) values.unshift({ value, index });
  }
  for (let size = values.length; size > 0; size--) {
    const tail = values.slice(-size);
    if (tail.every((item, at) => item.value === marker[at])) return lines.length - tail[0].index;
  }
  return 0;
}

function errorLines(text: string) {
  const lines = text.split(/\r?\n/);
  const last = lines.filter((line) => line.trim()).at(-1) ?? '';
  const prompt = passwordPromptPattern.test(last) ? [last] : [];
  return [...lines.filter((line) => errorLinePattern.test(line)), ...prompt].map((line) => line.trim());
}

const lastSetContext = (command: string) => [...command.matchAll(setContextPattern)].at(-1)?.[1];

export class MqlError extends Error {
  constructor(
    message: string,
    readonly output: string,
  ) {
    super(message);
  }
}

export class MqlClient {
  private readonly session: MqlSession;
  private readonly remainders: Record<Pipe, string> = { out: '', err: '' };
  private readonly flushTimers: Partial<Record<Pipe, Timer>> = {};
  private waiters: Waiter[] = [];
  private drainers: Signal[] = [];
  private watchdog: Timer | undefined;
  private learning: Learning | undefined;
  private learnTimer: Timer | undefined;
  private startWaiter: Signal | undefined;
  private starting: Promise<void> | undefined;
  private gate: Promise<unknown> = Promise.resolve();
  private marker: string[] | undefined;
  private lastContext = '';

  constructor(
    private readonly contextCommand: () => string,
    private readonly onStatus: (status: ClientStatus, message?: string) => void,
    private readonly log: (text: string) => void,
  ) {
    this.session = new MqlSession({
      output: (text, pipe) => this.onOutput(text, pipe),
      ready: () => this.startWaiter?.resolve(),
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

  run(command: string, onChunk?: Chunk): Promise<string> {
    const text = withSemicolon(command);
    const exclusive = changesContext(text);
    const task = this.gate.then(async () => {
      await this.start();
      if (!exclusive) return this.enqueue(text, onChunk);
      await this.drain();
      const output = await this.learn(text).catch((error: Error) => this.recover(text, error));
      const context = lastSetContext(text);
      if (context) this.lastContext = withSemicolon(context);
      this.notifyReady();
      return output;
    });
    if (exclusive) this.gate = task.catch(() => undefined);
    return task;
  }

  dispose() {
    this.session.stop();
    this.rejectAll(new Error('MQL 세션이 종료되었습니다.'));
    this.starting = undefined;
  }

  private async boot() {
    this.marker = undefined;
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
    const context = withSemicolon(this.contextCommand());
    await this.learn(context);
    this.lastContext = context;
    this.log(`marker=${JSON.stringify(this.marker)}`);
    this.notifyReady();
  }

  private async recover(command: string, error: Error): Promise<never> {
    const isMqlError = error instanceof MqlError;
    if (isMqlError && this.lastContext && contextStatementPattern.test(command)) {
      this.log(`restore context > ${this.lastContext}`);
      await this.learn(this.lastContext).catch(() => undefined);
    }
    if (isMqlError && this.starting) this.notifyReady();
    throw error;
  }

  private notifyReady() {
    this.onStatus('ready', this.marker?.join(' '));
  }

  private enqueue(command: string, onChunk?: Chunk) {
    return new Promise<string>((resolve, reject) => {
      if (!this.marker) {
        reject(new Error('MQL 세션이 준비되지 않았습니다.'));
        return;
      }
      this.waiters.push({ command, at: Date.now(), lines: [], streamed: 0, onChunk, resolve, reject });
      if (!this.session.send(`${command}\n${markerCommand}`)) {
        this.waiters.pop();
        reject(new Error('MQL 명령 전송에 실패했습니다.'));
        return;
      }
      if (!this.watchdog) this.watch();
    });
  }

  private learn(command: string) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => this.finishLearning(new Error('MQL 응답 확인 시간이 초과되었습니다.')),
        learnTimeoutMs,
      );
      this.learning = { command: command || markerCommand, at: Date.now(), lines: [], sent: 2, verifyFrom: 0, timer, resolve, reject };
      const commands = [command, markerCommand, markerCommand].filter(Boolean).join('\n');
      if (!this.session.send(commands)) this.finishLearning(new Error('MQL 명령 전송에 실패했습니다.'));
    });
  }

  private drain() {
    if (!this.waiters.length) return Promise.resolve();
    if (!this.watchdog) this.watch();
    return new Promise<void>((resolve, reject) => this.drainers.push({ resolve, reject }));
  }

  private watch() {
    clearTimeout(this.watchdog);
    this.watchdog = this.waiters.length ? setTimeout(() => this.expire(), responseTimeoutMs) : undefined;
  }

  private expire() {
    this.watchdog = undefined;
    const error = new Error('MQL 응답 시간이 초과되었습니다.');
    this.waiters
      .filter((waiter) => !waiter.discard)
      .forEach((waiter) => {
        waiter.discard = true;
        this.log(`timeout > ${waiter.command}`);
        waiter.reject(error);
      });
    this.drainers.splice(0).forEach((drainer) => drainer.reject(error));
  }

  private onOutput(text: string, pipe: Pipe) {
    const lines = (this.remainders[pipe] + text).split(/\r?\n/);
    this.remainders[pipe] = lines.pop() ?? '';
    lines.forEach((line) => this.onLine(cleanLine(line)));
    if (cleanLine(text).trim()) this.watch();
    this.stream();
    if (this.learning) {
      clearTimeout(this.learnTimer);
      this.learnTimer = setTimeout(() => this.checkLearning(), learnQuietMs);
    } else this.scheduleFlush(pipe);
  }

  private onLine(line: string) {
    if (this.learning) {
      this.learning.lines.push(line);
      return;
    }
    const head = this.waiters[0];
    const marker = this.marker;
    if (!head || !marker) return;
    head.lines.push(line);
    if (line.trim() !== marker[marker.length - 1] || !sameBlock(lastValues(head.lines, marker.length), marker)) return;
    this.waiters.shift();
    const text = stripBlocks(head.lines, marker, 1).join('\n');
    this.logResponse(head.command, head.at, text);
    if (!head.discard) this.settle(head, text);
    this.watch();
    if (!this.waiters.length) this.drainers.splice(0).forEach((drainer) => drainer.resolve());
  }

  private stream() {
    const head = this.waiters[0];
    if (!head?.onChunk || head.discard || !this.marker) return;
    const end = head.lines.length - heldLines(head.lines, this.marker);
    if (end <= head.streamed) return;
    head.onChunk(
      head.lines
        .slice(head.streamed, end)
        .map((line) => `${line}\n`)
        .join(''),
    );
    head.streamed = end;
  }

  private scheduleFlush(pipe: Pipe) {
    clearTimeout(this.flushTimers[pipe]);
    const rest = this.remainders[pipe];
    const last = this.marker?.[this.marker.length - 1];
    if (!last || cleanLine(rest).trim() !== last) return;
    this.flushTimers[pipe] = setTimeout(() => {
      if (this.remainders[pipe] !== rest) return;
      this.remainders[pipe] = '';
      this.onLine(cleanLine(rest));
    }, trailingQuietMs);
  }

  private checkLearning() {
    const learning = this.learning;
    if (!learning) return;
    const tentative = pipes.map((pipe) => cleanLine(this.remainders[pipe])).filter((line) => line.trim());
    const values = valuesOf([...learning.lines, ...tentative]);
    const candidate = doubledTail(values);
    if (!candidate || countBlocks(values, candidate) < learning.sent) return;
    if (!learning.candidate || !sameBlock(learning.candidate, candidate)) {
      learning.candidate = candidate;
      learning.verifyFrom = values.length;
      learning.sent += 1;
      if (!this.session.send(markerCommand)) this.finishLearning(new Error('MQL 명령 전송에 실패했습니다.'));
      return;
    }
    if (!countBlocks(values.slice(learning.verifyFrom), candidate)) return;
    learning.lines.push(...tentative);
    pipes.forEach((pipe) => {
      if (cleanLine(this.remainders[pipe]).trim()) this.remainders[pipe] = '';
    });
    this.marker = candidate;
    this.finishLearning();
  }

  private finishLearning(error?: Error) {
    const learning = this.learning;
    if (!learning) return;
    this.learning = undefined;
    clearTimeout(learning.timer);
    clearTimeout(this.learnTimer);
    if (error) {
      learning.reject(error);
      return;
    }
    const text = stripBlocks(learning.lines, this.marker ?? [], learning.sent).join('\n');
    this.logResponse(learning.command, learning.at, text);
    this.settle(learning, text);
  }

  private settle(pending: Pending, text: string) {
    const errors = errorLines(text);
    if (errors.length) pending.reject(new MqlError(errors.join('\n'), text));
    else pending.resolve(text);
  }

  private logResponse(command: string, at: number, text: string) {
    this.log(`${Date.now() - at}ms > ${command}\n${text.slice(0, 2000)}`);
  }

  private abort(status: ClientStatus, message: string) {
    this.log(`${status}: ${message}`);
    this.starting = undefined;
    this.rejectAll(new Error(message));
    this.onStatus(status, message);
  }

  private rejectAll(error: Error) {
    clearTimeout(this.watchdog);
    this.watchdog = undefined;
    this.waiters.splice(0).forEach((waiter) => {
      if (!waiter.discard) waiter.reject(error);
    });
    this.drainers.splice(0).forEach((drainer) => drainer.resolve());
    this.finishLearning(error);
    this.startWaiter?.reject(error);
    this.startWaiter = undefined;
    pipes.forEach((pipe) => {
      clearTimeout(this.flushTimers[pipe]);
      this.remainders[pipe] = '';
    });
  }
}
