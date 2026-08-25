import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

export function readGitObjectBytes(repository, revision, path) {
  return execFileSync("git", ["-C", resolve(repository), "show", `${revision}:${path}`], {
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
  })
}
