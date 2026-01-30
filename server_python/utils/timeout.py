import asyncio
from typing import TypeVar, Coroutine, Any

T = TypeVar("T")


class TimeoutError(Exception):
    """Custom timeout error with operation context."""

    def __init__(self, operation: str, timeout_seconds: float):
        self.operation = operation
        self.timeout_seconds = timeout_seconds
        super().__init__(
            f'Operation "{operation}" timed out after {int(timeout_seconds)} seconds'
        )


async def with_timeout(
    coro: Coroutine[Any, Any, T],
    timeout_seconds: float,
    operation: str
) -> T:
    """
    Execute a coroutine with a timeout.

    Args:
        coro: The coroutine to execute
        timeout_seconds: Maximum time to wait in seconds
        operation: Description of the operation for error messages

    Returns:
        The result of the coroutine

    Raises:
        TimeoutError: If the operation exceeds the timeout
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise TimeoutError(operation, timeout_seconds)
