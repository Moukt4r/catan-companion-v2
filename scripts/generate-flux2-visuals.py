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
    selected = [scene for scene in SCENES if not args.keys or scene["key"] in args.keys]
    unknown = set(args.keys or []) - {scene["key"] for scene in SCENES}
    if unknown:
        raise SystemExit(f"Unknown keys: {', '.join(sorted(unknown))}")

    manifest = []
    for index, scene in enumerate(SCENES, 1):
        target = DEST / f"{scene['key']}.webp"
        if scene in selected and (args.force or not target.exists()):
            print(f"[{selected.index(scene) + 1}/{len(selected)}] {scene['key']}", flush=True)
            response = request_json("/prompt", {"prompt": graph(scene)})
            source = wait_for_output(response["prompt_id"])
            export_webp(source, target)
            print(f"wrote {target} ({target.stat().st_size / 1024:.1f} KiB)", flush=True)
        manifest.append({
            "id": scene["key"],
            "group": scene["group"],
            "file": f"src/assets/flux2/{scene['key']}.webp",
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
