#!/usr/bin/env python3
"""
Generate location-specific landing pages for Hoyt Exteriors
Usage: python generate-location-pages.py --service roofing --city eagan
       python generate-location-pages.py --batch all
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

# Configuration
SERVICES = ["roofing", "siding", "decks"]
CITIES = [
    "eagan", "woodbury", "burnsville", "lakeville", "apple-valley",
    "roseville", "maplewood", "cottage-grove", "inver-grove-heights", "mendota-heights"
]

# City metadata
CITY_META = {
    "eagan": {
        "name": "Eagan",
        "weather": "Humid summers, harsh winters, freeze-thaw cycles",
        "type": "Corporate tech corridor, newer construction (2000s+)",
        "context": "Energy efficiency and modern durability are priorities in this tech-forward suburb"
    },
    "woodbury": {
        "name": "Woodbury",
        "weather": "Similar to Eagan, strong winter weather",
        "type": "Master-planned communities, affluent suburbs",
        "context": "Premium finishes and durability are expected in these master-planned communities"
    },
    "burnsville": {
        "name": "Burnsville",
        "weather": "Heavy snow, extended freeze-thaw damage",
        "type": "Mixed older/newer, diverse income",
        "context": "Ice dams and aging roofs are common challenges in this diverse suburb"
    },
    "lakeville": {
        "name": "Lakeville",
        "weather": "Similar to Burnsville, prone to hail",
        "type": "Family-oriented, many HOAs",
        "context": "HOA-coordinated projects and insurance claims are frequent in this family-oriented area"
    },
    "apple-valley": {
        "name": "Apple Valley",
        "weather": "Rural exposure, heavy snow loads",
        "type": "Semi-rural, agricultural heritage",
        "context": "We're headquartered here — we know these properties and their unique challenges"
    },
    "roseville": {
        "name": "Roseville",
        "weather": "Established exposure to Minnesota seasons",
        "type": "Older suburban (1960s-1980s), historic homes",
        "context": "Aging roofs and foundation exposure require specialized attention in these established neighborhoods"
    },
    "maplewood": {
        "name": "Maplewood",
        "weather": "Dense urban exposure, varied microclimates",
        "type": "Dense residential, older multi-family conversions",
        "context": "Close-quarter coordination and minimal disruption are essential in dense neighborhoods"
    },
    "cottage-grove": {
        "name": "Cottage Grove",
        "weather": "Rural, open exposure",
        "type": "Semi-rural, agricultural",
        "context": "Rural properties face unique exposure challenges and weather patterns"
    },
    "inver-grove-heights": {
        "name": "Inver Grove Heights",
        "weather": "Industrial area exposure, varied microclimates",
        "type": "Mixed industrial/residential, diverse heritage",
        "context": "Experience with diverse property types — from industrial to residential — is crucial here"
    },
    "mendota-heights": {
        "name": "Mendota Heights",
        "weather": "Elevated terrain, exposure to elements",
        "type": "Upscale residential, premium finishes",
        "context": "Premium workmanship and finishes are expected in these upscale homes"
    }
}

# Service-specific content
SERVICE_CONTENT = {
    "roofing": {
        "name": "Roofing",
        "type": "Roof Replacement",
        "description": "Expert roof replacement and repair services in {{CITY}}, MN. Drone thermal imaging + ice dam prevention.",
        "intro": "Your roof is your home's first line of defense against Minnesota's harsh winters. From ice dams to freeze-thaw cycles, {{CITY}}'s weather demands durability. We've managed hundreds of roofs across the Twin Cities metro — and we know exactly what {{CITY}} properties need to survive Minnesota winter.",
        "content_blocks": [
            "Minnesota's freeze-thaw cycles are brutal on roofs. Water seeps under shingles, freezes, expands, and tears the membrane. By spring, what looked like minor damage has become a $30,000 problem. Our drone thermal imaging catches these moisture issues *before* they destroy your roof.",
            "{{CITY}} homes face specific roof challenges. Older roofs (20+ years) commonly develop ice dams and seam separation. Newer homes sometimes have insulation gaps that create heat loss and ice dam formation. Our thermal imaging reveals both.",
            "We replace roofs the right way: proper ventilation + adequate insulation + quality shingles + workmanship warranty. Your roof will survive Minnesota winters for 25+ years — not 15. That's the Hoyt difference."
        ],
        "faq": [
            {
                "q": "How long does a roof last in Minnesota?",
                "a": "Asphalt shingles last 15-25 years in Minnesota's climate. Metal roofs last 40-50+ years. The difference? Minnesota's freeze-thaw cycles are hard on standard shingles. We recommend quality shingles (GAF or similar) with proper ventilation to maximize lifespan."
            },
            {
                "q": "When should I repair vs. replace my roof?",
                "a": "If your roof is under 15 years old and damage is localized (small leaks, missing shingles), repair is cheaper. If it's over 20 years old or showing widespread damage, replacement is usually more cost-effective. A thermal inspection ($2,500) gives you the clear answer."
            },
            {
                "q": "How do I prevent ice dams?",
                "a": "Three steps: (1) Insulate your attic to R-30+, (2) Ensure proper roof ventilation, (3) Keep gutters clean. Ice dams form when attic heat melts snow, then water refreezes at the cold eaves. Fix the heat loss, eliminate the problem."
            },
            {
                "q": "What should I do after winter storm damage?",
                "a": "Document everything with photos. Call your insurance company immediately. Don't delay — temporary waterproofing is critical. We coordinate with insurance adjusters and can often expedite claims with thermal imaging documentation."
            },
            {
                "q": "What's included in your roofing warranty?",
                "a": "We provide material warranty (typically 25+ years) plus workmanship warranty (10 years minimum). This means if something fails due to installation, we fix it at no cost."
            }
        ]
    },
    "siding": {
        "name": "Siding",
        "type": "Siding Replacement",
        "description": "Professional siding replacement and installation in {{CITY}}, MN. Fiber cement, vinyl, and composite options.",
        "intro": "Your home's siding is constantly exposed to Minnesota's temperature swings, UV damage, and moisture. Every gap, every crack is an opportunity for water intrusion that can rot sheathing and cause $50,000+ in repairs. We replace siding the right way — with materials that survive Minnesota weather and proper installation that keeps water out.",
        "content_blocks": [
            "{{CITY}}'s freeze-thaw cycles are especially tough on siding. Vinyl becomes brittle and cracks in -20° weather. Improper caulking allows water behind the siding, where it freezes and expands. Fiber cement (LP SmartSide) is the superior choice for Minnesota — it handles temperature swings, resists rot, and can be refreshed with new paint every 15+ years.",
            "The siding you choose determines your home's appearance, durability, and future cost. Vinyl is cheapest upfront ($10-12/sq ft) but fades in 10 years and can't be refreshed. Fiber cement costs more ($13-16/sq ft) but lasts 25-30 years and can be repainted to look new.",
            "We install siding with proper ventilation, flashing, and caulking that actually stops water intrusion. Your siding will protect your home for decades, not years."
        ],
        "faq": [
            {
                "q": "How long does siding last in Minnesota?",
                "a": "Vinyl lasts 15-20 years before fading and becoming brittle. Fiber cement lasts 25-30 years with occasional repainting. The difference? Minnesota's temperature extremes are hard on vinyl. Fiber cement laughs at freeze-thaw cycles."
            },
            {
                "q": "Is fiber cement worth the extra cost?",
                "a": "Yes. Total cost of ownership favors fiber cement. Vinyl requires replacement twice in 40 years (~$40K total). Fiber cement requires one replacement plus a paint refresh at year 15 (~$35K total). Plus, fiber cement adds 2-3% to resale value."
            },
            {
                "q": "How often should siding be painted?",
                "a": "Fiber cement should be refreshed every 12-15 years depending on sun exposure and weather. This is much cheaper than replacement and keeps your home looking premium. Vinyl can't be painted reliably."
            },
            {
                "q": "What causes water damage behind siding?",
                "a": "Failed caulk, improper flashing, and gaps around windows/doors. We install siding with proper ventilation and sealed transitions that actually prevent water intrusion."
            },
            {
                "q": "Do you offer siding warranties?",
                "a": "Yes. Material warranty (25+ years for fiber cement) plus 10-year workmanship warranty covering installation quality."
            }
        ]
    },
    "decks": {
        "name": "Decks",
        "type": "Deck Installation",
        "description": "Expert deck repair, staining, and installation in {{CITY}}, MN. Wood and composite options.",
        "intro": "Minnesota decks face freeze-thaw cycles that would destroy lesser structures. Snow loads, ice accumulation, and constant moisture cycles make deck maintenance critical. Whether you're repairing an aging deck or building new, we understand what it takes to survive Minnesota winters.",
        "content_blocks": [
            "Minnesota's winter is uniquely hard on decks. Repeated freezing and thawing causes wood to expand and contract. Water gets trapped in cracks, freezes, and pushes nails out. Within 3-5 years, an unstained deck becomes a safety hazard. Regular staining (every 2-3 years) is not optional — it's required.",
            "{{CITY}}'s climate and typical deck aging patterns require proactive maintenance. Decks over 15 years old commonly need structural repairs. Frost heave can lift entire sections. Snow load calculations must account for {{CITY}}'s typical winter conditions. We handle all of this.",
            "We build and repair decks that survive Minnesota winters. Proper drainage, protective staining, and structural soundness mean your deck stays safe and beautiful for decades."
        ],
        "faq": [
            {
                "q": "How often should I stain my deck in Minnesota?",
                "a": "Every 2-3 years, depending on sun exposure and weather intensity. This is not optional — stain protects wood from freeze-thaw damage and moisture infiltration. Skipping stain costs you $5,000+ in structural repairs."
            },
            {
                "q": "Wood deck vs. composite: Which is better?",
                "a": "Wood requires maintenance but offers natural beauty and lower cost ($15-20/sq ft). Composite requires minimal maintenance but costs more ($25-35/sq ft). For Minnesota's climate, both work — choose based on your maintenance tolerance."
            },
            {
                "q": "When should I repair vs. replace my deck?",
                "a": "If structural damage is localized (rotted boards, loose railings) and the deck is under 20 years old, repair is usually adequate. Decks over 20 years old with widespread rot should be replaced. We'll assess and give you clear numbers."
            },
            {
                "q": "Can I use my deck safely in winter?",
                "a": "Yes, but with caution. Snow accumulation adds weight. Ice creates slipping hazards. We recommend snow removal and ice melt products. Structurally sound decks can handle Minnesota snow loads — but safety is your responsibility."
            },
            {
                "q": "Do I need permits for deck work?",
                "a": "Most {{CITY}} permits require permits for decks over 30 sq ft or elevated more than 30 inches. We handle all permitting and inspections as part of the project."
            }
        ]
    }
}

def generate_faq_schema(faqs: List[Dict]) -> str:
    """Generate FAQPage schema JSON-LD for a list of FAQs."""
    items = []
    for faq in faqs:
        items.append({
            "@type": "Question",
            "name": faq["q"],
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq["a"]
            }
        })
    return ",\n      ".join(json.dumps(item, indent=6).replace("\n", "\n      ") for item in items)

def generate_faq_html(faqs: List[Dict]) -> str:
    """Generate HTML FAQ section."""
    html = ""
    for i, faq in enumerate(faqs, 1):
        html += f"""    <div class="faq-item">
      <h3>{faq['q']}</h3>
      <p>{faq['a']}</p>
    </div>\n\n"""
    return html

def generate_related_services(city_slug: str, current_service: str) -> str:
    """Generate related services section."""
    services = [s for s in SERVICES if s != current_service]
    html = ""
    for service in services:
        service_name = SERVICE_CONTENT[service]["name"]
        html += f'      <li><a href="/locations/{service}-{city_slug}.html">{service_name} in {CITY_META[city_slug]["name"]}, MN</a></li>\n'
    return html

def generate_page(service: str, city: str) -> str:
    """Generate a single location page HTML."""
    city_slug = city.lower().replace(" ", "-")
    service_lower = service.lower()

    # Validate inputs
    if service_lower not in SERVICES or city_slug not in CITIES:
        raise ValueError(f"Invalid service '{service}' or city '{city}'")

    # Get metadata
    city_meta = CITY_META[city_slug]
    service_meta = SERVICE_CONTENT[service_lower]

    # Generate content blocks
    content_blocks = "\n\n    <p>".join([
        f"<p>{block.replace('{{CITY}}', city_meta['name'])}"
        for block in service_meta["content_blocks"]
    ]).replace("</p>\n\n    <p>", "</p>\n\n    <p>")

    # Generate FAQ section
    faq_schema = generate_faq_schema(service_meta["faq"])
    faq_html = generate_faq_html(service_meta["faq"])

    # Generate related services
    related_services = generate_related_services(city_slug, service_lower)

    # Read template
    template_path = Path("/Users/levihoyt/Code/hoyt-exteriors-site/.worktrees/location-pages/locations/template-location-page.html")
    with open(template_path, "r") as f:
        template = f.read()

    # Replace placeholders
    page = template
    page = page.replace("{{H1_TITLE}}", f"{service_meta['name']} Contractor in {city_meta['name']}, MN | Hoyt Exteriors")
    page = page.replace("{{META_DESCRIPTION}}", f"{service_meta['description'].replace('{{CITY}}', city_meta['name'])}")
    page = page.replace("{{PAGE_SLUG}}", f"{service_lower}-{city_slug}")
    page = page.replace("{{CITY_NAME}}", city_meta["name"])
    page = page.replace("{{SERVICE_NAME}}", service_meta["name"])
    page = page.replace("{{SERVICE_TYPE}}", service_meta["type"])
    page = page.replace("{{SERVICE_DESCRIPTION}}", service_meta["description"].replace("{{CITY}}", city_meta["name"]))
    page = page.replace("{{BUSINESS_ADDRESS}}", "Apple Valley, MN 55124")
    page = page.replace("{{INTRO_PARAGRAPH}}", service_meta["intro"].replace("{{CITY}}", city_meta["name"]))
    page = page.replace("{{CONTENT_BLOCK_1}}", f"<p>{service_meta['content_blocks'][0].replace('{{CITY}}', city_meta['name'])}</p>")
    page = page.replace("{{CONTENT_BLOCK_2}}", f"<p>{service_meta['content_blocks'][1].replace('{{CITY}}', city_meta['name'])}</p>")
    page = page.replace("{{CONTENT_BLOCK_3}}", f"<p>{service_meta['content_blocks'][2].replace('{{CITY}}', city_meta['name'])}</p>")
    page = page.replace("{{FAQ_ITEMS}}", faq_schema)
    page = page.replace("{{FAQ_QUESTIONS}}", faq_html)
    page = page.replace("{{RELATED_SERVICES}}", related_services)

    return page

def main():
    import sys

    if len(sys.argv) < 2:
        print("Usage: python generate-location-pages.py --service roofing --city eagan")
        print("       python generate-location-pages.py --batch all")
        sys.exit(1)

    if sys.argv[1] == "--batch":
        # Generate all 30 pages
        output_dir = Path("/Users/levihoyt/Code/hoyt-exteriors-site/.worktrees/location-pages/locations")
        output_dir.mkdir(parents=True, exist_ok=True)

        count = 0
        for service in SERVICES:
            for city in CITIES:
                city_slug = city.lower().replace(" ", "-")
                html = generate_page(service, city)
                output_path = output_dir / f"{service}-{city_slug}.html"
                with open(output_path, "w") as f:
                    f.write(html)
                count += 1
                print(f"✓ Created {service}-{city_slug}.html")

        print(f"\n✓ Successfully generated {count} location pages")

    elif sys.argv[1] == "--service":
        service = sys.argv[2]
        city = sys.argv[4] if len(sys.argv) > 4 else None

        if not city:
            print("Usage: python generate-location-pages.py --service roofing --city eagan")
            sys.exit(1)

        html = generate_page(service, city)
        print(html)

if __name__ == "__main__":
    main()
