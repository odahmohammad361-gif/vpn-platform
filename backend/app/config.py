from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str
    SUBSCRIPTION_BASE_URL: str = "http://52.77.235.166:8080"
    USDT_WALLET: str = ""
    BINANCE_API_KEY: str = ""
    BINANCE_API_SECRET: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_IDS: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
