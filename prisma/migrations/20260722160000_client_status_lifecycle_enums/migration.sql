-- Extend ClientStatus. Must commit before new values are used in DML.
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'PROSPECT';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'OFFBOARDED';
