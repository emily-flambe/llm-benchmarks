"""Schedules for benchmark jobs."""

from dagster import DefaultScheduleStatus, ScheduleDefinition

from .jobs import echo_test_job

# Schedule that runs every minute - can be toggled on/off in Dagster UI
echo_test_schedule = ScheduleDefinition(
    job=echo_test_job,
    cron_schedule="* * * * *",  # Every minute
    execution_timezone="UTC",
    default_status=DefaultScheduleStatus.STOPPED,  # Start disabled, enable via UI
)
