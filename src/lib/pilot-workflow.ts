import type {
  PilotDelta,
  PilotPlanCard,
  PilotPrintPreparation,
  PilotPrintRequest,
  PilotProjectState,
  PilotRevision,
} from "@/lib/pilot-api"

export type PilotCardDisposition =
  | "new_print"
  | "replacement_print"
  | "reuse"
  | "outside"
  | "clarify"

export function pilotActiveCards(state: PilotProjectState) {
  const result = new Map<
    string,
    { boardId: string; card: PilotPrintPreparation["cards"][number] }
  >()
  if (!("boards" in state.activePlacement)) return result
  for (const [boardId, preparation] of Object.entries(state.activePlacement.boards)) {
    for (const card of preparation.cards) {
      result.set(card.sourcePlanCardId, { boardId, card })
    }
  }
  return result
}

export function pilotCardDisposition(
  delta: PilotDelta,
  active: ReturnType<typeof pilotActiveCards>,
): PilotCardDisposition {
  if (delta.kind === "outside_forecast") return "outside"
  if (["removed_or_unclear", "removed_confirmed", "parent_conflict"].includes(delta.kind)) {
    return "clarify"
  }
  if (delta.replacementPrintRequired) return "replacement_print"
  return active.has(delta.sourcePlanCardId) ? "reuse" : "new_print"
}

export function pilotCardsInScope(cards: PilotPlanCard[], start: string, end: string) {
  return cards.filter((card) => card.date >= start && card.date <= end)
}

export function pilotCardsToPrint(
  preparation: PilotPrintPreparation,
  revision: PilotRevision,
  state: PilotProjectState,
) {
  const delta = new Map(revision.delta.map((item) => [item.sourcePlanCardId, item]))
  const active = pilotActiveCards(state)
  return preparation.cards
    .filter((card) => {
      const item = delta.get(card.sourcePlanCardId)
      return item && pilotCardDisposition(item, active) !== "reuse"
    })
    .map((card) => card.sourcePlanCardId)
}

export function assertPilotPrintPreparation(
  preparation: PilotPrintPreparation,
  request: PilotPrintRequest,
  sourceProjectId: string,
) {
  const responseIds = preparation.cards.map((card) => card.sourcePlanCardId)
  if (
    preparation.requestId !== request.requestId ||
    preparation.sourceProjectId !== sourceProjectId ||
    preparation.revision !== request.revision ||
    preparation.boardId !== request.boardId ||
    responseIds.length !== request.cardIds.length ||
    responseIds.some((id, index) => id !== request.cardIds[index])
  ) {
    throw new Error("Die Druckvorbereitung passt nicht zur angeforderten Projekt-/Kartenbindung.")
  }
}
