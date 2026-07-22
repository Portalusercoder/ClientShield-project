-- Additive AssetType values (must commit before data uses WORKSTATION)
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'WORKSTATION';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'NETWORK_DEVICE';
