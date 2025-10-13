import type { Vitest } from 'vitest/node';
import type { RunnerTestFile, RunnerTask } from 'vitest';
import type { Reporter } from 'vitest/reporters';
import type { APIEmbed } from 'discord.js';
import { sendDiscordMessage } from './discord';

export interface DiscordReporterOptions {
  webhookUrl?: string;
  title?: string;
  includeStackTrace?: boolean;
  mentionOnFailure?: string;
  showPassedTests?: boolean;
}

export class DiscordReporter implements Reporter {
  private reporterOptions: Required<DiscordReporterOptions>;
  private startTime: number = 0;
  private ctx!: Vitest;

  constructor(options?: DiscordReporterOptions) {
    this.reporterOptions = {
      webhookUrl: options?.webhookUrl || '',
      title: options?.title || 'Test Results',
      includeStackTrace: options?.includeStackTrace ?? false,
      mentionOnFailure: options?.mentionOnFailure || '',
      showPassedTests: options?.showPassedTests ?? true,
    };
  }

  onInit(ctx: Vitest) {
    if (
      !this.reporterOptions.webhookUrl &&
      process.env.VITE_DISCORD_REPORTER_WEBHOOK_URL
    ) {
      this.reporterOptions.webhookUrl = process.env.VITE_DISCORD_REPORTER_WEBHOOK_URL;
    }
    this.ctx = ctx;
    this.startTime = Date.now();
  }

  async onFinished(files?: RunnerTestFile[], _errors?: unknown[]) {
    const testFiles = files || this.ctx.state.getFiles();
    const duration = Date.now() - this.startTime;
    const embeds = this.buildEmbeds(testFiles, duration);

    try {
      if (this.reporterOptions.webhookUrl) {
        await sendDiscordMessage(this.reporterOptions.webhookUrl, embeds);
        this.ctx.logger.log('✅ Discord notification sent');
      } else {
        this.ctx.logger.warn(
          '⚠️ Discord webhook URL not provided. Skipping notification.',
        );
      }
    } catch (error) {
      this.ctx.logger.error('❌ Failed to send Discord notification:', error);
    }
  }

  private buildEmbeds(files: RunnerTestFile[], duration: number): APIEmbed[] {
    const stats = this.calculateStats(files);
    const embeds: APIEmbed[] = [];

    // Main summary embed
    const summaryEmbed: APIEmbed = {
      title: this.reporterOptions.title,
      color: stats.failed > 0 ? 0xed4245 : 0x57f287, // Red if failed, green if passed
      fields: [
        {
          name: '✅ Passed',
          value: stats.passed.toString(),
          inline: true,
        },
        {
          name: '❌ Failed',
          value: stats.failed.toString(),
          inline: true,
        },
        {
          name: '⏭️ Skipped',
          value: stats.skipped.toString(),
          inline: true,
        },
        {
          name: '⏱️ Duration',
          value: `${(duration / 1000).toFixed(2)}s`,
          inline: true,
        },
        {
          name: '📊 Total',
          value: stats.total.toString(),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    // Add mention if tests failed
    if (stats.failed > 0 && this.reporterOptions.mentionOnFailure) {
      summaryEmbed.description = this.reporterOptions.mentionOnFailure;
    }

    embeds.push(summaryEmbed);

    // Add failed tests details
    const failedTests = this.getFailedTests(files);
    if (failedTests.length > 0) {
      const failedEmbed = this.buildFailedTestsEmbed(failedTests);
      if (failedEmbed) {
        embeds.push(failedEmbed);
      }
    }

    // Add passed tests if enabled
    if (this.reporterOptions.showPassedTests && stats.passed > 0) {
      const passedEmbed = this.buildPassedTestsEmbed(files);
      if (passedEmbed) {
        embeds.push(passedEmbed);
      }
    }

    return embeds;
  }

  private calculateStats(files: RunnerTestFile[]) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let total = 0;

    const countTests = (task: RunnerTask) => {
      if (task.type === 'test') {
        total++;
        if (task.result?.state === 'pass') {
          passed++;
        } else if (task.result?.state === 'fail') {
          failed++;
        } else if (task.mode === 'skip' || task.mode === 'todo') {
          skipped++;
        }
      }

      if ('tasks' in task && task.tasks) {
        task.tasks.forEach(countTests);
      }
    };

    files.forEach((file) => {
      if (file.tasks) {
        file.tasks.forEach(countTests);
      }
    });

    return { passed, failed, skipped, total };
  }

  private getFailedTests(
    files: RunnerTestFile[],
  ): Array<{ name: string; error: string }> {
    const failed: Array<{ name: string; error: string }> = [];

    const collectFailed = (task: RunnerTask, path: string[] = []) => {
      const currentPath = [...path, task.name];

      if (task.type === 'test' && task.result?.state === 'fail') {
        const errorMessage = task.result.errors?.[0]?.message || 'Unknown error';
        const stackTrace = task.result.errors?.[0]?.stack || '';

        let error = errorMessage;
        if (this.reporterOptions.includeStackTrace && stackTrace) {
          error = `${errorMessage}\n\`\`\`\n${this.truncateStackTrace(stackTrace)}\n\`\`\``;
        }

        failed.push({
          name: currentPath.join(' > '),
          error,
        });
      }

      if ('tasks' in task && task.tasks) {
        task.tasks.forEach((t) => collectFailed(t, currentPath));
      }
    };

    files.forEach((file) => {
      if (file.tasks) {
        file.tasks.forEach((task) => collectFailed(task, [file.name]));
      }
    });

    return failed;
  }

  private buildFailedTestsEmbed(
    failedTests: Array<{ name: string; error: string }>,
  ): APIEmbed | null {
    if (failedTests.length === 0) return null;

    const fields = failedTests.slice(0, 10).map((test) => ({
      name: test.name.length > 256 ? test.name.substring(0, 253) + '...' : test.name,
      value:
        test.error.length > 1024 ? test.error.substring(0, 1021) + '...' : test.error,
    }));

    const embed: APIEmbed = {
      title: '❌ Failed Tests',
      color: 0xed4245,
      fields,
    };

    if (failedTests.length > 10) {
      embed.description = `Showing 10 of ${failedTests.length} failed tests`;
    }

    return embed;
  }

  private buildPassedTestsEmbed(files: RunnerTestFile[]): APIEmbed | null {
    const passedTests: string[] = [];

    const collectPassed = (task: RunnerTask, path: string[] = []) => {
      const currentPath = [...path, task.name];

      if (task.type === 'test' && task.result?.state === 'pass') {
        passedTests.push(currentPath.join(' > '));
      }

      if ('tasks' in task && task.tasks) {
        task.tasks.forEach((t) => collectPassed(t, currentPath));
      }
    };

    files.forEach((file) => {
      if (file.tasks) {
        file.tasks.forEach((task) => collectPassed(task, [file.name]));
      }
    });

    if (passedTests.length === 0) return null;

    const testList = passedTests
      .slice(0, 20)
      .map((test) => `✓ ${test}`)
      .join('\n');

    const description =
      testList.length > 2048 ? testList.substring(0, 2045) + '...' : testList;

    const embed: APIEmbed = {
      title: '✅ Passed Tests',
      color: 0x57f287,
      description: description || 'All tests passed!',
    };

    if (passedTests.length > 20) {
      embed.footer = {
        text: `Showing 20 of ${passedTests.length} passed tests`,
      };
    }

    return embed;
  }

  private truncateStackTrace(stack: string, maxLength: number = 800): string {
    if (stack.length <= maxLength) {
      return stack;
    }
    return stack.substring(0, maxLength) + '\n... (truncated)';
  }
}
