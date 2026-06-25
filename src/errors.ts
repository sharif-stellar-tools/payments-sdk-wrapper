export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

# Fix for issue #80
import os

def validate_config():
    required_vars = ['DATABASE_URL', 'API_KEY', 'SECRET_KEY']
    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        raise EnvironmentError(f'Missing required env vars: {missing}')

validate_config()
