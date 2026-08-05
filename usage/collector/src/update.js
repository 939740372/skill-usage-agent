import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const COLLECTOR_ROOT = path.resolve(moduleDirectory, '..');

async function hasGitMetadata(directory) {
  try {
    await fs.stat(path.join(directory, '.git'));
    return true;
  } catch {
    return false;
  }
}

export async function findGitRepoRoot(startDirectory = COLLECTOR_ROOT) {
  let directory = path.resolve(startDirectory);
  while (true) {
    if (await hasGitMetadata(directory)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    const details = String(error.stderr || error.stdout || error.message || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export async function updateInstallation() {
  const repoRoot = await findGitRepoRoot();
  if (!repoRoot) {
    throw new Error('当前安装不是 Git checkout，无法自更新；请从 skill-usage-agent 仓库安装后再执行此命令');
  }

  const status = await run('git', ['status', '--porcelain'], repoRoot);
  if (status.stdout.trim()) {
    throw new Error(`Git 工作区不干净，请先提交或暂存本地改动：${repoRoot}`);
  }

  const branch = (await run('git', ['branch', '--show-current'], repoRoot)).stdout.trim();
  if (!branch) throw new Error('当前 Git checkout 没有可更新的分支');

  await run('git', ['pull', '--ff-only', 'origin', branch], repoRoot);
  await run(npmCommand(), ['install', '--no-audit', '--no-fund'], COLLECTOR_ROOT);

  return {
    repoRoot,
    branch,
    collectorRoot: COLLECTOR_ROOT,
    message: 'usage-agent 已从 GitHub 更新并完成依赖安装'
  };
}
