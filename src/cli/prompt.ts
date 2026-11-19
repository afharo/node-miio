import readline from "node:readline";
import { Writable } from "node:stream";

/**
 * Asks a question in the terminal.
 *
 * @param question The question
 * @param options The options
 * @param options.hidden Don't echo the answer (passwords)
 * @returns The answer
 */
export function prompt(
  question: string,
  options: { hidden?: boolean } = {},
): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: process.stdin.isTTY,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (options.hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
    // Mute the echo of the answer (the question is already written)
    muted = !!options.hidden;
  });
}
