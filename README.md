# LLM Benchmarks

Track LLM code generation quality over time using [LiveCodeBench](https://livecodebench.github.io/).

**Live**: [benchmarks.emilycogsdill.com](https://benchmarks.emilycogsdill.com)

## Models Tracked

- Claude Opus 4.5
- Claude Sonnet 4
- GPT-4.1
- GPT-5.1
- GPT-5.2
- o3

## Architecture

```
GitHub Actions               Cloudflare Workers + D1
┌─────────────────────┐      ┌─────────────────────┐
│ Fetch problems      │      │ Store results       │
│ Call model API      │─────▶│ Serve dashboard     │
│ Execute code        │      │ Trigger workflows   │
│ Score pass@1        │      │ Manage schedules    │
└─────────────────────┘      └─────────────────────┘
```

- **GitHub Actions**: Runs benchmarks per model (executes Python for scoring)
- **Cloudflare Workers**: REST API, React dashboard, schedule management
- **Durable Objects**: Deduplicates scheduled runs across Worker instances

## Dashboard Features

- **ScoreCard**: Aggregated pass@1 scores with date range filtering
- **RankChart**: Bar chart comparing models, sorted by score
- **TrendChart**: Line chart showing score trends over 30 days
- **CostSummary**: API costs (authenticated users only)
- **Model filter pills**: Toggle model visibility across all charts
- **Run History**: View past GitHub Actions workflow runs
- **Schedules**: Configure cron-based benchmark schedules

## Benchmark: LiveCodeBench

| | |
|---|---|
| **Problems** | ~400 (LeetCode, AtCoder, CodeForces) |
| **Metric** | pass@1 (code passes all tests on first try) |
| **Why** | Contamination-resistant, continuously updated |

## Tech Stack

- **Benchmark runner**: GitHub Actions (Python)
- **API**: Cloudflare Workers (Hono)
- **Frontend**: React + Recharts
- **Database**: Cloudflare D1
- **Scheduling**: Durable Objects + cron triggers

## Dagster Integration

This repo includes Dagster definitions for scheduled job orchestration via the home PC Dagster instance.

### Structure

```
dagster_definitions/
├── __init__.py
├── definitions.py    # Main Definitions export
├── jobs.py           # Job that triggers GitHub Actions
├── schedules.py      # Cron schedules (disabled by default)
└── resources.py      # GitHubActionsResource for API calls
```

### Adding to Dagster Instance

1. **Add to workspace.yaml** in WSL2 (`/opt/dagster/dagster_home/workspace.yaml`):

   ```yaml
   - python_module:
       module_name: dagster_definitions.definitions
       working_directory: /mnt/c/Users/emily/Documents/GitHub/llm-benchmarks
       location_name: llm_benchmarks
   ```

   Uses `python_module` (not `python_file`) because the code uses relative imports across multiple files.

2. **Add GITHUB_TOKEN** to both service files:

   Edit `/etc/systemd/system/dagster-webserver.service` and `/etc/systemd/system/dagster-daemon.service`, adding under `[Service]`:

   ```ini
   Environment=GITHUB_TOKEN=ghp_xxx
   ```

   Token needs `repo` and `actions:write` scopes. Both services need it because they both spawn code location subprocesses.

3. **Restart services:**

   ```bash
   wsl -d Ubuntu -e sudo systemctl daemon-reload
   wsl -d Ubuntu -e sudo systemctl restart dagster-webserver dagster-daemon
   ```

4. **Enable schedule** in Dagster UI at http://pceus:3000

### Available Schedules

| Schedule | Cron | Default | Description |
|----------|------|---------|-------------|
| `echo_test_job_schedule` | `* * * * *` | Stopped | Triggers echo-test workflow every minute |

## Related

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - LLM response collection
- [dagster](https://github.com/emily-flambe/dagster) - Dagster PC infrastructure docs
