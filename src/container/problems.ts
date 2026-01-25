/**
 * Problem loader for LiveCodeBench dataset from HuggingFace
 */

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

const DATASET_URL =
  'https://huggingface.co/datasets/livecodebench/code_generation_lite/resolve/main/test.jsonl';

// Fixed seed for reproducible sampling
const FIXED_SEED = 42;

// Simple seeded random number generator (mulberry32)
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(array: T[], random: () => number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Cache for loaded problems
let cachedProblems: Problem[] | null = null;

export async function loadProblems(sampleSize: number): Promise<Problem[]> {
  // Fetch dataset if not cached
  if (!cachedProblems) {
    console.log('Fetching LiveCodeBench dataset from HuggingFace...');

    // HuggingFace datasets API provides JSONL format
    const jsonlUrl =
      'https://huggingface.co/datasets/livecodebench/code_generation_lite/resolve/main/test.jsonl';

    const response = await fetch(jsonlUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.trim().split('\n');

    cachedProblems = lines.map((line) => {
      const raw = JSON.parse(line);

      // Parse test cases if they're strings
      let publicTests: TestCase[] = [];
      let privateTests: TestCase[] = [];

      if (raw.public_test_cases) {
        publicTests = typeof raw.public_test_cases === 'string'
          ? JSON.parse(raw.public_test_cases)
          : raw.public_test_cases;
      }

      if (raw.private_test_cases) {
        privateTests = typeof raw.private_test_cases === 'string'
          ? JSON.parse(raw.private_test_cases)
          : raw.private_test_cases;
      }

      return {
        question_id: raw.question_id,
        question_content: raw.question_content,
        starter_code: raw.starter_code || undefined,
        public_test_cases: publicTests,
        private_test_cases: privateTests,
      };
    });

    console.log(`Loaded ${cachedProblems.length} problems`);
  }

  // Sample if needed
  if (sampleSize > 0 && sampleSize < cachedProblems.length) {
    const random = seededRandom(FIXED_SEED);
    const shuffled = shuffleArray(cachedProblems, random);
    console.log(`Sampled ${sampleSize} problems (seed=${FIXED_SEED})`);
    return shuffled.slice(0, sampleSize);
  }

  return cachedProblems;
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
