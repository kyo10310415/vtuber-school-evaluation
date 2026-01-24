#!/bin/bash

# PostgreSQL Migration Script for Analytics History

DATABASE_URL="${DATABASE_URL}"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "🔧 Running migration: 001_create_analytics_history.sql"
echo "📊 Database: $(echo $DATABASE_URL | sed 's/postgres:\/\/\([^:]*\):\([^@]*\)@/postgres:\/\/\1:***@/')"

psql "$DATABASE_URL" < migrations/001_create_analytics_history.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully"
else
  echo "❌ Migration failed"
  exit 1
fi
