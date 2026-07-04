"""
Human-readable detail strings per canonical waste key — what the **Waste Details**
card on the frontend shows.

When the scene analyzer can narrow the scene to a specific item type (e.g. a beer
bottle, a banana, a cardboard box) the optional ``hint`` arg lets callers swap in
more specific text. For the default flow we still return generic strings that are
correct for the entire bucket.
"""

from __future__ import annotations

from typing import Optional

from ml.waste_pipeline.categories import DISPLAY_LABEL


def recyclable_for(key: str) -> bool:
    if key in ("organic", "mixed"):
        return False
    return True


def detail_strings(key: str, recyclable: bool, *, hint: Optional[str] = None):
    """
    Returns ``(material, decomposition, impact, impact_tone, disposal, category, waste_type)``.

    ``hint`` is an optional short context string (e.g. the ImageNet label) — when it
    matches a specific known object we tighten the text. Otherwise we fall back to a
    bucket-level description.
    """
    h = (hint or "").lower()

    material_map = {
        "plastic": "Plastic — often PET / HDPE (single-use bottles, packaging film, containers)",
        "metal": "Metal — steel or aluminium; widely recyclable when clean and crushed",
        "glass": "Glass — silica; infinitely recyclable when separated by colour (clear / green / amber)",
        "paper": "Paper / cardboard fibre — recyclable when clean and dry, contaminants lower yield",
        "organic": "Biological / food — compostable; high water content, generates methane in landfill",
        "mixed": "Mixed residue — heterogeneous trash; usually landfilled or sent to energy recovery",
    }
    material = material_map.get(key, "—")

    # Item-level overrides — keep the bucket label but tighten the wording.
    if key == "glass":
        if "wine" in h or "champagne" in h:
            material = "Glass — wine / champagne bottle (lead-free, recycled in green stream)"
        elif "beer" in h:
            material = "Glass — beer bottle (typically amber, recycled with brown-glass stream)"
        elif "jar" in h or "mason" in h:
            material = "Glass — food jar (rinse before recycling; lids go to metal)"
        elif "vase" in h or "goblet" in h or "tumbler" in h:
            material = "Glass — household glassware (check local: tempered glass is often NOT accepted in bottle recycling)"
    elif key == "metal":
        if "beer can" in h or "soda can" in h or "pop can" in h:
            material = "Aluminium beverage can — widely accepted, crush to save volume"
        elif "tin" in h or "food can" in h:
            material = "Steel food can — rinse, label can stay on, recyclable"
        elif "foil" in h:
            material = "Aluminium foil — ball up clean foil; greasy foil → trash"
    elif key == "plastic":
        if "water bottle" in h or "soda" in h or "pop" in h:
            material = "PET plastic bottle (resin #1) — universally recyclable, remove cap if local rules require"
        elif "bag" in h:
            material = "Plastic film / bag — NOT in kerbside recycling; return to grocery-store film bins"
        elif "polystyrene" in h or "styrofoam" in h:
            material = "Polystyrene foam — generally NOT recyclable kerbside; landfill or special drop-off"
    elif key == "paper":
        if "cardboard" in h or "carton" in h:
            material = "Cardboard / paperboard — flatten boxes, remove tape, dry"
        elif "newspaper" in h or "magazine" in h:
            material = "Newsprint — recyclable; keep dry"
        elif "paper towel" in h or "tissue" in h:
            material = "Soiled tissue / paper towel — usually compostable, not recyclable"
    elif key == "organic":
        if any(k in h for k in ("banana", "orange", "apple", "peel", "fruit")):
            material = "Fruit / peel — compostable; high in cellulose and sugars"
        elif "vegetable" in h or "veg" in h or "broccoli" in h or "tomato" in h:
            material = "Vegetable scrap — compostable; nitrogen-rich"
        elif "meat" in h or "fish" in h or "bone" in h:
            material = "Animal-origin food — compost only in industrial/hot composters"
        elif "bread" in h or "pizza" in h or "doughnut" in h or "donut" in h:
            material = "Baked food waste — compostable; greasy items can slow composting"

    if key == "mixed":
        decomposition = "Depends on composition — anywhere from weeks (paper bits) to centuries (plastic film)"
        impact = "Heterogeneous mix is hard to sort — typically landfilled"
        impact_tone = "bad"
        disposal = "Manual segregation at source first; otherwise general waste"
    elif key == "plastic":
        decomposition = "Centuries in landfill; fragments into microplastics"
        impact = "High persistence; marine and soil pollution if littered"
        impact_tone = "bad"
        disposal = "Recycling bin if accepted; otherwise residual waste"
    elif key == "organic":
        decomposition = "Weeks in compost; months in landfill"
        impact = "Methane (greenhouse gas) if landfilled — composting prevents this"
        impact_tone = "bad"
        disposal = "Compost / organic-waste collection"
    elif key == "glass":
        decomposition = "Effectively does not decompose, but infinitely recyclable"
        impact = "Low when recycled by colour stream; physical hazard if broken"
        impact_tone = "med"
        disposal = "Glass-only recycling bin (clear / green / amber separated if local rules require)"
    elif key == "metal":
        decomposition = "Decades to centuries; recycling avoids new mining"
        impact = "Low when recycled (high circularity rate)"
        impact_tone = "low"
        disposal = "Metal recycling bin; rinse food residue first"
    elif key == "paper":
        decomposition = "2–6 weeks if clean; longer when contaminated"
        impact = "Low when recycled; contamination is the main issue"
        impact_tone = "low"
        disposal = "Paper recycling stream; flatten cardboard, keep dry"
    else:
        decomposition = "Varies"
        impact = "Lower when recycled correctly"
        impact_tone = "med"
        disposal = "Sort into the matching recyclable stream"

    cat = "Recyclable" if recyclable else "Non-recyclable"
    waste_type_map = {
        "plastic": "Plastic",
        "paper": "Paper",
        "organic": "Organic",
        "metal": "Metal",
        "glass": "Glass",
        "mixed": "Mixed",
    }
    waste_type = waste_type_map.get(key, "Mixed")

    return material, decomposition, impact, impact_tone, disposal, cat, waste_type


def predicted_display_name(key: str) -> str:
    return DISPLAY_LABEL.get(key, key.title())
