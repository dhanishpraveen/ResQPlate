from datetime import datetime, timezone, timedelta

from .matching import Demand, MatchCandidate, rank_matches


def test_matches_rank_confirmed_full_quantity_before_predicted_partial() -> None:
    demand = Demand(10, "prepared_meal", datetime(2026, 10, 30, tzinfo=timezone.utc), "servings")
    results = rank_matches(
        demand,
        [
            MatchCandidate("partial", "prepared_meal", 5, "servings", datetime(2026, 10, 29, tzinfo=timezone.utc), False),
            MatchCandidate("full", "prepared_meal", 20, "servings", datetime(2026, 10, 29, tzinfo=timezone.utc), True),
        ],
    )
    assert results[0].candidate_id == "full"
    assert results[0].allocatable_quantity == 10


def test_late_candidate_is_rejected_without_fabricated_travel_time() -> None:
    demand = Demand(10, "salad", datetime(2026, 10, 30, tzinfo=timezone.utc), "servings")
    result = rank_matches(
        demand,
        [MatchCandidate("late", "salad", 10, "servings", datetime(2026, 10, 31, tzinfo=timezone.utc), True)],
    )[0]
    assert result.feasible is False
    assert "after the NGO deadline" in result.explanation[0]


def test_configured_travel_time_can_make_candidate_infeasible() -> None:
    demand = Demand(10, "salad", datetime(2026, 10, 30, 12, tzinfo=timezone.utc), "servings")
    result = rank_matches(
        demand,
        [MatchCandidate("route", "salad", 10, "servings", datetime(2026, 10, 30, 11, 30, tzinfo=timezone.utc), True, travel_minutes=45)],
    )[0]
    assert result.feasible is False
    assert "travel time" in result.explanation[0]
