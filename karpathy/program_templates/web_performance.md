# Karpathy Program: Web Performance

## Metric
- **Primary**: Lighthouse Performance Score (0-100, higher is better)
- **Secondary**: LCP (ms, lower), CLS (score, lower), FID/INP (ms, lower), bundle size (KB, lower)

## Measurement Command
```bash
# Option A: Lighthouse CLI
npx lighthouse <URL> --output=json --quiet --chrome-flags="--headless" | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('lighthouse_perf:', r.categories.performance.score * 100);
  console.log('lcp_ms:', r.audits['largest-contentful-paint'].numericValue);
  console.log('cls:', r.audits['cumulative-layout-shift'].numericValue);
  console.log('tbt_ms:', r.audits['total-blocking-time'].numericValue);
"

# Option B: Bundle size only
npm run build 2>&1 && du -sb dist/ | awk '{print "bundle_bytes:", $1}'

# Option C: Web Vitals from real data (if analytics available)
# Parse from analytics API
```

## Target Files (modifiable)
- Components (`.tsx`, `.jsx`, `.vue`, `.svelte`)
- Stylesheets (`.css`, `.scss`, `.module.css`)
- Configuration (`next.config.js`, `vite.config.ts`, `webpack.config.js`)
- Image assets (optimize, convert to WebP/AVIF, add lazy loading)
- Route definitions and code splitting boundaries

## Invariants (do NOT modify)
- API endpoints and business logic
- Database schemas
- Authentication flows
- Test files (unless the experiment IS about tests)

## Experiment Ideas (priority order)
1. Image optimization: compress, convert to modern formats, lazy-load below-fold
2. Code splitting: dynamic imports for heavy routes/components
3. Bundle analysis: remove unused dependencies, tree-shake
4. Critical CSS: inline above-fold styles, defer rest
5. Font optimization: subset, preload, font-display swap
6. Caching headers: service worker, static asset caching
7. Preloading: prefetch critical resources, preconnect to origins
8. Component optimization: memo, virtualization, debounce
9. Third-party scripts: defer, async, remove unused trackers
10. Server-side: SSR/SSG for critical pages, edge functions

## Heatmap Integration
If heatmap data is available:
- Prioritize optimizing components in high-click areas
- Lazy-load components in low-engagement areas
- Use scroll depth data to define above/below fold boundaries
- A/B test layout changes based on click patterns
