# Yamame (Oncorhynchus masou masou) head: colours and surface markings from 50 photos

Source: `/tmp/.../scratchpad/head50/p001..p050.jpg` (small web images, 158-590 px high; 001-009 oblique from front, 010-027 oblique from above, 028-050 side views).
Numbers: `head_color_markings.json` (same folder). All RGB values are 8-bit sRGB as stored in the JPEG, **white balance not corrected**; expect +-10-15 per channel. Photo ids are written as `pNNN` or just `NNN`.

Method in one paragraph: for each photo I placed small rectangular patches by eye on zoomed crops, checked the boxes on overlays, took the median RGB (plus the dark/light quartile medians), classified the lighting of each photo (N = near neutral, W = mild warm/yellow/brown, X = strong colour cast -> excluded from medians) and took the median over N+W photos. Cast photos (green ferns 002, teal 004/045/042 water, dappled green 005, golden-green 012, blue 014/016/019/032/038/039, yellow-green 024/036, HDR 026, orange 031/041/044, skin-pink 048) were measured only for reference. A pooled median mixes parr and adults, so the JSON also holds `stage_medians`.

## 0. Quick table (pooled medians; full detail and per-photo values in the JSON)

| region | median sRGB (hex) | dark .. light | n | photos |
|---|---|---|---|---|
| dorsal_head | 112,98,74 #70624a | 88,76,53 .. 140,128,105 | 28 | 001 003 006-011 013 015 017 018 021 022 025 028 029 030 033 034 035 037 040 042 046 047 049 050 |
| snout_side | 112,102,83 #706653 | 80,69,56 .. 139,127,110 | 30 | 001 003 006-011 013 015 017 018 021-023 025 027-030 033 034 037 040 042 043 046 047 049 050 |
| cheek | 160,140,124 #a08c7c | 132,116,100 .. 182,166,164 | 28 | 001 003 006 008-010 013 015 017 018 021-023 025 027-030 033-035 037 040 043 046 047 049 050 |
| opercle | 158,144,125 #9e907d | 128,114,90 .. 194,175,160 | 28 | 001 003 006 007 009-011 013 015 017 018 021-023 027-030 033 034 037 040 042 043 046 047 049 050 |
| opercle_rim | 178,162,130 #b2a282 | 158,136,98 .. 204,194,164 | 10 | 013 018 021 022 023 028 034 040 046 050 |
| preopercle_line | 224,202,180 #e0cab4 (pale lit edge) | 177,146,111 .. 229,209,184 | 6 | 007 010 015 017 021 023 |
| lower_jaw_side | 146,141,139 #928d8b | 110,102,101 .. 188,180,174 | 30 | (as snout_side, +035, -040) |
| lower_jaw_underside_throat | 87,96,104 (bimodal, see 1.2) | 77,37,37 .. 171,174,165 | 5 | 006 011 021 030 034 (low confidence) |
| upper_lip_maxilla_plate | 155,134,136 #9b8688 | 106,92,88 .. 202,194,194 | 16 | 001 006 008 010 011 013 015 017 021 022 023 025 028 030 034 050 |
| lip_edge (gape line, dark quartile) | 26,17,35 #1a1123 | 26,17,35 .. 113,127,128 | 8 | 006 013 021 022 029 034 040 050 |
| mouth_lining_inside | 61,60,72 (bimodal) ; dark cavity 47,48,59 ; lit tissue 163,133,139 | 24,14,15 .. 126,131,142 | 8 | 007 008 015 017 021 022 023 035 |
| iris_ring (thin gold ring) | 152,130,96 #988260 | 65,58,34 .. 215,189,150 | 14 | 006 008 013 017 021-023 025 027-030 033 034 |
| pupil | 5,6,8 | 5,6,8 .. 25,22,32 | 29 | many |
| eye_outer_dark_rim | 75,60,46 #4b3c2e | 52,46,38 .. 107,84,72 | 6 | 003 006 008 027 033 050 |
| nostril_pit | 48,42,37 #302a25 (pit centre) | 48,42,37 .. 108,114,124 (rim) | 8 | 003 006 017 021 030 035 040 050 |
| gill_membrane_branchiostegal | 172,170,177 #acaab1 | 140,140,134 .. 207,201,204 | 7 | 011 013 017 022 023 028 034 |

Stage medians (JSON `stage_medians`, parr/juvenile n=13-15 vs adult/large n=9-11; stage assignment from the photos themselves, see section f):

| region | parr / juvenile | adult / large |
|---|---|---|
| dorsal_head | 121,108,86 | 74,60,40 |
| snout_side | 132,110,92 | 64,57,48 |
| cheek | 149,141,121 | 163,140,126 |
| opercle | 162,146,142 | 159,147,106 |
| lower_jaw_side | 154,145,142 | 134,126,129 |
| upper_lip_maxilla_plate | 181,164,158 (n=4) | 137,116,104 |

Rule of thumb for the texture: dorsal cap, snout and lip strap are the parts that darken with age (adult cap is about half the luminance of the parr cap); cheek and opercle keep a pearly mid-light base in both stages but the adult opercle moves from lilac-silver to olive-bronze/copper.

## (a) Dorsal-ventral gradient and where the transitions lie

Fractions below are of **head height measured at the cheek/opercle-front column**, 0 = dorsal outline of the head, 1 = ventral outline of the throat (vertical colour strips at that column in p028, p013, p037, p046, p017, p021, p023, p034, p040, p050; accuracy about +-0.05; the photos are not true profiles so treat as guide).

Parr / smolt (028, 013, 037, 046, 033, 040, 030, 043):
- 0 - 0.08..0.20: dark olive-brown cap (p046 ~0.08, p028/p013 ~0.10-0.15, p037 ~0.20; colour 100-125 / 85-105 / 55-90, see dorsal_head). Edge is fairly sharp but ragged, not a straight line (especially p046, p037).
- ~0.15-0.30: narrow transition through tan/olive-gold (p040 and p033 spread this over 0-0.30 because of lighter, tan caps with spots; p033 cap 183,167,132 in warm light).
- 0.30-0.85: pale field - pearly silver-cream/white with lilac, pink or blue-green sheen (cheek 227,210,194 in p013; 224,215,178 in p028; opercle 211,211,210 in p046). This is where eye (centre at about 0.30-0.45), cheek, opercle and jaw side sit.
- 0.85-1.0: ventral edge, silver-white to cream (p028 231,225,201), peach-pink in the aquarium photo p030 (194,167,156), grey-lilac in p037 (155,160,165).

Adult / large (017, 034, 023, 050, 021):
- p017: very dark brown cap 0-0.18 (66,43,32 at 0, 84,57,30 at 0.1) with a sharp, torn-looking lower border at about 0.18-0.20, then a narrow gold-olive band 0.20-0.35 (cheek-top, 191,186,177 at 0.2), then silver-white/lilac 0.40-1.0 (242,232,238 at 0.6).
- p034 (resident adult): no sharp boundary; dark brown 0-0.35 (97,65,40 .. 128,94,54), brown-gold 0.40-0.55 (176,138,80), olive-yellow 0.6-0.8 (159,132,89), cream-yellow 0.9-1.0 (196,174,124).
- p023 (autumn male): near-black 0-0.15 (38,37,26), dark bronze-purple 0.15-0.45 (65,57,57 .. 118,107,113), olive-bronze/pale 0.5-0.8, pale blue-grey belly side 0.8-0.9.
- p050: tan 0-0.30 (168,142,125 .. 178,160,134), maroon post-orbital smear 0.40-0.70 (104,75,79 .. 113,82,69), tan-pink 0.7-0.9, pale lilac 0.9.
- p021: white-pink lilac head (238,238,242 at 0.2); dark cap reduced to a thin ragged brown edge 0-0.05 (olive-brown 74,62,46) above it.

So: the dark dorsal cap covers the top ~10-20 % of head height in parr/smolt and ~20-35 % in dark adults, with a bronze/gold intermediate band 0.2-0.5 (strongest in 023, 034, 050, 028 yellow-green tint 0.55-0.75) before the pale pearly lower head. The gradient is a fairly abrupt step in silvery fish and a long smooth gradient in dark breeding-colour fish. Eye centre about 0.30-0.45 (p028 ~0.35, p033 ~0.40, p017 ~0.38, p040 ~0.30, p013 ~0.45); the eye outer diameter is 0.12-0.22 of head height (p017 smallest, p013/p033 largest). Mouth gape line is at roughly 0.60-0.70 at the snout end (p028, p021, p013), not reliable.

## (b) Spots and speckles

Dorsal head (top of skull, snout roof, nape), small black spots:
- Present in nearly every photo in which the cap is clearly visible: 017 (~15, elongate/oval, 0.15-0.35 eye diameter, aligned in 2-3 rows from nape to mid-snout), 034 (~10, round, 0.25-0.40), 040 (~20, round, 0.10-0.35, larger and darker toward nape, tiny toward the snout), 038 (~20, 0.07-0.20, dense over snout roof and nape), 050 (~12, 0.08-0.15), 047 (~12, 0.07-0.15), 029 (~8, 0.12-0.20), 033 (6-8, 0.10-0.15), 025 (6-8, ~0.10), 042 (~10 on nape, 0.10-0.15), 024 (8-10, 0.20-0.30), 016 (3-5, ~0.20), 037, 035 (a few), 049 (few, hard to see in dark skin).
- Count range on head roof anterior to the nape: roughly 5-20 per side/dorsal view; size grows toward the nape and merges into the body's dorsal spotting; the snout tip and the lateral snout are almost clean (p034 and p025 show 2-3 tiny dots beside the nostril; p050 a few tiny dots along the snout roof).
- Colour: black to very dark brown (about 20-45 in each channel), edges slightly soft in parr and crisp in adults (017, 034); shape round to short ovals oriented along the body axis (017). Not ringed with pale halo. The ratio is relative to the eye outer diameter (eye ring included).
- Parr in 003, 013, 028 show no or almost no dorsal-head spots (028: none visible on the head).

Cheek and opercle:
- Crisp black spots are **absent** on cheek/opercle in almost all photos. Instead there are 0-6 diffuse, soft-edged dark blotches: 034 (2 brown blotches on the cheek, ~0.3 eye diameter, 125,80,50 range), 038 (2 blue-grey blotches on cheek, 0.5-0.6), 032 (3-4 blue-violet, 0.5-0.7, cast), 024 (4-5 blue-violet 0.4-0.7, cast), 013 (one violet-grey blotch on upper opercle, about one eye diameter), 027 (one large brown diffuse blotch covering cheek/opercle, 0.8-1.0), 043 (rose-brown smudge on opercle), 021 (3-6 small bluish-lilac smudges 0.2-0.3 on cheek/opercle), 049 (3 dark smears ~0.3 on opercle), 050 (one maroon smear behind the eye 0.8, another 0.4 below it), 048 (one round grey dotted/pitted spot ~0.35 in the middle of the opercle).
- Tiny black pits/points (0.05-0.2 eye diameter, 1-5 per side) on the upper cheek/opercle: 023, 021 (very fine), 025 (2-3 dark dots on the cheek), 003 (1-2 small dark spots on cheek/opercle, ~0.4), 033, 044 (purple-brown smudge behind the eye).
- In several parr (027, 029, 013, 012) the opercle is the **dark plate** itself: 029 shows a rounded brown-mauve plate 79,65,52 darker than cheek and body, with paler rim; 027 brown 129,110,94. This is the parr-mark-like darkening, not a spot.

Golden/bronze/white speckling:
- Bronze/golden flecks on nape and upper opercle: 030 (mottled gold flecks 2-5 px on a grey-lilac cap, i.e. scale-edge light spots), 011 (copper-gold blotches plus fine orange speckling on opercle), 050 (copper-orange flush with fine pale granules over the opercle/cheek), 010 (fine pale speckles on the cheek), 028 (pale golden dots on the opercle).
- Pearly white/silver speckles (0.03-0.08 eye diameter): 044 and 047 (dozens of small white specks on cheek and opercle, plus a patch over the first parr mark), 049 (10-30 white tubercle-like dots on upper opercle and nape; may be breeding tubercles or water beads - unclear), 040 (pale scale-edge dots over the nape), 001 (white tubercle-like dots on lower jaw and snout, per photo and earlier landmark notes).
- Orange/red: orange-copper flush on rear opercle top in 015 (187,147,97), 021 (pink-salmon upper opercle), 018/046 (salmon crescent at rear of opercle), 049 (orange-red upper rear opercle). These are warm flushes, not spots.

## (c) Sheen / iridescence

Metallic (pearly silver, high specular, with colour shifts):
- Opercle and cheek (strongest), then lower jaw side and branchiostegal membrane in parr/smolt/silvery adults: 013, 017, 021, 037, 040, 046, 047, 018, 028 (019 and 020 are even more mirror-like but cast-excluded).
- Shift colours seen: lilac/pink-violet (017 cheek 175,159,157 and opercle upper smudge; 021 pink-lilac whole head; 047 lilac-silver 145,141,160), blue-lilac (010 lower jaw 132,131,151; 021 lip), pale blue-green on lower opercle (046 light 197,205,203; 040 mint is partly background bounce), pink-salmon on opercle rear/top (018, 046, 021), teal-blue-green on the upper orbital rim (050), gold-green on the rear opercle margin (023, 028).
- Sky-blue patches on 011/016/024 are mirror reflections of sky on the wet surface; do not paint them as base colour.

Matte / low-sheen: dorsal cap (very low sheen, satin; specular only as sharp thin white streaks along the profile where the water film sits: 017, 021, 022, 023), snout top, the pigmented upper lip strap in adults, the dark eye rim, the pupil (glossy catchlight only), nostril pit, and pale cream-yellow opercle plate in 028/034 (translucent satin).
Non-metallic but wet-glossy: p007 and p011 are specular-dominated (wet glossy sunlight).

## (d) Mucus / wet look
- Fish photographed in water or just lifted (007, 011, 017, 021, 022, 023, 049) show a continuous water film: bright thin specular streaks on top of the head and jaw, rim lighting, and strong gloss variation; the surface is smooth, no visible mucus clots.
- Aquarium fish (029, 030, 033, 040, 047) look satin: low-roughness, soft broad highlights (030 skin like peach satin).
- No photo shows distinct mucus strings or opaque cloudy mucus; a faintly hazy bloom exists on 043 (milky skin glare) and on 018/028 where the translucent opercle plate looks glassy. A single clear coat (roughness about 0.25-0.35 on cap, 0.15-0.25 on opercle/cheek) is supported; do not add milky film.

## (e) Lateral-line canals and pores on the head
- Resolution is too low in nearly all photos to show pores. Clearly visible: anterior nostril pit (017 pale-rimmed pit; 021 small bluish pit; 035 pinkish ring with dark centre; 050 bluish pit with dark rim; 030 dark pit with pale ring; 040 a pale bump), and in a few photos tiny dark pits on the upper cheek/opercle (023, 021, 048 round pitted spot).
- Pale thin lines on the opercle: preopercle edge (pale cream line in 007, 010, 015, 017, 023; amber-brown in 021) and concentric/radial ridges on the opercle (002, 021, 023, 028, 040, 046); in 030 and 043 dark hairline cracks radiate from the preopercle; these look like canal/ridge traces but they could also be opercular growth ridges.
- On the lower jaw and along the snout I see no reliable pore dots; 001 shows white tubercle-like dots on the lower jaw (could be mandibular pore tubercles or just highlights).

## (f) Differences between life stages (by photo)
- Parr/juvenile (parr marks, translucent head, silver cheek, spots only on cap): 003, 013, 018, 025, 027, 028, 029, 030, 031, 032, 033, 035, 036, 037, 038, 039, 040, 043, 047, 024, 016 (two parr). Aquarium fish 044 and 045 keep large oval parr marks plus a pink flush (juvenile to young adult; stage unclear). Head: pearly pale (cheek 227,210,194 in 013), cap tan-olive (121,108,86), opercle sometimes a darker plate (027, 029), lips pale blue-lilac, ring of the eye is bright gold with a thin dark outline.
- Smolt/silvery (ginge-like): 046 (olive cap, silver head, blue-green/pink opercle sheen), 019, 020 (mirror-silver, cast-excluded), 004, 009 (probably; stage unclear).
- Adult resident / large non-breeding: 034 (brown-gold cheek, big black spots, orange pectoral), 042 (large, red-pink flush with parr marks kept), 050 (copper flush, tan cap), 015, 006, 007, 021 (almost white-pink head, gold eye, very dark thin cap - possibly pre-spawn silvery fish).
- Dark breeding-colour (spawning-type) adults: 011 (very dark, copper-gold blotches, dark lip), 017 (large, hooked kype-like snout, nearly black cap, many oval spots), 022 and 023 (autumn bronze head with black snout roof, orange flank, jaw hooked), 049 (dark brown head with orange-red upper opercle, many white dots). In these the dorsal cap is 74,60,40 or darker (023: 22,18,8 in shade), snout side 64,57,48, the lip strap bronze-brown, the lips edged with pale blue-lilac, eyes with a thick bright gold ring, and the cheek/opercle olive-bronze rather than silver.
- Eye in adults: black pupil, gold ring thicker and cleaner (017, 021, 022, 023, 030); in parr the iris looks greyer (029 white-gold with dark notches; 037 silver-grey; 035 silver with olive outer ring).

## (g) Marks around the eye
- Gold/bronze thin ring immediately around the pupil (152,130,96; lit parts to 215,189,150), then a broad dark brown/olive iris band (about 40-70 per channel) and an outer grey-blue or silver halo (034 pale blue-silver halo, 048 silver-blue crescent above, 029 blue-dark crescent behind, 050 teal-green iridescent upper rim, 021 amber outer ring). Pupil is round to slightly rhomboid (035, 047 look rhomboid but that is probably catchlight/perspective).
- Dark outline of the orbit skin (eye_outer_dark_rim 75,60,46): thicker at the upper-front and rear (008 olive-grey half-moon above, 033 half-moon above and small smear behind, 003 dark patch at front, 035 dark ring, 046 blue-grey ring plus dark smear behind).
- Dark smear behind the eye (post-orbital): 050 (large maroon 68,40,43 about 0.8 eye diameter), 027 (dark crescent, 42,38,43), 033 (small), 040 (grey-olive smear directly behind), 045 and 044 (dark crescent / purple-brown behind the eye), 043 (rose-brown smudge at the front of the opercle), 046 (blue-grey).
- Dark smear in front of the eye (pre-orbital): 003 (dark maroon patch beside the nostril 50,38,32), 001 (blue-violet smudge), 032 (dark band from snout to the eye, cast), and in 030 a dark brown groove line running from the nostril to below the eye (see section h).
- A dark **vertical bar through the eye**: not seen in any photo. A short dark bar above the pupil is visible only in the iris of 048 (transverse dark bars in the iris).

## (h) What a texture artist must not miss
1. The pale maxilla strap along the upper lip has a thin dark brown/violet groove line along its upper edge, running from below the nostril to under the eye (030 80,55,31; 021 dark violet-brown; 022; 006). Its lower edge is the gape. Pale strap colours: cream-white in lit parr (221,209,186), bronze-brown in adults (116,97,83).
2. The gape line is near black navy-violet (26,17,35); inner lower-lip surfaces are pale blue-lilac (029, 034, 050, 021, 023) with a row of fine teeth ridges; lips look bluish-white from the side even on bronze fish. The adult mouth interior is black/navy with white tooth rows; lit palate/tongue tissue is pink-mauve to violet-grey (163,133,139; 021 violet 118,114,139, 015 bright pink spot 206,164,182).
3. The opercle is a translucent pearly plate with visible concentric growth lines and a thin curved preopercle ridge; its rear margin carries a warm gold/amber/copper or salmon band 3-8 px wide (178,162,130 median; 207,184,124 in 028; 168,126,80 in 050).
4. The dorsal cap boundary is irregular/ragged and not a straight horizontal line (017, 021, 046); below it in adults is a narrow gold-olive band.
5. Nostril: one visible dark pit with a pale/bluish or pinkish rim, not a hole; sits on the snout side about 0.33-0.6 of the way from the snout tip to the eye centre (p030 ~0.33, p050 ~0.37, p017 ~0.6; rough eye-estimates) (003, 017, 021, 030, 035, 050).
6. The post-orbital dark smear and the diffuse dark blotches on cheek/opercle are soft-edged, brown/maroon (or blue-grey in parr), never crisp black spots. Crisp black spots belong to the dorsal cap/nape.
7. Warm flush: copper, salmon or orange on the upper rear opercle in many photos (015, 018, 021, 046, 049, 050) - gentle, not saturated.
8. Branchiostegal membrane: silver-grey with fine radiating ribs (p017, p022, p023), cream-yellow in 028/034; the underside of the jaw is strongly shadowed in underwater shots - do not paint it black.
9. Keep tubercle-like white dots optional (breeding males 049, 001, 044/047 white specks).

## What I could NOT determine
- True neutral colours: white balance is unknown in every photo; no gray card, and images are heavily compressed. The values are +-10-15 per channel and the N/W classification is a judgement.
- Reliable lateral-line pore positions and counts (supraorbital, infraorbital, preopercular, mandibular) - not resolvable.
- Colour of the throat and branchiostegal membrane in neutral light (only 5-7 photos, mostly in shadow or oblique), and the underside of the lower jaw from below (no clean ventral view); `lower_jaw_underside_throat` and `gill_membrane_branchiostegal` are low confidence.
- Tongue, teeth and palate colour (only 4-5 usable open-mouth photos with neutral light; many are black-cavity dominated).
- Whether the white dots in 049/001/044/047 are true breeding tubercles, pearl organs or water beads.
- Exact spot count and diameters: sizes are estimated by eye relative to the eye diameter on 100-500 px images (+-30 %).
- Life-stage/sex assignment of photos is inferred from head shape and colour only; for 001, 004-010 (oblique, low resolution) the stage is uncertain.
- Whether the dark crack-like lines on the opercle in 030/043 are canals or just wrinkles.
- A dark vertical bar through the eye was not found; the exact iris structure (pupil shape, inner ring thickness) is below resolution in most photos.
- The sharpness of the dorsal-ventral transition as a function of fish length (only a few photos give a clean vertical profile).
