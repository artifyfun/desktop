/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';

export class UVRunner {
  private readonly uvPath: string;
  private process: ChildProcess | null = null;

  constructor(uvPath: string) {
    this.uvPath = uvPath;
  }

  async execute(args: string[]): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      let output = '';

      this.process = spawn(this.uvPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          RUST_LOG: 'trace',
        },
      });

      this.process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      this.process.stderr?.on('data', (data) => {
        output += data.toString();
      });

      this.process.on('error', (error) => {
        reject(new Error(`Failed to start UV process: ${error.message}`));
      });

      this.process.on('close', (code) => {
        resolve({
          exitCode: code ?? -1,
          output: output.trim(),
        });
      });
    });
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

const runner = new UVRunner('/Users/junhanhuang/Documents/robinjhuang/desktop/assets/uv/macos/uv');
try {
  const result = await runner.execute(['venv', '--python', '3.12.4']);
  console.log(`Exit code: ${result.exitCode}`);
  console.log(`Output: ${result.output}`);
} catch (error) {
  console.error('Error:', error);
}
