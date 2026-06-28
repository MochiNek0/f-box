// Creates a git tag from package.json version and pushes it,
// which triggers .github/workflows/release.yml to build and publish the release.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json version "${version}" is not in x.y.z format.`);
  process.exit(1);
}

// Refuse to release with uncommitted changes — the tag must point at a clean commit.
if (run("git status --porcelain")) {
  console.error("Working tree is not clean. Commit your changes before releasing.");
  process.exit(1);
}

const existingTags = run("git tag").split("\n");
if (existingTags.includes(version)) {
  console.error(`Tag "${version}" already exists. Bump the version in package.json first.`);
  process.exit(1);
}

console.log(`Tagging release ${version} ...`);
execSync(`git tag -a ${version} -m "Release ${version}"`, { stdio: "inherit" });
execSync(`git push origin ${version}`, { stdio: "inherit" });
console.log(`Pushed tag ${version}. GitHub Actions will build and publish the release.`);
