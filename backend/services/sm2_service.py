"""SuperMemo-2 (SM-2) Spaced Repetition Scheduling Service for Mneme.

Implements the peer-reviewed mathematical spaced repetition algorithm
established by P. A. Wozniak (1990) and empirically validated by
Cepeda et al. (2006, 2008).

Formulation:
- Ease Factor (EF): Reflects card difficulty, bounded below by 1.3.
- Repetition (n): Consecutive successful recall count.
- Interval (I): Delay in days before the next active recall review.
- Quality (q): Student response grade (1: Again, 3: Hard, 4: Good, 5: Easy).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple


MINIMUM_EASE_FACTOR = 1.3
DEFAULT_EASE_FACTOR = 2.5


def parse_utc_iso(iso_str: Optional[str]) -> datetime:
    """Parse ISO timestamp safely, defaulting to current UTC time on failure."""
    if not iso_str:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


def calculate_sm2_review(
    card: Dict[str, Any],
    rating: str,
    quality: Optional[int] = None,
    review_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Calculate updated SuperMemo-2 (SM-2) spaced repetition parameters.
    
    Ratings:
      - 'again' (q=1): Complete recall failure, lapses incremented, interval resets to 1.
      - 'hard'  (q=3): Correct response with serious effort/hesitation, small interval increase.
      - 'good'  (q=4): Correct recall under normal retrieval effort, standard SM-2 multiplier.
      - 'easy'  (q=5): Effortless instantaneous retrieval, bonus interval multiplier.
    """
    if review_time is None:
        review_time = datetime.now(timezone.utc)

    # Resolve quality grade q in [1..5]
    rating_lower = (rating or "good").strip().lower()
    if quality is not None and 0 <= quality <= 5:
        q = quality
    elif rating_lower == "again":
        q = 1
    elif rating_lower == "hard":
        q = 3
    elif rating_lower == "easy":
        q = 5
    else:
        q = 4  # default "good"

    # Extract current parameters with sane defaults
    repetition = int(card.get("repetition", 0))
    interval_days = float(card.get("interval_days", 1.0))
    ease_factor = float(card.get("ease_factor", DEFAULT_EASE_FACTOR))
    lapses = int(card.get("lapses", 0))
    review_count = int(card.get("review_count", 0)) + 1

    # Update Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    # Wozniak (1990) formula
    ef_delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
    new_ease_factor = max(MINIMUM_EASE_FACTOR, round(ease_factor + ef_delta, 2))

    # Compute new repetition count and interval
    if q < 3:
        # Failure / "Again": reset repetition count, interval collapses to 1 day
        new_repetition = 0
        new_interval_days = 1.0
        new_lapses = lapses + 1
        new_mastery = 0
    else:
        # Successful recall (q >= 3)
        if repetition == 0:
            new_interval_days = 1.0
        elif repetition == 1:
            new_interval_days = 6.0
        else:
            if q == 3:  # Hard
                multiplier = 1.2
            elif q == 5:  # Easy
                multiplier = new_ease_factor * 1.3
            else:  # Good (q == 4)
                multiplier = new_ease_factor

            new_interval_days = max(interval_days + 1.0, round(interval_days * multiplier, 1))

        new_repetition = repetition + 1
        new_lapses = lapses
        new_mastery = min(5, new_repetition)

    # Next review timestamp
    next_review_utc = review_time + timedelta(days=new_interval_days)

    return {
        "repetition": new_repetition,
        "interval_days": new_interval_days,
        "ease_factor": new_ease_factor,
        "lapses": new_lapses,
        "mastery": new_mastery,
        "review_count": review_count,
        "last_reviewed_utc": review_time.isoformat(),
        "next_review_utc": next_review_utc.isoformat(),
    }


def is_card_due(card: Dict[str, Any], as_of: Optional[datetime] = None) -> bool:
    """Determine if a flashcard is currently due for active recall review."""
    if as_of is None:
        as_of = datetime.now(timezone.utc)

    next_review_str = card.get("next_review_utc")
    if not next_review_str:
        # Never scheduled or new card => due immediately
        return True

    next_review = parse_utc_iso(next_review_str)
    # Due if next review time is on or before current time
    return next_review <= as_of

