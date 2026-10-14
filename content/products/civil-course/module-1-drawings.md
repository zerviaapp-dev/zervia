# Module 1: Reading Construction Drawings
*The complete beginner lesson — everything in this module, start to finish.*

---

## 1.1 Types of Construction Drawings — Who Draws What, and Why

On a real project, there isn't one drawing — there's a whole set, and each discipline produces its own. When I walk onto a site as a QA specialist, the first thing I do is figure out which drawings govern the work in front of me. Here's the map:

**Architectural drawings (the "A" series).** These show what the building looks like and how it's laid out — floor plans, elevations, room layouts, finishes, doors, windows. They answer: *what does the client get?* If you're a homeowner, these are the drawings you'll spend the most time with.

**Structural drawings (the "S" series).** These show what holds the building up — foundations, columns, beams, slabs, rebar details. They answer: *how does it stand?* Structural drawings are drawn by the structural engineer, and they're the ones I scrutinize most during inspection. A beam that's 300 mm deep on the structural drawing but built at 250 mm is a problem — and it's the kind of thing you only catch if you can read the drawing.

**MEP drawings (Mechanical, Electrical, Plumbing).** These show the building's "organs" — ductwork, piping, wiring, plumbing runs, equipment locations. They answer: *how does it work?* On industrial projects like the ones I've worked on, MEP coordination is where most clashes happen: a duct drawn through a beam, a pipe where a footing goes.

**Civil drawings (the "C" series).** Site plans, grading, drainage, roads, utilities outside the building. They answer: *how does the building sit on the land?*

**How the set is organized:** Drawing numbers tell you the discipline — A-101 is architectural, S-201 is structural. Sheets are sequenced logically: site plan first, then floor plans, then elevations, then sections, then details. When you open a drawing set, always check the **drawing index** (usually on the first sheet) — it's the table of contents.

**A field truth:** The most expensive mistakes I've seen come from people working off the wrong revision. Always check the revision block (more on that in title blocks below) and make sure you're looking at the latest issued-for-construction set. "I built it from the drawing" is not a defense if it was the wrong drawing.

---

## 1.2 Reading a Floor Plan Step by Step

The floor plan is the drawing everyone thinks they can read — and most people misread. Here's the professional way to read one, step by step.

**What a floor plan is:** Imagine cutting the building horizontally at about 1.2 metres above the floor, removing the top, and looking straight down. Walls are shown as thick lines (thicker = structural or exterior), doors as gaps with a swing arc, windows as breaks in the wall line.

**Step 1 — Orient yourself.** Find the north arrow and the room labels. Read the title under the drawing: it tells you the floor level, the scale, and the drawing number. Check the title block for the project name and revision — make sure this is the current issue.

**Step 2 — Trace the perimeter.** Follow the exterior walls all the way around. Note the overall dimensions written outside the walls — these are the building's footprint. Get a feel for the size before diving into details.

**Step 3 — Read the rooms.** Room names or numbers are labeled inside each space. Follow the interior walls and see how rooms connect — where doors are, which way they swing (the arc shows the swing direction), where windows sit. A door swinging into a hallway instead of into the room changes how furniture fits — catch it on paper, not after installation.

**Step 4 — Check dimensions.** Interior dimensions are usually shown as a string of measurements along walls — room widths, wall-to-wall distances, door and window sizes. Add them up: the individual room dimensions should roughly total the overall dimension. If they don't, something's off — either a dimension is missing or the drawing has an error. Yes, drawings have errors. Part of my job is finding them.

**Step 5 — Look for references.** Small circles or tags with numbers/letters point you to other drawings — a section cut marker (showing where a section is taken), a detail callout (showing where an enlarged detail lives), a door or window schedule reference. Follow these; the plan alone never tells the whole story.

**Step 6 — Check the notes and legend.** General notes on the sheet carry requirements that apply everywhere — "all dimensions in millimetres," "verify all dimensions on site," finish notes. The legend explains symbols used on that sheet.

**A real example:** On a residential project, I once caught a bathroom where the plan showed a 900 mm door but the dimension string only left 850 mm of clear wall. The framer would have discovered it the hard way. Reading dimensions critically — not just glancing — is the difference between a drawing reader and a drawing *checker*.

---

## 1.3 Elevations vs. Sections — Seeing the Building from Every Side

Floor plans show layout. Elevations and sections show height — and height is where a huge number of construction mistakes live.

**Elevations** are flat views of the building's exterior faces — north elevation, south elevation, and so on. Think of standing across the street and looking at the building. Elevations show: exterior finishes and materials, window and door positions in the wall, rooflines and heights, ground level relative to the building. They answer: *what does it look like from outside?*

**Sections** are what you get when you cut the building vertically and look at the cut face — like slicing a cake and looking at the layers. A section marker on the floor plan (a line with arrows showing the viewing direction) tells you exactly where the cut is taken. Sections show: floor-to-floor heights, slab thicknesses, foundation depth, roof buildup, ceiling heights, the relationship between structure and finishes. They answer: *how is it put together vertically?*

**Why sections matter so much:** Most coordination problems are vertical, not horizontal. The classic clash: a structural beam drawn at one depth, with MEP ductwork drawn passing through the same space. On the floor plan, both look fine — they're in different locations horizontally. In section, they occupy the same space. This is exactly the kind of thing QA review catches before it becomes a very expensive field fix.

**Reading heights:** Elevations and sections carry height dimensions — finished floor levels, ceiling heights, top-of-wall elevations. These are often given as absolute elevations (e.g., 102.50 m above sea level datum) or relative to a reference (e.g., +3.00 m above ground floor). Pay attention to which one you're looking at — mixing them up is a classic beginner error.

**Key habit:** Never look at a floor plan alone. For any room or area that matters, pull up the corresponding elevation and section. Three views together give you the full picture — plan for layout, elevation for appearance, section for construction.

---

## 1.4 Scale and Dimensioning — Measuring from a Drawing

Drawings are not full size (imagine a 1:1 drawing of a building). **Scale** is the ratio between the drawing and reality — and understanding it lets you pull real measurements off paper.

**Common scales:**
- **Site plans:** 1:500, 1:1000 (1 mm on paper = 500 mm in reality)
- **Floor plans:** 1:50, 1:100 (1 cm on paper = 50 cm or 1 m in reality)
- **Details:** 1:10, 1:5, even 1:1 for small components

**How to use scale:** The scale is always printed under the drawing title. With an architect's scale ruler (a triangular ruler with multiple scales — worth owning), you can measure directly off the drawing. Without one: measure the line in millimetres with a regular ruler, then multiply. At 1:50, a 40 mm line on paper = 40 × 50 = 2000 mm = 2 metres in reality.

**The golden rule of dimensioning:** Always trust the **written dimension** over measuring the drawing. Written dimensions (the numbers printed on the drawing) are exact. Measuring off the paper introduces error — paper stretches, printers distort, and PDF zoom lies. If the written dimension says 3600 mm, the wall is 3600 mm, even if your ruler says otherwise. I have seen disputes on site settled by this rule more times than I can count.

**Types of dimensions you'll see:**
- **Overall dimensions** — the total length of the building or a major element
- **String dimensions** — a chain of smaller measurements (room widths, wall segments) that should add up to the overall
- **Grid dimensions** — structural grids (numbered one way, lettered the other) that locate columns and walls precisely; everything structural ties back to the grid

**Checking dimensions like an inspector:** Add up the string. Compare it to the overall. They should match within a few millimetres (rounding). If a room string reads 3000 + 3600 + 3000 = 9600 but the overall says 9800, there's a 200 mm gap somewhere — find it before concrete is poured, because after that, it's permanent.

---

## 1.5 Common Symbols and Abbreviations Legend

Drawings speak in shorthand. Here's the legend that covers most of what you'll encounter — keep it handy when practicing.

**Common symbols:**
- **Door:** gap in wall with an arc showing swing direction
- **Window:** parallel lines within a wall break
- **Section cut marker:** line with arrows and a letter/number tag showing where the section is cut and which way you're looking
- **Detail callout:** circle with a number (the detail) over a letter or number (the sheet it's on)
- **Elevation marker:** circle with arrow pointing at the face being viewed
- **Grid lines:** numbered/lettered lines locating structural elements
- **North arrow:** orientation — always check it first
- **Revision cloud:** a cloud-shaped outline marking what changed in this revision
- **Break line:** a jagged line showing the drawing continues but is cut short for space

**Common abbreviations:**
- **CL** — centreline
- **TYP** — typical (applies everywhere unless noted otherwise)
- **NTS** — not to scale (do NOT measure this drawing!)
- **UNO** — unless noted otherwise
- **FFL / SSL** — finished floor level / structural slab level
- **AFF** — above finished floor
- **DIA** — diameter
- **THK** — thickness
- **RC** — reinforced concrete
- **U/S, D/S** — upstream, downstream (drainage drawings)
- **INV** — invert level (the bottom inside of a pipe — critical for drainage)

**NTS deserves emphasis:** When a drawing says "not to scale" — usually on schematics, diagrams, and some details — measuring it is meaningless. Work from the written dimensions and notes only.

---

## 1.6 Title Blocks — The Drawing's ID Card

Every professional drawing carries a **title block**, usually in the bottom-right corner. It's the drawing's ID card, and reading it is the first thing a professional does. Here's what it carries:

- **Project name and address** — which project this belongs to (sounds obvious; matters when multiple projects' drawings are floating around a site office)
- **Drawing title** — what this sheet shows ("Ground Floor Plan," "Foundation Details")
- **Drawing number** — the unique identifier (A-101, S-201). This is how the drawing is referenced in emails, RFIs, and inspection reports. Quote it exactly.
- **Scale** — as printed; note that different views on one sheet can have different scales
- **Date and revision** — when this issue was released, and which revision it is (Rev 0, Rev A, Rev 1...). **Always work from the latest revision.** The revision block (a small table, usually above the title block) lists what changed in each revision.
- **Drawn / checked / approved** — who produced it and who signed off. On QA review, I check this: a drawing with no checker signature gets extra scrutiny.
- **Status stamp** — "Issued for Construction," "For Review," "Preliminary." This is critical: **never build from a "Preliminary" or "For Review" drawing.** Only "Issued for Construction" (IFC) drawings are authorized for building. I've stopped work on site over this.

**The habit:** Before reading any drawing, read its title block. Thirty seconds that prevents working from the wrong revision, the wrong status, or the wrong project entirely.

---

## 1.7 Worked Example — Walking Through a Simple House Plan

Let's put it all together. Imagine a simple single-storey house plan, drawing A-101, scale 1:50, Rev 2, status "Issued for Construction."

**First, the title block:** Project "Sample Residence," drawing A-101 "Ground Floor Plan," scale 1:50, dated, Rev 2, IFC status. Good — current and buildable.

**Orient:** North arrow points up. Overall dimensions: 12,000 mm × 9,000 mm. The footprint is 12 × 9 metres — a modest family home.

**Trace the perimeter:** Exterior walls shown thick (300 mm — likely concrete block or insulated assembly). Openings for the front door (1000 mm per the door tag D-01) and windows (tags W-01, W-02...).

**Read the rooms:** Entry foyer opens to a living room (labeled, with window tags on two walls — good natural light), a kitchen at the rear, two bedrooms, one bathroom. Door swings: bedroom doors swing into the rooms (correct — you don't want a door swinging into a hallway blocking passage). The bathroom door swings in — check clearance against fixtures, a classic plan-check item.

**Check dimensions:** Living room string: 3600 + wall 150 + 4200 = 7950... but the overall interior dimension says 8100. There's a 150 mm discrepancy — either a dimension is missing or there's an error. This is exactly the kind of thing to flag with an RFI (request for information) to the designer before construction. On a real project, I'd redline this and send it back.

**Follow references:** A section marker A-A cuts through the living room and kitchen — pull up section A-A on sheet A-201 to check ceiling height (say 2700 mm AFF) and roof buildup. A detail callout at the front entry points to a porch detail on A-301.

**Notes:** General note says "All dimensions in millimetres. Verify all dimensions on site prior to construction." The legend confirms the wall hatch pattern means concrete block.

**What we just did** is a real plan review in miniature — the same process, just smaller. On a major project, I do this across dozens of sheets, cross-checking architectural against structural against MEP. The skill is identical; only the volume changes.

---

## 1.8 Practice Exercises

Use the Drawing-Reading Practice Sheets included with this course. Five exercises to lock in the skill:

1. **Title block drill.** Given three sample title blocks, identify: the drawing number, the scale, the revision, and whether the drawing is issued for construction. (One of them isn't — find it.)
2. **Room schedule.** From a sample floor plan, list every room, its dimensions, and its door/window tags. Check that the room dimensions add to the overall.
3. **Swing check.** On a sample plan, mark every door swing. Identify any door that swings the wrong way or clashes with a fixture.
4. **Section hunt.** Given a floor plan with two section markers, describe in words what each section would show (which rooms it cuts, what heights it reveals).
5. **Error find.** A sample plan contains three deliberate errors — a dimension string that doesn't add up, a door tag with no matching schedule entry, and a revision cloud with no revision table entry. Find all three, and write each up as you would in a real review comment.

Work through these with the legend from section 1.5 beside you. If you can do all five confidently, you read drawings better than most people on a job site — and that's not an exaggeration.

---

## Module 1 Recap

You can now identify drawing types and who produces them, read a floor plan systematically instead of just glancing at it, understand what elevations and sections reveal (and why sections catch the expensive mistakes), use scale and — more importantly — trust written dimensions over measurements, decode the common symbols and abbreviations, read a title block and verify you're working from the right revision, and walk through a plan the way a QA reviewer does. That's a real, employable skill — and it's the foundation everything else in civil construction builds on.

*Next: Module 2 — Concrete Basics.*
