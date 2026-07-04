import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))
from PIL import Image

from ml.waste_pipeline.material_cues import glass_cue_score
from ml.waste_pipeline.organic_visual_cue import produce_cover_and_masks

for p in [
    r"dataset\organic\3213ac596c134d06b36bffa459af8735.jpg",
    r"dataset\organic\722d428fd7e64c1d85a3e2dd34252e7d.jpg",
    r"dataset\organic\792df64d1d154f0086fb175d6029ed98.jpg",
    r"dataset\glass\1bb54702b2d34bcd83a785261c74450d.jpg",
]:
    img = Image.open(p).convert("RGB")
    img.thumbnail((512, 512))
    cover, _, py, gv, ro, _ = produce_cover_and_masks(img)
    g = glass_cue_score(img)
    print(
        f"{Path(p).name[:38]:38}  py={float(py.mean()):.3f} ro={float(ro.mean()):.3f}  "
        f"G={g['score']:.2f}  amber={g['amber']:.3f} green={g['green']:.3f}  "
        f"specular={g['specular']:.3f}"
    )
