/**
 * Problem loader for LiveCodeBench dataset from HuggingFace
 * Uses Python's datasets library for efficient loading
 */

import { execFileSync } from 'child_process';

export interface TestCase {
  input: string;
  output: string;
}

export interface Problem {
  question_id: string;
  question_content: string;
  starter_code?: string;
  public_test_cases: TestCase[];
  private_test_cases: TestCase[];
}

// Parse a raw problem object into our Problem interface
function parseProblem(raw: Record<string, unknown>): Problem {
  let publicTests: TestCase[] = [];
  let privateTests: TestCase[] = [];

  if (raw.public_test_cases) {
    publicTests = typeof raw.public_test_cases === 'string'
      ? JSON.parse(raw.public_test_cases as string)
      : raw.public_test_cases as TestCase[];
  }

  if (raw.private_test_cases) {
    privateTests = typeof raw.private_test_cases === 'string'
      ? JSON.parse(raw.private_test_cases as string)
      : raw.private_test_cases as TestCase[];
  }

  return {
    question_id: raw.question_id as string,
    question_content: raw.question_content as string,
    starter_code: (raw.starter_code as string) || undefined,
    public_test_cases: publicTests,
    private_test_cases: privateTests,
  };
}

export async function loadProblems(sampleSize: number): Promise<Problem[]> {
  console.log(`Loading ${sampleSize || 'all'} problems from LiveCodeBench using Python...`);

  try {
    // Use Python's datasets library which handles HuggingFace datasets efficiently
    // Using execFileSync to avoid shell injection (sampleSize is validated as number)
    const args = ['/app/scripts/load_problems.py'];
    if (sampleSize > 0) {
      args.push('--sample', String(sampleSize));
    }

    console.log(`Running: python3 ${args.join(' ')}`);

    const output = execFileSync('python3', args, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large outputs
      timeout: 120000, // 2 minute timeout
    });

    const rawProblems = JSON.parse(output) as Record<string, unknown>[];
    const problems = rawProblems.map(parseProblem);

    console.log(`Loaded ${problems.length} problems`);
    return problems;
  } catch (error) {
    const err = error as Error & { stderr?: string };
    console.error('Failed to load problems via Python:', err.message);
    if (err.stderr) {
      console.error('Python stderr:', err.stderr);
    }
    throw new Error(`Failed to load dataset: ${err.message}`);
  }
}

export function formatPrompt(problem: Problem): string {
  let prompt = `Solve the following programming problem. Return only the Python code solution, no explanations.

## Problem

${problem.question_content}

`;

  if (problem.starter_code) {
    prompt += `## Starter Code

Use the following function signature:

\`\`\`python
${problem.starter_code}
\`\`\`

`;
  }

  prompt += `## Requirements

- Write clean, correct Python code
- Handle all edge cases
- Your code should read from stdin and write to stdout if no starter code is provided
- If starter code is provided, implement the function with that exact signature
- Return ONLY the code, wrapped in \`\`\`python ... \`\`\` markers
`;

  return prompt;
}
