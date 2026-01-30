"""Dagster definitions for llm-benchmarks."""

from dagster import Definitions, EnvVar

from .jobs import echo_test_job
from .resources import GitHubActionsResource
from .schedules import echo_test_schedule

defs = Definitions(
    jobs=[echo_test_job],
    schedules=[echo_test_schedule],
    resources={
        "github": GitHubActionsResource(
            github_token=EnvVar("GITHUB_TOKEN"),
        ),
    },
)
