# Karpathy Program: Code Quality

## Metric
- **Primary**: Choose one based on goal:
  - Test coverage (%, higher is better)
  - Build time (seconds, lower is better)
  - Bundle size (bytes, lower is better)
  - Type error count (count, lower is better)
  - Lint warning count (count, lower is better)
  - Cyclomatic complexity (average, lower is better)
- **Secondary**: All of the above that aren't primary

## Measurement Commands
```bash
# Test coverage
npm test -- --coverage --silent 2>&1 | grep "All files" | awk '{print "coverage_pct:", $10}'

# Build time
time npm run build 2>&1 | tail -1

# Bundle size
npm run build 2>&1 && find dist -type f -name "*.js" -exec du -cb {} + | tail -1 | awk '{print "js_bundle_bytes:", $1}'

# Type errors
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l | awk '{print "type_errors:", $1}'

# Lint warnings
npx eslint . --format json 2>/dev/null | node -e "
  const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const w=r.reduce((a,f)=>a+f.warningCount,0);
  const e=r.reduce((a,f)=>a+f.errorCount,0);
  console.log('lint_warnings:', w, 'lint_errors:', e);
"

# Python equivalents
pytest --cov --cov-report=term-missing -q 2>&1 | tail -1
ruff check . --statistics 2>&1
mypy . --no-error-summary 2>&1 | grep "error" | wc -l
```

## Target Files (modifiable)
- Source code files (`.ts`, `.tsx`, `.py`, `.go`, etc.)
- Configuration files (tsconfig, eslint, biome, ruff, etc.)
- Test files (when coverage is the metric)
- Build configuration (when build time is the metric)

## Invariants (do NOT modify)
- API contracts / interfaces consumed by external systems
- Database migration files already applied
- CI/CD pipeline configuration (unless that IS the experiment)
- Lock files (package-lock.json, poetry.lock)

## Experiment Ideas by Metric

### Coverage Improvement
1. Identify uncovered files (parse coverage report)
2. Add unit tests for utility functions (highest ROI)
3. Add integration tests for API endpoints
4. Add edge case tests for error handling paths
5. Mock external dependencies to enable testing

### Build Time Reduction
1. Enable persistent caching (Turbopack, SWC cache)
2. Parallelize independent build steps
3. Remove unused dependencies
4. Code split to reduce per-page compilation
5. Use incremental compilation where available

### Bundle Size Reduction
1. Tree-shake unused exports
2. Replace heavy libraries with lighter alternatives
3. Dynamic imports for below-fold features
4. Remove dead code paths
5. Optimize images and static assets at build time

### Type Safety
1. Add types to untyped modules (any → specific)
2. Enable stricter tsconfig options incrementally
3. Replace type assertions with type guards
4. Add generic types where any is used
5. Fix implicit any from untyped dependencies (@types/*)
