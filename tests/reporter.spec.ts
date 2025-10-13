import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Discord sender
vi.mock('../src/discord', () => ({
  sendDiscordMessage: vi.fn(),
}));

const { sendDiscordMessage } = await import('../src/discord');
const { DiscordReporter } = await import('../src/reporter');

const makeSampleFiles = () => {
  const files: any[] = [
    {
      name: 'a.test.ts',
      tasks: [
        {
          type: 'suite',
          name: 'suite A',
          tasks: [
            { type: 'test', name: 'passes', result: { state: 'pass' } },
            {
              type: 'test',
              name: 'fails',
              result: {
                state: 'fail',
                errors: [{ message: 'Boom', stack: 'STACK\nline1\nline2' }],
              },
            },
            { type: 'test', name: 'skipped', mode: 'skip' },
          ],
        },
      ],
    },
  ];
  return files;
};

describe('DiscordReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeCtx = (files: any[]) => ({
    state: { getFiles: () => files },
    logger: { log: vi.fn(), error: vi.fn() },
  });

  it('calculates stats correctly', () => {
    const reporter = new DiscordReporter({ webhookUrl: 'https://example/hook' });
    const files = makeSampleFiles();
    const ctx: any = makeCtx(files);
    reporter.onInit(ctx);

    // access private via casting
    const stats = reporter['calculateStats'](files);
    expect(stats).toEqual({ passed: 1, failed: 1, skipped: 1, total: 3 });
  });

  it('builds summary embed with mention on failure and duration', () => {
    const reporter = new DiscordReporter({
      webhookUrl: 'https://example/hook',
      title: 'My Suite',
      mentionOnFailure: '@here tests failed',
    });
    const files = makeSampleFiles();
    const ctx: any = makeCtx(files);
    reporter.onInit(ctx);

    const embeds = reporter['buildEmbeds'](files, 2500);
    expect(embeds.length).toBe(3);
    expect(embeds[0].title).toBe('My Suite');
    expect(embeds[0].color).toBe(0xed4245); // red on failure
    // Summary fields values
    const fields = embeds[0].fields;
    expect(fields).toBeTruthy();
    const fieldMap = Object.fromEntries(fields!.map((f) => [f.name, f.value]));
    expect(fieldMap['✅ Passed']).toBe('1');
    expect(fieldMap['❌ Failed']).toBe('1');
    expect(fieldMap['⏭️ Skipped']).toBe('1');
    expect(fieldMap['📊 Total']).toBe('3');
    expect(fieldMap['⏱️ Duration']).toBe('2.50s');
    // Mention on failure
    expect(embeds[0].description).toBe('@here tests failed');
  });

  it('includes failed and passed embeds with proper formatting', () => {
    const reporter = new DiscordReporter({
      webhookUrl: 'https://example/hook',
      includeStackTrace: true,
      showPassedTests: true,
    });
    const files = makeSampleFiles();
    const ctx: any = makeCtx(files);
    reporter.onInit(ctx);

    const embeds = reporter['buildEmbeds'](files, 1000);

    // Failed embed present
    const failedEmbed = embeds.find((e: any) => e.title === '❌ Failed Tests');
    expect(failedEmbed).toBeTruthy();
    expect(failedEmbed!.color).toBe(0xed4245);
    expect((failedEmbed!.fields?.[0]?.name || '').includes('fails')).toBe(true);
    // stack trace wrapped in code block when includeStackTrace=true
    expect(failedEmbed!.fields?.[0]?.value).toContain('```');

    // Passed embed present
    const passedEmbed = embeds.find((e: any) => e.title === '✅ Passed Tests');
    expect(passedEmbed).toBeTruthy();
    expect(passedEmbed!.color).toBe(0x57f287);
    expect(passedEmbed!.description).toContain('✓ a.test.ts > suite A > passes');
  });

  it('limits failed tests embed to 10 and shows notice for more', () => {
    const reporter = new DiscordReporter({ webhookUrl: 'https://example/hook' });

    const manyFailed = Array.from({ length: 12 }).map((_, i) => ({
      type: 'test',
      name: `f${i + 1}`,
      result: { state: 'fail', errors: [{ message: `E${i + 1}` }] },
    }));

    const files: any[] = [
      { name: 'many.test.ts', tasks: [{ type: 'suite', name: 'S', tasks: manyFailed }] },
    ];
    const ctx: any = makeCtx(files);
    reporter.onInit(ctx);

    const failed = reporter['getFailedTests'](files);
    const failedEmbed = reporter['buildFailedTestsEmbed'](failed);

    expect(failed.length).toBe(12);
    expect(failedEmbed).toBeTruthy();
    expect(failedEmbed!.fields).toBeTruthy();
    expect(failedEmbed!.fields!.length).toBe(10);
    expect(failedEmbed!.description).toContain('Showing 10 of 12 failed tests');
  });

  it('onFinished sends embeds and logs outcome (success)', async () => {
    const reporter = new DiscordReporter({ webhookUrl: 'https://example/hook' });
    const files = makeSampleFiles();
    const ctx: any = makeCtx(files);

    (sendDiscordMessage as any).mockResolvedValue({ ok: true });

    reporter.onInit(ctx);
    await reporter.onFinished();

    expect(sendDiscordMessage).toHaveBeenCalledTimes(1);
    const [url, embeds] = (sendDiscordMessage as any).mock.calls[0];
    expect(url).toBe('https://example/hook');
    expect(Array.isArray(embeds)).toBe(true);
    expect(ctx.logger.log).toHaveBeenCalledWith('✅ Discord notification sent');
  });

  it('onFinished logs error on failure to send', async () => {
    const reporter = new DiscordReporter({ webhookUrl: 'https://example/hook' });
    const files = makeSampleFiles();
    const ctx: any = makeCtx(files);

    (sendDiscordMessage as any).mockRejectedValue(new Error('network'));

    reporter.onInit(ctx);
    await reporter.onFinished();

    expect(ctx.logger.error).toHaveBeenCalled();
    const firstArg = (ctx.logger.error as any).mock.calls[0][0];
    expect(firstArg).toBe('❌ Failed to send Discord notification:');
  });
});
