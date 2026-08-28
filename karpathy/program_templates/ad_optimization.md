# Karpathy Program: Ad Optimization

## Metric
- **Primary**: CTR (Click-Through Rate, %, higher is better) OR ROAS (Return on Ad Spend, ratio, higher is better)
- **Secondary**: CPC (cost per click, lower), CPM (cost per mille, lower), conversion rate (%, higher), CPA (cost per acquisition, lower)

## Measurement Command
```bash
# Option A: Facebook Ads API (via MCP or direct)
# Query campaign metrics for the last 24h
# Parse: CTR, CPC, impressions, clicks, conversions

# Option B: Google Ads API
# Similar metric extraction

# Option C: Manual input (semi-automated)
# Prompt user to paste current metrics from ads dashboard
# Parse and compare

# Option D: Analytics-based (if tracking pixel data available)
# Query analytics for conversion events attributed to ad campaigns
```

## Target "Files" (modifiable)
In ad optimization, "files" maps to ad components:
- **Ad copy**: Headlines, descriptions, CTAs
- **Creative assets**: Images, videos, carousel cards
- **Targeting**: Audience segments, demographics, interests, lookalikes
- **Bidding**: Strategy (CBO, ABO), bid caps, budget allocation
- **Landing pages**: The page the ad links to (web performance crossover)
- **Ad format**: Single image vs carousel vs video vs collection

## Invariants (do NOT modify)
- Brand guidelines (logo, colors, tone)
- Legal disclaimers and compliance text
- Tracking/attribution setup
- Payment/billing configuration
- Account structure (campaigns, ad sets hierarchy)

## Experiment Ideas (priority order)
1. **Headline variants**: Test benefit-driven vs curiosity-driven vs urgency headlines
2. **CTA buttons**: Test different call-to-action text
3. **Image variants**: Test lifestyle vs product-focused vs UGC-style images
4. **Audience refinement**: Narrow or broaden targeting based on performance data
5. **Copy length**: Test short punchy vs detailed descriptive copy
6. **Social proof**: Add/remove testimonials, ratings, user counts
7. **Offer framing**: Test discount % vs dollar amount vs free shipping
8. **Ad format**: Test carousel vs single image vs video
9. **Placement optimization**: Feed vs stories vs reels vs audience network
10. **Dayparting**: Test different time-of-day scheduling

## A/B Testing Protocol
- Run each variant for minimum 24h or 1000 impressions (whichever comes first)
- Statistical significance: require 95% confidence before declaring winner
- Always keep a control (current best performer)
- Test ONE variable at a time
- Document: hypothesis, variant description, sample size, result, confidence level

## Integration with Heatmaps
If landing page heatmap data is available:
- Optimize landing page based on click/scroll patterns
- Match ad message to above-fold landing page content
- Reduce friction points identified by rage-click data
- Test landing page variants alongside ad variants (full-funnel optimization)
