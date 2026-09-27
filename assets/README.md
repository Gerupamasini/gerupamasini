Textures for *Chaetodon auriga*, both in the model's side-view painting space.

- `auriga_photo.webp`: de-lit, colour-corrected albedo made from iNaturalist photo 67560751
  (public domain, CC0), rectified onto the model with `tools/rectify.py`, `tools/frame74.py`
  and `tools/delight.py`.
- `auriga_pattern.png`: pattern masks traced from the same photo (`tools/masks2.py`):
  r = yellow field (+ thin yellow lines), g = dusky zone / eye band, b = stripe distance field.

- `goby_photo.webp`: albedo for *Nemateleotris magnifica*, warped onto the goby model with a
  thin-plate spline (`tools/goby_tex.py`) from iNaturalist photo 31740129 (CC BY,
  observer id 27795). The model's eyes are 3D (`src/eye.js`), so the photographed eye is filled in.
