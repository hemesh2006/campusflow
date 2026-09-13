"""Thin async client for a local Ollama server (https://ollama.com).

Nothing here is a hosted API — Ollama must actually be running on this
machine (or wherever OLLAMA_HOST points):

    ollama serve
    ollama pull llama3.2   # or whatever model you want to offer

Every failure mode (server not running, model not pulled, bad
response) is turned into a clear OllamaError instead of a raw
connection traceback bubbling up to the frontend, since "Ollama isn't
running" is by far the most common failure here.
"""
import httpx
from campusflow.backend.app.config import settings


class OllamaError(Exception):
    pass


async def list_models() -> list[dict]:
    """GET /api/tags — every model currently pulled on this Ollama host."""
    url = f"{settings.ollama_host}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data.get("models", [])
    except httpx.RequestError as e:
        raise OllamaError(
            f"Could not reach Ollama at {settings.ollama_host} — is `ollama serve` running?"
        ) from e
    except httpx.HTTPStatusError as e:
        raise OllamaError(f"Ollama returned an error: {e.response.status_code}") from e


async def chat(model: str, messages: list[dict], temperature: float = 0.4) -> str:
    """POST /api/chat (non-streaming). messages is the standard
    [{"role": "system"|"user"|"assistant", "content": str}, ...] shape."""
    if not model:
        raise OllamaError("No model selected — ask an admin to pick one in Agent manager.")

    url = f"{settings.ollama_host}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return (data.get("message") or {}).get("content", "").strip()
    except httpx.RequestError as e:
        raise OllamaError(
            f"Could not reach Ollama at {settings.ollama_host} — is `ollama serve` running?"
        ) from e
    except httpx.HTTPStatusError as e:
        detail = e.response.text[:200]
        if e.response.status_code == 404:
            raise OllamaError(
                f"Model \"{model}\" isn't pulled on this Ollama host — run `ollama pull {model}`."
            ) from e
        raise OllamaError(f"Ollama returned an error ({e.response.status_code}): {detail}") from e
