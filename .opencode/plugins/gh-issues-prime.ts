import type { Plugin } from '@opencode-ai/plugin';

export const GhIssuesPrimePlugin: Plugin = async ({ $, directory }) => {
  const result = await $`sh configs/agents/trackers/gh-issues/gh-issues-prime`
    .cwd(directory)
    .quiet()
    .nothrow();
  const prime = result.exitCode === 0 ? result.stdout.toString() : '';

  return {
    'experimental.chat.system.transform': async (_, output) => {
      if (prime) output.system.push(prime);
    },
    'experimental.session.compacting': async (_, output) => {
      if (prime) output.context.push(prime);
    },
  };
};

export default GhIssuesPrimePlugin;
