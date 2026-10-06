import { createHash } from "node:crypto"

export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  }
  throw new Error("Nicht kanonischer Vergabewert.")
}

export function allocationDigest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex")
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungueltiger Vergabestand.")
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Ungueltige Vergabebindung.")
  return value
}

export function verifyPrintAllocation(journal: Uint8Array, witnessValue: unknown, project: string) {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(journal)
  if (!raw.endsWith("\n")) throw new Error("Unvollstaendiges Vergabejournal.")
  const [headerValue, ...events] = raw
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown)
  const header = record(headerValue)
  if (
    header.schema !== "pilot-allocation-journal-v1" ||
    header.project !== project ||
    typeof header.synthetic !== "boolean"
  ) {
    throw new Error("Vergabejournal passt nicht zum Quellprojekt.")
  }
  const authority = text(header.authority)
  if (!Array.isArray(header.allowedTags) || !Array.isArray(header.allowedMarkers))
    throw new Error("Inventar fehlt im Vergabejournal.")
  const allowedTags = new Set(header.allowedTags)
  const allowedMarkers = new Set(header.allowedMarkers)
  const jobs = new Map<string, Record<string, unknown>>()
  const assignments = new Map<string, { activity: string; active: number; done: number }>()
  const used = new Set<number>()
  const boards = new Map<string, number>()
  let previous = allocationDigest(header)
  for (const [index, value] of events.entries()) {
    const event = record(value)
    if (event.sequence !== index + 1 || event.previous !== previous)
      throw new Error("Vergabekette ist inkonsistent.")
    const job = record(event.job)
    const requestId = text(job.requestId)
    const boardId = text(job.boardId)
    const marker = job.boardMarkerId
    if (
      jobs.has(requestId) ||
      job.authority !== authority ||
      job.sourceProjectId !== project ||
      job.synthetic !== header.synthetic ||
      typeof marker !== "number" ||
      !Number.isInteger(marker) ||
      !allowedMarkers.has(marker) ||
      (boards.has(boardId) && boards.get(boardId) !== marker) ||
      (!boards.has(boardId) && [...boards.values()].includes(marker)) ||
      !Array.isArray(job.cards)
    )
      throw new Error("Inkonsistente Druckauftrags-/Tafelbindung im Journal.")
    boards.set(boardId, marker)
    const cardIds: string[] = []
    for (const rawCard of job.cards) {
      const card = record(rawCard)
      const id = text(card.sourcePlanCardId)
      const activity = text(card.sourceActivityId)
      const active = card.activeTagId
      const done = card.doneTagId
      if (
        typeof active !== "number" ||
        typeof done !== "number" ||
        !Number.isInteger(active) ||
        !Number.isInteger(done) ||
        active === done ||
        active < 0 ||
        done < 0 ||
        active >= 63486 ||
        done >= 63486 ||
        !allowedTags.has(active) ||
        !allowedTags.has(done) ||
        cardIds.includes(id)
      ) {
        throw new Error("Ungueltiges Kartenpaar im Journal.")
      }
      cardIds.push(id)
      const prior = assignments.get(id)
      if (prior) {
        if (prior.activity !== activity || prior.active !== active || prior.done !== done)
          throw new Error("Kartenidentitaet wurde im Journal umgewidmet.")
      } else {
        if (used.has(active) || used.has(done))
          throw new Error("Tag-ID wurde im Journal wiedervergeben.")
        assignments.set(id, { activity, active, done })
        used.add(active)
        used.add(done)
      }
    }
    if (
      job.requestHash !== allocationDigest({ requestId, revision: job.revision, boardId, cardIds })
    ) {
      throw new Error("Druckauftrags-Hash passt nicht zum Journalauftrag.")
    }
    jobs.set(requestId, job)
    previous = allocationDigest(event)
  }
  const witness = record(witnessValue)
  if (witness.count !== events.length || witness.hash !== previous)
    throw new Error("Witness passt nicht zum vollstaendigen Journal.")
  return {
    jobs,
    assignments,
    manifest: {
      authority,
      synthetic: header.synthetic,
      journalSha256: createHash("sha256").update(journal).digest("hex"),
      witnessSha256: allocationDigest(witness),
      witnessCount: events.length,
      witnessHead: previous,
    },
  }
}
