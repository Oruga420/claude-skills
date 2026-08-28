# Karpathy Program: ML Training (Local GPU)

## Overview

This template runs actual ML training experiments on the local GPU, following
the original autoresearch methodology. The agent modifies `train.py`, trains
a small GPT model, measures val_bpb, and keeps/discards based on results.

## Hardware Profile

Detect GPU at startup:
```bash
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader
```

### Tuning for Laptop GPUs (4-12GB VRAM)

Apply these adjustments to `train.py` defaults:

```python
# For ~8GB VRAM (RTX 5060, RTX 4070, etc.)
DEPTH = 4                    # fewer layers
ASPECT_RATIO = 48            # narrower model
HEAD_DIM = 64                # smaller heads
VOCAB_SIZE = 4096            # smaller vocabulary
MAX_SEQ_LEN = 512            # shorter context
TOTAL_BATCH_SIZE = 2**15     # ~32K tokens per step
DEVICE_BATCH_SIZE = 32       # fits in VRAM
WINDOW_PATTERN = "L"         # full attention only (skip sliding window)
TIME_BUDGET = 300            # 5 min per experiment (same as original)

# For ~4GB VRAM (RTX 3050, GTX 1650, etc.)
DEPTH = 3
ASPECT_RATIO = 32
VOCAB_SIZE = 2048
MAX_SEQ_LEN = 256
TOTAL_BATCH_SIZE = 2**14
DEVICE_BATCH_SIZE = 16
```

## Metric
- **Primary**: val_bpb (bits per byte, lower is better)
- **Secondary**: peak_vram_mb, mfu_percent, training_seconds, total_tokens_M

## Measurement Command
```bash
# Run training with time budget
uv run train.py 2>&1 | tee run.log

# Parse output — the last block contains metrics:
# val_bpb:          X.XXXXXX
# training_seconds: XXX.X
# peak_vram_mb:     XXXX.X
# mfu_percent:      XX.XX
```

## Setup (one-time)
```bash
# Clone autoresearch
git clone https://github.com/karpathy/autoresearch.git
cd autoresearch

# Install dependencies
pip install uv  # or: curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync

# Download data and train tokenizer
uv run prepare.py --num-shards 5  # fewer shards for laptop

# Verify baseline runs
uv run train.py
```

## Target Files (modifiable)
- `train.py` — THE ONLY file to modify (architecture, hyperparameters, optimizer, training loop)

## Invariants (do NOT modify)
- `prepare.py` — data loading and evaluation (ground truth)
- `evaluate_bpb()` function — the metric function
- Downloaded data shards
- Tokenizer

## Experiment Ideas (priority order for small models)

### Architecture
1. Adjust DEPTH vs width ratio (deeper vs wider for same param count)
2. Try different HEAD_DIM values (64 vs 128)
3. Modify WINDOW_PATTERN schedule
4. Toggle value embeddings on/off
5. Experiment with n_head vs n_kv_head ratio (GQA)

### Optimization
1. Learning rate sweep (MATRIX_LR: 0.02, 0.04, 0.08)
2. Warmup ratio adjustments
3. Weight decay tuning
4. Adam beta values
5. Batch size vs learning rate scaling

### Training Dynamics
1. Warmdown ratio (0.3 vs 0.5 vs 0.7)
2. Final LR fraction
3. Gradient accumulation steps
4. Mixed precision settings

## VRAM Management

The executor MUST monitor VRAM:
- If experiment OOMs: reduce DEVICE_BATCH_SIZE by half and retry ONCE
- If still OOMs: discard experiment, note VRAM limit in learnings
- Track peak_vram_mb — reject experiments that use >90% available VRAM
- Prefer experiments that maintain or reduce VRAM while improving val_bpb

## Integration with /karpathy Loop

The standard karpathy loop applies:
1. Researcher proposes a train.py modification
2. Executor implements it, runs `uv run train.py`, captures metrics
3. Analyst compares val_bpb: keep if improved >0.1%, discard otherwise
4. Higher threshold (0.1% vs 0.5%) because BPB changes are small
5. All experiments logged to results.tsv

## Expected Performance

On a laptop with RTX 5060 (8GB):
- ~12 experiments per hour (5 min each)
- ~100 experiments overnight (8 hours)
- Baseline val_bpb will be higher than H100 (smaller model = worse)
- But the RELATIVE improvements are what matter
