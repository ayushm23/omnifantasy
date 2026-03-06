-- Migration: add league_emoji to leagues table
-- Run this in Supabase SQL Editor after database-migration-league-chat.sql
--
-- Adds a customizable emoji field so commissioners can personalize their league card.
-- Defaults to '🏆' so existing leagues get a sensible fallback automatically.

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS league_emoji TEXT DEFAULT '🏆';
