/**
 * Code executor - runs Python code in subprocess and captures output
 */

import { spawn } from 'child_process';

export type ErrorType = 'syntax' | 'runtime' | 'wrong_answer' | 'timeout' | 'api_error' | null;

export interface ExecutionResult {
  success: boolean;
  output: string;
  errorType: ErrorType;
}

const CODE_EXECUTION_TIMEOUT = 30000; // 30 seconds

export function extractCodeFromResponse(responseText: string): string {
  // Try to find ```python ... ``` blocks first
  const pythonBlocks = responseText.match(/```(?:python|py)\n([\s\S]*?)```/g);
  if (pythonBlocks && pythonBlocks.length > 0) {
    const lastBlock = pythonBlocks[pythonBlocks.length - 1];
    return lastBlock.replace(/```(?:python|py)\n/, '').replace(/```$/, '').trim();
  }

  // Try generic ``` ... ``` blocks
  const genericBlocks = responseText.match(/```\w*\n([\s\S]*?)```/g);
  if (genericBlocks && genericBlocks.length > 0) {
    const lastBlock = genericBlocks[genericBlocks.length - 1];
    return lastBlock.replace(/```\w*\n/, '').replace(/```$/, '').trim();
  }

  // Fall back to the entire response
  return responseText.trim();
}

export async function executeCode(
  code: string,
  input: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', code], {
      env: {
        PATH: process.env.PATH || '',
        PYTHONPATH: '',
        HOME: '/tmp',
      },
      timeout: CODE_EXECUTION_TIMEOUT,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, CODE_EXECUTION_TIMEOUT);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send input
    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (killed) {
        resolve({
          success: false,
          output: '',
          errorType: 'timeout',
        });
        return;
      }

      if (exitCode !== 0) {
        const errorType: ErrorType = stderr.includes('SyntaxError')
          ? 'syntax'
          : 'runtime';
        resolve({
          success: false,
          output: stderr,
          errorType,
        });
        return;
      }

      resolve({
        success: true,
        output: stdout,
        errorType: null,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        output: err.message,
        errorType: 'runtime',
      });
    });
  });
}

export async function runTestCases(
  code: string,
  testCases: Array<{ input: string; output: string }>
): Promise<{ passed: boolean; errorType: ErrorType }> {
  for (const testCase of testCases) {
    const result = await executeCode(code, testCase.input);

    if (!result.success) {
      return { passed: false, errorType: result.errorType };
    }

    // Compare outputs (strip whitespace for comparison)
    const actualOutput = result.output.trim();
    const expectedOutput = testCase.output.trim();

    if (actualOutput !== expectedOutput) {
      return { passed: false, errorType: 'wrong_answer' };
    }
  }

  return { passed: true, errorType: null };
}
