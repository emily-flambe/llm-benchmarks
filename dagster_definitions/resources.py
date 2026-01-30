"""Resources for triggering GitHub Actions workflows."""

import json
import urllib.request
import urllib.error
from typing import Optional

from dagster import ConfigurableResource


class GitHubActionsResource(ConfigurableResource):
    """Resource for triggering GitHub Actions workflows."""

    github_token: str
    owner: str = "emily-flambe"
    repo: str = "llm-benchmarks"

    def trigger_workflow(
        self, workflow_id: str, ref: str = "main", inputs: Optional[dict] = None
    ) -> dict:
        """Trigger a GitHub Actions workflow via workflow_dispatch."""
        url = f"https://api.github.com/repos/{self.owner}/{self.repo}/actions/workflows/{workflow_id}/dispatches"

        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.github_token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        }

        payload = {"ref": ref}
        if inputs:
            payload["inputs"] = inputs

        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                # workflow_dispatch returns 204 No Content on success
                return {"status": "triggered", "workflow_id": workflow_id, "inputs": inputs}
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"GitHub API error: {e.code} - {e.read().decode()}")
