#!/bin/sh
set -e

# Wait for Postgres to be ready (simple check)
echo "Waiting for PostgreSQL to start..."
# In a real scenario, you might use 'wait-for-it' or similar, 
# but for now we assume Docker's depends_on + healthcheck handles most of it.

# Run database migrations
echo "Running database schema push..."
# We use db:push for simplicity in this project phase. 
# For strict production, 'migrate' is often preferred, but db:push works for 'Clone & Go'.
pnpm --filter @oslsr/api db:push

# Start the application
echo "Starting API..."
exec node dist/index.js
