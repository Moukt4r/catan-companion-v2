import type { EventFace, Season, WorldEventCategory } from "../domain";

import eventBarbarian from "../assets/flux2/event-barbarian.webp";
import eventPolitics from "../assets/flux2/event-politics.webp";
import eventScience from "../assets/flux2/event-science.webp";
import eventTrade from "../assets/flux2/event-trade.webp";
import seasonAutumn from "../assets/flux2/season-autumn.webp";
import seasonSpring from "../assets/flux2/season-spring.webp";
import seasonSummer from "../assets/flux2/season-summer.webp";
import seasonWinter from "../assets/flux2/season-winter.webp";
import worldDiplomacy from "../assets/flux2/world-diplomacy.webp";
import worldEconomy from "../assets/flux2/world-economy.webp";
import worldMilitary from "../assets/flux2/world-military.webp";
import worldNature from "../assets/flux2/world-nature.webp";
import worldSociety from "../assets/flux2/world-society.webp";

export const EVENT_DIE_ART: Readonly<Record<EventFace, string>> = {
  barbarian: eventBarbarian,
  politics: eventPolitics,
  science: eventScience,
  trade: eventTrade,
};

export const SEASON_ART: Readonly<Record<Season, string>> = {
  spring: seasonSpring,
  summer: seasonSummer,
  autumn: seasonAutumn,
  winter: seasonWinter,
};

export const WORLD_EVENT_ART: Readonly<Record<WorldEventCategory, string>> = {
  nature: worldNature,
  economy: worldEconomy,
  military: worldMilitary,
  diplomacy: worldDiplomacy,
  society: worldSociety,
};

export function worldEventIllustration(eventId: string): string {
  return `${import.meta.env.BASE_URL}world-events/${encodeURIComponent(eventId)}.webp`;
}
