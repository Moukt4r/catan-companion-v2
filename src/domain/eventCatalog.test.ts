import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMATIC_EVENTS } from "./rules";

const canonicalCatalog = [
  ["Earthquake!", "All players must remove one road from their network."],
  ["Good Harvest", "Each player receives one resource of their choice."],
  ["Trade Winds", "Maritime trade costs are reduced by 1 for the next round."],
  ["Pirates!", "Players with more than 7 cards must discard one resource."],
  ["Market Day", "All players may make one 2:1 trade with the bank."],
  ["Storm", "No maritime trade allowed for one round."],
  ["Discovery", "Draw one development card at half cost."],
  [
    "Rebellion",
    "Longest road is temporarily broken - no bonus points this round.",
  ],
  ["Festival", "Each player with a city receives one free resource."],
  ["Drought", "Fields produce no grain this round."],
  ["Time of Abundance", "All resource production is doubled this round."],
  ["Peace Treaty", "Robber cannot be moved this round."],
  ["Innovation", "First city upgrade this round costs 1 less resource."],
  ["Epidemic", "Cities produce resources as settlements this round."],
  ["Progress", "Each player may upgrade one road for free."],
  ["Dense Fog", "No robber movement allowed this round."],
  ["Resource Windfall", "Roll one die - all players get that resource."],
  [
    "Tax Collection",
    "Players with more than 5 victory points must give away 1 resource.",
  ],
  ["Good Fortune", "Next 7 rolled does not trigger robber."],
  ["Sabotage", "Each player must disable one production hex for one round."],
  ["Celebration", "Development cards cost 1 less resource this round."],
  ["Diplomacy", "Players cannot play soldier cards this round."],
  [
    "Creative Solutions",
    "Players may use any resource as a wildcard once this round.",
  ],
  ["Raider Attack", "Players with settlements on 6 or 8 lose one resource."],
  ["Cooperation", "All trades between players cost no resources this round."],
  ["Competition", "No trades between players allowed this round."],
  [
    "Ancient Wisdom",
    "Development cards can be played immediately after purchase.",
  ],
  ["Mystical Event", "Reshuffle all unplayed development cards."],
  ["Investment", "Players may buy victory points for 5 resources each."],
  ["Isolation", "No new roads can be built this round."],
] as const;

describe("built-in thematic event catalog", () => {
  it("mirrors the canonical predecessor utils/events.ts catalog", () => {
    expect(
      BUILT_IN_THEMATIC_EVENTS.map(({ title, instruction }) => [
        title,
        instruction,
      ]),
    ).toEqual(canonicalCatalog);
    expect(
      new Set(BUILT_IN_THEMATIC_EVENTS.map((event) => event.id)).size,
    ).toBe(canonicalCatalog.length);
  });

  it("versions the changed Market Day definition", () => {
    expect(
      BUILT_IN_THEMATIC_EVENTS.find((event) => event.id === "event-market-day"),
    ).toMatchObject({ contentVersion: 2 });
  });
});
