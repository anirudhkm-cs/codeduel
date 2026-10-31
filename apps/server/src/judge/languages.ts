import type { LanguageId } from "./types.js";

export interface Language {
  id: LanguageId;
  label: string;
  /** Judge0 CE 1.13 language id */
  judge0Id: number;
  /** Monaco editor language id */
  monaco: string;
  starter: string;
}

export const LANGUAGES: Record<LanguageId, Language> = {
  python: {
    id: "python",
    label: "Python 3",
    judge0Id: 71,
    monaco: "python",
    starter: `import sys

def main():
    data = sys.stdin.read().split()
    # your solution here
    print(data)

main()
`,
  },
  javascript: {
    id: "javascript",
    label: "JavaScript (Node.js)",
    judge0Id: 63,
    monaco: "javascript",
    starter: `const data = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/);

// your solution here
console.log(data);
`,
  },
  cpp: {
    id: "cpp",
    label: "C++17",
    judge0Id: 54,
    monaco: "cpp",
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // your solution here

    return 0;
}
`,
  },
  java: {
    id: "java",
    label: "Java",
    judge0Id: 62,
    monaco: "java",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

        // your solution here
    }
}
`,
  },
};

export const LANGUAGE_IDS = Object.keys(LANGUAGES) as LanguageId[];
