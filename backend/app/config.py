from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "campusflow"
    jwt_secret: str = "change-this-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:5173"
    dev_mode: bool = False  # enables /dev/* no-password login for local testing only — NEVER true in prod

    # Personal assistant agent — talks to a local Ollama server.
    # Install Ollama, run `ollama serve`, and `ollama pull <model>` at
    # least once. The active model is admin-selectable at runtime (see
    # /assistant/model) and stored in Mongo; this is only the fallback
    # used the very first time, before an admin has picked one.
    ollama_host: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.2"
    ollama_timeout_seconds: float = 60.0

    class Config:
        env_file = ".env"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
