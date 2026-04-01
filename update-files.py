#!/usr/bin/env python3
import re
from pathlib import Path

base = Path("/Users/levihoyt/Code/hoyt-exteriors-site/.worktrees/location-pages")

# Generate sitemap entries
sitemap_entries = ""
services = ["roofing", "siding", "decks"]
cities = [
    "eagan", "woodbury", "burnsville", "lakeville", "apple-valley",
    "roseville", "maplewood", "cottage-grove", "inver-grove-heights", "mendota-heights"
]

for service in services:
    for city in cities:
        sitemap_entries += f"""  <url><loc>https://hoytexteriors.com/locations/{service}-{city}.html</loc><lastmod>2026-03-31</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n"""

# Update sitemap
sitemap_path = base / "sitemap.xml"
with open(sitemap_path, "r") as f:
    sitemap = f.read()

sitemap = sitemap.replace("</urlset>", sitemap_entries + "</urlset>")

with open(sitemap_path, "w") as f:
    f.write(sitemap)

print("✓ Sitemap updated with 30 location pages")

# Generate service areas section
service_areas_html = """    <section id="service-areas">
      <h2>Serving the Twin Cities Metro</h2>

      <h3>Roofing Services</h3>
      <ul>
        <li><a href="/locations/roofing-eagan.html">Roofing contractor in Eagan, MN</a></li>
        <li><a href="/locations/roofing-woodbury.html">Roofing contractor in Woodbury, MN</a></li>
        <li><a href="/locations/roofing-burnsville.html">Roofing contractor in Burnsville, MN</a></li>
        <li><a href="/locations/roofing-lakeville.html">Roofing contractor in Lakeville, MN</a></li>
        <li><a href="/locations/roofing-apple-valley.html">Roofing contractor in Apple Valley, MN</a></li>
        <li><a href="/locations/roofing-roseville.html">Roofing contractor in Roseville, MN</a></li>
        <li><a href="/locations/roofing-maplewood.html">Roofing contractor in Maplewood, MN</a></li>
        <li><a href="/locations/roofing-cottage-grove.html">Roofing contractor in Cottage Grove, MN</a></li>
        <li><a href="/locations/roofing-inver-grove-heights.html">Roofing contractor in Inver Grove Heights, MN</a></li>
        <li><a href="/locations/roofing-mendota-heights.html">Roofing contractor in Mendota Heights, MN</a></li>
      </ul>

      <h3>Siding Services</h3>
      <ul>
        <li><a href="/locations/siding-eagan.html">Siding contractor in Eagan, MN</a></li>
        <li><a href="/locations/siding-woodbury.html">Siding contractor in Woodbury, MN</a></li>
        <li><a href="/locations/siding-burnsville.html">Siding contractor in Burnsville, MN</a></li>
        <li><a href="/locations/siding-lakeville.html">Siding contractor in Lakeville, MN</a></li>
        <li><a href="/locations/siding-apple-valley.html">Siding contractor in Apple Valley, MN</a></li>
        <li><a href="/locations/siding-roseville.html">Siding contractor in Roseville, MN</a></li>
        <li><a href="/locations/siding-maplewood.html">Siding contractor in Maplewood, MN</a></li>
        <li><a href="/locations/siding-cottage-grove.html">Siding contractor in Cottage Grove, MN</a></li>
        <li><a href="/locations/siding-inver-grove-heights.html">Siding contractor in Inver Grove Heights, MN</a></li>
        <li><a href="/locations/siding-mendota-heights.html">Siding contractor in Mendota Heights, MN</a></li>
      </ul>

      <h3>Deck Services</h3>
      <ul>
        <li><a href="/locations/decks-eagan.html">Deck contractor in Eagan, MN</a></li>
        <li><a href="/locations/decks-woodbury.html">Deck contractor in Woodbury, MN</a></li>
        <li><a href="/locations/decks-burnsville.html">Deck contractor in Burnsville, MN</a></li>
        <li><a href="/locations/decks-lakeville.html">Deck contractor in Lakeville, MN</a></li>
        <li><a href="/locations/decks-apple-valley.html">Deck contractor in Apple Valley, MN</a></li>
        <li><a href="/locations/decks-roseville.html">Deck contractor in Roseville, MN</a></li>
        <li><a href="/locations/decks-maplewood.html">Deck contractor in Maplewood, MN</a></li>
        <li><a href="/locations/decks-cottage-grove.html">Deck contractor in Cottage Grove, MN</a></li>
        <li><a href="/locations/decks-inver-grove-heights.html">Deck contractor in Inver Grove Heights, MN</a></li>
        <li><a href="/locations/decks-mendota-heights.html">Deck contractor in Mendota Heights, MN</a></li>
      </ul>
    </section>\n"""

# Update homepage
index_path = base / "index.html"
with open(index_path, "r") as f:
    index = f.read()

# Insert before footer
if "</footer>" in index:
    index = index.replace("</footer>", service_areas_html + "  </footer>")
else:
    index = index.replace("</body>", service_areas_html + "</body>")

with open(index_path, "w") as f:
    f.write(index)

print("✓ Homepage updated with Service Areas section")
