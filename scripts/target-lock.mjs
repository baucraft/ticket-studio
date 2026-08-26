import { randomUUID } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

function processStartToken(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19] ?? null
  } catch {
    return null
  }
}

function processIsLockOwner(owner) {
  const pid = owner?.pid
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return owner.processStartToken === processStartToken(pid)
  } catch (error) {
    return error?.code === "EPERM"
  }
}

function lockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(join(lockPath, "owner.json"), "utf8"))
  } catch {
    return null
  }
}

function reclaimOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(join(lockPath, "reclaim.json"), "utf8"))
  } catch {
    return null
  }
}

export function acquireTargetLock(targetValue, { beforeReclaim } = {}) {
  const target = resolve(targetValue)
  const parent = dirname(target)
  const lockPath = join(parent, `.${basename(target)}.lock`)
  const token = randomUUID()
  const owner = {
    pid: process.pid,
    processStartToken: processStartToken(process.pid),
    token,
    target,
    acquiredAt: new Date().toISOString(),
  }
  mkdirSync(parent, { recursive: true })

  for (;;) {
    const candidate = mkdtempSync(join(parent, `.${basename(target)}.lock-candidate-`))
    writeFileSync(join(candidate, "owner.json"), `${JSON.stringify(owner)}\n`, {
      encoding: "utf8",
      flag: "wx",
    })
    try {
      renameSync(candidate, lockPath)
      break
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true })
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error
    }

    const currentOwner = lockOwner(lockPath)
    if (processIsLockOwner(currentOwner)) {
      throw new Error(`Target is locked by generator process ${currentOwner.pid}: ${target}`)
    }
    beforeReclaim?.({ lockPath, owner: currentOwner })

    try {
      writeFileSync(
        join(lockPath, "reclaim.json"),
        `${JSON.stringify({ ...owner, observedOwnerToken: currentOwner?.token ?? null })}\n`,
        {
          encoding: "utf8",
          flag: "wx",
        },
      )
    } catch (error) {
      if (error?.code === "ENOENT") continue
      if (error?.code !== "EEXIST") throw error
      const currentReclaimer = reclaimOwner(lockPath)
      if (processIsLockOwner(currentReclaimer)) {
        throw new Error(
          `Target lock is being reclaimed by generator process ${currentReclaimer.pid}: ${target}`,
        )
      }
      throw new Error(`Target lock has an abandoned reclamation claim: ${target}`)
    }
    if ((lockOwner(lockPath)?.token ?? null) !== (currentOwner?.token ?? null)) {
      continue
    }

    const stalePath = `${lockPath}.stale-${token}`
    try {
      renameSync(lockPath, stalePath)
      rmSync(stalePath, { recursive: true, force: true })
    } catch (error) {
      if (!["ENOENT", "EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error
    }
  }

  let released = false
  return {
    lockPath,
    release() {
      if (released) return
      released = true
      const owner = lockOwner(lockPath)
      if (owner?.token === token) rmSync(lockPath, { recursive: true, force: true })
    },
  }
}

export function recoverTargetArtifacts(targetValue, { restoreBackup = false } = {}) {
  const target = resolve(targetValue)
  const parent = dirname(target)
  const targetName = basename(target)
  const backupPath = join(parent, `.${targetName}.backup`)

  if (restoreBackup) {
    try {
      readdirSync(backupPath)
      try {
        renameSync(backupPath, target)
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error
        rmSync(backupPath, { recursive: true, force: true })
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }

  for (const name of readdirSync(parent)) {
    if (
      name.startsWith(`.${targetName}.tmp-`) ||
      name.startsWith(`.${targetName}.lock-candidate-`)
    ) {
      rmSync(join(parent, name), { recursive: true, force: true })
    }
  }
}
