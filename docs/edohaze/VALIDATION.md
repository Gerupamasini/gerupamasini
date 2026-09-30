# Edohaze — scientific / visual self-review (Phase 13)

This review asks what an ichthyologist would point out on seeing this model.
Tags: ✅ consistent with a documented trait · ⚠️ plausible but unverified · ❌ known deviation or not implemented.

**Largest limitation.** The environment's network policy blocked page and image retrieval. All morphology and colour work rests on **textual** descriptions (RDB entries, museum pages, Fishbase, paper abstracts) plus *Gymnogobius*/gobiid generalities. **No photo was measured or directly compared.** Every proportion, and the whole colour pattern, should be re-checked against a series of live photographs from several individuals.

Reference renders are in `img/`: close-up head, neutral-light profile, C-start filmstrip, hop filmstrip, burrow peek, and strike gape.

## 1. Silhouette
* ✅ Slender, "cylindrical" body, with maximum depth 15.5% SL and a round head cross-section (RDB wording).
* ✅ D2 and anal fin set further back than in typical gobies: D2 starts at 58% SL, anal at 62% SL.
* ✅ Fin-ray counts follow D VII–I,12 and A I,10 (Fishbase).
* ⚠️ All %SL values are estimates (probably ±10–15%); no photogrammetry was done.
* ⚠️ The caudal fin is assumed rounded. In profile renders it reads too faint, so the tail can look pointed.
* ⚠️ Sexual dimorphism is only a 6% wider head in males. The real dimorphism (males with longer jaws or larger heads) is not quantified here.

## 2. Head shape
* ✅ Round cross-section, full cheeks, broad head.
* ⚠️ The maxilla ends below the rear margin of the eye. This is inferred from *macrognathos* and "顎が大きい" (large jaw); the exact extent (which may differ by sex) needs photos or specimens.
* ⚠️ The interorbital width (3% SL) and the degree of eye elevation above the head profile are estimates. A researcher might find the eyes **too prominent**.
* ❌ Cephalic sensory canal pores are not modelled. Papilla rows exist only in the normal map as a generic *Gymnogobius* pattern, not this species' actual row arrangement.

## 3. Mouth
* ✅ **No barbels or skin flaps on the underside of the lower jaw.** This is the key distinction from チクゼンハゼ (Chikuzen-haze), and it was checked in an under-chin render.
* ✅ The mouth is large, terminal, and slightly oblique, with a real opening gape (jaw bone plus lip-split topology plus buccal lining).
* ⚠️ Relative jaw lengths (whether the lower jaw projects) and the exact lip-line slope are estimates.
* ❌ Teeth are not modelled; they would be invisible at ~0.1 mm anyway.

## 4. Eye placement
* ✅ Dorsolateral, close together, with a spherical lens protruding through the pupil.
* ⚠️ Eye size is 6% SL (estimate).
* ⚠️ The iris colour (bronze-gold ring near the pupil, duskier above) is a gobiid **guess**. This species' live iris colour was not documented in the sources I could reach.

## 5. Fin placement
* ✅ Positions follow §1. The pelvic fins are fused into a disc, as in the family.
* ❌ The pelvic **frenum** (the anterior membrane joining the pelvic spines) and the spine / soft-ray distinction on the disc are not modelled. A gobiid specialist would notice this in a belly view.
* ⚠️ The shapes of D1 and the pectoral fin are generic. The D1 spine height profile and any male elongation are unknown.

## 6. Body coloration
* ✅ Low contrast and "no conspicuous pattern". Midlateral blotches are indistinct (contrast 7–14%) and differ between individuals and between left and right sides.
* ✅ **No black bar across the middle of the body side** (a Chikuzen-haze trait).
* ✅ Caudal dot rows stop above the lower part of the fin (documented).
* ⚠️ Base colours (greyish yellow-brown back, pale fawn flank, whitish belly) and the melanophore density and size are estimates from generic *Gymnogobius* descriptions, **not measured from photos**. This is the part most likely to be wrong in detail.
* ⚠️ Chromatophore-state changes (paling under stress, darkening on mud) are plausible teleost physiology but are not documented for this species.
* ❌ Breeding coloration is not implemented, because it wasn't found in the sources.

## 7. Swimming mechanics
* ⚠️ The traveling wave (λ ≈ 0.95 BL, tail amplitude ≈ 0.1 BL, frequency tied to speed and thrust) uses generic small-fish subcarangiform parameters. There are no kinematic measurements for this species.
* ⚠️ Saltatory burst-and-glide hops and drag-based pectoral use follow gobiid literature (e.g. the *Pomatoschistus* pectoral morphology).
* ✅ The phase is integrated, so frequency and amplitude changes never pop. The filmstrips show a C-bend at ~40 ms, a counter-stroke, a burst, and then a straight glide with pectoral braking.
* ⚠️ Fin flex is kinematic (shader-driven), not fluid-coupled.

## 8. Bottom behaviour
* ✅ The fish is demersal and never swims up into the water column. `HOVER` is capped at 1.5 BL and is rare (a game supplement).
* ⚠️ Perching on the pelvic disc, independent pectoral flicks, and pivot turns on the substrate are gobiid generalities.
* ⚠️ Resting pitch comes from two support points (pelvic disc and caudal peduncle). This looks right on mounds but is not validated.

## 9. Burrow behaviour
* ✅ The fish uses callianassid (ニホンスナモグリ type) and upogebiid (アナジャコ type) burrows as refuge. It stays inside at low tide (documented: collected from burrows at low tide). Breeding males hold a burrow in March–May (documented: males guard eggs in burrows).
* ⚠️ Head-first entry, turning around inside, and peeking with the head out are inferred from related burrow-associated gobies. Real behaviour could include more tail-first withdrawal or different peeking postures.
* ⚠️ Time budgets (in simulation, ~25–28% hidden and ~35–40% peeking) are **game-tuned**, not data.
* ❌ The shrimp themselves and goby–shrimp interactions are not simulated. Egg guarding is represented only by burrow ownership.
* ⚠️ Burrow diameters (13–17 mm) and depth (~17 cm usable) are approximate.

## 10. Escape behaviour
* ⚠️ Looming-rate triggering, the Mauthner-type latency, and the C-start → burst → refuge-or-freeze sequence are general teleost and gobiid findings, not species data.
* ⚠️ Flight-initiation distances and fear dynamics are game-tuned but can be parameterised through personality.
* ✅ MUD_DIVE (burrowing into sediment) was **deliberately removed** because I found no record of it for this species. FREEZE replaces it.

## Headless simulation checks (8 fish, 240 s, net swept every 20 s)
| Check | Result |
|---|---|
| NaN / ground penetration | 0 / 0 |
| Peak burst speed | 14.9 BL/s (target ≈ 14) |
| Escapes / burrow entries / feeding strikes (two runs) | 7–14 / 22 / 32–45 |
| Low-tide drain | 7 of 8 fish sheltered in burrows within 60 s; 1 stayed on the bottom with no free burrow in range |

Bugs found and fixed through this validation:
* inverted body winding
* burrow commands ignored after the first one (no real peeking)
* the `hidden` flag never cleared after a fish left a burrow
* escape↔approach retrigger loop
* sRGB/linear colour mix-up
* LOD not updating while paused

## Rendering / technical caveats
* Validation renders were made with SwiftShader (CPU). I have no GPU frame-time measurements; triangle and draw-call budgets are listed in DESIGN.md.
* Translucency is an analytic thin-tissue approximation, not true subsurface scattering or transmission.
* Fins do not cast shadows (their membranes are nearly transparent); body shadows only.

## What would most improve fidelity next
1. Photograph-based calibration: at least 10 live individuals, side, top and ventral views, with scale bars. Refit the profile curves and pigment maps.
2. Add the pelvic frenum and a species-specific cephalic papilla pattern.
3. Gather field or aquarium video of burrow entry, exit and peeking to replace the inferred postures and time budgets.
