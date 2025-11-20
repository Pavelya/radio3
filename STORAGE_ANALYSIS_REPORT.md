# Supabase Storage Analysis Report

**Date:** 2025-11-18
**Total Storage:** 2.7 GB
**Database Size:** ~7-8 MB
**Unaccounted Storage:** ~2.69 GB (likely in Supabase Storage bucket)

## Summary

The 2.7GB storage usage is almost entirely in the **Supabase Storage bucket** (`audio-assets`), NOT in the database. The database itself is only ~7-8 MB.

## Key Findings

### 1. Database is Small
- Total database size: ~7-8 MB
- Largest table: `segments` (3.3 MB, 575 rows)
- Second largest: `kb_embeddings` (1.6 MB, but 0 rows - just indexes)
- All other tables: < 1 MB each

### 2. Critical Data Inconsistency
**Problem:** 575 segments exist, but **0 have asset_id references**
- 573 segments marked as `ready` (should have audio)
- 2 segments marked as `queued`
- **0% of segments** have valid asset_id references
- **0 rows** in the `assets` table

This indicates a broken workflow where:
- Segments are created and marked "ready"
- BUT the asset creation/linking step is failing or not happening
- OR assets were deleted without updating segments

### 3. Storage Breakdown

**Database Tables:**
```
segments:           3.3 MB (575 rows)
kb_embeddings:      1.6 MB (0 rows, just indexes)
voices:             160 KB
health_checks:      144 KB
djs:                112 KB
programs:           96 KB
Other tables:       < 96 KB each
```

**Supabase Storage Bucket (`audio-assets`):** ~2.69 GB
- This bucket should contain:
  - `raw/` - Raw TTS audio from segment-gen worker
  - `final/` - Normalized audio from mastering worker
  - `music/` - Music track files
  - `jingles/` - Jingle files

## Storage Sources

### Audio Generation Workflow
1. **Segment Gen Worker** uploads raw audio to `raw/{timestamp}-{random}.wav`
2. **Mastering Worker** downloads raw, normalizes, uploads to `final/{asset_id}.wav`
3. Both raw AND normalized versions are kept (doubles storage)

### Music Library
- Music tracks stored in `music/` subdirectory
- Jingles stored in `jingles/` subdirectory
- Currently: 0 tracks in database (but files may exist in storage)

## Root Cause Analysis

The 2.7GB is likely from:

1. **Orphaned Audio Files** - Audio files in storage with no database records
   - Files uploaded but never linked to assets table
   - Old test files that weren't cleaned up
   - Failed job cleanup

2. **Duplicate Storage** - Both raw and normalized versions kept
   - Every segment has 2 files: `raw/*.wav` and `final/*.wav`
   - No automatic cleanup of raw files after normalization

3. **No Cleanup Policy** - Old segments/audio never deleted
   - No retention policy for aired segments
   - No archival/deletion of old content

## Recommendations

### Immediate Actions (High Priority)

#### 1. Fix Asset Workflow Bug 🔴
**Current State:** Segments marked "ready" without assets
**Action Required:** Debug why assets aren't being created
- Check segment-gen worker logs
- Check mastering worker logs
- Fix the workflow to properly create asset records

#### 2. Audit Storage Bucket 🟡
**Action:** List all files in the `audio-assets` bucket and identify:
- Orphaned files (no matching asset in database)
- File count and total size by subdirectory
- Oldest files

**Command:** Create a script to use Supabase Storage API to list files

#### 3. Implement Storage Cleanup 🟡
**Option A - Conservative:** Delete only confirmed orphaned files
- Files in `raw/` that have a corresponding `final/` version
- Files older than 90 days with no database reference

**Option B - Aggressive:** Full cleanup and rebuild
- Delete all storage bucket contents
- Regenerate necessary segments from scratch

### Medium-Term Improvements

#### 4. Implement Retention Policy
```sql
-- Delete aired segments older than 30 days
DELETE FROM segments
WHERE state = 'aired'
AND aired_at < NOW() - INTERVAL '30 days';
```

#### 5. Auto-Delete Raw Audio After Normalization
Update mastering worker to delete `raw/` file after uploading to `final/`

**File:** [workers/mastering/src/worker/mastering-handler.ts:214](workers/mastering/src/worker/mastering-handler.ts#L214)
```typescript
// After uploading normalized audio, delete raw version
const { error: deleteError } = await this.db.storage
  .from('audio-assets')
  .remove([asset.storage_path]); // Delete raw file
```

#### 6. Implement Asset Deduplication Cleanup
Delete duplicate assets that reference the same content_hash:
```sql
-- Find and remove duplicate assets (keep newest)
DELETE FROM assets a1
WHERE EXISTS (
  SELECT 1 FROM assets a2
  WHERE a1.content_hash = a2.content_hash
  AND a1.id < a2.id
  AND a1.content_hash IS NOT NULL
);
```

### Long-Term Architecture

#### 7. Implement Storage Monitoring
- Add metrics for storage bucket size
- Alert when storage exceeds thresholds
- Weekly storage usage reports

#### 8. Archival Strategy
For segments older than X days:
- Move to cheaper storage tier
- Compress audio files
- Delete non-critical segments

## Estimated Storage Savings

| Action | Est. Savings | Difficulty |
|--------|-------------|------------|
| Delete raw files after normalization | ~50% (1.35 GB) | Low |
| Remove orphaned files | Variable | Medium |
| Delete old aired segments | Variable | Low |
| Implement deduplication | ~10-20% | Medium |
| **Total Potential Savings** | **~1.5-2 GB** | - |

## Next Steps

1. **Investigate asset workflow bug** - Why are no assets being created?
2. **Create storage audit script** - List all files in bucket
3. **Implement raw file cleanup** - Delete after normalization
4. **Set up retention policy** - Auto-delete old segments

## Scripts Created

- [infra/analyze-storage.sh](infra/analyze-storage.sh) - Database analysis (completed)
- TODO: Create `infra/audit-storage-bucket.js` - Supabase Storage audit
- TODO: Create `infra/cleanup-orphaned-storage.js` - Safe cleanup script
