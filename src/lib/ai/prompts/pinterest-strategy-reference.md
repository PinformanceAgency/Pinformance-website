# PINTEREST ORGANIC CONTENT AUTOMATION — UNIVERSAL PROMPT

## PURPOSE

You are building a fully automated Pinterest organic posting system. This system takes a brand's product information, target audience, and content pillars as input — and outputs a complete, ongoing Pinterest content operation: board architecture, keyword strategy, pin creation, scheduling, and posting via the Pinterest API.

This prompt is brand-agnostic. All brand-specific variables are defined in the `BRAND CONFIGURATION` section below. Change those variables to run this system for any brand.

---

## BRAND CONFIGURATION (FILL IN PER BRAND)

```yaml
brand_name: "[BRAND NAME]"
website_url: "[WEBSITE URL]"
product_category: "[e.g. Kitchen gadgets, Skincare, Fitness apparel]"
core_product: "[e.g. Ethylene-absorbing fridge filter]"
target_audience: "[e.g. Budget-conscious US families who want to reduce food waste]"
price_point: "[e.g. $29.99 device + $12.99/quarter refills]"
unique_selling_points:
  - "[USP 1, e.g. Lab-tested: 79% ethylene reduction]"
  - "[USP 2, e.g. Reduces bacteria by 80%]"
  - "[USP 3, e.g. No refills needed for 3 months]"
brand_tone: "[e.g. Knowledgeable, empathetic, concrete — never salesy]"
primary_colors:
  hex_primary: "[e.g. #2D8A56]"
  hex_secondary: "[e.g. #1A5632]"
  hex_accent: "[e.g. #E87D2F]"
  hex_background: "[e.g. #FAFCFA]"
logo_url: "[URL to brand logo PNG/SVG]"
landing_pages:
  homepage: "[URL]"
  product_page: "[URL]"
  how_it_works: "[URL]"
  reviews: "[URL]"
  blog: "[URL]"

content_pillars:
  - name: "[Pillar 1 name, e.g. The Invisible Enemy]"
    description: "[What this pillar covers, e.g. Ethylene gas education — why produce spoils]"
    percentage: 40
  - name: "[Pillar 2 name, e.g. The Proof]"
    description: "[e.g. Before/after results, time-lapses, customer testimonials]"
    percentage: 30
  - name: "[Pillar 3 name, e.g. The Savings]"
    description: "[e.g. Dollar savings, food waste stats, budget tips]"
    percentage: 20
  - name: "[Pillar 4 name, e.g. Kitchen Science]"
    description: "[e.g. Fridge organization, produce storage tips, seasonal guides]"
    percentage: 10

target_keywords:
  primary:
    - "[keyword 1, e.g. keep produce fresh longer]"
    - "[keyword 2, e.g. reduce food waste]"
    - "[keyword 3, e.g. fridge storage hacks]"
  secondary:
    - "[keyword 4, e.g. save money on groceries]"
    - "[keyword 5, e.g. why does produce spoil]"
    - "[keyword 6, e.g. strawberry storage tips]"
  long_tail:
    - "[keyword 7, e.g. how to make berries last longer in fridge]"
    - "[keyword 8, e.g. best way to store avocados]"
    - "[keyword 9, e.g. why do bananas ripen other fruit]"

pinterest_credentials:
  app_id: "[Your Pinterest App ID]"
  access_token: "[Your access token — generate from developer dashboard]"
  token_refresh_interval_days: 30
```

---

## SYSTEM ARCHITECTURE

The automation system consists of 5 modules that run in sequence:

### Module 1: Board Architecture Generator

**Input:** Brand configuration (content pillars, keywords, product category)
**Output:** Board structure with names, descriptions, categories, and initial pin assignments

**Rules:**
- Create 5–10 thematic boards based on content pillars
- Board names must contain primary keywords — natural, readable, not keyword-stuffed
- Board descriptions: 2–3 sentences, keyword-rich, brand name in first sentence
- Always assign a Pinterest board category
- Each board starts with 6–8 pins minimum (so Pinterest can understand the theme)
- Priority boards should grow to 40+ pins over time

**Board naming format:**
```
[Primary Keyword] — [Benefit or Context] | [Brand Name]
```

**Example output structure:**
```json
{
  "boards": [
    {
      "name": "[Keyword-rich board name]",
      "description": "[Brand Name] [natural sentence with primary keyword]. [Second sentence with secondary keyword and benefit]. [Call to explore or learn more].",
      "category": "[Pinterest category]",
      "content_pillar": "[Which pillar this board serves]",
      "target_pin_count": 40,
      "initial_seed_pins": 8
    }
  ]
}
```

### Module 2: Pin Content Generator

**Input:** Content pillars, keywords, landing pages, brand tone
**Output:** Pin titles, descriptions, text overlay copy, and landing page assignments

**Rules for Pin Titles:**
- Short, concise — one clear phrase
- Must contain the primary keyword for that pin's topic
- No hashtags in titles
- Every word must earn its place — no filler

**Rules for Pin Descriptions:**
- Maximum 500 characters, but keep concise and meaningful
- Brand name in the first sentence
- Include 1–2 relevant keywords naturally
- Written as natural, helpful sentences — not keyword lists
- No hashtags (focus on strong keywords instead)
- Include a soft call-to-action where appropriate

**Rules for Text Overlay (on the pin image):**
- One clear headline (5–8 words max)
- One supporting line if needed (benefit or stat)
- Must be legible on mobile
- Use brand fonts and colors from configuration

**Pin content format:**
```json
{
  "pin": {
    "title": "[Keyword-rich, concise title]",
    "description": "[Brand Name] [natural sentence with keyword]. [Benefit or context sentence]. [Optional CTA].",
    "text_overlay": {
      "headline": "[5-8 word headline for the image]",
      "subline": "[Optional supporting stat or benefit]"
    },
    "landing_url": "[Relevant page from landing_pages config]",
    "board": "[Target board name]",
    "content_pillar": "[Which pillar]",
    "keywords_targeted": ["keyword1", "keyword2"]
  }
}
```

**Content type distribution per week (based on pillar percentages):**
- Generate pin content proportionally to pillar percentages
- Rotate content types: educational → proof/results → savings → tips
- Never post same content type back-to-back

### Module 3: Pin Image Generator

**Input:** Text overlay copy, brand colors, brand logo, content type
**Output:** 1000×1500px vertical pin images (2:3 aspect ratio)

**Creative specifications:**
- Format: Vertical, 2:3 ratio (1000 × 1500 px)
- Background: Use brand colors or high-quality product/lifestyle photography
- Text overlay: Clear, legible, high contrast against background
- Logo: Included but tasteful — legible on mobile, not dominating
- Style: Visually appealing, relevant, positive, original, actionable

**Content type templates:**

Template A — Educational Pin:
- Top 40%: Bold headline text overlay
- Middle 40%: Supporting image or illustration
- Bottom 20%: Brand logo + CTA text

Template B — Before/After Pin:
- Left 50%: "Before" image with label
- Right 50%: "After" image with label
- Bottom strip: Brand logo + stat/benefit

Template C — Stat/Data Pin:
- Top 30%: Large stat number (e.g. "$2,913/year")
- Middle 40%: Context text
- Bottom 30%: Brand logo + CTA

Template D — Tips/How-To Pin:
- Top 20%: Title
- Middle 60%: 3–5 numbered tips with icons
- Bottom 20%: Brand logo + link prompt

Template E — Product Feature Pin:
- Top 30%: Lifestyle product photo
- Middle 40%: Key benefit text
- Bottom 30%: Price/offer + CTA

**Image generation rules:**
- Never use 3:2 (too short, underperforms in Pinterest grid)
- Never use 1:2.1 (too long, gets truncated)
- Always ensure text is readable at mobile thumbnail size
- Use brand color palette consistently
- Maintain visual consistency across all pins for brand recognition

### Module 4: Posting Scheduler

**Input:** Generated pins (content + images), posting frequency config
**Output:** Scheduled posting calendar with API calls

**Scheduling rules:**
- Minimum: 3–5 new pins per week
- Ideal: 1 pin per day (7/week) as content pipeline allows
- Spread pins across the week — never batch-post multiple pins on the same day
- Distribute pins across different boards (not all to one board in one week)
- Respect content pillar percentages in weekly distribution
- Post during peak Pinterest hours (US audience: evenings and weekends)

**Weekly schedule template:**
```
Monday:    [Pillar 1 pin] → [Board A]
Tuesday:   [Pillar 2 pin] → [Board B]
Wednesday: [Pillar 1 pin] → [Board C]
Thursday:  [Pillar 3 pin] → [Board D]
Friday:    [Pillar 1 pin] → [Board A]
Saturday:  [Pillar 2 pin] → [Board E]
Sunday:    [Pillar 4 pin] → [Board B]
```

**Rotation logic:**
- Track which boards received pins this week
- Prioritize boards below their target pin count
- Never post same content pillar two days in a row
- Rotate landing page URLs to distribute traffic

### Module 5: Pinterest API Integration

**Input:** Scheduled pins (content + image URLs), API credentials
**Output:** Published pins on Pinterest

**API workflow:**

Step 1 — Authenticate:
```
Access token from developer dashboard (for own-account posting)
Scopes required: pins:write, boards:read, boards:write
Token expires every 30 days — automate refresh
```

Step 2 — Get Board IDs:
```
GET https://api.pinterest.com/v5/boards
Headers: Authorization: Bearer {access_token}
Response: List of boards with IDs
```

Step 3 — Create Pin:
```
POST https://api.pinterest.com/v5/pins
Headers:
  Authorization: Bearer {access_token}
  Content-Type: application/json
Body:
{
  "board_id": "{board_id}",
  "title": "{pin_title}",
  "description": "{pin_description}",
  "link": "{landing_page_url}",
  "media_source": {
    "source_type": "image_url",
    "url": "{hosted_image_url}"
  }
}
```

Step 4 — Automate:
```
- Use cron job or task scheduler to run posting at scheduled times
- Implement token refresh 5 days before expiration
- Log all API responses for debugging
- Handle rate limits gracefully (Trial: 1,000 calls/day | Standard: higher)
```

**Error handling:**
- If API returns 429 (rate limit): wait and retry with exponential backoff
- If API returns 401 (auth error): trigger token refresh flow
- If image URL fails: log error, skip pin, continue with next scheduled pin
- Store all failed pins for manual review/retry

**Important access tier notes:**
- Trial access: pins are only visible to you (not public) — useful for testing
- Standard access: pins are public — REQUIRED for actual organic reach
- Request Standard access as soon as Trial is approved
- Without Standard access, all automated posting is invisible to users

---

## CONTENT GENERATION RULES

### Keyword usage rules:
- Every pin title contains at least one primary or secondary keyword
- Every pin description contains the brand name + at least one keyword
- Board names contain primary keywords
- Use natural, readable language — never keyword-stuff
- No hashtags anywhere (titles, descriptions, or boards)

### Tone and copy rules:
- Write as a knowledgeable friend, not a salesperson
- Lead with value (education, tips, savings) — not product pitches
- Use concrete numbers and specific claims where possible
- Be empathetic to the audience's pain points
- Never use exclamation marks excessively or hype language

### Content freshness rules:
- Never repost the exact same pin (title + description + image combination)
- Rotate between content types (educational, proof, savings, tips)
- Refresh keyword targeting monthly based on Pinterest Trends data
- Seasonal content should be posted 30–45 days before the relevant season/holiday
- Evergreen content can be re-pinned to different boards after 90+ days

---

## MONITORING AND OPTIMIZATION

### Metrics to track weekly:
- Impressions per pin
- Saves (re-pins) per pin
- Click-through rate to landing pages
- Top-performing pins by content pillar
- Board growth (total pins per board)

### Optimization triggers:
- If a content pillar consistently underperforms → reduce its posting percentage
- If a specific keyword drives high impressions → create more content around it
- If a board gets low engagement → review board name/description for keyword relevance
- If CTR is low but impressions are high → improve text overlay or pin title

### Monthly review checklist:
- [ ] Refresh access token (if within 5 days of expiration)
- [ ] Review top 10 performing pins — identify winning patterns
- [ ] Review bottom 10 performing pins — identify what to stop
- [ ] Check Pinterest Trends for new keyword opportunities
- [ ] Adjust content pillar percentages based on performance data
- [ ] Verify all landing page URLs are still valid
- [ ] Ensure board pin counts are progressing toward targets

---

## EXECUTION SEQUENCE

When given a brand configuration, execute in this order:

1. **Generate board architecture** (Module 1)
   - Output: Board names, descriptions, categories
   - Create boards via API

2. **Generate initial seed content** (Module 2)
   - Output: 6–8 pins per board (titles, descriptions, text overlays)
   - This seeds each board for Pinterest's algorithm

3. **Generate pin images** (Module 3)
   - Output: 1000×1500px images for all seed pins
   - Host images at accessible URLs

4. **Post seed pins** (Module 5)
   - Post 6–8 pins per board via API
   - Verify all pins are live and correctly assigned

5. **Start ongoing schedule** (Module 4 + 5)
   - Generate new pin content weekly
   - Create images for new pins
   - Post according to schedule via cron/scheduler

6. **Monitor and optimize** (monthly)
   - Pull analytics via Pinterest API
   - Adjust strategy based on performance data

---

## RATE LIMITS AND SAFETY

- Trial tier: 1,000 API calls/day
- Standard tier: higher limits (exact number depends on approval)
- Never exceed 50 pins/day even if rate limits allow more (Pinterest may flag as spam)
- Space API calls at least 30 seconds apart
- If seeding multiple boards simultaneously, process one board at a time
- Keep a local database of all posted pins to prevent duplicates

---

## NOTES FOR CLAUDE CODE IMPLEMENTATION

When implementing this as an automated system:

1. **File structure:**
   - `config.yaml` — Brand configuration (the variables above)
   - `boards.py` — Board creation and management
   - `content.py` — Pin content generation (titles, descriptions)
   - `images.py` — Pin image generation
   - `scheduler.py` — Posting schedule logic
   - `api.py` — Pinterest API wrapper (auth, post, refresh)
   - `monitor.py` — Analytics pulling and reporting
   - `main.py` — Orchestrator that runs the full pipeline

2. **Dependencies:**
   - `requests` for API calls
   - `Pillow` for image generation
   - `schedule` or `APScheduler` for cron-like scheduling
   - `pyyaml` for config parsing
   - `sqlite3` or similar for local pin database

3. **Token management:**
   - Store token securely (environment variable or encrypted config)
   - Implement auto-refresh 5 days before 30-day expiration
   - Log all token refresh events

4. **Image hosting:**
   - Pin images must be hosted at a publicly accessible URL
   - Options: upload to Shopify CDN, Cloudinary, AWS S3, or similar
   - The `media_source.url` in the API call must point to this hosted URL

5. **Testing flow:**
   - First run with Trial access (pins visible only to you)
   - Verify all boards created correctly
   - Verify pin content, images, and links are correct
   - Then request Standard access for public visibility
   - Re-run with Standard access for live operation
