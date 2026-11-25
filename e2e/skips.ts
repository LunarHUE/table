import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Lists every skipped spec at the end of a run with its reason, which is the
 * capability the framework lacks. The list reporter marks a skip but doesn't
 * say why.
 */
export default class SkipsReporter implements Reporter {
  private readonly lines: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "skipped") return;
    const skip = [...result.annotations, ...test.annotations].find((annotation) => annotation.type === "skip");
    this.lines.push(`  ${test.titlePath().filter(Boolean).join(" › ")}\n    ${skip?.description ?? "No reason given."}`);
  }

  onEnd(): void {
    if (this.lines.length === 0) return;
    console.log(`\n${this.lines.length} skipped:\n${this.lines.join("\n")}`);
  }

  printsToStdio(): boolean {
    return true;
  }
}
