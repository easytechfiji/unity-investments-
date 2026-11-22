// A small JSON logger. One line per event, so a log service can search it.
// Rule: never pass names, emails, phone numbers or addresses in `fields`.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type Fields = Record<string, string | number | boolean | null | undefined>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

export function createLogger(minLevel: LogLevel): Logger {
  const write = (level: Exclude<LogLevel, 'silent'>, message: string, fields?: Fields) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
    if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
