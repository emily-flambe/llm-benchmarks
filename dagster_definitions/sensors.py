"""Sensor that polls the benchmark API and triggers GitHub Actions workflows."""

import json
from datetime import datetime, timezone

from dagster import sensor, SensorEvaluationContext, SkipReason

from .resources import BenchmarkApiResource, GitHubActionsResource, MODEL_WORKFLOWS


def cron_matches(cron_expression: str, dt: datetime) -> bool:
    """
    Check if a cron expression matches the given datetime.
    Supports: *, specific values, ranges (1-5), lists (1,3,5), steps (*/5)
    """
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        return False

    minute, hour, day, month, weekday = parts

    def matches_field(field: str, value: int, max_val: int) -> bool:
        if field == "*":
            return True
        if "/" in field:
            base, step = field.split("/")
            step = int(step)
            if base == "*":
                return value % step == 0
            return False
        if "-" in field:
            start, end = map(int, field.split("-"))
            return start <= value <= end
        if "," in field:
            return value in [int(x) for x in field.split(",")]
        return value == int(field)

    # Convert Python weekday (0=Monday) to cron weekday (0=Sunday)
    cron_weekday = (dt.weekday() + 1) % 7

    return (
        matches_field(minute, dt.minute, 59)
        and matches_field(hour, dt.hour, 23)
        and matches_field(day, dt.day, 31)
        and matches_field(month, dt.month, 12)
        and matches_field(weekday, cron_weekday, 6)
    )


@sensor(minimum_interval_seconds=60)
def benchmark_schedule_sensor(
    context: SensorEvaluationContext,
    benchmark_api: BenchmarkApiResource,
    github: GitHubActionsResource,
):
    """
    Polls the benchmark API for active schedules and triggers GitHub Actions
    when cron expressions match the current time.

    All schedule configuration comes from D1 via the API - no code changes
    needed when schedules are updated in the UI.
    """
    now = datetime.now(timezone.utc)
    current_minute = now.strftime("%Y-%m-%d-%H-%M")

    # Load cursor (tracks which schedules we've triggered this minute)
    cursor = json.loads(context.cursor or "{}")

    # Clean up old cursor entries (older than 1 hour)
    cutoff = now.strftime("%Y-%m-%d-%H")
    cursor = {k: v for k, v in cursor.items() if k.startswith(cutoff) or k > cutoff[:10]}

    try:
        schedules = benchmark_api.get_schedules()
    except Exception as e:
        context.log.error(f"Failed to fetch schedules: {e}")
        return SkipReason(f"API error: {e}")

    triggered = []

    for schedule in schedules:
        # Skip paused schedules
        if schedule.get("is_paused"):
            continue

        model_id = schedule.get("model_id")
        cron_expr = schedule.get("cron_expression")

        if not model_id or not cron_expr:
            continue

        # Check if cron matches current time
        if not cron_matches(cron_expr, now):
            continue

        # Deduplication: don't trigger same schedule twice in same minute
        dedup_key = f"{current_minute}:{model_id}"
        if dedup_key in cursor:
            context.log.debug(f"Skipping {model_id} - already triggered this minute")
            continue

        # Get workflow file for this model
        workflow_file = MODEL_WORKFLOWS.get(model_id)
        if not workflow_file:
            context.log.warning(f"No workflow configured for model: {model_id}")
            continue

        # Trigger the workflow
        try:
            sample_size = schedule.get("sample_size") or 0
            inputs = {
                "sample_size": str(sample_size),
                "trigger_source": "dagster",
            }

            # For echo-test, use message instead of sample_size
            if model_id == "echo-test":
                inputs = {"message": f"Triggered by Dagster at {now.isoformat()}"}

            result = github.trigger_workflow(workflow_file, inputs=inputs)
            context.log.info(f"Triggered {model_id} ({workflow_file}): {result}")
            triggered.append(model_id)
            cursor[dedup_key] = True

        except Exception as e:
            context.log.error(f"Failed to trigger {model_id}: {e}")

    # Update cursor
    context.update_cursor(json.dumps(cursor))

    if triggered:
        return None  # Success, runs were triggered
    else:
        return SkipReason("No schedules matched current time")
