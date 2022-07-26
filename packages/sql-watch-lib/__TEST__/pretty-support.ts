import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';

// eslint-disable-next-line import/no-extraneous-dependencies
import SonicBoom from 'sonic-boom';

export const prettyLogger = (fileName: string): Logger => {
  const prettyStream = pretty({
    colorize: false,
    ignore: 'pid,hostname,time',
    sync: true, // when testing using jest,
    destination: new SonicBoom({ dest: fileName }),
    mkdir: true,
  });

  return pino(prettyStream);
};
