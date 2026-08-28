# Karpathy: Local Learning Layer (GPU-Accelerated)

## Overview

This is NOT a standalone template — it's a **cross-cutting layer** that any domain template
can activate. It uses the local GPU to train a small model that learns from experiment
history and predicts which future experiments are most likely to succeed.

The more experiments you run, the smarter the predictions get.

## How It Works

```
TRADITIONAL LOOP:
  researcher proposes → executor tries → analyst evaluates → repeat
  (researcher relies on heuristics and web search)

WITH LEARNING LAYER:
  mini-model trained on results.tsv → predicts experiment outcomes →
  researcher uses predictions to prioritize → executor tries →
  analyst evaluates → results feed back into training → repeat
  (researcher has a local oracle that improves over time)
```

## Architecture

### The Mini Model

A tiny neural network trained on YOUR experiment history:

```python
# Lightweight predictor — trains in seconds on laptop GPU
import torch
import torch.nn as nn

class ExperimentPredictor(nn.Module):
    """Predicts whether a proposed experiment will improve the metric."""

    def __init__(self, feature_dim=64, hidden_dim=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.net(x)  # P(keep) for this experiment

# Training: ~5 seconds on any GPU
# Input features: encoded experiment description + current metrics
# Output: probability that experiment will be kept (improve metric)
```

### Feature Engineering

Each experiment gets encoded as a feature vector from:

| Feature | Source | Encoding |
|---------|--------|----------|
| Experiment category | Description keywords | One-hot or embedding |
| Current metric value | results.tsv | Normalized float |
| Delta from baseline | results.tsv | Normalized float |
| Experiment number | Sequential count | Normalized float |
| Previous N outcomes | results.tsv | Binary sequence |
| File types modified | Git diff | One-hot |
| Change size | Lines added/removed | Normalized float |
| Similar past experiments | Cosine similarity to previous descriptions | Float |

### Training Loop

```bash
# Auto-trains after every 10 experiments (or on demand)
# Uses results.tsv as training data
# Labels: 1 = kept, 0 = discarded

python karpathy_learner.py train \
  --data results.tsv \
  --model karpathy_predictor.pt \
  --epochs 50 \
  --device cuda
# Takes ~5-10 seconds on laptop GPU
```

### Prediction

```bash
# Before each experiment, predict success probability
python karpathy_learner.py predict \
  --model karpathy_predictor.pt \
  --proposal "lazy-load hero image" \
  --current_metric 72 \
  --device cuda
# Output: P(keep) = 0.83 → high confidence, proceed
# Output: P(keep) = 0.12 → skip, try something else
```

## Integration with Each Domain

### Web Performance + Learning Layer
- Features include: component type changed, CSS vs JS vs image, above/below fold
- Model learns: "image optimizations in hero section have 80% keep rate"
- Model learns: "CSS changes to footer have 5% keep rate — skip"
- Researcher gets ranked proposals: try high-P(keep) first

### Ad Optimization + Learning Layer
- Features include: headline style, CTA type, audience segment, creative format
- Model learns: "benefit-driven headlines outperform curiosity-driven for this brand"
- Model learns: "carousel format has 3x keep rate vs single image"
- Researcher focuses budget on predicted winners

### Code Quality + Learning Layer
- Features include: file complexity, test coverage gap, module type, change pattern
- Model learns: "adding tests to utility modules improves coverage 2x vs UI components"
- Model learns: "refactoring files >500 lines has 70% keep rate"
- Researcher targets high-ROI files first

### Custom Domain + Learning Layer
- Auto-discovers which feature patterns correlate with success
- No domain knowledge needed — learns purely from experiment outcomes
- Gets more accurate as results.tsv grows (minimum 20 experiments to start)

## When to Activate

The learning layer activates automatically when:
1. GPU is available (nvidia-smi succeeds)
2. results.tsv has >= 20 experiments (enough data to train on)
3. Domain is not ML training (avoids GPU contention — ML training already uses GPU)

The lead should check these conditions at startup and after every 10 experiments.

## GPU Resource Management

When active alongside ML training:
- Learning layer uses <500MB VRAM (tiny model)
- Training takes <10 seconds (doesn't block experiment execution)
- Can run on CPU if GPU is busy with main experiment
- Priority: main experiment GPU > learning layer GPU

When active in non-ML domains:
- GPU is fully available for learning layer
- Can use larger model and more features
- Retrain after every 5 experiments instead of 10

## Files Created

```
karpathy_learner.py          # Training + prediction script
karpathy_predictor.pt        # Saved model weights
karpathy_features.json       # Feature engineering config
karpathy_predictions.log     # History of predictions vs actuals
```

## Meta-Learning: The Model Improves Itself

Every 50 experiments, the analyst checks prediction accuracy:
```
Prediction accuracy = (correct predictions) / (total predictions)
```

If accuracy > 70%: model is useful, keep using it
If accuracy < 50%: model is no better than random — retrain with different features
If accuracy drops over time: domain is shifting — reset and retrain from recent data only

The learning layer itself follows the karpathy philosophy:
**measure → keep/discard → repeat** — applied to the predictor model itself.
