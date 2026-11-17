import { spawnSync } from "node:child_process";

// CI passes the range explicitly; locally the range comes from the branch point.
// Keeping the selection here means the CI step and the hk steps cannot drift apart.
const zeroHash = /^0+$/;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function git(args) {
  const result = run("git", args);

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function resolveCommit(ref) {
  if (!ref || zeroHash.test(ref)) {
    return null;
  }

  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
}

const repositoryRoot = git(["rev-parse", "--show-toplevel"]);

if (!repositoryRoot) {
  process.stderr.write("lint-commits: not inside a git repository\n");
  process.exit(1);
}

const head = resolveCommit("HEAD");

if (!head) {
  process.stderr.write("lint-commits: HEAD is not a commit\n");
  process.exit(1);
}

let base = null;
let source = null;

for (const [name, ref] of [
  ["PR_BASE", process.env.PR_BASE],
  ["PUSH_BEFORE", process.env.PUSH_BEFORE],
]) {
  const commit = resolveCommit(ref);

  if (commit) {
    base = commit;
    source = name;
    break;
  }
}

if (!base) {
  base = git(["merge-base", "origin/main", "HEAD"]);
  source = "origin/main";
}

if (!base) {
  base = resolveCommit("HEAD~1");
  source = "HEAD~1";
}

if (!base) {
  process.stdout.write("No previous commit to compare against; linting HEAD.\n");
  const message = git(["log", "-1", "--format=%B"]) ?? "";
  const result = run("pnpm", ["exec", "commitlint"], {
    cwd: repositoryRoot,
    input: message,
    stdio: ["pipe", "inherit", "inherit"],
  });
  process.exit(result.status ?? 1);
}

if (base === head) {
  process.stdout.write("No new commits to lint.\n");
  process.exit(0);
}

process.stdout.write(
  `Linting commits ${base.slice(0, 12)}..${head.slice(0, 12)} (base: ${source}).\n`,
);

const result = run("pnpm", ["exec", "commitlint", "--from", base, "--to", head, "--verbose"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
