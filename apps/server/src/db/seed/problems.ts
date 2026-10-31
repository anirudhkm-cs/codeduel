/**
 * Seed problem set. Each problem defines its inputs plus a reference
 * solution; expected outputs are COMPUTED from the reference, so they can't
 * contain hand-typed mistakes. The first `samples` inputs are shown to players.
 *
 * Add a problem: append to PROBLEMS, then run `npm run db:seed`.
 */
import type { Difficulty } from "../../problems/repository.js";

export interface SeedProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  statementMd: string;
  timeLimitMs?: number;
  samples: number;
  inputs: string[];
  solve: (input: string) => string;
}

// ---------- deterministic random helpers (same tests on every seed) ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261031);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
const ints = (n: number, lo: number, hi: number) => Array.from({ length: n }, () => int(lo, hi));
const str = (n: number, alphabet: string) => Array.from({ length: n }, () => pick([...alphabet])).join("");
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const ALNUM = LOWER + LOWER.toUpperCase() + "0123456789";

const tokens = (input: string) => input.trim().split(/\s+/);

// -----------------------------------------------------------------------------

export const PROBLEMS: SeedProblem[] = [
  {
    slug: "a-plus-b",
    title: "A + B",
    difficulty: "easy",
    statementMd: `Read two integers and print their sum. The classic warm-up.

### Input
A single line with two integers **a** and **b**.

### Output
Print **a + b**.

### Constraints
- -10^9 ≤ a, b ≤ 10^9`,
    samples: 2,
    inputs: [
      "1 2\n",
      "-5 7\n",
      "0 0\n",
      "1000000000 1000000000\n",
      "-1000000000 -1000000000\n",
      ...Array.from({ length: 5 }, () => `${int(-1e9, 1e9)} ${int(-1e9, 1e9)}\n`),
    ],
    solve: (input) => {
      const [a, b] = tokens(input).map(Number);
      return String(a! + b!);
    },
  },

  {
    slug: "reverse-string",
    title: "Reverse a String",
    difficulty: "easy",
    statementMd: `Given a line of text, print it reversed.

### Input
A single line **s**. It contains letters, digits and spaces, and never starts or ends with a space.

### Output
Print **s** reversed.

### Constraints
- 1 ≤ |s| ≤ 1000`,
    samples: 2,
    inputs: [
      "hello\n",
      "Code Duel 2026\n",
      "a\n",
      "racecar\n",
      "ab cd ef\n",
      str(1000, ALNUM) + "\n",
      ...Array.from({ length: 4 }, () => `${str(int(1, 20), ALNUM)} ${str(int(1, 20), ALNUM)}\n`),
    ],
    solve: (input) => [...input.replace(/\n$/, "")].reverse().join(""),
  },

  {
    slug: "fizzbuzz",
    title: "FizzBuzz",
    difficulty: "easy",
    statementMd: `For every integer i from 1 to n, print one line:
- \`FizzBuzz\` if i is divisible by 3 and 5,
- \`Fizz\` if i is divisible by 3 only,
- \`Buzz\` if i is divisible by 5 only,
- otherwise the number i itself.

### Input
A single integer **n**.

### Output
n lines as described.

### Constraints
- 1 ≤ n ≤ 10^4`,
    samples: 1,
    inputs: ["15\n", "1\n", "3\n", "5\n", "30\n", "100\n", "9999\n", "10000\n"],
    solve: (input) => {
      const n = Number(input.trim());
      const lines: string[] = [];
      for (let i = 1; i <= n; i++) {
        lines.push(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i));
      }
      return lines.join("\n");
    },
  },

  {
    slug: "count-vowels",
    title: "Count the Vowels",
    difficulty: "easy",
    statementMd: `Count how many vowels (**a, e, i, o, u**, upper or lower case) appear in a line of text.

### Input
A single line **s** of letters and spaces.

### Output
Print the number of vowels.

### Constraints
- 1 ≤ |s| ≤ 10^5`,
    samples: 2,
    inputs: [
      "Hello World\n",
      "rhythm\n",
      "AEIOU aeiou\n",
      "x\n",
      ...Array.from({ length: 5 }, () => str(int(1, 200), LOWER + "AEIOU  ").trim() + "a\n"),
      str(100000, LOWER + "AEIOU").slice(0, 99999) + "e\n",
    ],
    solve: (input) => String((input.match(/[aeiou]/gi) ?? []).length),
  },

  {
    slug: "valid-palindrome",
    title: "Valid Palindrome",
    difficulty: "easy",
    statementMd: `A phrase is a palindrome if, after removing all characters that are not letters or digits and ignoring case, it reads the same forwards and backwards.

### Input
A single line **s** of printable ASCII characters.

### Output
Print \`YES\` if **s** is a palindrome, otherwise \`NO\`.

### Constraints
- 1 ≤ |s| ≤ 10^5`,
    samples: 2,
    inputs: [
      "A man, a plan, a canal: Panama\n",
      "race a car\n",
      "a\n",
      "ab\n",
      "No 'x' in Nixon\n",
      "0P\n",
      ...Array.from({ length: 6 }, (_, i) => {
        const half = str(int(1, 300), ALNUM + " ,.!");
        const mirrored = half + [...half].reverse().join("");
        return (i % 2 === 0 ? mirrored : mirrored + "Q" + half) + "\n";
      }),
    ],
    solve: (input) => {
      const clean = input.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return clean === [...clean].reverse().join("") ? "YES" : "NO";
    },
  },

  {
    slug: "max-subarray-sum",
    title: "Maximum Subarray Sum",
    difficulty: "medium",
    statementMd: `Find the largest possible sum of a **non-empty contiguous** subarray.

### Input
The first line contains **n**. The second line contains n integers a₁ … aₙ.

### Output
Print the maximum subarray sum.

### Constraints
- 1 ≤ n ≤ 2·10^5
- -10^4 ≤ aᵢ ≤ 10^4

An O(n²) solution will time out on the largest tests.`,
    samples: 2,
    inputs: [
      "9\n-2 1 -3 4 -1 2 1 -5 4\n",
      "3\n-3 -1 -2\n",
      "1\n7\n",
      "1\n-7\n",
      "5\n1 2 3 4 5\n",
      ...[10, 100, 1000].map((n) => `${n}\n${ints(n, -100, 100).join(" ")}\n`),
      `200000\n${ints(200000, -10000, 10000).join(" ")}\n`,
      `200000\n${ints(200000, -10000, -1).join(" ")}\n`,
    ],
    solve: (input) => {
      const [, ...a] = tokens(input).map(Number);
      let best = -Infinity;
      let cur = 0;
      for (const x of a) {
        cur = Math.max(x, cur + x);
        best = Math.max(best, cur);
      }
      return String(best);
    },
  },

  {
    slug: "pair-count",
    title: "Pairs with Target Sum",
    difficulty: "medium",
    statementMd: `Count the pairs of indices **i < j** such that aᵢ + aⱼ = k.

### Input
The first line contains **n** and **k**. The second line contains n integers.

### Output
Print the number of pairs.

### Constraints
- 1 ≤ n ≤ 10^5
- -10^9 ≤ aᵢ, k ≤ 10^9
- The answer may not fit in a 32-bit integer.`,
    samples: 2,
    inputs: [
      "5 6\n1 5 3 3 2\n",
      "4 2\n1 1 1 1\n",
      "1 0\n0\n",
      "3 100\n1 2 3\n",
      ...[50, 1000].map((n) => `${n} ${int(-20, 20)}\n${ints(n, -10, 10).join(" ")}\n`),
      `100000 0\n${ints(100000, -3, 3).join(" ")}\n`,
      `100000 2\n${Array(100000).fill(1).join(" ")}\n`,
      `100000 ${int(-1e9, 1e9)}\n${ints(100000, -1e9, 1e9).join(" ")}\n`,
    ],
    solve: (input) => {
      const [n, k, ...a] = tokens(input).map(Number);
      const seen = new Map<number, number>();
      let pairs = 0;
      for (let i = 0; i < n!; i++) {
        const x = a[i]!;
        pairs += seen.get(k! - x) ?? 0;
        seen.set(x, (seen.get(x) ?? 0) + 1);
      }
      return String(pairs);
    },
  },

  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    difficulty: "medium",
    statementMd: `A bracket string is balanced if every opening bracket is closed by the same type of bracket, in the correct order.

### Input
A single line consisting only of the characters \`()[]{}\`.

### Output
Print \`YES\` if the string is balanced, otherwise \`NO\`.

### Constraints
- 1 ≤ |s| ≤ 10^5`,
    samples: 3,
    inputs: [
      "([]{})\n",
      "([)]\n",
      "((\n",
      ")\n",
      "{}\n",
      ...Array.from({ length: 3 }, () => {
        // random balanced string
        const stack: string[] = [];
        let s = "";
        for (let i = 0; i < 2000; i++) {
          if (stack.length && rand() < 0.5) s += stack.pop();
          else {
            const [o, c] = pick([["(", ")"], ["[", "]"], ["{", "}"]] as const);
            s += o;
            stack.push(c);
          }
        }
        return s + stack.reverse().join("") + "\n";
      }),
      "(".repeat(50000) + ")".repeat(50000) + "\n",
      "(".repeat(50000) + ")".repeat(49999) + "]" + "\n",
    ],
    solve: (input) => {
      const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
      const stack: string[] = [];
      for (const ch of input.trim()) {
        if (ch in pairs) {
          if (stack.pop() !== pairs[ch]) return "NO";
        } else stack.push(ch);
      }
      return stack.length === 0 ? "YES" : "NO";
    },
  },

  {
    slug: "fibonacci-mod",
    title: "Big Fibonacci",
    difficulty: "medium",
    statementMd: `F(0) = 0, F(1) = 1, and F(n) = F(n-1) + F(n-2). Print **F(n) mod 1 000 000 007**.

### Input
A single integer **n**.

### Output
Print F(n) modulo 10^9 + 7.

### Constraints
- 0 ≤ n ≤ 10^6`,
    samples: 2,
    inputs: ["10\n", "50\n", "0\n", "1\n", "2\n", "90\n", "1000\n", "123456\n", "999999\n", "1000000\n"],
    solve: (input) => {
      const n = Number(input.trim());
      const MOD = 1_000_000_007;
      let a = 0;
      let b = 1;
      for (let i = 0; i < n; i++) [a, b] = [b, (a + b) % MOD];
      return String(a);
    },
  },

  {
    slug: "most-frequent-word",
    title: "Most Frequent Word",
    difficulty: "medium",
    statementMd: `Find the word that appears most often. If several words tie, print the **lexicographically smallest** one.

### Input
The first line contains **n**. The second line contains n lowercase words separated by single spaces.

### Output
Print the most frequent word.

### Constraints
- 1 ≤ n ≤ 10^5
- Each word has 1 to 10 lowercase letters.`,
    samples: 2,
    inputs: [
      "6\nthe cat and the hat the\n",
      "4\nbanana apple banana apple\n",
      "1\nsolo\n",
      "3\nc b a\n",
      ...[20, 500].map((n) => {
        const vocab = Array.from({ length: 8 }, () => str(int(1, 5), LOWER));
        return `${n}\n${Array.from({ length: n }, () => pick(vocab)).join(" ")}\n`;
      }),
      (() => {
        const vocab = Array.from({ length: 2000 }, () => str(int(1, 10), LOWER));
        return `100000\n${Array.from({ length: 100000 }, () => pick(vocab)).join(" ")}\n`;
      })(),
    ],
    solve: (input) => {
      const [, ...words] = tokens(input);
      const counts = new Map<string, number>();
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      let best = "";
      let bestCount = 0;
      for (const [w, c] of counts) {
        if (c > bestCount || (c === bestCount && w < best)) {
          best = w;
          bestCount = c;
        }
      }
      return best;
    },
  },
];
