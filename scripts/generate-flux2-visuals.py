#!/usr/bin/env python3
"""Generate the Catan Companion FLUX.2 visual system.

Requires the isolated local FLUX.2 ComfyUI service at http://127.0.0.1:8190.
Raw PNGs remain in ComfyUI's output tree; optimized WebP assets and a full
provenance manifest are written into this repository.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance

COMFY = "http://127.0.0.1:8190"
COMFY_OUTPUT = Path.home() / "ComfyUI-flux2" / "output"
REPO = Path(__file__).resolve().parents[1]
DEST = REPO / "src" / "assets" / "flux2"
MANIFEST_PATH = REPO / "docs" / "flux2-visuals-manifest.json"
WIDTH, HEIGHT, STEPS, GUIDANCE = 1216, 768, 24, 4.0

STYLE = (
    "Full-bleed cinematic landscape illustration, edge-to-edge museum-quality book art, not a screenshot, "
    "handcrafted miniature-diorama realism blended with sophisticated painterly matte painting, "
    "a rugged northern coastal frontier of timber, stone, linen and aged brass, tactile materials, "
    "dramatic but natural atmospheric light, elegant restrained composition with one calm area for later interface overlays, "
    "rich detail and cohesive premium art direction. Absolutely no user interface, no HUD, no menu, no buttons, "
    "no icons, no resource bar, no frame, no border, no decorative medallions, no tokens, no coins, no readable text, "
    "no lettering, no logos, no trademarks, no hex grid, no dice, no commercial board-game pieces, no CATAN trade dress, "
    "no watermark. The entire canvas contains only the illustrated physical scene. "
)

SCENES = [
    # Official event-die outcomes: visually distinct, information remains textual in UI.
    {
        "key": "event-barbarian",
        "group": "event-die",
        "seed": 240701,
        "prompt": STYLE + (
            "A dark raider fleet with charcoal sails crossing a slate-blue sea toward a small fortified lantern harbor, "
            "storm front gathering behind distant mountains, crimson warning light on the horizon, tense and purposeful, "
            "wide cinematic view, no battle, no gore, no emblems."
        ),
    },
    {
        "key": "event-science",
        "group": "event-die",
        "seed": 240702,
        "prompt": STYLE + (
            "A luminous cliffside observatory workshop overlooking the sea, brass armillary sphere, glass lenses, "
            "celestial instruments and rolled blank parchment, cool indigo twilight with turquoise lamplight, "
            "discovery and precision, no formulas or readable markings."
        ),
    },
    {
        "key": "event-trade",
        "group": "event-die",
        "seed": 240703,
        "prompt": STYLE + (
            "A prosperous sunlit harbor exchange, graceful merchant vessels, stacked timber crates, woven goods, "
            "ceramic jars and a brass balance scale, warm ochre and sea-green palette, lively commerce implied without crowds, "
            "no coins with faces, no signs or readable labels."
        ),
    },
    {
        "key": "event-politics",
        "group": "event-die",
        "seed": 240704,
        "prompt": STYLE + (
            "A candlelit coastal council chamber with a round oak table, four empty carved chairs, blank parchment, "
            "wax seals without symbols, deep burgundy and midnight-blue drapery, harbor lights beyond tall windows, "
            "quiet authority and negotiation, no people, no heraldry, no readable text."
        ),
    },
    # Same world language across the four seasons.
    {
        "key": "season-spring",
        "group": "season",
        "seed": 240711,
        "prompt": STYLE + (
            "Elevated view across a compact coastal settlement, river valley, orchard, fields and mountain ridge in early spring, "
            "fresh green growth, blossom, retreating snow high on the peaks, soft rain clearing into sunrise, hopeful renewal, "
            "the harbor and village remain the visual anchor."
        ),
    },
    {
        "key": "season-summer",
        "group": "season",
        "seed": 240712,
        "prompt": STYLE + (
            "Elevated view across a compact coastal settlement, river valley, orchard, fields and mountain ridge in high summer, "
            "long golden evening light, deep green fields, bright blue water, full sails in the harbor, warm abundance, "
            "the harbor and village remain the visual anchor."
        ),
    },
    {
        "key": "season-autumn",
        "group": "season",
        "seed": 240713,
        "prompt": STYLE + (
            "Elevated view across a compact coastal settlement, river valley, orchard, fields and mountain ridge in autumn, "
            "copper and amber foliage, harvested fields, stacked grain, low mist and angled sunset, reflective prosperity, "
            "the harbor and village remain the visual anchor."
        ),
    },
    {
        "key": "season-winter",
        "group": "season",
        "seed": 240714,
        "prompt": STYLE + (
            "Elevated view across a compact coastal settlement, river valley, orchard, fields and mountain ridge in winter, "
            "snow on roofs and fields, dark open seawater, warm window lights, pale blue dawn and gathering weather, resilient calm, "
            "the harbor and village remain the visual anchor."
        ),
    },
    # World Event pack motifs, reused consistently for all events in each pack.
    {
        "key": "world-nature",
        "group": "world-event-pack",
        "seed": 240721,
        "prompt": STYLE + (
            "Weather and harvest under pressure: wind moving through golden grain beside a coastal village while a dramatic rain wall "
            "crosses sunlit fields, fruit trees bending, distant lightning over mountains, awe rather than disaster, emerald and gold palette."
        ),
    },
    {
        "key": "world-economy",
        "group": "world-event-pack",
        "seed": 240722,
        "prompt": STYLE + (
            "Trade and markets changing at a frontier port: empty brass balance scale in the foreground, merchant ship arriving, "
            "crates and textiles arranged on a timber quay, shifting sunlight and clouds suggesting opportunity and scarcity, teal and amber palette."
        ),
    },
    {
        "key": "world-military",
        "group": "world-event-pack",
        "seed": 240723,
        "prompt": STYLE + (
            "Conflict and defense at a northern harbor: beacon watchtower lit at dusk, closed wooden gate, shields without symbols, "
            "patrol silhouettes far in the distance and stormy sea beyond, vigilant rather than violent, steel blue and ember red palette, no combat."
        ),
    },
    {
        "key": "world-diplomacy",
        "group": "world-event-pack",
        "seed": 240724,
        "prompt": STYLE + (
            "Diplomacy and intrigue: two empty high-backed chairs facing across a small council table, sealed blank letters, "
            "a half-open harbor map with no labels, moonlit windows and one warm candle, subtle tension, plum, navy and brass palette, no people."
        ),
    },
    {
        "key": "world-society",
        "group": "world-event-pack",
        "seed": 240725,
        "prompt": STYLE + (
            "Festivals and progress in a coastal settlement square: lanterns, flower garlands, workshop inventions, waterwheel and communal long table, "
            "sunset celebration without visible faces, inventive optimism with a hint of uncertainty, coral, gold and turquoise palette."
        ),
    },
]


WORLD_EVENT_SCENES = [
    {
        "key": "we-good-harvest", "title": "Good Harvest", "category": "economy", "group": "world-event", "seed": 240801,
        "prompt": STYLE + "A newly opened coastal granary after a generous harvest, baskets of grain, fruit, wool, timber and clay arranged naturally on a sunlit wooden floor, full storehouse doors open toward green fields, warm gratitude and shared abundance, no people and no labels.",
    },
    {
        "key": "we-market-day", "title": "Market Day", "category": "economy", "group": "world-event", "seed": 240802,
        "prompt": STYLE + "A single-day frontier market beneath canvas awnings beside the harbor, a prominent empty brass balance, neatly arranged sacks, pottery, timber and woven cloth, lively motion suggested by distant soft silhouettes, bright morning opportunity, no signs and no readable price marks.",
    },
    {
        "key": "we-trade-winds", "title": "Trade Winds", "category": "economy", "group": "world-event", "seed": 240803,
        "prompt": STYLE + "Three graceful merchant sailing vessels driven toward a sheltered northern harbor by strong favorable winds, taut cream sails, sparkling teal water, cargo waiting on the quay, sweeping clouds opening to gold sunlight, dynamic prosperity, no flags or emblems.",
    },
    {
        "key": "we-tax-collection", "title": "Tax Collection", "category": "economy", "group": "world-event", "seed": 240804,
        "prompt": STYLE + "An austere coastal treasury room at dusk, measured portions of grain, timber and pottery set beside an empty brass scale and a sealed wooden strongbox, long shadow across a plain oak desk, restrained burden and civic obligation, no coins, no people, no writing.",
    },
    {
        "key": "we-border-patrol", "title": "Border Patrol", "category": "military", "group": "world-event", "seed": 240805,
        "prompt": STYLE + "A vigilant dawn patrol moving along a mountain pass above the coastal settlement, distant anonymous figures and horses seen from behind, stone watchtower beacon glowing, safe valley below, crisp blue air, preparedness without combat, no uniforms or heraldry.",
    },
    {
        "key": "we-raider-attack", "title": "Raider Attack", "category": "military", "group": "world-event", "seed": 240806,
        "prompt": STYLE + "Fast dark raider boats approaching an exposed coastal farm and harbor at stormy twilight, warning beacon lit, villagers only as tiny distant silhouettes securing gates, wind-whipped fields and urgent crimson light, threat without battle, injuries or gore, no emblems.",
    },
    {
        "key": "we-peace-treaty", "title": "Peace Treaty", "category": "military", "group": "world-event", "seed": 240807,
        "prompt": STYLE + "An empty treaty table on a quiet sea-cliff terrace after negotiations, two plain shields and sheathed swords deliberately set aside, blank parchment secured by simple wax, white linen moving in a soft breeze, calm harbor at sunrise, relief without triumph, no symbols or writing.",
    },
    {
        "key": "we-fortification", "title": "Fortification", "category": "military", "group": "world-event", "seed": 240808,
        "prompt": STYLE + "A northern settlement reinforcing its stone-and-timber harbor gate before nightfall, fresh beams, rope, tools and grain sacks ready for the watch, workers as small anonymous silhouettes, warm torchlight against steel-blue dusk, constructive defense, no battle or emblems.",
    },
    {
        "key": "we-trade-embargo", "title": "Trade Embargo", "category": "diplomacy", "group": "world-event", "seed": 240809,
        "prompt": STYLE + "A once-busy frontier harbor made still by an embargo, warehouse shutters closed, merchant vessels tied motionless beyond a lowered timber chain, untouched cargo under gray morning mist, quiet economic tension, no people, no signs, no official seals or readable text.",
    },
    {
        "key": "we-diplomacy", "title": "Diplomatic Summit", "category": "diplomacy", "group": "world-event", "seed": 241811,
        "prompt": STYLE + "A formal summit chamber overlooking the harbor, four distinct empty chairs around a circular oak table, four plain unmarked cloth banners in restrained colors, blank parchment and extinguished weapons locked outside the room, balanced cool daylight and candlelight, no people or text, clean empty image corners, no badge, monogram, signature or artist mark.",
    },
    {
        "key": "we-envoy", "title": "Royal Envoy", "category": "diplomacy", "group": "world-event", "seed": 240812,
        "prompt": STYLE + "An elegant small messenger vessel arriving at a modest frontier quay at first light, a sealed blank letter case resting beside a folded travel cloak, harbor officials only as distant silhouettes, hopeful anticipation, deep blue and gold palette, no crown, heraldry or readable text.",
    },
    {
        "key": "we-earthquake", "title": "Earthquake", "category": "nature", "group": "world-event", "seed": 240813,
        "prompt": STYLE + "The safe aftermath of an earthquake along a coastal settlement road, a deep crack crossing the packed earth, shifted stone wall and fallen roof tiles, fine dust glowing in low sunlight, intact homes and no injured people, sober resilience, no disaster spectacle.",
    },
    {
        "key": "we-drought", "title": "Drought", "category": "nature", "group": "world-event", "seed": 240814,
        "prompt": STYLE + "A parched northern grain valley during prolonged drought, cracked earth, dry irrigation channel and pale struggling fields beneath a vast white-hot sky, distant coastal village conserving water, desaturated ochre and blue-gray palette, no dead animals or people.",
    },
    {
        "key": "we-storm", "title": "Storm at Sea", "category": "nature", "group": "world-event", "seed": 241815,
        "prompt": STYLE + "A fierce sea storm striking the outer harbor, towering dark waves, rain driven sideways, moored vessels secured behind the breakwater and lighthouse beam cutting through lightning-lit clouds, dramatic maritime danger without shipwreck, people or text, clean empty image corners, no badge, numeral, plaque, signature or artist mark.",
    },
    {
        "key": "we-abundant-year", "title": "Abundant Year", "category": "nature", "group": "world-event", "seed": 240816,
        "prompt": STYLE + "An exceptionally abundant coastal year, luminous green fields and heavy orchards surrounding a thriving timber-and-stone town, overflowing granary, clear river and full harbor under radiant late-summer light, extraordinary fertility without fantasy magic or people close-up.",
    },
    {
        "key": "we-festival", "title": "Festival", "category": "society", "group": "world-event", "seed": 240817,
        "prompt": STYLE + "A warm lantern festival in a coastal settlement square at blue hour, long communal tables, flower garlands, musicians and neighbors only as joyful distant silhouettes, harbor lights beyond, welcoming celebration with coral and gold accents, no banners, signs or readable text.",
    },
    {
        "key": "we-epidemic", "title": "Epidemic", "category": "society", "group": "world-event", "seed": 242818,
        "prompt": STYLE + "A quiet residential lane of simple homes in a coastal town responding carefully to an epidemic, calm empty street at dawn, closed shutters, bundles of medicinal herbs and clean water placed outside plain residential doorways, soft pale mist and one warm window lamp, compassionate restraint, no shops, no taverns, no hanging brackets, no signs, plaques, symbols, sick bodies, masks, gore, signature or artist mark.",
    },
    {
        "key": "we-innovation", "title": "Innovation", "category": "society", "group": "world-event", "seed": 240819,
        "prompt": STYLE + "A bright frontier invention workshop beside a waterwheel, elegant wooden gears, bellows, glass lenses, measuring tools and a compact new lifting mechanism, morning sun through open doors toward the harbor, practical discovery, no impossible machinery, formulas or writing.",
    },
    {
        "key": "we-celebration", "title": "Celebration", "category": "society", "group": "world-event", "seed": 240820,
        "prompt": STYLE + "A city-wide evening celebration seen from a hill above the harbor, hundreds of warm lanterns, flower-covered arches, small distant crowds and gentle fireworks reflected on dark water, civic pride and earned progress, elegant rather than carnival-like, no readable banners or logos.",
    },
    {
        "key": "we-fair-shares", "title": "Fair Shares", "category": "diplomacy", "group": "world-event", "seed": 240821,
        "prompt": STYLE + "A modest redistribution of goods on a frontier quay at overcast morning, one full crate of grain and cloth carried from a large well-stocked warehouse toward a small nearly empty storehouse, plain wooden handcart between them, distant anonymous silhouettes, quiet fairness without confrontation, no scales, no signs or readable text.",
    },
    {
        "key": "we-patronage-trade", "title": "Merchant Patronage", "category": "society", "group": "world-event", "seed": 240822,
        "prompt": STYLE + "A merchant patron's alcove above a harbor counting house, warm amber and gold palette, folded bolts of cloth, a plain unmarked sealed letter and a modest closed pouch resting on aged oak, generous afternoon light through small panes, quiet sponsorship, no faces, no visible coins, no readable text or emblems.",
    },
    {
        "key": "we-patronage-politics", "title": "Noble Patronage", "category": "society", "group": "world-event", "seed": 240823,
        "prompt": STYLE + "A noble hall antechamber overlooking the settlement, deep blue and pewter palette, a plain unmarked seal case and folded indigo cloth on a dark polished table, tall window with cool northern light, restrained aristocratic favour, no crest, crown, heraldry, faces or readable text.",
    },
    {
        "key": "we-patronage-science", "title": "Scholarly Patronage", "category": "society", "group": "world-event", "seed": 240824,
        "prompt": STYLE + "An endowed study in a cliffside academy, deep green and brass palette, blank parchment sheets, an unlit reading lamp, glass lenses and a plain closed chest of supplies set out for a student, calm green-tinted daylight from a sea-facing window, quiet sponsorship of learning, no writing, diagrams, faces or emblems.",
    },
    {
        "key": "we-land-grant", "title": "Land Grant", "category": "diplomacy", "group": "world-event", "seed": 240825,
        "prompt": STYLE + "A newly granted parcel of coastal land at golden hour, fresh timber boundary stakes and a coil of rope marking an open green plot beside established farms, a small cart of building materials just delivered, distant surveyor silhouettes, hopeful new beginning, no maps, documents, signs or readable text.",
    },
    {
        "key": "we-favourable-winds", "title": "Favourable Winds", "category": "economy", "group": "world-event", "seed": 240826,
        "prompt": STYLE + "A single modest fishing boat with a patched cream sail running fast before a strong following wind toward a busy harbor, spray and low golden light, larger vessels becalmed in the distance behind it, the small craft clearly favoured, buoyant momentum, no flags, emblems or readable text.",
    },
    {
        "key": "we-call-to-arms", "title": "Call to Arms", "category": "military", "group": "world-event", "seed": 240827,
        "prompt": STYLE + "A modest settlement answering a call to arms at dawn, a plain iron helm and spear taken down from a timber wall rack beside an untouched sack of grain, open door toward a misty valley, one distant anonymous figure setting out, resolve without battle, no uniforms, heraldry, faces or readable text.",
    },
    {
        "key": "we-discontent", "title": "Discontent", "category": "diplomacy", "group": "world-event", "seed": 240828,
        "prompt": STYLE + "Murmurs of discontent outside a prosperous frontier estate at grey dusk, a well-stocked storehouse with one sack set out on the step toward the road, small distant silhouettes gathered at a respectful distance, cold blue light against warm interior glow, civic pressure without violence, no crowd close-up, no signs, banners or readable text.",
    },
    {
        "key": "we-great-library", "title": "The Great Library", "category": "society", "group": "world-event", "seed": 240829,
        "prompt": STYLE + "A grand cliffside library reading hall at golden hour, tall shelves of plain unlabelled bound volumes, stacks of blank paper and an open empty ledger on a broad oak table, dust motes in shafts of warm light through arched windows above the sea, accumulated knowledge, no writing, letters, diagrams, people or emblems.",
    },
    {
        "key": "we-open-schools", "title": "Open Schools", "category": "society", "group": "world-event", "seed": 240830,
        "prompt": STYLE + "A humble village schoolroom newly opened in a converted timber barn, simple benches, a stack of fresh blank paper and plain slates set out on a rough table, bright clear morning light through an open door toward fields, modest beginnings and opportunity, no writing, chalk marks, children, faces or readable text.",
    },
    {
        "key": "we-guild-charter", "title": "Guild Charter", "category": "economy", "group": "world-event", "seed": 240831,
        "prompt": STYLE + "An established weavers' workshop at the height of its craft, several looms with finished bolts of fine cloth stacked neatly, spools of dyed thread in ochre and teal, warm workshop light through high windows, mastery and standing, no people close-up, no signs, charters, seals or readable text.",
    },
    {
        "key": "we-open-markets", "title": "Open Markets", "category": "economy", "group": "world-event", "seed": 240832,
        "prompt": STYLE + "A small newly permitted market stall at the edge of a frontier square, one simple trestle table with a modest roll of plain cloth and a few woven goods, larger established awnings further off, fresh morning light and open cobblestones, a first foothold in trade, no crowds, signs, prices or readable text.",
    },
    {
        "key": "we-royal-audience", "title": "Royal Audience", "category": "diplomacy", "group": "world-event", "seed": 240833,
        "prompt": STYLE + "A formal audience chamber prepared for established envoys, polished stone floor, a single empty high-backed chair on a low dais, plain unmarked drapery in deep blue and pewter, cool light from tall windows over the harbor, institutional standing, no crown, throne ornament, heraldry, faces or readable text.",
    },
    {
        "key": "we-common-council", "title": "Common Council", "category": "diplomacy", "group": "world-event", "seed": 240834,
        "prompt": STYLE + "A plain common council room in a timber town hall, a circle of simple mismatched wooden chairs around a worn round table, one shuttered window open to the harbor, honest afternoon light on scrubbed floorboards, ordinary citizens' governance, no people, banners, seals or readable text.",
    },
    {
        "key": "we-flood", "title": "Flood", "category": "nature", "group": "world-event", "seed": 240835,
        "prompt": STYLE + "A flooded clay riverbank below a coastal settlement, brown water covering the brick pits and low fields, submerged fences and a stranded handcart, heavy grey rain clouds breaking over distant hills, muted ochre and slate palette, sober disruption without drowning victims, people or readable text.",
    },
    {
        "key": "we-caravan", "title": "Caravan", "category": "economy", "group": "world-event", "seed": 240836,
        "prompt": STYLE + "A small overland caravan pausing at a frontier crossroads in late afternoon, two laden pack animals and a covered cart, bundles of wool, timber and pottery ready to be exchanged, dust and long golden shadows toward distant coastal hills, everyday exchange, no faces, signs or readable text.",
    },
    {
        "key": "we-muster", "title": "Muster", "category": "military", "group": "world-event", "seed": 240837,
        "prompt": STYLE + "A settlement muster ground at first light, rows of plain spears and simple iron helms set out on timber racks awaiting untrained hands, empty practice field with morning mist, stone watchtower behind, readiness and civic duty before any conflict, no soldiers, faces, uniforms, heraldry or readable text.",
    },
]

ALL_SCENES = SCENES + WORLD_EVENT_SCENES


def request_json(path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        COMFY + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def graph(scene: dict) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "mistral_3_small_flux2_fp8.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": scene["prompt"], "clip": ["2", 0]}},
        "5": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": GUIDANCE}},
        "6": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["5", 0]}},
        "7": {"class_type": "RandomNoise", "inputs": {"noise_seed": scene["seed"]}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "Flux2Scheduler", "inputs": {"steps": STEPS, "width": WIDTH, "height": HEIGHT}},
        "10": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["7", 0], "guider": ["6", 0], "sampler": ["8", 0], "sigmas": ["9", 0], "latent_image": ["10", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": f"catan_companion_flux2/{scene['key']}"}},
    }


def wait_for_output(prompt_id: str, timeout: int = 1200) -> Path:
    deadline = time.time() + timeout
    while time.time() < deadline:
        history = request_json(f"/history/{prompt_id}")
        item = history.get(prompt_id)
        if item:
            status = item.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI error for {prompt_id}: {status}")
            for output in item.get("outputs", {}).values():
                images = output.get("images", [])
                if images:
                    image = images[0]
                    return COMFY_OUTPUT / image.get("subfolder", "") / image["filename"]
        time.sleep(2)
    raise TimeoutError(f"Timed out waiting for {prompt_id}")


def export_webp(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGB")
    image = ImageEnhance.Contrast(image).enhance(1.025)
    image = ImageEnhance.Color(image).enhance(0.97)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=82, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keys", nargs="*", help="Generate only these scene keys")
    parser.add_argument("--force", action="store_true", help="Regenerate existing assets")
    args = parser.parse_args()

    request_json("/system_stats")
    selected = [scene for scene in ALL_SCENES if not args.keys or scene["key"] in args.keys]
    unknown = set(args.keys or []) - {scene["key"] for scene in ALL_SCENES}
    if unknown:
        raise SystemExit(f"Unknown keys: {', '.join(sorted(unknown))}")

    manifest = []
    for index, scene in enumerate(ALL_SCENES, 1):
        target = (
            REPO / "public" / "world-events" / f"{scene['key']}.webp"
            if scene["group"] == "world-event"
            else DEST / f"{scene['key']}.webp"
        )
        if scene in selected and (args.force or not target.exists()):
            print(f"[{selected.index(scene) + 1}/{len(selected)}] {scene['key']}", flush=True)
            response = request_json("/prompt", {"prompt": graph(scene)})
            source = wait_for_output(response["prompt_id"])
            export_webp(source, target)
            print(f"wrote {target} ({target.stat().st_size / 1024:.1f} KiB)", flush=True)
        manifest.append({
            "id": scene["key"],
            "group": scene["group"],
            "file": (
                f"public/world-events/{scene['key']}.webp"
                if scene["group"] == "world-event"
                else f"src/assets/flux2/{scene['key']}.webp"
            ),
            **({"title": scene["title"], "category": scene["category"]} if scene["group"] == "world-event" else {}),
            "model": "FLUX.2 Dev FP8mixed",
            "seed": scene["seed"],
            "steps": STEPS,
            "guidance": GUIDANCE,
            "width": WIDTH,
            "height": HEIGHT,
            "prompt": scene["prompt"],
        })

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST_PATH}", flush=True)


if __name__ == "__main__":
    main()
