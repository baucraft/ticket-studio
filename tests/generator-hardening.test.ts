import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { readGitObjectBytes } from "../scripts/git-object.mjs"
import { acquireTargetLock, recoverTargetArtifacts } from "../scripts/target-lock.mjs"

describe("DEMO-04 generator hardening", () => {
  it("reads pinned Git object bytes and ignores a modified tracked worktree file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-git-object-"))
    const repository = join(root, "source")
    try {
      await mkdir(repository)
      execFileSync("git", ["init", "--quiet"], { cwd: repository })
      await writeFile(join(repository, "marker.png"), "pinned bytes")
      execFileSync("git", ["add", "marker.png"], { cwd: repository })
      execFileSync(
        "git",
        [
          "-c",
          "user.name=DEMO-04 test",
          "-c",
          "user.email=demo04@example.invalid",
          "commit",
          "--quiet",
          "-m",
          "fixture",
        ],
        { cwd: repository },
      )
      const revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        encoding: "ascii",
      }).trim()
      const originalBlob = execFileSync("git", ["rev-parse", "HEAD:marker.png"], {
        cwd: repository,
        encoding: "ascii",
      }).trim()
      const replacementBlob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repository,
        encoding: "ascii",
        input: "replacement-ref bytes",
      }).trim()
      execFileSync("git", ["replace", originalBlob, replacementBlob], { cwd: repository })

      const before = readGitObjectBytes(repository, revision, "marker.png")
      await writeFile(join(repository, "marker.png"), "modified worktree bytes")
      const after = readGitObjectBytes(repository, revision, "marker.png")

      expect(before.toString("utf8")).toBe("pinned bytes")
      expect(after).toEqual(before)
      expect(await readFile(join(repository, "marker.png"), "utf8")).toBe("modified worktree bytes")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects an active target lock and reclaims a lock left by a dead process", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-target-lock-"))
    const target = join(root, "generated")
    try {
      const active = acquireTargetLock(target)
      const activeOwner = await readFile(join(active.lockPath, "owner.json"), "utf8")
      expect(() => acquireTargetLock(target)).toThrow("locked by generator process")
      active.release()

      mkdirSync(join(root, ".generated.lock"))
      writeFileSync(
        join(root, ".generated.lock", "owner.json"),
        JSON.stringify({ pid: 999_999_999, processStartToken: null, token: "observed-stale" }),
      )
      let replacement: ReturnType<typeof acquireTargetLock> | undefined
      expect(() =>
        acquireTargetLock(target, {
          beforeReclaim: ({ lockPath }) => {
            rmSync(lockPath, { recursive: true })
            replacement = acquireTargetLock(target)
          },
        }),
      ).toThrow("locked by generator process")
      expect(
        JSON.parse(readFileSync(join(root, ".generated.lock", "owner.json"), "utf8")).token,
      ).not.toBe("observed-stale")
      expect(
        JSON.parse(readFileSync(join(root, ".generated.lock", "reclaim.json"), "utf8"))
          .observedOwnerToken,
      ).toBe("observed-stale")
      replacement?.release()

      await mkdir(join(root, ".generated.lock"))
      await writeFile(
        join(root, ".generated.lock", "owner.json"),
        JSON.stringify({ pid: 999_999_999, processStartToken: null, token: "stale" }),
      )
      await writeFile(join(root, ".generated.lock", "reclaim.json"), activeOwner)
      expect(() => acquireTargetLock(target)).toThrow("being reclaimed by generator process")
      expect(
        JSON.parse(await readFile(join(root, ".generated.lock", "owner.json"), "utf8")).token,
      ).toBe("stale")
      await rm(join(root, ".generated.lock"), { recursive: true })

      await mkdir(join(root, ".generated.lock"))
      await writeFile(
        join(root, ".generated.lock", "owner.json"),
        JSON.stringify({ pid: 999_999_999, processStartToken: null, token: "stale" }),
      )
      await writeFile(
        join(root, ".generated.lock", "reclaim.json"),
        JSON.stringify({ pid: 999_999_998, processStartToken: null, token: "abandoned" }),
      )
      expect(() => acquireTargetLock(target)).toThrow("abandoned reclamation claim")
      expect(
        JSON.parse(await readFile(join(root, ".generated.lock", "owner.json"), "utf8")).token,
      ).toBe("stale")
      await rm(join(root, ".generated.lock"), { recursive: true })

      const moduleUrl = new URL("../scripts/target-lock.mjs", import.meta.url).href
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import { acquireTargetLock } from ${JSON.stringify(moduleUrl)}; acquireTargetLock(${JSON.stringify(target)});`,
        ],
        { stdio: "pipe" },
      )
      const recovered = acquireTargetLock(target)
      recovered.release()
      expect(
        await readFile(join(root, ".generated.lock", "owner.json"), "utf8").catch(() => null),
      ).toBe(null)

      await mkdir(join(root, ".generated.lock"))
      await writeFile(
        join(root, ".generated.lock", "owner.json"),
        JSON.stringify({ pid: process.pid, processStartToken: "reused-pid", token: "stale" }),
      )
      const reusedPidRecovered = acquireTargetLock(target)
      reusedPidRecovered.release()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("restores a pre-publish backup and removes crash leftovers under the target lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-target-recovery-"))
    const target = join(root, "generated")
    try {
      await mkdir(target)
      await writeFile(join(target, "manifest.json"), "old manifest")
      await writeFile(join(target, "sentinel.txt"), "complete old target")
      await rename(target, join(root, ".generated.backup"))
      await mkdir(join(root, ".generated.tmp-crashed"))
      await mkdir(join(root, ".generated.lock-candidate-crashed"))

      const lock = acquireTargetLock(target)
      try {
        recoverTargetArtifacts(target, { restoreBackup: true })
      } finally {
        lock.release()
      }

      expect(await readFile(join(target, "sentinel.txt"), "utf8")).toBe("complete old target")
      expect((await readdir(root)).sort()).toEqual(["generated"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
