"""Jobs for triggering GitHub Actions workflows."""

from dagster import job, op, OpExecutionContext

from .resources import GitHubActionsResource


@op
def trigger_echo_workflow(
    context: OpExecutionContext, github: GitHubActionsResource
) -> dict:
    """Trigger the echo-test workflow in GitHub Actions."""
    context.log.info("Triggering echo-test workflow...")

    result = github.trigger_workflow(
        workflow_id="echo-test.yml",
        inputs={"message": "Hello from Dagster!"},
    )

    context.log.info(f"Workflow triggered: {result}")
    return result


@job
def echo_test_job():
    """Job that triggers the echo-test GitHub Actions workflow."""
    trigger_echo_workflow()
