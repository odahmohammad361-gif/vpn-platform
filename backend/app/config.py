from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str

    class Config:
        env_file = ".env"

settings = Settings()
