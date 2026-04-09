import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str
    upload_dir: str = os.path.join(os.path.dirname(__file__), "uploads")
    fonts_dir: str = os.path.join(os.path.dirname(__file__), "fonts")

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env")
    )


settings = Settings()
