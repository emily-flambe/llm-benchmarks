"""
Dagster definitions for llm-benchmarks.

This code location provides a sensor that:
1. Polls the benchmark API for schedules (stored in D1)
2. Triggers GitHub Actions workflows when cron expressions match

All schedule configuration happens in the React UI - no code changes needed
when schedules are added/modified/deleted.
"""

from dagster import Definitions, EnvVar

from .resources import BenchmarkApiResource, GitHubActionsResource
from .sensors import benchmark_schedule_sensor

defs = Definitions(
    sensors=[benchmark_schedule_sensor],
    resources={
        "benchmark_api": BenchmarkApiResource(),
        "github": GitHubActionsResource(
            github_token=EnvVar("GITHUB_TOKEN"),
        ),
    },
)
