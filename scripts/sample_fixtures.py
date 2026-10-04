"""Generate the synthetic sample case: SYNTHETIC DEMO DATA, never real.

A roofing contractor claims the roof leak repair in work order 14 was
completed before the maintenance deadline. The property manager's inspection
report finds moisture remaining and unfinished work. The contractor files an
invoice and photographs.

Writes, from one definition:
  fixtures/sample/manifest.json   terms and evidence for the live run
  fixtures/sample/*.jpg, *.txt    the evidence itself
  web/public/sample/*.jpg         the same images for the sample page
  web/lib/sample-data.json        what the sample page shows

Every image is a drawn illustration labelled as synthetic, so nobody can
mistake it for a photograph of a real property.

    python scripts/sample_fixtures.py
"""

import json
import pathlib
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "sample"
PUBLIC = ROOT / "web" / "public" / "sample"
WEB_DATA = ROOT / "web" / "lib" / "sample-data.json"

W, H = 1200, 800


def font(size: int, bold: bool = False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def stamp(d: ImageDraw.ImageDraw, text: str = "SYNTHETIC DEMO DATA - illustration, not a photograph"):
    f = font(22, True)
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.rectangle([16, 16, 16 + w + 24, 16 + h + 20], fill=(20, 32, 47))
    d.text((28, 24), text, font=f, fill=(242, 196, 109))


def camera_date(d: ImageDraw.ImageDraw, text: str, left: bool = False):
    f = font(30, True)
    d.text((40 if left else W - 330, H - 60), text, font=f, fill=(255, 170, 40))


def sky_and_roof(d: ImageDraw.ImageDraw):
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(150 + 60 * t), int(190 + 40 * t), int(230 + 20 * t)))
    # Wall and the pitched roof plane.
    d.rectangle([0, 600, W, H], fill=(196, 160, 128))
    d.polygon([(60, 600), (1140, 600), (900, 220), (300, 220)], fill=(92, 98, 108))
    # Chimney.
    d.rectangle([560, 120, 660, 300], fill=(150, 82, 62))
    d.rectangle([548, 108, 672, 130], fill=(120, 66, 50))


def slates(d: ImageDraw.ImageDraw, skip=(), fresh=()):
    for row in range(9):
        y = 230 + row * 41
        left = 300 - (row * 26.7)
        right = 900 + (row * 26.7)
        n = int((right - left) // 60)
        for i in range(n):
            x = left + i * 60 + (30 if row % 2 else 0)
            if x + 56 > right:
                continue
            if (row, i) in skip:
                d.rectangle([x, y, x + 56, y + 36], fill=(46, 40, 38))  # bare felt
                continue
            colour = (58, 64, 74) if (row, i) in fresh else (104, 110, 120)
            d.rectangle([x, y, x + 56, y + 36], fill=colour, outline=(70, 74, 82))


def flashing(d: ImageDraw.ImageDraw, south_new: bool, north_lifted: bool):
    d.rectangle([548, 288, 672, 306], fill=(214, 218, 222) if south_new else (120, 124, 128))
    if north_lifted:
        d.polygon([(560, 290), (600, 270), (604, 288)], fill=(120, 124, 128))
        d.polygon([(620, 288), (650, 266), (652, 286)], fill=(120, 124, 128))


def roof_after(path: pathlib.Path):
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky_and_roof(d)
    slates(d, fresh={(1, 4), (1, 5), (2, 4), (2, 5)})
    flashing(d, south_new=True, north_lifted=False)
    d.line([(980, 790), (1060, 330)], fill=(140, 140, 140), width=10)  # ladder rails
    d.line([(1030, 790), (1110, 330)], fill=(140, 140, 140), width=10)
    for k in range(9):
        y = 760 - k * 50
        d.line([(980 + (790 - y) * 80 / 460, y), (1030 + (790 - y) * 80 / 460, y)], fill=(140, 140, 140), width=8)
    stamp(d)
    camera_date(d, "25/09/2026 15:42")
    img.save(path, "JPEG", quality=84)


def roof_before(path: pathlib.Path):
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky_and_roof(d)
    slates(d, skip={(1, 4), (1, 5), (2, 4), (2, 5)})
    flashing(d, south_new=False, north_lifted=True)
    d.polygon([(700, 470), (980, 470), (1000, 590), (690, 590)], fill=(40, 90, 170))  # tarp
    stamp(d)
    camera_date(d, "18/09/2026 11:05")
    img.save(path, "JPEG", quality=84)


def roof_north(path: pathlib.Path):
    """The same roof from the other side on a later visit: new flashing all round the chimney."""
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky_and_roof(d)
    slates(d, fresh={(1, 4), (1, 5), (2, 4), (2, 5)})
    flashing(d, south_new=True, north_lifted=False)
    d.rectangle([540, 300, 548, 306], fill=(214, 218, 222))
    d.rectangle([672, 300, 680, 306], fill=(214, 218, 222))
    img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    d = ImageDraw.Draw(img)
    d.rectangle([60, 640, 420, 720], fill=(250, 250, 250), outline=(60, 60, 60), width=4)
    d.text((80, 660), "NORTH FACE", font=font(40, True), fill=(30, 30, 30))
    stamp(d)
    camera_date(d, "28/09/2026 09:15")
    img.save(path, "JPEG", quality=84)


def ceiling(path: pathlib.Path):
    img = Image.new("RGB", (W, H), (236, 234, 228))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 150):
        d.line([(x, 0), (x, H)], fill=(225, 222, 215), width=2)
    # Water stain: concentric brown rings.
    for r, c in ((260, (214, 196, 160)), (200, (196, 170, 128)), (140, (176, 146, 104)), (80, (160, 128, 90))):
        d.ellipse([560 - r, 380 - r * 0.7, 560 + r, 380 + r * 0.7], fill=c)
    d.ellipse([520, 350, 600, 410], fill=(120, 94, 64))
    # Bathroom extractor fan for context.
    d.rectangle([980, 120, 1100, 240], fill=(250, 250, 250), outline=(180, 180, 180), width=4)
    for k in range(5):
        d.line([(995, 140 + k * 20), (1085, 140 + k * 20)], fill=(190, 190, 190), width=4)
    # Moisture meter held against the stain.
    d.rounded_rectangle([700, 470, 960, 760], radius=24, fill=(240, 196, 40), outline=(60, 60, 60), width=4)
    d.rectangle([730, 500, 930, 600], fill=(30, 40, 30))
    d.text((750, 512), "27%", font=font(64, True), fill=(120, 255, 140))
    d.text((735, 620), "MOISTURE", font=font(30, True), fill=(40, 40, 40))
    d.text((735, 660), "wood scale", font=font(26), fill=(40, 40, 40))
    stamp(d)
    camera_date(d, "27/09/2026 10:41", left=True)
    img.save(path, "JPEG", quality=84)


INVOICE_LINES = [
    ("NORTHGATE ROOFING (synthetic)", 40, True),
    ("Invoice 2291", 34, True),
    ("Date of invoice: 25 September 2026", 26, False),
    ("Property: Riverside flat (synthetic)", 26, False),
    ("Work order 14", 26, False),
    ("", 20, False),
    ("Attended 25 September 2026, 09:00 to 16:00", 26, False),
    ("Replace four slipped slates, south face ........ 180.00", 26, False),
    ("Reseal chimney flashing, south face ............ 240.00", 26, False),
    ("Clear front gutter ............................. 60.00", 26, False),
    ("", 20, False),
    ("Total ........................................... 480.00", 28, True),
    ("Paid in full", 26, False),
]


def invoice(path: pathlib.Path):
    img = Image.new("RGB", (900, 1200), (252, 252, 248))
    d = ImageDraw.Draw(img)
    y = 110
    for text, size, bold in INVOICE_LINES:
        d.text((70, y), text, font=font(size, bold), fill=(25, 25, 25))
        y += size + 30
    d.line([(70, 95), (830, 95)], fill=(60, 60, 60), width=3)
    f = font(20, True)
    d.rectangle([16, 16, 600, 52], fill=(20, 32, 47))
    d.text((28, 22), "SYNTHETIC DEMO DATA - invented document", font=f, fill=(242, 196, 109))
    img.save(path, "JPEG", quality=86)


DOCS = {
    "work-order.txt": (
        "Work order 14 (SYNTHETIC DEMO DATA)\n"
        "Issued 14 September 2026 by Riverside Lettings (synthetic) to Northgate Roofing (synthetic).\n"
        "Property: Riverside flat (synthetic).\n\n"
        "Tasks:\n"
        "1. Replace the slipped slates above the bathroom.\n"
        "2. Reseal the chimney flashing on every face.\n"
        "3. Clear the front gutter.\n\n"
        "Complete by 17:00 on 26 September 2026."),
    "contractor-statement.txt": (
        "Contractor statement, Northgate Roofing (SYNTHETIC DEMO DATA)\n\n"
        "I attended Riverside flat on 25 September 2026 from 09:00 to 16:00. I replaced four slipped slates on the "
        "south face, resealed the chimney flashing and cleared the front gutter. Work order 14 is complete."),
    "contractor-second-visit.txt": (
        "Second visit, Northgate Roofing (SYNTHETIC DEMO DATA)\n\n"
        "After the inspection report I returned to Riverside flat on 28 September 2026 from 08:30 to 10:00 and "
        "resealed the chimney flashing on the north face. The photograph filed with this note shows it."),
    "inspection-report.txt": (
        "Inspection report, Riverside Lettings (SYNTHETIC DEMO DATA)\n"
        "Inspected 27 September 2026 at 10:30.\n\n"
        "Bathroom ceiling: the stain is still present. Moisture meter reads 27% at the centre of the stain against "
        "12% on dry plaster nearby.\n"
        "Loft: the timber below the chimney is damp to the touch.\n"
        "Roof, seen from the loft hatch and from the garden: four newer slates on the south face. The north face "
        "flashing has not been replaced and the old flashing is lifted in two places.\n\n"
        "Work order 14 asked for the flashing to be resealed on every face. It is not complete."),
}

CRITERIA = [
    "Evidence shows the contractor attended the property to carry out work order 14.",
    "Evidence shows each task in work order 14 was performed: the slipped slates replaced, the chimney flashing "
    "resealed on every face, and the front gutter cleared.",
    "Evidence shows all of the work in work order 14 was completed, with nothing left unfinished.",
    "Evidence shows the leak into the bathroom ceiling, which the repair addressed, has stopped or improved.",
    "Evidence shows the work was completed before 17:00 on 26 September 2026, Europe/London time.",
]

TERMS = {
    "title": "Roof leak repair under work order 14 (synthetic sample)",
    "event_kind": "REPAIR_COMPLETED",
    "property_ref": "Riverside flat (synthetic)",
    "time_zone": "Europe/London",
    "window_start": "2026-09-14",
    "deadline": "2026-09-26T17:00",
    "claim": "The roof leak repairs in work order 14 were completed before the maintenance deadline of 17:00 on "
             "26 September 2026.",
    "criteria": [{"text": t, "needs_independent": False} for t in CRITERIA],
    "allowed": ["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE", "TEXT_DOCUMENT"],
    "required": [{"type": "PHOTO", "min": 1}, {"type": "DOC:WORK_ORDER", "min": 1}],
    "limitations": [
        "The assessment does not test the roof under rain.",
        "Dates printed on photographs are the camera's setting and are not independently verified.",
    ],
    "held_sum_wei": str(10 ** 17),
    "funder": "RESPONDENT",
    "challenge_bond_wei": str(5 * 10 ** 16),
    "evidence_period_seconds": 600,
    "challenge_window_seconds": 3600,
    "challenge_evidence_seconds": 600,
}

# Who files what. The claimant is the contractor; the respondent is the property manager.
EVIDENCE = [
    {"file": "contractor-roof-before.jpg", "kind": "PHOTO", "role": "CLAIMANT", "criteria": ["C1"],
     "description": "The roof before the repair: slipped slates above the bathroom and a tarp.",
     "declared_capture": "18 September 2026"},
    {"file": "contractor-roof-after.jpg", "kind": "PHOTO", "role": "CLAIMANT", "criteria": ["C1", "C2", "C3", "C5"],
     "description": "The roof after the repair: four new slates and new flashing at the chimney.",
     "declared_capture": "25 September 2026, 15:42"},
    {"file": "invoice-2291.jpg", "kind": "DOCUMENT_PAGE", "role": "CLAIMANT", "doc_type": "INVOICE",
     "criteria": ["C1", "C2", "C5"], "description": "Invoice 2291 for the work, paid in full.",
     "declared_capture": "25 September 2026"},
    {"file": "contractor-statement.txt", "kind": "TEXT_DOCUMENT", "role": "CLAIMANT",
     "doc_type": "CONTRACTOR_STATEMENT", "title": "Contractor statement", "criteria": ["C1", "C2", "C3", "C5"],
     "description": "My statement of the work done on 25 September.", "declared_capture": "25 September 2026"},
    {"file": "work-order.txt", "kind": "TEXT_DOCUMENT", "role": "RESPONDENT", "doc_type": "WORK_ORDER",
     "title": "Work order 14", "criteria": ["C2", "C3", "C5"], "description": "The work that was ordered.",
     "declared_capture": "14 September 2026"},
    {"file": "inspection-report.txt", "kind": "TEXT_DOCUMENT", "role": "RESPONDENT", "doc_type": "INSPECTION_REPORT",
     "title": "Inspection, 27 September 2026", "criteria": ["C2", "C3", "C4"],
     "description": "Our inspection two days after the contractor's visit.", "declared_capture": "27 September 2026"},
    {"file": "manager-ceiling.jpg", "kind": "PHOTO", "role": "RESPONDENT", "criteria": ["C4"],
     "description": "The bathroom ceiling on 27 September with a moisture meter on the stain.",
     "declared_capture": "27 September 2026, 10:41"},
]


# What the claimant adds when it challenges the first decision: work done after the deadline.
CHALLENGE_EVIDENCE = [
    {"file": "contractor-north-flashing.jpg", "kind": "PHOTO", "role": "CLAIMANT", "criteria": ["C2", "C3"],
     "description": "The north face flashing resealed on a second visit.",
     "declared_capture": "28 September 2026, 09:15"},
    {"file": "contractor-second-visit.txt", "kind": "TEXT_DOCUMENT", "role": "CLAIMANT",
     "doc_type": "CONTRACTOR_STATEMENT", "title": "Second visit, 28 September", "criteria": ["C2", "C3"],
     "description": "My note of the second visit.", "declared_capture": "28 September 2026"},
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    roof_before(OUT / "contractor-roof-before.jpg")
    roof_after(OUT / "contractor-roof-after.jpg")
    invoice(OUT / "invoice-2291.jpg")
    ceiling(OUT / "manager-ceiling.jpg")
    roof_north(OUT / "contractor-north-flashing.jpg")
    for name, text in DOCS.items():
        (OUT / name).write_text(text + "\n", encoding="utf-8", newline="\n")
    for item in EVIDENCE + CHALLENGE_EVIDENCE:
        path = OUT / item["file"]
        data = path.read_bytes()
        if item["kind"] != "TEXT_DOCUMENT":
            assert data[:4] == b"\xff\xd8\xff\xe0", f"{item['file']} is not JFIF"
            assert len(data) <= 400_000, f"{item['file']} is too large"
            shutil.copy(path, PUBLIC / item["file"])
    manifest = {"notice": "SYNTHETIC DEMO DATA. Invented people, property and documents.",
                "terms": TERMS, "evidence": EVIDENCE, "challenge_evidence": CHALLENGE_EVIDENCE}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    web = dict(manifest, documents={k: v for k, v in DOCS.items()})
    WEB_DATA.write_text(json.dumps(web, indent=2) + "\n", encoding="utf-8", newline="\n")
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:32} {p.stat().st_size:>8} bytes")


if __name__ == "__main__":
    main()
