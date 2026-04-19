"""Process-wide singletons for real-time features (WebSocket broadcasts, rate limiting).

Extracted so routers can import these without creating a circular dependency on main.py.
"""
from collections import defaultdict
import time as _time
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    """In-process WebSocket broadcaster. Safe for a single-worker deployment."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        try:
            self.active_connections.remove(websocket)
        except ValueError:
            pass

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


class LoginRateLimiter:
    """Limits login attempts per IP address to prevent brute-force attacks."""
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: Dict[str, list] = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = _time.time()
        cutoff = now - self.window_seconds
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
        return len(self._attempts[key]) >= self.max_attempts

    def record_attempt(self, key: str) -> None:
        self._attempts[key].append(_time.time())

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)


# Process-wide singletons (imported by main.py and any router that needs them)
manager = ConnectionManager()
login_limiter = LoginRateLimiter(max_attempts=5, window_seconds=300)
