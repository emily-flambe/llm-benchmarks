.PHONY: setup dev test deploy db-migrate db-migrate-local typecheck clean

# Install dependencies
setup:
	npm install

# Run development server
dev:
	npm run dev

# Run tests
test:
	npm run test

# Run type checking
typecheck:
	npm run typecheck

# Deploy to Cloudflare
deploy:
	npm run deploy

# Run database migrations (production)
db-migrate:
	npm run db:migrate

# Run database migrations (local)
db-migrate-local:
	npm run db:migrate:local

# Create D1 database (run once during initial setup)
db-create:
	wrangler d1 create llm-benchmarks-db

# Set admin API key secret
set-secret:
	@echo "Enter your ADMIN_API_KEY:"
	@wrangler secret put ADMIN_API_KEY

# Clean build artifacts
clean:
	rm -rf node_modules dist .wrangler

# Full setup from scratch
init: setup db-create db-migrate-local
	@echo "Setup complete. Update wrangler.toml with your database_id."
	@echo "Then run 'make set-secret' to configure ADMIN_API_KEY."

# Development workflow
start: setup db-migrate-local dev
