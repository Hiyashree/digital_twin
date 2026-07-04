"""
Map arbitrary model label strings to one of six waste categories.

This is the **knowledge core** of the pipeline. Pretrained ImageNet ViT does not output
``glass`` or ``organic`` directly — it outputs very specific things like ``wine_bottle``,
``beer_bottle``, ``banana``, ``carton``. We map those into the six dashboard buckets here.

Ordering matters: we check **specific** patterns before **generic** ones (e.g. ``wine_bottle``
is detected as **glass** before the generic ``bottle → plastic`` fallback fires).

Categories:
  * **glass** — bottles for wine/beer/spirits, jars, vases, drinking glasses, ampoules…
  * **metal** — cans (beer / soda / food), tin foil, cutlery, hardware…
  * **plastic** — PET / HDPE bottles, plastic bags, packaging, plastic containers…
  * **paper** — cardboard, cartons, paper towels, books, envelopes, paper plates…
  * **organic** — fruit, vegetables, food scraps, peels, compost…
  * **mixed** — generic trash, bags of mixed waste, residual…
"""

from __future__ import annotations

import re

from ml.waste_pipeline.categories import WASTE_KEYS

# ---------------------------------------------------------------------------
# Specific ImageNet / dataset class names → six-way category.
# Order of dict construction does not matter — we check sets below.
# ---------------------------------------------------------------------------

_GLASS_EXACT: frozenset[str] = frozenset(
    {
        # Bottles that are virtually always glass on ImageNet
        "wine bottle",
        "beer bottle",
        "champagne",
        "pill bottle",
        "perfume",
        "perfume bottle",
        "ink bottle",
        "decanter",
        # Glassware
        "vase",
        "goblet",
        "wineglass",
        "wine glass",
        "beer glass",
        "drinking glass",
        "tumbler",
        "shot glass",
        "measuring cup",
        # Jars / preserves
        "jar",
        "mason jar",
        "preserve jar",
        # Lab / scientific glass
        "beaker",
        "test tube",
        "flask",
        "petri dish",
        "ampoule",
        "ampule",
    }
)

# Substrings that imply glass even when wrapped in other words.
_GLASS_SUBSTR: tuple[str, ...] = (
    "wine bottle",
    "beer bottle",
    "wineglass",
    "wine glass",
    "champagne",
    "cullet",  # broken glass for recycling
    "mirror",
    "windshield",
    "window glass",
    "shard",
    "shatter",
    "glassware",
    "glass jar",
    "glass bottle",
    "stemware",
)

_METAL_EXACT: frozenset[str] = frozenset(
    {
        # Cans / containers (steel or aluminium)
        "beer can",
        "pop can",
        "soda can",
        "tin can",
        "tin",
        "can opener",
        "milk can",
        "petrol can",
        "gas can",
        # Cookware
        "frying pan",
        "wok",
        "dutch oven",
        "caldron",
        "cauldron",
        # Foil
        "tinfoil",
        "aluminium foil",
        "aluminum foil",
        # Hardware that ends up in metal recycling
        "nail",
        "screw",
        "hook",
        "bolt",
        "hinge",
        "chain",
        "wire",
        "spring",
        "knife",
        "cleaver",
        "spatula",
        "fork",
        "spoon",
        "tray",
        "bucket",  # often metal pail in ImageNet
    }
)

_METAL_SUBSTR: tuple[str, ...] = (
    "aluminium",
    "aluminum",
    "stainless",
    "steel",
    "iron",
    "tin can",
    "beer can",
    "soda can",
    "pop can",
    "metal lid",
    "metallic",
)

_PLASTIC_EXACT: frozenset[str] = frozenset(
    {
        # Plastic bottles (PET / HDPE) — ImageNet labels
        "water bottle",
        "pop bottle",
        "soda bottle",
        "plastic bottle",
        "shampoo bottle",
        "detergent bottle",
        # Plastic packaging / containers
        "plastic bag",
        "shopping bag",
        "plastic crate",
        "milk crate",
        "plastic container",
        "tupperware",
        "lunch box",
        "lunch-box",
        "polystyrene",
        "styrene",
        "styrofoam",
        # Hygiene / household plastic
        "toothbrush",
        "comb",
        "hair dryer",
        "lighter",
        "syringe",
        # Toys (mostly plastic)
        "toy",
        # Disposable cups (typically plastic, sometimes paper — disambiguated later)
        "disposable cup",
    }
)

_PLASTIC_SUBSTR: tuple[str, ...] = (
    "plastic",
    "polyethylene",
    "polypropylene",
    "polystyrene",
    "polycarbonate",
    "pet bottle",
    "pvc",
    "styrofoam",
    "styrene",
    "soft plastic",
    "hard plastic",
)

_PAPER_EXACT: frozenset[str] = frozenset(
    {
        # Cardboard / cartons / packaging paper
        "carton",
        "milk carton",
        "egg carton",
        "cardboard",
        "corrugated cardboard",
        "cereal box",
        "shoebox",
        "shoe box",
        # Office / household paper
        "envelope",
        "paper towel",
        "toilet tissue",
        "toilet paper",
        "tissue",
        "tissue paper",
        "newspaper",
        "magazine",
        "book jacket",
        "comic book",
        "notebook",
        "notepad",
        # Paper food items
        "paper plate",
        "paper cup",
        "paper bag",
        # Currency / receipts
        "receipt",
        "paper money",
    }
)

_PAPER_SUBSTR: tuple[str, ...] = (
    "paper",
    "cardboard",
    "carton",  # milk_carton / egg_carton / generic
    "papyrus",
    "magazine",
    "newspaper",
    "envelope",
    "tissue paper",
    "toilet tissue",
    "paper plate",
    "paper bag",
    "paper cup",
    "paperboard",
)

# Organic — fruit, vegetables, food, peel, scraps.
_ORGANIC_EXACT: frozenset[str] = frozenset(
    {
        # Fruit
        "banana",
        "orange",
        "lemon",
        "lime",
        "apple",
        "fig",
        "pomegranate",
        "pineapple",
        "ananas",
        "strawberry",
        "jackfruit",
        "custard apple",
        "mango",
        "papaya",
        "guava",
        "watermelon",
        "melon",
        "grape",
        # Veg
        "broccoli",
        "cauliflower",
        "cabbage",
        "head cabbage",
        "bell pepper",
        "cucumber",
        "zucchini",
        "courgette",
        "artichoke",
        "cardoon",
        "mushroom",
        "corn",
        "potato",
        "sweet potato",
        "yam",
        "onion",
        "tomato",
        "carrot",
        "eggplant",
        "aubergine",
        # Cooked / dish — often photographed as food waste
        "pizza",
        "burrito",
        "hotdog",
        "hot dog",
        "cheeseburger",
        "hamburger",
        "french loaf",
        "bagel",
        "pretzel",
        "doughnut",
        "donut",
        # Animal / fish food residue
        "shrimp",
        "crayfish",
        "lobster",
        # Generic organic flags
        "compost",
        "food waste",
        "food scraps",
        "kitchen waste",
        "peel",
        "rind",
        "leftover",
        "leftovers",
    }
)

_ORGANIC_SUBSTR: tuple[str, ...] = (
    "organic",
    "food",
    "fruit",
    "vegetable",
    "biological",
    "compost",
    "kitchen",
    "leftover",
    "peel",
    "rind",
    "biowaste",
    "bio waste",
    "produce",
)

# Mixed / residual / trash markers.
_MIXED_SUBSTR: tuple[str, ...] = (
    "trash",
    "garbage",
    "rubbish",
    "litter",
    "residual",
    "general waste",
    "mixed waste",
    "landfill",
    "dustbin",
    "ashcan",
    "waste basket",
    "wastebasket",
)


def _normalize(label_text: str) -> str:
    return (label_text or "").lower().replace("_", " ").replace("-", " ").strip()


def canonical_waste_six(label_text: str) -> str:
    """
    Map free-form HF or dataset label text → plastic | paper | organic | metal | glass | mixed.

    Decision order (most specific first):
      1. Explicit glass items (wine_bottle, vase, jar, …)
      2. Explicit metal items (beer_can, tin, foil, …)
      3. Explicit organic items (banana, apple, food, compost, …)
      4. Explicit paper items (carton, paper_towel, cardboard, …)
      5. Explicit plastic items (water_bottle, plastic_bag, polystyrene, …)
      6. Generic substrings (glass, metal, plastic, paper, organic, mixed)
      7. Fallback: ``bottle`` → plastic (PET assumption when material is unspecified)
      8. Otherwise → mixed
    """
    s = _normalize(label_text)
    if not s:
        return "mixed"

    if s in _GLASS_EXACT or any(k in s for k in _GLASS_SUBSTR):
        return "glass"

    # `non-metal` should not be metal — handle that pattern up front.
    if re.search(r"non[ -]?metal|nonmetall", s):
        return "mixed"

    if s in _METAL_EXACT or any(k in s for k in _METAL_SUBSTR):
        return "metal"

    if s in _ORGANIC_EXACT or any(k in s for k in _ORGANIC_SUBSTR):
        return "organic"

    if s in _PAPER_EXACT or any(k in s for k in _PAPER_SUBSTR):
        return "paper"

    if s in _PLASTIC_EXACT or any(k in s for k in _PLASTIC_SUBSTR):
        return "plastic"

    # Batteries are tricky — usually e-waste, but for our six-way dashboard we route
    # them to mixed (special collection).
    if "battery" in s or "batteries" in s:
        return "mixed"

    # Generic substring fallbacks (least specific).
    if "glass" in s:
        return "glass"
    if re.search(r"(?<![a-z])metal(?![a-z])", s):
        return "metal"

    # ``bottle`` / ``pet`` / ``polyethylene`` last — only fires when none of the more
    # specific glass / metal bottle variants matched. PET assumption for plastic.
    if "bottle" in s or "pet" in s:
        return "plastic"

    # Trash / garbage residue.
    if any(k in s for k in _MIXED_SUBSTR):
        return "mixed"

    return "mixed"


def is_pretrained_waste_head(num_labels: int | None) -> bool:
    """Heuristic: 6–12 classes often means a custom waste head; 1000 = ImageNet."""
    if num_labels is None:
        return False
    return num_labels <= 32


def aggregate_scores_to_six(
    labeled_scores: list[tuple[str, float]],
    *,
    trashnet_trash_organic_share: float = 0.0,
) -> dict[str, float]:
    """Sum normalized model scores into six bins."""
    buckets = {k: 0.0 for k in WASTE_KEYS}
    share = max(0.0, min(1.0, float(trashnet_trash_organic_share)))
    for label, score in labeled_scores:
        low = (label or "").strip().lower()
        # TrashNet-style models have no organic logit; optional UI share of "trash" → organic (see vit_inference).
        if share > 0 and low == "trash":
            p = float(score)
            buckets["organic"] += p * share
            buckets["mixed"] += p * (1.0 - share)
            continue
        key = canonical_waste_six(label)
        buckets[key] += float(score)
    return buckets


def is_trashnet_six_id2label(id2label) -> bool:
    """True when the head is the usual TrashNet vocabulary (no native food/organic class)."""
    try:
        names = set()
        for i in range(6):
            if isinstance(id2label, dict):
                lab = id2label.get(str(i), id2label.get(i))
            else:
                lab = id2label[i]
            names.add(str(lab).strip().lower())
        return names == {"cardboard", "glass", "metal", "paper", "plastic", "trash"}
    except (KeyError, TypeError, IndexError):
        return False
