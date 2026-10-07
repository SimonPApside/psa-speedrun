import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [version, previousTag, targetRef = "HEAD", suppliedDate] =
  process.argv.slice(2);

if (!version || !previousTag) {
  throw new Error(
    "Usage: node scripts/update-changelog.mjs <version> <previous-tag> [target-ref] [release-date]",
  );
}

const changelogPath = "CHANGELOG.md";
const changelog = readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n");
if (changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md already contains version ${version}.`);
}

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const releaseDate = suppliedDate || git("log", "-1", "--format=%cs", targetRef);
const subjects = git(
  "log",
  "--no-merges",
  "--format=%s",
  `${previousTag}..${targetRef}`,
)
  .split("\n")
  .filter(Boolean)
  .filter((subject) => !/^chore: update extension version to /i.test(subject));

const categories = [
  { heading: "Added / Ajouts", pattern: /^feat(?:\([^)]*\))?:\s*/i },
  { heading: "Fixed / Corrections", pattern: /^fix(?:\([^)]*\))?:\s*/i },
  {
    heading: "Changed / Modifications",
    pattern: /^(?:refactor|perf|docs|style|build|ci|test)(?:\([^)]*\))?:\s*/i,
  },
];

const grouped = new Map(categories.map(({ heading }) => [heading, []]));
const otherHeading = "Other / Autres";
grouped.set(otherHeading, []);

for (const subject of subjects) {
  const category = categories.find(({ pattern }) => pattern.test(subject));
  const heading = category?.heading ?? otherHeading;
  const summary = category
    ? subject.replace(category.pattern, "")
    : subject;
  grouped.get(heading).push(`- ${summary}`);
}

const sections = [...grouped]
  .filter(([, entries]) => entries.length > 0)
  .map(([heading, entries]) => `### ${heading}\n\n${entries.join("\n")}`)
  .join("\n\n");

const releaseEntry = `## [${version}] - ${releaseDate}\n\n${sections || "No notable changes."}`;
const introEnd = changelog.indexOf("\n\n## [");
if (introEnd === -1) {
  throw new Error("Could not find the first release entry in CHANGELOG.md.");
}

const updated = `${changelog.slice(0, introEnd)}\n\n${releaseEntry}${changelog.slice(introEnd)}`;
const comparisonLink = `[${version}]: https://github.com/SimonPApside/psa-speedrun/compare/${previousTag}...v${version}`;
const linkStart = updated.search(/^\[[^\]]+\]: /m);
const linkSectionStart = linkStart === -1 ? updated.length : linkStart;
const linkSection = updated.slice(linkSectionStart).trimEnd();
const linkSectionWithoutVersion = linkSection
  .split("\n")
  .filter((line) => !line.startsWith(`[${version}]:`))
  .join("\n");
const links = [comparisonLink, linkSectionWithoutVersion]
  .filter(Boolean)
  .join("\n");

writeFileSync(changelogPath, `${updated.slice(0, linkSectionStart)}${links}\n`);
