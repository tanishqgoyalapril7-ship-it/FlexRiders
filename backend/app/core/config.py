from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "Super Riders API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "super-riders-secret-key-production-change-this-in-prod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # Database
    DATABASE_URL: str = f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'super_riders.db')}"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "*",
    ]

    # Cloud Storage / Documents
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = "super-riders-documents"

    # Business Config
    MULTI_BRAND_ASSIGNMENT: bool = False
    ENABLE_OTP_LOGIN: bool = True
    MOCK_OTP_CODE: str = "123456"

    # Uploads directory for local dev
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
