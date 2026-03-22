"""initial schema

Revision ID: 001
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users",
        sa.Column("id",                 UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("username",           sa.String(128),  unique=True, nullable=False),
        sa.Column("email",              sa.String(255),  unique=True),
        sa.Column("subscription_token", UUID(as_uuid=True), unique=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("is_active",          sa.Boolean,      default=True, nullable=False),
        sa.Column("disabled_reason",    sa.String(64)),
        sa.Column("quota_bytes",        sa.BigInteger,   default=0),
        sa.Column("bytes_used",         sa.BigInteger,   default=0),
        sa.Column("expires_at",         sa.DateTime(timezone=True)),
        sa.Column("notes",              sa.Text),
        sa.Column("created_at",         sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",         sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table("servers",
        sa.Column("id",               UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name",             sa.String(128), nullable=False),
        sa.Column("host",             sa.String(255), nullable=False),
        sa.Column("api_port",         sa.Integer,     default=8080),
        sa.Column("agent_secret",     sa.Text,        nullable=False),
        sa.Column("port_range_start", sa.Integer,     default=20000),
        sa.Column("port_range_end",   sa.Integer,     default=29999),
        sa.Column("method",           sa.String(64),  default="chacha20-ietf-poly1305"),
        sa.Column("is_active",        sa.Boolean,     default=True),
        sa.Column("last_seen_at",     sa.DateTime(timezone=True)),
        sa.Column("created_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table("user_servers",
        sa.Column("id",         UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id",    UUID(as_uuid=True), sa.ForeignKey("users.id",   ondelete="CASCADE"), nullable=False),
        sa.Column("server_id",  UUID(as_uuid=True), sa.ForeignKey("servers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("port",       sa.Integer, nullable=False),
        sa.Column("password",   sa.Text,    nullable=False),
        sa.Column("is_synced",  sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("server_id", "port"),
        sa.UniqueConstraint("user_id",   "server_id"),
    )

    op.create_table("traffic_logs",
        sa.Column("id",               sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_server_id",   UUID(as_uuid=True), sa.ForeignKey("user_servers.id"), nullable=False),
        sa.Column("upload_bytes",     sa.BigInteger, default=0),
        sa.Column("download_bytes",   sa.BigInteger, default=0),
        sa.Column("reported_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("agent_interval_sec", sa.Integer, default=30),
    )

    op.create_table("daily_traffic",
        sa.Column("id",             sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id",        UUID(as_uuid=True), sa.ForeignKey("users.id"),   nullable=False),
        sa.Column("server_id",      UUID(as_uuid=True), sa.ForeignKey("servers.id"), nullable=False),
        sa.Column("date",           sa.Date,       nullable=False),
        sa.Column("upload_bytes",   sa.BigInteger, default=0),
        sa.Column("download_bytes", sa.BigInteger, default=0),
        sa.UniqueConstraint("user_id", "server_id", "date"),
    )

    # Indexes
    op.create_index("idx_users_token",     "users",         ["subscription_token"])
    op.create_index("idx_users_active",    "users",         ["is_active"])
    op.create_index("idx_us_user",         "user_servers",  ["user_id"])
    op.create_index("idx_daily_user_date", "daily_traffic", ["user_id", "date"])


def downgrade():
    op.drop_table("daily_traffic")
    op.drop_table("traffic_logs")
    op.drop_table("user_servers")
    op.drop_table("servers")
    op.drop_table("users")
