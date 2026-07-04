# Local training data (not in git)

Put **TrashNet**, **Kaggle waste**, **TACO**, and **custom Meghalaya** images here.

- See **[training/README.md](../training/README.md)** for exact folder layouts and download commands.
- Only this `README` and `.gitkeep` files are tracked; image files stay on your machine.

Suggested tree after downloads:

```text
data/
  trashnet/          # <class>/images…
  kaggle_waste/      # train/<class>/… or <class>/…
  taco/              # annotations.json + images/
  taco_imagefolder/  # created by backend/scripts/convert_taco_to_imagefolder.py
  meghalaya_custom/  # your ImageFolder
```
