import os
import sys

def ensure_secret():
    key = os.environ.get("SECRET_KEY", "").strip()
    env = os.environ.get("FLASK_ENV") or os.environ.get("ENV") or "development"
    if not key:
        if env == "production":
            print("FATAL: SECRET_KEY must be set in production", file=sys.stderr)
            sys.exit(1)
        # dev fallback only
        return "dev-only-not-for-production"
    return key
